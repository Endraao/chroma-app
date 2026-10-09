import { NextResponse } from "next/server";

import { naCdn } from "@/lib/cdn";

/** GET /api/bnb/preco → { usd } — preço do BNB pra página de lançar (guardado 60 s no CDN). */
export async function GET() {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd", {
      signal: AbortSignal.timeout(6000),
    });
    const j = await r.json();
    const usd = Number(j?.binancecoin?.usd);
    if (!usd) throw new Error("sem preço");
    return NextResponse.json({ usd }, { headers: naCdn(60) });
  } catch {
    return NextResponse.json({ usd: null }, { status: 502 });
  }
}
