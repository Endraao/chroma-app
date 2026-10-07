import "server-only";
import { after } from "next/server";
import { classificarPendentes, soNegociaveis } from "@/lib/negociaveis";

import { unstable_cache } from "next/cache";

import { corrigirCapitalizacao, fetchPoolFeed, fetchToken, fetchTokenList } from "./market";
import { FORA_DA_VITRINE, moedasDaChroma } from "./moedas-da-chroma";
import { getTokenMeta } from "./jupiter";
import { cached } from "./cache";
import { lerMoedaDaCurvaEvm, resumoDaMoedaEvm } from "./curva-evm";
import { lerMoedaDaPons, resumoDaMoedaPons } from "./pons";
import { melhoresGraduadasDaPons, moedasDaCurvaSolana, moedasRecentesDaPons } from "./feeds-externos";
import { buscarMoedaDaChroma } from "./db";
import type { ChainId, TokenSummary } from "./types";

/**
 * Camada que as páginas consomem. Tenta dados reais primeiro e só cai no
 * conjunto de demonstração se a API externa estiver fora do ar — assim a
 * aplicação nunca abre vazia, mas também nunca finge que mock é real.
 *
 * Todo token de demonstração vem com `isDemo: true` pra interface poder avisar.
 */

export type SortKey = "hot" | "new" | "volume" | "marketCap" | "gainers";

/**
 * "Em alta" no critério da fomo (pedido do dono, 06/10/2026: "o top 1 da
 * chroma é uma moeda de 6k; na fomo são moedas muito mais interessantes").
 * A fomo só destaca moeda com valor de mercado e volume de verdade.
 */
export function ehMoedaSeria(t: TokenSummary): boolean {
  return (
    t.marketCapUsd >= 150_000 &&
    t.volume24hUsd >= 50_000 &&
    t.liquidityUsd >= 15_000 &&
    // Valor de mercado 400× a liquidez é par fantasma (ex.: UDR "$671M" com $60K no pool).
    t.marketCapUsd <= t.liquidityUsd * 400
  );
}

/**
 * Ordem "em alta": moeda séria primeiro; dentro dela, volume e alta das
 * últimas horas pesam mais. Moeda minúscula recém-nascida não sobe pro topo.
 */
export function pontuacaoEmAlta(t: TokenSummary): number {
  const c = t.priceChanges ?? {};
  const corta = (v: unknown, a: number, b: number) => Math.max(a, Math.min(b, Number(v) || 0));
  const vol = Math.log10((t.volume24hUsd || 0) + 1) * 10;
  return (
    (ehMoedaSeria(t) ? 100 : 0) +
    vol +
    corta(c.m5, -30, 100) * 0.3 +
    corta(c.h1, -50, 300) * 0.15 +
    corta(c.h24 ?? t.change24h, -90, 2000) * 0.02
  );
}

/** Nomes de marca famosa copiados: deixam a vitrine com cara de golpe. */
const MARCA_COPIADA = /^(lego|bybit|binance|coinbase|spacex|tesla|apple|nike|ferrari|google|amazon|openai|nvidia|microsoft|meta|x|twitter|kraken|okx|phantom|solana|bitcoin|ethereum|usdc|usdt|tether)$/i;
export function pareceMarcaCopiada(t: TokenSummary): boolean {
  const nome = (t.name ?? "").trim().split(/[s-·|]+/)[0] ?? "";
  return MARCA_COPIADA.test(nome) || MARCA_COPIADA.test((t.symbol ?? "").trim());
}

const MINUTE = 60_000;

const FALLBACK: TokenSummary[] = [
  {
    address: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
    chain: "solana",
    name: "Prism Cat",
    symbol: "PRISM",
    description: "Token de demonstração — a API de mercado não respondeu.",
    priceUsd: 0.0000412,
    change24h: 184.2,
    marketCapUsd: 412_000,
    liquidityUsd: 68_400,
    volume24hUsd: 1_240_000,
    holders: 2841,
    createdAt: Date.now() - 42 * MINUTE,
    bondingProgress: 78,
    creator: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
  },
  {
    address: "0x55d398326f99059ff775485246999027b3197955",
    chain: "robinhood",
    name: "Glass Dog",
    symbol: "GLASS",
    description: "Token de demonstração — a API de mercado não respondeu.",
    priceUsd: 0.0000009,
    change24h: 41.3,
    marketCapUsd: 90_000,
    liquidityUsd: 12_800,
    volume24hUsd: 340_000,
    holders: 612,
    createdAt: Date.now() - 14 * MINUTE,
    bondingProgress: 31,
    creator: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
  },
  {
    address: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
    chain: "solana",
    name: "Halo",
    symbol: "HALO",
    description: "Token de demonstração — a API de mercado não respondeu.",
    priceUsd: 0.0000021,
    change24h: 612.0,
    marketCapUsd: 21_000,
    liquidityUsd: 4_100,
    volume24hUsd: 88_000,
    holders: 143,
    createdAt: Date.now() - 3 * MINUTE,
    bondingProgress: 9,
    creator: "2Fd5PGoJdJi2GPRQTn5rHKVpfXcLXjvGnEXqRXnFpgzS",
  },
];

function sortTokens(list: TokenSummary[], sort: SortKey): TokenSummary[] {
  const copy = [...list];
  switch (sort) {
    case "volume":
      return copy.sort((a, b) => b.volume24hUsd - a.volume24hUsd);
    case "marketCap":
      return copy.sort((a, b) => b.marketCapUsd - a.marketCapUsd);
    case "gainers":
      return copy.sort((a, b) => b.change24h - a.change24h);
    case "hot":
      return copy.sort((a, b) => pontuacaoEmAlta(b) - pontuacaoEmAlta(a));
    default:
      return copy.sort((a, b) => b.createdAt - a.createdAt);
  }
}

/**
 * @param chain quando informado, devolve só as moedas dessa rede.
 *
 * O filtro é aplicado DEPOIS de buscar tudo, de propósito: a fonte entrega as
 * duas redes numa chamada só, e separar na origem custaria uma requisição por
 * rede sem nenhum ganho. O que não podia continuar era a home misturar as
 * duas — cada rede precisa de uma carteira diferente pra operar, então listar
 * junto leva a pessoa a clicar numa moeda que ela não consegue comprar com a
 * carteira que tem conectada.
 */
/**
 * O universo de moedas da vitrine, juntando as fontes gratuitas.
 *
 * ---------------------------------------------------------------------------
 * POR QUE SÃO VÁRIAS FONTES, E NÃO A MELHOR DELAS
 * ---------------------------------------------------------------------------
 * Porque nenhuma sozinha cobre o que a home precisa:
 *
 * - Os feeds da GeckoTerminal trazem o fluxo de verdade: pool recém-criada,
 *   pool em alta, pool grande.
 * - A lista da Dexscreener é pequena e enviesada (só quem foi lá cadastrar o
 *   perfil), mas traz descrição escrita pelo próprio projeto.
 *
 * Somadas, uma tapa o buraco da outra. Empatando no mesmo endereço, os números
 * vêm de quem apurou mais liquidez, e os campos que só uma das fontes tem
 * (imagem, descrição) são preservados dos dois lados.
 *
 * ---------------------------------------------------------------------------
 * A ROBINHOOD CHAIN ESTAVA FALTANDO, E NÃO ERA LIMITAÇÃO DA FONTE
 * ---------------------------------------------------------------------------
 * Durante meses esta função pediu os três feeds SÓ da Solana. O comentário
 * aqui dizia que a GeckoTerminal não cobria a Robinhood Chain — e era falso.
 * Ela cobre, com o id `robinhood`, e o mapeamento já estava certo em
 * `web3.ts` desde sempre. Ninguém nunca chamou.
 *
 * O efeito era a vitrine mostrar duas ou três moedas da Robinhood por dia,
 * as únicas que apareciam de raspão na lista de perfis da Dexscreener. Medido
 * na fonte no dia em que isto foi corrigido: 53 pools com liquidez acima de
 * mil dólares nos três feeds, incluindo uma de US$ 18,9 milhões.
 *
 * Lição pra não repetir: quando uma rede aparece vazia, conferir a FONTE
 * antes de concluir que ela não tem dados.
 */
async function montarUniverso(): Promise<TokenSummary[]> {
  /*
   * ROBINHOOD PRIMEIRO. As consultas à GeckoTerminal passam por uma fila e o
   * limite por IP acaba no meio dela: quem vem por último é quem leva a
   * recusa. A Robinhood é a rede principal e vinha por último — chegava com 3
   * moedas enquanto a Solana vinha cheia (28/09/2026).
   */
  const [novasRh, emAltaRh, grandesRh, novas, emAlta, grandes, perfis, daCasa, daCurvaSol, daPons, ponsGraduadas] =
    await Promise.all([
      fetchPoolFeed("robinhood", "new_pools"),
      fetchPoolFeed("robinhood", "trending_pools"),
      fetchPoolFeed("robinhood", "pools"),
      fetchPoolFeed("solana", "new_pools"),
      fetchPoolFeed("solana", "trending_pools"),
      fetchPoolFeed("solana", "pools"),
      fetchTokenList(),
      moedasDaChroma(),
      moedasDaCurvaSolana(),
      moedasRecentesDaPons(),
      melhoresGraduadasDaPons(),
    ]);

  const porEndereco = new Map<string, TokenSummary>();

  /*
   * Ordem importa: quem entra DEPOIS só sobrescreve se tiver mais liquidez.
   * As pools grandes primeiro, as novas por último — dentro de cada rede.
   */
  for (const t of [
    ...grandes,
    ...grandesRh,
    ...emAlta,
    ...emAltaRh,
    ...novas,
    ...novasRh,
    ...perfis,
  ]) {
    const chave = `${t.chain}:${t.address.toLowerCase()}`;
    const anterior = porEndereco.get(chave);

    if (!anterior) {
      porEndereco.set(chave, t);
      continue;
    }

    const melhor = t.liquidityUsd > anterior.liquidityUsd ? t : anterior;
    porEndereco.set(chave, {
      ...melhor,
      imageUrl: melhor.imageUrl ?? anterior.imageUrl ?? t.imageUrl,
      description: melhor.description ?? anterior.description ?? t.description,
      holders: Math.max(melhor.holders, anterior.holders, t.holders),
    });
  }

  /*
   * Piso de liquidez.
   *
   * O feed de pool nova traz MUITA pool natimorta — criada, um swap de um
   * centavo, abandonada. Sem piso, a vitrine vira uma parede de moeda que
   * ninguém consegue vender depois de comprar, o que é pior do que uma vitrine
   * curta. Mil dólares é o mesmo corte que a lista antiga já aplicava.
   */
  const deMercado = [...porEndereco.values()].filter(
    (t) => t.liquidityUsd >= 1_000 && !FORA_DA_VITRINE.has(t.address.toLowerCase()) && !pareceMarcaCopiada(t),
  );

  /*
   * Rede sem NENHUMA moeda de mercado é fonte recusando, não mercado vazio.
   * Falhar aqui faz o cache compartilhado manter a vitrine anterior em vez de
   * gravar a quebrada por 30 s (ver `universo`).
   */
  for (const rede of ["solana", "robinhood"] as const) {
    if (!deMercado.some((t) => t.chain === rede)) {
      throw new Error(`vitrine sem moedas de ${rede}: fonte recusou`);
    }
  }

  /*
   * As nossas entram DEPOIS do filtro, e por cima.
   *
   * Duas razões, as duas importantes:
   *
   * 1. **O piso de mil dólares não vale pra elas.** Uma moeda que nasceu há
   *    dois minutos na curva tem quase nada de liquidez — é assim que começa.
   *    Aplicar o corte de mercado esconderia justamente o que a launchpad
   *    acabou de lançar, que é o problema que este código veio resolver.
   *
   * 2. **A nossa versão é a boa.** Se a moeda já migrou e aparece nas duas
   *    listas, o registro daqui traz a arte e o texto que o criador escreveu,
   *    além do progresso da curva. Sobrescrever é o resultado certo.
   */
  const porChave = new Map(deMercado.map((t) => [`${t.chain}:${t.address.toLowerCase()}`, t]));
  /*
   * Destaques da curva da Solana e lançamentos recentes da Pons (pedido do
   * dono, 30/09/2026). Sem o piso de mil dólares — moeda de curva começa com
   * pouco —, e sem passar por cima de quem já veio de uma fonte de mercado.
   */
  for (const t of [...daCurvaSol, ...daPons, ...ponsGraduadas]) {
    if (FORA_DA_VITRINE.has(t.address.toLowerCase()) || pareceMarcaCopiada(t)) continue;
    const chave = `${t.chain}:${t.address.toLowerCase()}`;
    if (!porChave.has(chave)) porChave.set(chave, t);
  }
  for (const t of daCasa) {
    if (FORA_DA_VITRINE.has(t.address.toLowerCase())) continue;
    porChave.set(`${t.chain}:${t.address.toLowerCase()}`, t);
  }

  /*
   * A capitalização de TODAS as moedas sai do fornecimento real da rede, numa
   * chamada só pra vitrine inteira — ver `corrigirCapitalizacao` em market.ts.
   *
   * As fontes de mercado carregam estimativa velha de quantos tokens existem,
   * e moeda que queimou parte do fornecimento aparecia maior do que é.
   */
  const corrigidas = await corrigirCapitalizacao([...porChave.values()]);
  const sol = (await import("@/lib/precos-nativos").then((m) => m.precosNativos()).catch(() => null))?.solana ?? 0;
  return comVariacaoDesdeOLancamento(semCopias(corrigidas, new Set(daCasa.map((t) => t.address.toLowerCase()))), sol);
}

/**
 * Cópias com o mesmo nome (06/10/2026: a "AUTON" da vitrine era uma cópia de
 * $68 mil; a de verdade vale $3 mi). Por rede e símbolo, fica só a de maior
 * valor de mercado. As lançadas na Chroma nunca saem.
 */
function semCopias(todas: TokenSummary[], daChroma: Set<string>): TokenSummary[] {
  // Par fantasma: valor de mercado 400× a liquidez não é negociável (ex.: UDR "$671M").
  const lista = todas.filter(
    (t) => daChroma.has(t.address.toLowerCase()) || !(t.liquidityUsd > 0 && t.marketCapUsd > t.liquidityUsd * 400),
  );
  const maior = new Map<string, TokenSummary>();
  for (const t of lista) {
    if (daChroma.has(t.address.toLowerCase())) continue;
    const k = `${t.chain}:${t.symbol.trim().toLowerCase()}`;
    const atual = maior.get(k);
    if (!atual || t.marketCapUsd > atual.marketCapUsd) maior.set(k, t);
  }
  return lista.filter((t) => daChroma.has(t.address.toLowerCase()) || maior.get(`${t.chain}:${t.symbol.trim().toLowerCase()}`) === t);
}

/**
 * Moeda da pump.fun com menos de 24 h: variação DESDE O LANÇAMENTO, igual à
 * fomo (+80.000% numa moeda que nasceu com ~$3 mil e vale $3 mi). Toda moeda
 * nasce na curva com ~27,96 SOL de valor de mercado.
 */
const MCAP_INICIAL_PUMP_SOL = (30 / 1_073_000_000) * 1_000_000_000;
function comVariacaoDesdeOLancamento(lista: TokenSummary[], sol: number): TokenSummary[] {
  if (sol <= 0) return lista;
  const inicial = MCAP_INICIAL_PUMP_SOL * sol;
  return lista.map((t) => {
    const recente = t.createdAt > 0 && Date.now() - t.createdAt < 24 * 3600_000;
    if (t.chain !== "solana" || !t.address.endsWith("pump") || !recente || t.marketCapUsd <= 0) return t;
    return { ...t, mcapInicialUsd: inicial, change24h: (t.marketCapUsd / inicial - 1) * 100 };
  });
}

/**
 * A vitrine no cache COMPARTILHADO da Vercel, e não na memória.
 *
 * Montar a vitrine são oito consultas a fontes com limite de taxa, e a fila
 * que protege esse limite levava ~15 s. Com o cache só em memória, cada
 * servidor novo da Vercel (eles nascem e morrem sozinhos) pagava esses 15 s
 * — medido em 27/09/2026: primeira abertura da home em 15,2 s, as seguintes
 * em 0,6 s. O cache de dados da Vercel sobrevive entre servidores e, vencido,
 * entrega o anterior enquanto renova por trás.
 *
 * Lançar moeda renova na hora (tag `universo`, ver POST /api/moedas).
 */
export const TAG_DO_UNIVERSO = "universo";
const universoEmCache = unstable_cache(montarUniverso, ["universo-v6"], {
  /*
   * 2 min: cada montagem são 12 consultas à GeckoTerminal. A 30 s isso comia
   * quase todo o limite do IP. Moeda lançada aqui aparece na hora mesmo assim
   * (a tag é renovada no lançamento).
   */
  // 30 s: a vitrine tem de parecer viva (era 120 s e nada se mexia).
  revalidate: 30,
  tags: [TAG_DO_UNIVERSO],
});

/** Sem nenhuma versão boa ainda, a home cai no exemplo em vez de quebrar. */
async function universo(): Promise<TokenSummary[]> {
  try {
    return await universoEmCache();
  } catch (erro) {
    console.warn("[vitrine] sem versão boa:", erro);
    return [];
  }
}

export async function listTokens(
  sort: SortKey = "new",
  chain?: ChainId | null,
): Promise<{ tokens: TokenSummary[]; isDemo: boolean }> {
  const real = await universo();
  const base = real.length ? real : FALLBACK;
  const isDemo = real.length === 0;

  const daRede = chain ? base.filter((t) => t.chain === chain) : base;

  // Robinhood: só entra moeda confirmada como negociável aqui; as que ainda
  // não foram checadas são checadas depois da resposta, sem ninguém esperar.
  const filtradas = isDemo ? daRede : await soNegociaveis(daRede).catch(() => daRede);
  if (!isDemo) {
    try {
      after(() => classificarPendentes(base));
    } catch {
      /* fora de uma requisição (scripts): sem classificação em segundo plano */
    }
  }
  // Sem imagem na fonte de mercado: o leitor de logo procura em todas as
  // fontes (contrato, Jupiter, DexScreener, IPFS) — igual à página da moeda.
  const comImagem = filtradas.map((t) => (t.imageUrl ? t : { ...t, imageUrl: `/api/logo/${t.address}` }));
  return { tokens: sortTokens(comImagem, sort), isDemo };
}

/**
 * Moeda da Solana ainda na curva de lançamento: preço, capitalização,
 * liquidez e progresso lidos da PRÓPRIA curva.
 *
 * Recém-lançada, a DexScreener ainda não a conhece (leva de segundos a
 * minutos): a página abria com $0, "Listado em DEX" e alerta de "Liquidez
 * zero" numa moeda que já negociava (30/09/2026). A curva é a fonte certa.
 */
async function comCurvaDaSolana(r: { token: TokenSummary; isDemo: boolean }) {
  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC;
  if (r.token.chain !== "solana" || !rpc?.startsWith("http")) return r;
  const daChroma = await comCurvaDaChroma(r, rpc);
  if (daChroma) return daChroma;
  if (r.isDemo) return r;
  try {
    const [{ Connection, PublicKey }, { estadoDaCurvaPump, precoNaCurvaEmSol }, { precosNativos }] = await Promise.all([
      import("@solana/web3.js"),
      import("@/lib/pumpfun"),
      import("@/lib/precos-nativos"),
    ]);
    const conn = new Connection(rpc, "confirmed");
    const mint = new PublicKey(r.token.address);
    const [estado, emSol, precos] = await Promise.all([
      estadoDaCurvaPump(conn, mint),
      precoNaCurvaEmSol(conn, mint),
      precosNativos().catch(() => null),
    ]);
    const sol = precos?.solana ?? 0;
    if (!estado || estado.completa || emSol === null || sol <= 0) return r;
    const preco = emSol * sol;
    /*
     * O preço da CURVA manda (igual à pump.fun). A DexScreener registra o
     * preço médio do último negócio, abaixo do preço depois dele, e a
     * variação saía negativa numa moeda que só subiu (30/09/2026).
     * Moeda com menos de 24h: variação contra o preço de nascimento.
     */
    const inicialEmSol = 30 / 1_073_000_000;
    const nova = r.token.createdAt > 0 && Date.now() - r.token.createdAt < 24 * 3600_000;
    return {
      ...r,
      token: {
        ...r.token,
        priceUsd: preco,
        change24h: nova ? (emSol / inicialEmSol - 1) * 100 : r.token.change24h,
        // Emissão fixa da curva: 1 bilhão de tokens.
        marketCapUsd: preco * 1_000_000_000,
        liquidityUsd: estado.solReal * sol,
        bondingProgress: estado.progresso,
        dexId: "pumpfun",
      },
    };
  } catch {
    return r;
  }
}

/**
 * Moeda na Curva da Chroma (Meteora DBC): preço, liquidez e progresso lidos
 * da pool. Recém-criada, a DexScreener ainda não a conhece e a página abria
 * como "Token sem liquidez" até alguém recarregar (02/10/2026): nome, arte e
 * criador saem então do nosso cadastro.
 */
async function comCurvaDaChroma(r: { token: TokenSummary; isDemo: boolean }, rpc: string) {
  try {
    const [{ Connection }, { estadoNaCurvaDaChroma }, { precosNativos }] = await Promise.all([
      import("@solana/web3.js"),
      import("@/lib/meteora-dbc"),
      import("@/lib/precos-nativos"),
    ]);
    const [estado, precos] = await Promise.all([
      estadoNaCurvaDaChroma(new Connection(rpc, "confirmed"), r.token.address),
      precosNativos().catch(() => null),
    ]);
    const sol = precos?.solana ?? 0;
    if (!estado || estado.completa || sol <= 0) return null;
    const preco = estado.precoSol * sol;
    const cadastro = r.isDemo
      ? await import("@/lib/db").then((d) => d.buscarMoedaDaChroma(r.token.address)).catch(() => null)
      : null;
    const nasceu = cadastro?.criadaEm ?? r.token.createdAt;
    const nova = nasceu > 0 && Date.now() - nasceu < 24 * 3600_000;
    // Preço de nascimento da curva: 30 SOL de valor de mercado / 1 bilhão.
    const inicialEmSol = 30 / 1_000_000_000;
    return {
      isDemo: false,
      token: {
        ...r.token,
        ...(cadastro
          ? {
              name: cadastro.nome,
              symbol: cadastro.simbolo,
              imageUrl: cadastro.imagem ?? undefined,
              description: cadastro.descricao ?? undefined,
              createdAt: cadastro.criadaEm,
            }
          : {}),
        creator: estado.criador,
        priceUsd: preco,
        change24h: nova ? (estado.precoSol / inicialEmSol - 1) * 100 : r.token.change24h,
        marketCapUsd: preco * 1_000_000_000,
        liquidityUsd: estado.solReal * sol,
        // A Jupiter conta o cofre da própria curva (as moedas ainda à venda)
        // como "holder": uma moeda sem ninguém segurando aparecia com 1.
        holders: Math.max(0, (r.token.holders ?? 0) - 1),
        bondingProgress: estado.progresso,
        dexId: "chroma-curve",
      },
    };
  } catch {
    return null;
  }
}

/**
 * A moeda, com os links (site, X, Telegram) informados no lançamento quando
 * ela nasceu na Chroma — o mercado só conhece os que o time pagou pra exibir.
 */
export async function getToken(address: string): Promise<{ token: TokenSummary; isDemo: boolean }> {
  const r = await comCurvaDaSolana(await getTokenBase(address));
  const registro = await buscarMoedaDaChroma(address).catch(() => null);
  const l = registro?.links ?? {};
  if (!registro) return r;
  return {
    ...r,
    token: {
      ...r.token,
      website: r.token.website ?? l.site,
      twitter: r.token.twitter ?? l.twitter,
      telegram: r.token.telegram ?? l.telegram,
      recompensasParaDetentores: registro.recompensas === "detentores",
      criadorNaChroma: registro.criador,
    },
  };
}

async function getTokenBase(address: string): Promise<{ token: TokenSummary; isDemo: boolean }> {
  /*
   * Moeda da curva da Chroma na Robinhood: quem sabe dela é o contrato, não a
   * DEX — ela ainda não tem pool. Lida primeiro, e só cai no mercado depois
   * de migrar (aí a pool existe e o mercado sabe mais).
   */
  if (address.startsWith("0x")) {
    // Moeda na curva da Pons (lançada pela Chroma ou não): lida da curva.
    const daPons = await lerMoedaDaPons(address).catch(() => null);
    if (daPons) {
      const registro = await buscarMoedaDaChroma(address).catch(() => null);
      const token = await resumoDaMoedaPons(daPons, {
        imagem: registro?.imagem,
        descricao: registro?.descricao,
        criadaEm: registro?.criadaEm,
      });
      return { token, isDemo: false };
    }
    const daCurva = await lerMoedaDaCurvaEvm(address).catch(() => null);
    if (daCurva && !daCurva.curva.migrada) {
      const registro = await buscarMoedaDaChroma(address).catch(() => null);
      const token = await resumoDaMoedaEvm(address, {
        imagem: registro?.imagem,
        descricao: registro?.descricao,
        criadaEm: registro?.criadaEm,
      });
      if (token) return { token, isDemo: false };
    }
  }

  const doMercado = await fetchToken(address);
  // Moeda nova que a DEX ainda não indexou: usa o que a vitrine já sabe dela.
  const daVitrine = doMercado ? null : (await universo()).find((t) => t.address.toLowerCase() === address.toLowerCase());
  const achado = doMercado ?? daVitrine ?? null;
  // Sem imagem na fonte de mercado: o leitor de logo (mesma fonte da tela inicial), nas duas redes.
  const real = achado && !achado.imageUrl
    ? { ...achado, imageUrl: `/api/logo/${achado.address}` }
    : achado;

  if (real) {
    // A Dexscreener não tem holders nem criador; a Jupiter tem, para Solana.
    if (real.chain === "solana") {
      try {
        const meta = await cached(`meta:${address}`, 300_000, () => getTokenMeta(address));
        if (meta) {
          return {
            token: {
              ...real,
              holders: meta.holderCount ?? real.holders,
              creator: meta.dev ?? real.creator,
              imageUrl: real.imageUrl ?? meta.icon,
              website: real.website ?? meta.website,
              twitter: real.twitter ?? meta.twitter,
              telegram: real.telegram ?? meta.telegram,
            },
            isDemo: false,
          };
        }
      } catch {
        /* metadados são enfeite: a página abre sem eles */
      }
    }
    return { token: real, isDemo: false };
  }

  const fallback = FALLBACK.find((t) => t.address.toLowerCase() === address.toLowerCase());
  if (fallback) return { token: fallback, isDemo: true };

  /*
   * Endereço válido mas sem par listado: é o caso de um token recém-criado,
   * que é exatamente o público do launchpad. A página abre, o gráfico entra
   * em modo demo e o painel de segurança ainda consegue auditar o contrato.
   */
  return {
    token: {
      address,
      chain: address.startsWith("0x") ? "robinhood" : "solana",
      name: "Token sem liquidez",
      symbol: address.slice(0, 4).toUpperCase(),
      description: "Ainda não há par de negociação indexado para este endereço.",
      priceUsd: 0,
      change24h: 0,
      marketCapUsd: 0,
      liquidityUsd: 0,
      volume24hUsd: 0,
      holders: 0,
      createdAt: Date.now(),
      bondingProgress: null,
      creator: "",
    },
    isDemo: true,
  };
}
