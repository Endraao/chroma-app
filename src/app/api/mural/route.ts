import { NextResponse } from "next/server";

import { cached } from "@/lib/cache";
import { chaveInterna } from "@/lib/chave-interna";
import { listarMural, postarNotaDaHora } from "@/lib/obsi";

/**
 * O mural do Obsi (16/10/2026).
 *
 * GET → os últimos posts (20 s em memória: a home inteira lê daqui).
 * POST com a chave interna ("mural") → escreve a nota da hora. Quem chama é o
 * timer da VPS, de hora em hora; a hora é a referência, então chamar duas
 * vezes na mesma hora não duplica.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const posts = await cached("mural-obsi", 20_000, () => listarMural(20)).catch(() => []);
  return NextResponse.json({ posts }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${chaveInterna("mural")}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const r = await postarNotaDaHora();
  return NextResponse.json(r);
}
