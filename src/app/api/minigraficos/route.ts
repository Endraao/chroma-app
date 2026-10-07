import { NextResponse } from "next/server";

import { cached } from "@/lib/cache";

/**
 * MINI-GRÁFICOS DOS CARDS (pedido do dono, 07/10/2026: "deixa com cara de
 * gráfico, igual na pump.fun").
 *
 * O histórico de preço das últimas 24 h em velas de 15 min (96 pontos), da
 * mesma fonte que o site da Jupiter usa. Só Solana; guardado 3 min por moeda,
 * então a vitrine inteira custa poucos pedidos por minuto.
 */
const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX = 90;

async function fechamentos(mint: string): Promise<number[]> {
  return cached(`minigrafico:${mint}`, 180_000, async () => {
    const r = await fetch(
      `https://datapi.jup.ag/v2/charts/${mint}?interval=15_MINUTE&to=${Date.now()}&candles=96&type=price`,
      { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(6_000) },
    );
    if (!r.ok) return [];
    const j = (await r.json()) as { candles?: { close: number }[] };
    return (j.candles ?? []).map((c) => Number(c.close)).filter((v) => Number.isFinite(v) && v > 0);
  }).catch(() => []);
}

export async function GET(request: Request) {
  const mints = [...new Set((new URL(request.url).searchParams.get("mints") ?? "").split(",").filter((m) => MINT.test(m)))].slice(0, MAX);
  const saida: Record<string, number[]> = {};
  // Em lotes de 15: rajada grande demais vira recusa.
  for (let i = 0; i < mints.length; i += 15) {
    const lote = mints.slice(i, i + 15);
    const series = await Promise.all(lote.map(fechamentos));
    lote.forEach((m, j) => {
      if (series[j].length >= 4) saida[m] = series[j];
    });
  }
  return NextResponse.json(saida, { headers: { "cache-control": "public, max-age=60" } });
}
