import { NextResponse } from "next/server";

import { chaveInterna } from "@/lib/chave-interna";
import { gravarNoCacheDoBanco, lerDoCacheDoBanco } from "@/lib/db";
import { CA_DO_CHROMA } from "@/lib/token-oficial";

/**
 * O endereço oficial do $CHROMA trocado NA HORA, sem recompilar (13/10/2026):
 * no relançamento a moeda nasce às 11h e o site tem que mostrar o endereço no
 * mesmo minuto — recompilar na VPS leva 10 min.
 *
 * GET → { ca }. POST { ca } com a chave interna ("migrar") → grava no banco.
 */
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET() {
  const salvo = await lerDoCacheDoBanco<{ ca: string }>("token-oficial").catch(() => null);
  return NextResponse.json({ ca: salvo?.ca ?? CA_DO_CHROMA }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${chaveInterna("migrar")}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const { ca } = (await request.json().catch(() => ({}))) as { ca?: string };
  if (ca !== "" && !(ca && SOLANA.test(ca))) return NextResponse.json({ error: "endereço inválido" }, { status: 400 });
  await gravarNoCacheDoBanco("token-oficial", { ca, em: Date.now() });
  return NextResponse.json({ ok: true, ca });
}
