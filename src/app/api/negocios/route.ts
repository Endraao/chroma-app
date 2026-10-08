import { NextResponse } from "next/server";
import { naCdn } from "@/lib/cdn";

import { fetchToken, fetchTrades, type NegocioDoPool } from "@/lib/market";
import { negociosPelaRede } from "@/lib/negocios-pela-rede";
import { lerMoedaDaCurvaEvm, negociosDaCurvaComoPool } from "@/lib/curva-evm";
import { negociosDaCurvaDaChroma, negociosDaCurvaSolana } from "@/lib/negocios-curva-solana";
import { cached } from "@/lib/cache";
import { lerMoedaDaPons, negociosDaPonsComoPool } from "@/lib/pons";
import { precosNativos } from "@/lib/precos-nativos";

/** Só moeda ainda na curva de lançamento (conta existe e não terminou). */
async function negociosNaCurvaDaSolana(address: string) {
  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC;
  if (!rpc?.startsWith("http")) return null;
  try {
    const [{ Connection, PublicKey }, { estadoDaCurvaPump }] = await Promise.all([
      import("@solana/web3.js"),
      import("@/lib/pumpfun"),
    ]);
    // Guardado 30 s (inclusive o "não está na curva"): era refeito a cada leitura.
    const estado = await cached(`curva-pump:${address}`, 30_000, () =>
      estadoDaCurvaPump(new Connection(rpc, { commitment: "confirmed", disableRetryOnRateLimit: true }), new PublicKey(address)),
    );
    if (!estado || estado.completa) return null;
    const sol = (await precosNativos().catch(() => null))?.solana ?? 0;
    return await negociosDaCurvaSolana(address, sol);
  } catch {
    return null;
  }
}

/**
 * GET /api/negocios?address=… → os últimos negócios da moeda, do mais novo
 * pro mais velho. Alimenta a aba "Transações" da página da moeda.
 *
 * Moeda na curva da Chroma: eventos do próprio contrato. Qualquer outra: a
 * GeckoTerminal (últimos ~300 negócios do par principal).
 */
/** Moeda ainda na curva da Chroma: a pool (guardada 30 s, inclusive o "não é"). */
async function negociosNaCurvaDaChroma(address: string) {
  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC;
  if (!rpc?.startsWith("http")) return null;
  try {
    const pool = await cached(`curva-chroma-pool:${address}`, 30_000, async () => {
      const [{ Connection }, { estadoNaCurvaDaChroma }] = await Promise.all([import("@solana/web3.js"), import("@/lib/meteora-dbc")]);
      const e = await estadoNaCurvaDaChroma(new Connection(rpc, { commitment: "confirmed", disableRetryOnRateLimit: true }), address);
      return e && !e.completa ? e.pool : null;
    });
    if (!pool) return null;
    const sol = (await precosNativos().catch(() => null))?.solana ?? 0;
    return await negociosDaCurvaDaChroma(address, pool, sol);
  } catch {
    return null;
  }
}

async function negociosRecentesDaRede(address: string) {
  try {
    const token = await fetchToken(address);
    if (!token?.pairAddress || token.chain !== "solana") return null;
    const sol = (await precosNativos().catch(() => null))?.solana ?? 0;
    return await negociosPelaRede(address, token.pairAddress, token.priceUsd, sol);
  } catch {
    return null;
  }
}

/** Os da rede primeiro (mais frescos); os da fonte de mercado completam, sem repetir. */
function juntar(daRede: NegocioDoPool[], doMercado: NegocioDoPool[]): NegocioDoPool[] {
  const vistos = new Set(daRede.map((n) => n.txHash));
  return [...daRede, ...doMercado.filter((n) => !vistos.has(n.txHash))];
}

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address");
  if (!address) return NextResponse.json({ error: "parâmetro 'address' é obrigatório" }, { status: 400 });

  let negocios: NegocioDoPool[] = [];
  try {
    const daPons = address.startsWith("0x") ? await lerMoedaDaPons(address).catch(() => null) : null;
    const daCurva = address.startsWith("0x") && !daPons ? await lerMoedaDaCurvaEvm(address).catch(() => null) : null;
    // Solana na curva de lançamento: direto da rede, em segundos (a fonte
    // de mercado leva ~1 min). Sem leitura, cai na fonte de sempre.
    // Endereço terminado em "pump" nasceu na pump.fun: nem tenta a curva da Chroma.
    const daCurvaSolana = address.startsWith("0x")
      ? null
      : ((address.endsWith("pump") ? null : await negociosNaCurvaDaChroma(address)) ?? (await negociosNaCurvaDaSolana(address)));
    // Fora de curva, na Solana: os negócios recentes direto da rede (segundos de
    // atraso, não um minuto) somados aos mais antigos da fonte de mercado.
    const daRede = !address.startsWith("0x") && !daCurvaSolana ? await negociosRecentesDaRede(address) : null;
    negocios =
      daCurvaSolana ??
      (daRede ? juntar(daRede, await fetchTrades(address).catch(() => [])) : null) ??
      (daPons ? await negociosDaPonsComoPool(daPons) : null) ??
      (daCurva && !daCurva.curva.migrada
        ? await negociosDaCurvaComoPool(address)
        : await fetchTrades(address));
  } catch (erro) {
    console.warn("[negocios]", erro);
    return NextResponse.json({ error: "Não foi possível ler os negócios agora." }, { status: 502 });
  }

  const lista = [...negocios].sort((a, b) => b.em - a.em).slice(0, 100);
  return NextResponse.json({ negocios: lista, total: negocios.length, at: Date.now() }, { headers: naCdn(2) });
}
