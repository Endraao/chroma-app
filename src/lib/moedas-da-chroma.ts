import "server-only";

import { unstable_cache } from "next/cache";

import { PublicKey } from "@solana/web3.js";

import { cached } from "@/lib/cache";
import { precosNativos } from "@/lib/precos-nativos";
import { listarMoedasDaChroma, type MoedaRegistrada } from "@/lib/db";
import { SOL_MINT } from "@/lib/jupiter";
import { fetchPrice, fetchToken } from "@/lib/market";
import {
  enderecoDaConfig,
  enderecoDaCurva,
  lerConfig,
  lerCurva,
  type EstadoDaConfig,
  type EstadoDaCurva,
} from "@/lib/chroma-program";
import type { TokenSummary } from "@/lib/types";
import { resumoDaMoedaEvm } from "@/lib/curva-evm";
import { lerMoedaDaPons, resumoDaMoedaPons } from "@/lib/pons";

/**
 * As moedas lançadas na Chroma, prontas pra entrar na vitrine.
 *
 * ---------------------------------------------------------------------------
 * DUAS SITUAÇÕES, DOIS CAMINHOS
 * ---------------------------------------------------------------------------
 * 1. **Moeda que já migrou.** Tem par na Raydium, então as fontes de mercado
 *    sabem tudo sobre ela. Usamos o registro de mercado e só emprestamos a
 *    arte e a descrição que o criador escreveu aqui — que o mercado não tem.
 *
 * 2. **Moeda ainda na curva.** Não existe par em lugar nenhum, então nenhuma
 *    API de mercado a conhece. Preço, capitalização e progresso saem da CONTA
 *    DA CURVA, lida direto do nó. É por isso que este arquivo existe.
 *
 * ---------------------------------------------------------------------------
 * POR QUE LER DA REDE E NÃO GUARDAR NO BANCO
 * ---------------------------------------------------------------------------
 * Porque preço guardado é preço velho. A tabela `moedas` guarda só o que não
 * muda — nome, arte, criador, data. Tudo que anda vem da rede a cada leitura,
 * com cache curto. Um número de mercado salvo em banco envelhece em silêncio,
 * e ninguém descobre até alguém decidir dinheiro em cima dele.
 */

/** O programa cunha com 6 casas (`CASAS` em programs/chroma-curve/src/lib.rs). */
const CASAS = 6;
const UM_TOKEN = 10n ** BigInt(CASAS);
const LAMPORTS = 1_000_000_000n;

/** Curva anda a cada compra; 15s é o bastante pra vitrine parecer viva. */
const TTL_CURVAS = 15_000;

/**
 * No cache compartilhado da Vercel (15 s), pelo mesmo motivo da vitrine em
 * `tokens.ts`: cada moeda são várias leituras de contrato, e servidor novo
 * pagava todas de uma vez. Mesma tag da vitrine — lançar renova as duas.
 */
/**
 * Moedas que não aparecem na VITRINE (home e listas), a pedido do dono.
 * Continuam existindo, negociando e aparecendo no perfil de quem criou.
 *
 * SundayCat: a moeda de teste, lançada antes do ajuste de preço inicial —
 * nasceu valendo ~US$ 75 mil e destoaria das novas (~US$ 5 mil).
 */
/**
 * Moedas de TESTE (30/09/2026): existem na rede para sempre, mas não aparecem
 * na vitrine. Continuam abrindo pelo endereço e no perfil de quem criou.
 * Comparação sempre em minúsculas.
 */
export const FORA_DA_VITRINE = new Set(
  [
    "0x5b78097b8a5de294f93780abdff4ce7ac790ef63",
    "Fn4QycXx5JN5uocWtzMxkBJFrVtNrEJu49WF8KWYKhjc",
    "Gvf5RiyNiUwKYaAgiruJotBp89PdLGwyHzYGx2TKmBVe",
    "7SwbHeEpJZmPtDMUPTbeGdNCWfa67fYnHAo91gNetykp",
    "ACcX351Jn1mwcyEYQw4DcKkQJ3RYR7w57KWjWmoEEZew",
    "0x4e270310e2f217296e4df00017297a0141bd14ec",
    "0x8b152f9d792e46c096dbd7cc82c9116e0bee9b34",
    // MIAU (6kKvg3…V7ehK) voltou pra vitrine em 05/10/2026, a pedido do dono:
    // mostra que já tem moeda lançada na Curva da Chroma.
  ].map((a) => a.toLowerCase()),
);

const moedasDaChromaComCache = unstable_cache(moedasSemZero, ["moedas-da-chroma-v1"], {
  revalidate: 15,
  tags: ["universo"],
});

/*
 * Valor de mercado 0 numa moeda da vitrine é sempre falha de cotação, nunca
 * verdade. Esse resultado não pode ir pro cache compartilhado (ficava 15 s
 * mostrando "$0" pra todo mundo): o erro impede o cache, e a página recebe a
 * lista montada na hora mesmo assim.
 */
async function moedasSemZero(): Promise<TokenSummary[]> {
  const lista = await moedasDaChromaSemCache();
  if (lista.some((t) => !(t.marketCapUsd > 0))) throw new Error("cotação incompleta");
  return lista;
}

export async function moedasDaChroma(): Promise<TokenSummary[]> {
  try {
    return await moedasDaChromaComCache();
  } catch {
    return moedasDaChromaSemCache();
  }
}

async function moedasDaChromaSemCache(): Promise<TokenSummary[]> {
  let registros: MoedaRegistrada[];
  try {
    registros = await listarMoedasDaChroma();
  } catch (erro) {
    console.warn("[chroma] não deu pra ler as moedas registradas:", erro);
    return [];
  }

  if (registros.length === 0) return [];

  const solanas = registros.filter((m) => m.rede === "solana");

  const [estados, precoDoSol] = await Promise.all([
    lerCurvasDaRede(solanas.map((m) => m.endereco)),
    fetchPrice(SOL_MINT)
      .catch(() => null)
      .then(async (p) => (p && p > 0 ? p : ((await precosNativos().catch(() => null))?.solana || null))),
  ]);

  const saida = await Promise.all(
    registros.map(async (m) => {
      /*
       * Robinhood: o estado sai do contrato EVM. Se a moeda já migrou (ou a
       * leitura falhar), cai no mesmo caminho de mercado da Solana.
       */
      if (m.rede === "robinhood") {
        // Lançada pela Chroma na curva da Pons: lida de lá.
        const daPons = await lerMoedaDaPons(m.endereco).catch(() => null);
        if (daPons) {
          return resumoDaMoedaPons(daPons, { imagem: m.imagem, descricao: m.descricao, criadaEm: m.criadaEm }).catch(
            () => montar(m, undefined, estados.config, precoDoSol),
          );
        }
        const naCurva = await resumoDaMoedaEvm(m.endereco, {
          imagem: m.imagem,
          descricao: m.descricao,
          criadaEm: m.criadaEm,
        }).catch(() => null);
        return naCurva ?? montar(m, undefined, estados.config, precoDoSol);
      }
      return montar(m, estados.curvas.get(m.endereco), estados.config, precoDoSol);
    }),
  );

  return saida.filter((t): t is TokenSummary => t !== null);
}

async function montar(
  m: MoedaRegistrada,
  curva: EstadoDaCurva | undefined,
  config: EstadoDaConfig | null,
  precoDoSol: number | null,
): Promise<TokenSummary | null> {
  /*
   * Migrou? Então o mercado sabe mais do que a gente.
   *
   * A conta da curva continua existindo depois da migração, com a marca
   * `migrada`. Nesse ponto ela não negocia mais e o preço dela está congelado
   * no instante da migração — usar esse número seria mostrar um preço morto.
   */
  /* Na Curva da Chroma (Meteora DBC): tudo sai da pool, desde o primeiro segundo. */
  const rpcSol = process.env.NEXT_PUBLIC_SOLANA_RPC;
  if (m.rede === "solana" && !curva && rpcSol?.startsWith("http") && precoDoSol) {
    try {
      const [{ Connection }, { estadoNaCurvaDaChroma }] = await Promise.all([
        import("@solana/web3.js"),
        import("@/lib/meteora-dbc"),
      ]);
      const e = await estadoNaCurvaDaChroma(new Connection(rpcSol, "confirmed"), m.endereco);
      if (e && !e.completa) {
        const preco = e.precoSol * precoDoSol;
        const nova = Date.now() - m.criadaEm < 24 * 3600_000;
        return {
          address: m.endereco,
          chain: "solana",
          name: m.nome,
          symbol: m.simbolo,
          imageUrl: m.imagem ?? undefined,
          description: m.descricao ?? undefined,
          priceUsd: preco,
          change24h: nova ? (e.precoSol / (30 / 1_000_000_000) - 1) * 100 : 0,
          marketCapUsd: preco * 1_000_000_000,
          liquidityUsd: e.solReal * precoDoSol,
          volume24hUsd: 0,
          holders: 0,
          createdAt: m.criadaEm,
          bondingProgress: e.progresso,
          creator: m.criador,
          dexId: "chroma-curve",
        };
      }
    } catch {
      /* sem leitura: segue pelo mercado */
    }
  }

  if (!curva || curva.migrada) {
    const mercado = await fetchToken(m.endereco).catch(() => null);
    if (!mercado) return curva ? null : ((await daCurvaClassica(m, precoDoSol)) ?? semMercado(m));

    /*
     * Lançada na curva de lançamento da Solana: progresso e SOL guardado lidos
     * da própria curva — a DexScreener não dá o progresso e mostra liquidez 0,
     * e o card saía com o selo da rede em vez de "Curva".
     */
    let naCurvaPump: { bondingProgress: number; liquidityUsd: number } | null = null;
    const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC;
    if (m.rede === "solana" && mercado.dexId === "pumpfun" && rpc?.startsWith("http")) {
      try {
        const [{ Connection }, { estadoDaCurvaPump }] = await Promise.all([
          import("@solana/web3.js"),
          import("@/lib/pumpfun"),
        ]);
        const e = await estadoDaCurvaPump(new Connection(rpc, "confirmed"), new PublicKey(m.endereco));
        if (e && !e.completa) {
          naCurvaPump = { bondingProgress: e.progresso, liquidityUsd: e.solReal * (precoDoSol ?? 0) };
        }
      } catch {
        /* sem leitura: fica o que o mercado disse */
      }
    }

    return {
      ...mercado,
      ...(naCurvaPump ?? {}),
      /* O que o criador escreveu aqui vale mais que o que a DEX adivinhou. */
      name: mercado.name || m.nome,
      symbol: mercado.symbol || m.simbolo,
      imageUrl: m.imagem ?? mercado.imageUrl,
      description: m.descricao ?? mercado.description,
      creator: m.criador,
      createdAt: m.criadaEm,
    };
  }

  /* Ainda na curva: tudo sai da conta lida do nó. */
  const precoEmSol = precoDaCurva(curva);
  const precoUsd = precoDoSol !== null ? precoEmSol * precoDoSol : 0;

  const emissao = config ? Number(config.emissaoTotal) / Number(UM_TOKEN) : 0;
  const aVenda = config?.tokenAVendaInicial ?? 0n;
  const vendidos = aVenda > curva.tokenReal ? aVenda - curva.tokenReal : 0n;

  return {
    address: m.endereco,
    chain: "solana",
    name: m.nome,
    symbol: m.simbolo,
    imageUrl: m.imagem ?? undefined,
    description: m.descricao ?? undefined,
    priceUsd: precoUsd,
    /*
     * Variação 24h fica em zero, e não num número inventado.
     *
     * Pra calcular seria preciso guardar o preço de ontem, e uma moeda que
     * nasceu há vinte minutos não tem ontem. Zero aqui é lido como "sem
     * variação apurada", que é a verdade.
     */
    change24h: 0,
    marketCapUsd: emissao > 0 ? precoUsd * emissao : 0,
    /* A liquidez da curva é o SOL de verdade que está dentro dela. */
    liquidityUsd:
      precoDoSol !== null ? (Number(curva.solReal) / Number(LAMPORTS)) * precoDoSol : 0,
    volume24hUsd:
      precoDoSol !== null ? (Number(curva.volumeAcumulado) / Number(LAMPORTS)) * precoDoSol : 0,
    holders: 0,
    createdAt: m.criadaEm,
    bondingProgress:
      aVenda > 0n ? Math.min(100, Number((vendidos * 10_000n) / aVenda) / 100) : 0,
    creator: m.criador,
  };
}

/** Registrada, mas a rede não conhece: nem curva, nem par. */
/**
 * Moeda da curva clássica da Solana que nenhum site de dados indexou (pouca
 * ou nenhuma negociação): lida direto da curva. Sem isto o cartão saía com
 * tudo zerado e o selo "Solana" em vez de "Curva" (02/10/2026).
 */
async function daCurvaClassica(m: MoedaRegistrada, precoDoSol: number | null): Promise<TokenSummary | null> {
  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC;
  if (m.rede !== "solana" || !precoDoSol || !rpc?.startsWith("http")) return null;
  try {
    const [{ Connection }, { estadoDaCurvaPump, precoNaCurvaEmSol }] = await Promise.all([
      import("@solana/web3.js"),
      import("@/lib/pumpfun"),
    ]);
    const conexao = new Connection(rpc, "confirmed");
    const mint = new PublicKey(m.endereco);
    const [e, emSol] = await Promise.all([estadoDaCurvaPump(conexao, mint), precoNaCurvaEmSol(conexao, mint)]);
    if (!e || e.completa || emSol === null) return null;
    const preco = emSol * precoDoSol;
    return {
      ...semMercado(m),
      priceUsd: preco,
      marketCapUsd: preco * 1_000_000_000,
      liquidityUsd: e.solReal * precoDoSol,
      bondingProgress: e.progresso,
      dexId: "pumpfun",
    };
  } catch {
    return null;
  }
}

function semMercado(m: MoedaRegistrada): TokenSummary {
  return {
    address: m.endereco,
    chain: m.rede === "robinhood" ? "robinhood" : "solana",
    name: m.nome,
    symbol: m.simbolo,
    imageUrl: m.imagem ?? undefined,
    description: m.descricao ?? undefined,
    priceUsd: 0,
    change24h: 0,
    marketCapUsd: 0,
    liquidityUsd: 0,
    volume24hUsd: 0,
    holders: 0,
    createdAt: m.criadaEm,
    bondingProgress: null,
    creator: m.criador,
  };
}

/**
 * Preço de um token na curva, em SOL.
 *
 * É a razão entre as reservas virtuais — o preço marginal da curva, o mesmo
 * que o programa usa. Feito em ponto flutuante de propósito: aqui é número de
 * VITRINE. A conta que move dinheiro é feita em inteiro dentro do programa, em
 * `cotarCompra`/`cotarVenda`, e nunca a partir daqui.
 */
function precoDaCurva(c: EstadoDaCurva): number {
  if (c.tokenVirtual === 0n) return 0;
  const porUnidade = Number(c.solVirtual) / Number(c.tokenVirtual);
  return (porUnidade * Number(UM_TOKEN)) / Number(LAMPORTS);
}

/* ------------------------------------------------------------------ */
/* Leitura no nó                                                       */
/* ------------------------------------------------------------------ */

interface Estados {
  curvas: Map<string, EstadoDaCurva>;
  config: EstadoDaConfig | null;
}

/**
 * Lê as contas de curva de várias moedas numa requisição só.
 *
 * `getMultipleAccounts` aceita até 100 endereços por chamada. Uma consulta por
 * moeda faria a home abrir dezenas de requisições ao nó — e o RPC é justamente
 * o recurso mais escasso que temos.
 */
async function lerCurvasDaRede(mints: string[]): Promise<Estados> {
  if (mints.length === 0) return { curvas: new Map(), config: null };

  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC;
  if (!rpc) {
    console.warn("[chroma] NEXT_PUBLIC_SOLANA_RPC não definido: curvas não serão lidas");
    return { curvas: new Map(), config: null };
  }

  const chave = `curvas:${mints.slice(0, 100).join(",")}`;

  return cached(chave, TTL_CURVAS, async () => {
    const usados = mints.slice(0, 99);

    /* A config é a mesma pra todas; entra como último endereço da mesma chamada. */
    const enderecos = [
      ...usados.map((m) => enderecoDaCurva(new PublicKey(m)).toBase58()),
      enderecoDaConfig().toBase58(),
    ];

    const resposta = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getMultipleAccounts",
        params: [enderecos, { encoding: "base64", commitment: "confirmed" }],
      }),
    });

    if (!resposta.ok) throw new Error(`RPC respondeu ${resposta.status}`);

    const json = (await resposta.json()) as {
      result?: { value: ({ data: [string, string] } | null)[] };
      error?: { message: string };
    };
    if (json.error) throw new Error(json.error.message);

    const valores = json.result?.value ?? [];
    const curvas = new Map<string, EstadoDaCurva>();

    usados.forEach((mint, i) => {
      const conta = valores[i];
      if (!conta) return; // curva não existe: moeda registrada mas nunca criada
      try {
        curvas.set(mint, lerCurva(Buffer.from(conta.data[0], "base64")));
      } catch {
        /* Conta com formato inesperado: melhor ignorar essa moeda do que
           mostrar número decodificado errado. */
      }
    });

    const contaConfig = valores[usados.length];
    let config: EstadoDaConfig | null = null;
    if (contaConfig) {
      try {
        config = lerConfig(Buffer.from(contaConfig.data[0], "base64"));
      } catch {
        /* sem config: a vitrine mostra a moeda sem progresso nem capitalização */
      }
    }

    return { curvas, config };
  }).catch((erro) => {
    console.warn("[chroma] leitura das curvas falhou:", erro);
    return { curvas: new Map<string, EstadoDaCurva>(), config: null };
  });
}
