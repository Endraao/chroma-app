import "server-only";

import { fetchPoolFeed, fetchToken, fetchTokenList } from "./market";
import { moedasDaChroma } from "./moedas-da-chroma";
import { getTokenMeta } from "./jupiter";
import { cached } from "./cache";
import type { ChainId, TokenSummary } from "./types";

/**
 * Camada que as páginas consomem. Tenta dados reais primeiro e só cai no
 * conjunto de demonstração se a API externa estiver fora do ar — assim a
 * aplicação nunca abre vazia, mas também nunca finge que mock é real.
 *
 * Todo token de demonstração vem com `isDemo: true` pra interface poder avisar.
 */

export type SortKey = "new" | "volume" | "marketCap" | "gainers";

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
 * - Os feeds da GeckoTerminal trazem o fluxo de verdade — pool recém-criada,
 *   pool em alta, pool grande — mas NÃO cobrem a Robinhood Chain, que sequer
 *   aparece no catálogo de redes deles.
 * - A lista da Dexscreener é pequena e enviesada (só quem foi lá cadastrar o
 *   perfil), mas indexa a Robinhood e traz descrição escrita pelo projeto.
 *
 * Somadas, uma tapa o buraco da outra. Empatando no mesmo endereço, os números
 * vêm de quem apurou mais liquidez, e os campos que só uma das fontes tem
 * (imagem, descrição) são preservados dos dois lados.
 */
async function universo(): Promise<TokenSummary[]> {
  const [novas, emAlta, grandes, perfis, daCasa] = await Promise.all([
    fetchPoolFeed("solana", "new_pools"),
    fetchPoolFeed("solana", "trending_pools"),
    fetchPoolFeed("solana", "pools"),
    fetchTokenList(),
    moedasDaChroma(),
  ]);

  const porEndereco = new Map<string, TokenSummary>();

  for (const t of [...grandes, ...emAlta, ...novas, ...perfis]) {
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
  const deMercado = [...porEndereco.values()].filter((t) => t.liquidityUsd >= 1_000);

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
  for (const t of daCasa) {
    porChave.set(`${t.chain}:${t.address.toLowerCase()}`, t);
  }

  return [...porChave.values()];
}

export async function listTokens(
  sort: SortKey = "new",
  chain?: ChainId | null,
): Promise<{ tokens: TokenSummary[]; isDemo: boolean }> {
  const real = await universo();
  const base = real.length ? real : FALLBACK;
  const isDemo = real.length === 0;

  const filtradas = chain ? base.filter((t) => t.chain === chain) : base;
  return { tokens: sortTokens(filtradas, sort), isDemo };
}

export async function getToken(address: string): Promise<{ token: TokenSummary; isDemo: boolean }> {
  const real = await fetchToken(address);

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
