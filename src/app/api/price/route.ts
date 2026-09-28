import { NextResponse } from "next/server";

import { fetchPrice } from "@/lib/market";
import { lerMoedaDaCurvaEvm, precoEmEth } from "@/lib/curva-evm";
import { precosNativos } from "@/lib/precos-nativos";

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

  /*
   * Moeda na curva da Chroma: o preço é o da curva. Sem isto a rota devolvia
   * 502, o gráfico pedia de novo a cada 3 s e a vela nunca andava ao vivo.
   */
  const daCurva = await lerMoedaDaCurvaEvm(address).catch(() => null);
  if (daCurva && !daCurva.curva.migrada) {
    const eth = (await precosNativos().catch(() => null))?.robinhood ?? 0;
    const priceUsd = precoEmEth(daCurva.curva) * eth;
    if (priceUsd > 0) return NextResponse.json({ address, priceUsd, at: Date.now() });
  }

  const price = await fetchPrice(address);
  if (price === null) {
    return NextResponse.json({ error: "Preço indisponível no momento." }, { status: 502 });
  }

  return NextResponse.json({ address, priceUsd: price, at: Date.now() });
}
