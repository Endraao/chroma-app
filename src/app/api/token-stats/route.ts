import { NextResponse } from "next/server";

import { fetchToken } from "@/lib/market";

/**
 * GET /api/token-stats?address=… → os números de mercado do token.
 *
 * Existe separado de `/api/price` porque serve a outro ritmo. O preço é
 * repescado a cada poucos segundos pelo gráfico; estes números mudam devagar
 * na fonte e são pedidos de dez em dez segundos.
 *
 * Vale dizer o que NÃO adianta: pedir isto de segundo em segundo devolveria o
 * mesmo número. Volume, liquidez e portadores são recalculados pela fonte de
 * tempos em tempos. O que anda a cada negócio — preço, capitalização, variação
 * e o volume acumulado na sessão — é calculado no navegador a partir do que os
 * eventos da própria rede entregam. Ver `usePoolTicker`.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "parâmetro 'address' é obrigatório" }, { status: 400 });
  }

  const token = await fetchToken(address);
  if (!token) {
    return NextResponse.json({ error: "token indisponível" }, { status: 502 });
  }

  return NextResponse.json({
    address,
    priceUsd: token.priceUsd,
    change24h: token.change24h,
    marketCapUsd: token.marketCapUsd,
    liquidityUsd: token.liquidityUsd,
    volume24hUsd: token.volume24hUsd,
    holders: token.holders,
    at: Date.now(),
  });
}
