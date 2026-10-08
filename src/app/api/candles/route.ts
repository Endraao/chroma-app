import { NextResponse } from "next/server";
import { naCdn } from "@/lib/cdn";

import { fetchCandles, CANDLE_INTERVALS, intervalSeconds } from "@/lib/market";
import { lerMoedaDaCurvaEvm, velasDaCurvaEvm } from "@/lib/curva-evm";
import { lerMoedaDaPons, velasDaPons } from "@/lib/pons";

/** GET /api/candles?address=…&interval=1m → velas reais da GeckoTerminal. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  const interval = searchParams.get("interval") ?? "1m";

  if (!address) {
    return NextResponse.json({ error: "parâmetro 'address' é obrigatório" }, { status: 400 });
  }
  if (!CANDLE_INTERVALS.includes(interval)) {
    return NextResponse.json(
      { error: `interval inválido; use um de: ${CANDLE_INTERVALS.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    /*
     * Moeda na curva da Chroma não tem pool em DEX: as velas saem dos
     * negócios registrados no próprio contrato. Depois de migrar, ela passa a
     * ter pool e o caminho de sempre volta a valer.
     */
    const daPons = await lerMoedaDaPons(address).catch(() => null);
    if (daPons) {
      const velas = await velasDaPons(daPons, intervalSeconds(interval));
      if (!velas.length) return NextResponse.json({ error: "sem velas para este par" }, { status: 404 });
      return NextResponse.json(velas, { headers: naCdn(20) });
    }
    const daCurva = await lerMoedaDaCurvaEvm(address).catch(() => null);
    if (daCurva && !daCurva.curva.migrada) {
      const velas = await velasDaCurvaEvm(address, intervalSeconds(interval));
      if (!velas.length) {
        return NextResponse.json({ error: "sem velas para este par" }, { status: 404 });
      }
      return NextResponse.json(velas, { headers: naCdn(20) });
    }

    const candles = await fetchCandles(address, interval);
    if (!candles.length) {
      return NextResponse.json({ error: "sem velas para este par" }, { status: 404 });
    }
    return NextResponse.json(candles, { headers: naCdn(20) });
  } catch (error) {
    console.warn("[api/candles]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "falha ao buscar velas" },
      { status: 502 },
    );
  }
}
