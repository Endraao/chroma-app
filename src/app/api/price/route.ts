import { NextResponse } from "next/server";

import { fetchPrice } from "@/lib/market";

/**
 * GET /api/price?address=… → só o preço em USD.
 *
 * É o endpoint mais chamado da aplicação (o gráfico bate a cada poucos
 * segundos), por isso devolve o mínimo possível e conta com o cache de 3s
 * do lado do servidor — mil usuários na mesma página viram uma requisição
 * à Dexscreener a cada 3 segundos, não mil.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "parâmetro 'address' é obrigatório" }, { status: 400 });
  }

  const price = await fetchPrice(address);
  if (price === null) {
    return NextResponse.json({ error: "Preço indisponível no momento." }, { status: 502 });
  }

  return NextResponse.json({ address, priceUsd: price, at: Date.now() });
}
