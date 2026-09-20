import "server-only";

import { cached, putStale, stale } from "./cache";
import { CHAINS } from "./web3";
import type { Candle, ChainId, TokenSummary } from "./types";

/**
 * Dados de mercado reais.
 *
 * - Dexscreener  → preço, liquidez, volume, market cap, pares (grátis, sem chave)
 * - GeckoTerminal → velas OHLCV (grátis, sem chave)
 *
 * Ambas cortam por rate limit, então tudo passa pelo cache de `./cache`.
 * Este arquivo é `server-only`: as chaves e o cache não vão pro browser.
 */

const DEXSCREENER = "https://api.dexscreener.com";
const GECKOTERMINAL = "https://api.geckoterminal.com/api/v2";

/** TTLs curtos o bastante pra parecer ao vivo, longos o bastante pra não tomar 429. */
const TTL = {
  price: 3_000,
  token: 10_000,
  list: 60_000,
  candles: 20_000,
} as const;

/* ------------------------------------------------------------------ */
/* Tradução de nomes de rede                                           */
/* ------------------------------------------------------------------ */

/**
 * Dexscreener e GeckoTerminal usam identificadores próprios pra cada rede.
 * Os dois mapas saem de CHAINS, pra existir um lugar só a mudar quando
 * entrar uma rede nova.
 */
const DEXSCREENER_TO_CHAIN: Record<string, ChainId> = Object.fromEntries(
  (Object.entries(CHAINS) as [ChainId, (typeof CHAINS)[ChainId]][]).map(([id, meta]) => [
    meta.dexscreener,
    id,
  ]),
);

const CHAIN_TO_GECKO: Record<ChainId, string> = Object.fromEntries(
  (Object.entries(CHAINS) as [ChainId, (typeof CHAINS)[ChainId]][]).map(([id, meta]) => [
    id,
    meta.gecko,
  ]),
) as Record<ChainId, string>;

export function chainFromDexscreener(id: string): ChainId | null {
  return DEXSCREENER_TO_CHAIN[id] ?? null;
}

/* ------------------------------------------------------------------ */
/* Tipos crus da Dexscreener (só o que usamos)                         */
/* ------------------------------------------------------------------ */

interface DexPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; symbol: string };
  priceUsd?: string;
  /** preço na moeda do par (ex.: HOLT por USDG) */
  priceNative?: string;
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  volume?: { m5?: number; h1?: number; h6?: number; h24?: number };
  liquidity?: { usd?: number };
  marketCap?: number;
  fdv?: number;
  pairCreatedAt?: number;
  info?: { imageUrl?: string };
}

async function getJson<T>(url: string, revalidateSeconds = 10): Promise<T> {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: revalidateSeconds },
  });
  if (!res.ok) throw new Error(`${url} respondeu ${res.status}`);
  return (await res.json()) as T;
}

/** Entre vários pares do mesmo token, o que vale é o de maior liquidez. */
function bestPair(pairs: DexPair[]): DexPair | null {
  const valid = pairs.filter((p) => DEXSCREENER_TO_CHAIN[p.chainId] && Number(p.priceUsd) > 0);
  if (!valid.length) return null;
  return valid.reduce((best, p) =>
    (p.liquidity?.usd ?? 0) > (best.liquidity?.usd ?? 0) ? p : best,
  );
}

function toSummary(pair: DexPair): TokenSummary {
  return {
    address: pair.baseToken.address,
    chain: DEXSCREENER_TO_CHAIN[pair.chainId] ?? "solana",
    name: pair.baseToken.name,
    symbol: pair.baseToken.symbol,
    imageUrl: pair.info?.imageUrl,
    description: undefined,
    priceUsd: Number(pair.priceUsd ?? 0),
    change24h: pair.priceChange?.h24 ?? 0,
    priceChanges: pair.priceChange,
    marketCapUsd: pair.marketCap ?? pair.fdv ?? 0,
    liquidityUsd: pair.liquidity?.usd ?? 0,
    volume24hUsd: pair.volume?.h24 ?? 0,
    holders: 0, // Dexscreener não expõe; o painel de segurança traz quando dá.
    createdAt: pair.pairCreatedAt ?? Date.now(),
    bondingProgress: null, // token já listado em DEX, não está em curva
    creator: "",
    pairAddress: pair.pairAddress,
    dexId: pair.dexId,
    quoteAddress: pair.quoteToken?.address,
    quoteSymbol: pair.quoteToken?.symbol,
    /*
     * A fonte dá o preço em dólar e o preço na moeda do par; a razão entre os
     * dois é quanto vale a moeda do par. Sai de graça, sem uma segunda
     * consulta que pudesse discordar da primeira.
     */
    quotePriceUsd:
      Number(pair.priceNative) > 0 ? Number(pair.priceUsd) / Number(pair.priceNative) : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Token individual                                                    */
/* ------------------------------------------------------------------ */

export async function fetchToken(address: string): Promise<TokenSummary | null> {
  const key = `token:${address}`;
  try {
    return await cached(key, TTL.token, async () => {
      const data = await getJson<{ pairs: DexPair[] | null }>(
        `${DEXSCREENER}/latest/dex/tokens/${address}`,
      );
      const pair = bestPair(data.pairs ?? []);
      if (!pair) throw new Error("token sem par listado");
      return toSummary(pair);
    });
  } catch (error) {
    console.warn("[market] fetchToken falhou:", error);
    // Se a API caiu mas já vimos esse token antes, devolve o último valor conhecido.
    return stale<TokenSummary>(key);
  }
}

/** Só o preço, com TTL bem curto — é o que alimenta o tick do gráfico. */
export async function fetchPrice(address: string): Promise<number | null> {
  const key = `price:${address}`;
  try {
    return await cached(key, TTL.price, async () => {
      const data = await getJson<{ pairs: DexPair[] | null }>(
        `${DEXSCREENER}/latest/dex/tokens/${address}`,
        3,
      );
      const pair = bestPair(data.pairs ?? []);
      if (!pair) throw new Error("sem par");
      return Number(pair.priceUsd);
    });
  } catch {
    return stale<number>(key);
  }
}

/* ------------------------------------------------------------------ */
/* Listagem                                                            */
/* ------------------------------------------------------------------ */

interface TokenProfile {
  chainId: string;
  tokenAddress: string;
  icon?: string;
  description?: string;
}

/**
 * Vitrine da home: os tokens com perfil mais recente na Dexscreener.
 *
 * Não é "os que mais subiram" — é o que existe de graça e sem chave. Um
 * ranking de verdade (novos lançamentos, maiores altas) exige indexador próprio
 * ou API paga. O `sort` abaixo reordena o que veio, não busca no universo todo.
 */
export async function fetchTokenList(limit = 24): Promise<TokenSummary[]> {
  const key = `list:${limit}`;
  try {
    return await cached(key, TTL.list, async () => {
      const profiles = await getJson<TokenProfile[]>(`${DEXSCREENER}/token-profiles/latest/v1`, 60);

      const wanted = profiles.filter((p) => DEXSCREENER_TO_CHAIN[p.chainId]).slice(0, limit);

      // A Dexscreener aceita até 30 endereços por chamada, separados por vírgula.
      const byChain = new Map<string, TokenProfile[]>();
      for (const p of wanted) {
        const bucket = byChain.get(p.chainId) ?? [];
        bucket.push(p);
        byChain.set(p.chainId, bucket);
      }

      const results = await Promise.all(
        [...byChain.entries()].map(async ([chainId, group]) => {
          const addresses = group.map((g) => g.tokenAddress).join(",");
          try {
            const data = await getJson<{ pairs: DexPair[] | null }>(
              `${DEXSCREENER}/latest/dex/tokens/${addresses}`,
              60,
            );
            const pairs = data.pairs ?? [];

            // Um token pode ter vários pares: fica só o melhor de cada.
            const perToken = new Map<string, DexPair>();
            for (const pair of pairs) {
              if (DEXSCREENER_TO_CHAIN[pair.chainId] !== DEXSCREENER_TO_CHAIN[chainId]) continue;
              const addr = pair.baseToken.address;
              const current = perToken.get(addr);
              if (!current || (pair.liquidity?.usd ?? 0) > (current.liquidity?.usd ?? 0)) {
                perToken.set(addr, pair);
              }
            }

            return [...perToken.values()].map((pair) => {
              const summary = toSummary(pair);
              const profile = group.find(
                (g) => g.tokenAddress.toLowerCase() === summary.address.toLowerCase(),
              );
              return {
                ...summary,
                imageUrl: summary.imageUrl ?? profile?.icon,
                description: profile?.description?.split("\n")[0],
              };
            });
          } catch (error) {
            console.warn(`[market] lista da rede ${chainId} falhou:`, error);
            return [];
          }
        }),
      );

      const flat = results.flat().filter((t) => t.liquidityUsd > 1_000);
      if (!flat.length) throw new Error("nenhum token utilizável na resposta");

      putStale(key, flat, TTL.list);
      return flat;
    });
  } catch (error) {
    console.warn("[market] fetchTokenList falhou:", error);
    return stale<TokenSummary[]>(key) ?? [];
  }
}

/* ------------------------------------------------------------------ */
/* Velas                                                               */
/* ------------------------------------------------------------------ */

/** Timeframes que a GeckoTerminal aceita, traduzidos dos nossos rótulos. */
const GECKO_TIMEFRAME: Record<string, { path: string; aggregate: number; seconds: number }> = {
  "1m": { path: "minute", aggregate: 1, seconds: 60 },
  "5m": { path: "minute", aggregate: 5, seconds: 300 },
  "15m": { path: "minute", aggregate: 15, seconds: 900 },
  "1h": { path: "hour", aggregate: 1, seconds: 3600 },
  "4h": { path: "hour", aggregate: 4, seconds: 14400 },
  "1d": { path: "day", aggregate: 1, seconds: 86400 },
};

export const CANDLE_INTERVALS = Object.keys(GECKO_TIMEFRAME);

export function intervalSeconds(interval: string): number {
  return GECKO_TIMEFRAME[interval]?.seconds ?? 60;
}

export async function fetchCandles(address: string, interval: string, limit = 300): Promise<Candle[]> {
  const tf = GECKO_TIMEFRAME[interval];
  if (!tf) throw new Error(`timeframe inválido: ${interval}`);

  const token = await fetchToken(address);
  if (!token?.pairAddress) throw new Error("token sem par conhecido");

  const network = CHAIN_TO_GECKO[token.chain];
  if (!network) throw new Error(`GeckoTerminal não cobre a rede ${token.chain}`);

  const key = `candles:${network}:${token.pairAddress}:${interval}`;
  return cached(key, TTL.candles, async () => {
    const url =
      `${GECKOTERMINAL}/networks/${network}/pools/${token.pairAddress}/ohlcv/${tf.path}` +
      `?aggregate=${tf.aggregate}&limit=${limit}&currency=usd`;

    const data = await getJson<{
      data: { attributes: { ohlcv_list: [number, number, number, number, number, number][] } };
    }>(url, 20);

    const list = data.data?.attributes?.ohlcv_list ?? [];

    // A GeckoTerminal devolve do mais recente pro mais antigo; o gráfico quer o contrário.
    return list
      .map(([time, open, high, low, close, volume]) => ({ time, open, high, low, close, volume }))
      .sort((a, b) => a.time - b.time);
  });
}
