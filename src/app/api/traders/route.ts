import { NextResponse } from "next/server";

import { fetchToken } from "@/lib/market";
import { agregarTraders } from "@/lib/traders";

/**
 * GET /api/traders?address=… → quem está posicionado, quanto botou e quanto
 * está ganhando, dentro da janela de negócios que a fonte entrega.
 *
 * O preço e a capitalização vêm daqui, do servidor, e não do cliente: se o
 * navegador pudesse mandar o preço, qualquer pessoa conseguiria pedir a tabela
 * com um preço inventado e receber de volta uma lista de lucros fabricada —
 * pronta pra tirar print e usar como prova de que a moeda está pagando.
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

  const quadro = await agregarTraders({
    address,
    precoUsd: token.priceUsd,
    marketCapUsd: token.marketCapUsd,
  });

  return NextResponse.json({ ...quadro, at: Date.now() });
}
