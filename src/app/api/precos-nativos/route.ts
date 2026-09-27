import { NextResponse } from "next/server";

import { precosNativos } from "@/lib/precos-nativos";

/**
 * GET /api/precos-nativos → { solana: 180.4, robinhood: 2690.1 }
 *
 * O preço da moeda nativa de cada rede, em dólar. Usado para mostrar quanto
 * vale o que a pessoa digita em SOL ou ETH antes de assinar. Zero significa
 * "sem preço agora" — a tela esconde o dólar em vez de mostrar um valor errado.
 */
export async function GET() {
  return NextResponse.json(await precosNativos());
}
