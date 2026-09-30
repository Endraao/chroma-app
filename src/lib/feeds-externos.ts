import "server-only";

import { createPublicClient, http, parseAbiItem, type Address } from "viem";

import { cached } from "@/lib/cache";
import { FABRICA_DA_PONS } from "@/lib/chroma-pons";
import { lerMoedaDaPons, precoNaPons, progressoNaPons } from "@/lib/pons";
import { precosNativos } from "@/lib/precos-nativos";
import { robinhoodChain } from "@/lib/web3";
import type { TokenSummary } from "@/lib/types";

/**
 * Mais moedas na vitrine (pedido do dono, 30/09/2026): as de destaque e as
 * mais ativas da curva de lançamento da Solana, e os lançamentos recentes da
 * Pons na Robinhood. Todas negociáveis pela Chroma — a Solana pela rota da
 * curva, a Pons pelo contrato ChromaPons.
 */

const API_DA_CURVA_SOLANA = "https://frontend-api-v3.pump.fun";
/** Tokens à venda na curva quando ela nasce (793,1 mi, 6 casas). */
const A_VENDA_INICIAL = 793_100_000_000_000;

interface MoedaDaCurvaSolana {
  mint: string;
  name: string;
  symbol: string;
  description?: string;
  image_uri?: string;
  twitter?: string;
  website?: string;
  created_timestamp?: number;
  complete?: boolean;
  usd_market_cap?: number;
  total_supply?: number;
  base_decimals?: number;
  real_sol_reserves?: number;
  real_token_reserves?: number;
  nsfw?: boolean;
  is_banned?: boolean;
}

function daCurvaSolana(m: MoedaDaCurvaSolana, precoDoSol: number): TokenSummary | null {
  if (!m.mint || m.nsfw || m.is_banned || !m.usd_market_cap) return null;
  const casas = m.base_decimals ?? 6;
  const fornecimento = (m.total_supply ?? 1e15) / 10 ** casas;
  const preco = m.usd_market_cap / fornecimento;
  const naCurva = !m.complete;
  const vendidos = A_VENDA_INICIAL - (m.real_token_reserves ?? A_VENDA_INICIAL);
  return {
    address: m.mint,
    chain: "solana",
    name: m.name,
    symbol: m.symbol,
    imageUrl: m.image_uri || undefined,
    description: m.description || undefined,
    website: m.website || undefined,
    twitter: m.twitter || undefined,
    priceUsd: preco,
    change24h: 0,
    marketCapUsd: m.usd_market_cap,
    liquidityUsd: ((m.real_sol_reserves ?? 0) / 1e9) * precoDoSol,
    volume24hUsd: 0,
    holders: 0,
    createdAt: m.created_timestamp ?? 0,
    bondingProgress: naCurva ? Math.max(0, Math.min(100, (vendidos / A_VENDA_INICIAL) * 100)) : null,
    creator: "",
    dexId: naCurva ? "pumpfun" : "pumpswap",
  };
}

async function listaDaCurvaSolana(caminho: string): Promise<MoedaDaCurvaSolana[]> {
  const r = await fetch(`${API_DA_CURVA_SOLANA}/${caminho}`, {
    headers: { "user-agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`curva solana ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

/**
 * Destaques (a lista "great-coins", base do Trending de lá), ao vivo agora e
 * recém-negociadas. Piso de US$ 8 mil de capitalização: abaixo disso é, na
 * esmagadora maioria, moeda que nasceu e morreu no mesmo minuto.
 */
export async function moedasDaCurvaSolana(): Promise<TokenSummary[]> {
  return cached("feed:curva-solana", 60_000, async () => {
    const precoDoSol = (await precosNativos().catch(() => null))?.solana ?? 0;
    const [destaque, aoVivo, ativas] = await Promise.all([
      listaDaCurvaSolana("coins/great-coins?limit=40").catch(() => []),
      listaDaCurvaSolana("coins/currently-live?limit=30&offset=0&includeNsfw=false").catch(() => []),
      listaDaCurvaSolana("coins?offset=0&limit=40&sort=last_trade_timestamp&order=DESC&includeNsfw=false").catch(() => []),
    ]);
    const vistas = new Set<string>();
    const saida: TokenSummary[] = [];
    for (const m of [...destaque, ...aoVivo, ...ativas]) {
      if (vistas.has(m.mint)) continue;
      vistas.add(m.mint);
      const t = daCurvaSolana(m, precoDoSol);
      if (t && t.marketCapUsd >= 8_000) saida.push(t);
    }
    return saida;
  }).catch(() => []);
}

const cliente = createPublicClient({
  chain: robinhoodChain,
  transport: http(process.env.ROBINHOOD_RPC || robinhoodChain.rpcUrls.default.http[0]),
});
const EVENTO_LANCADA = parseAbiItem(
  "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)",
);

/**
 * Os lançamentos mais recentes da Pons (lidos da fábrica na rede), ainda na
 * curva. Só os 12 últimos: cada um custa algumas leituras ao nó, e a vitrine
 * é refeita a cada 2 minutos.
 */
export async function moedasRecentesDaPons(): Promise<TokenSummary[]> {
  return cached("feed:pons", 90_000, async () => {
    const ultimo = await cliente.getBlockNumber();
    const logs = await cliente.getLogs({
      address: FABRICA_DA_PONS as Address,
      event: EVENTO_LANCADA,
      fromBlock: ultimo > 200_000n ? ultimo - 200_000n : 0n,
      toBlock: ultimo,
    });
    const recentes = [...new Set(logs.map((l) => l.args.token!.toLowerCase()))].reverse().slice(0, 12);
    const precoEth = (await precosNativos().catch(() => null))?.robinhood ?? 0;
    const lidas = await Promise.all(recentes.map((t) => lerMoedaDaPons(t).catch(() => null)));
    return lidas
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .map((m) => {
        const precoUsd = precoNaPons(m) * precoEth;
        return {
          address: m.moeda,
          chain: "robinhood" as const,
          name: m.nome,
          symbol: m.simbolo,
          imageUrl: m.logo || `/api/logo/${m.moeda}`,
          description: m.descricao || undefined,
          priceUsd: precoUsd,
          change24h: 0,
          marketCapUsd: precoUsd * m.emissao,
          liquidityUsd: (Number(m.ethReal) / 1e18) * precoEth,
          volume24hUsd: 0,
          holders: 0,
          createdAt: 0,
          bondingProgress: progressoNaPons(m),
          creator: m.criador,
          dexId: "pons",
        };
      });
  }).catch(() => []);
}
