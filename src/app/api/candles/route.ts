import { NextResponse } from "next/server";

import { fetchCandles, CANDLE_INTERVALS } from "@/lib/market";

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
    const candles = await fetchCandles(address, interval);
    if (!candles.length) {
      return NextResponse.json({ error: "sem velas para este par" }, { status: 404 });
    }
    return NextResponse.json(candles);
  } catch (error) {
    console.warn("[api/candles]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "falha ao buscar velas" },
      { status: 502 },
    );
  }
}
