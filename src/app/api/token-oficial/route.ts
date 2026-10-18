import { NextResponse } from "next/server";

import { chaveInterna } from "@/lib/chave-interna";
import { gravarNoCacheDoBanco, lerDoCacheDoBanco } from "@/lib/db";
import { CA_DO_CHROMA } from "@/lib/token-oficial";

/**
 * O token OFICIAL da Chroma trocado NA HORA, sem recompilar (13/10/2026):
 * no lançamento a moeda nasce e o site tem que mostrar o endereço no mesmo
 * minuto — recompilar na VPS leva 10 min.
 *
 * GET → { ca, simbolo }. POST { ca, simbolo } com a chave interna ("migrar")
 * → grava no banco. `ca: ""` tira o selo do site.
 *
 * 18/10/2026: o símbolo também vem daqui (o $CHROMA foi vendido e o oficial
 * vai ser outro): selo, mural e notas do Obsi mostram o que estiver gravado.
 */
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET() {
  const salvo = await lerDoCacheDoBanco<{ ca: string; simbolo?: string }>("token-oficial").catch(() => null);
  return NextResponse.json(
    { ca: salvo?.ca ?? CA_DO_CHROMA, simbolo: salvo?.simbolo ?? "" },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${chaveInterna("migrar")}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const { ca, simbolo } = (await request.json().catch(() => ({}))) as { ca?: string; simbolo?: string };
  if (ca !== "" && !(ca && SOLANA.test(ca))) return NextResponse.json({ error: "endereço inválido" }, { status: 400 });
  const limpo = (simbolo ?? "").replace(/^\$/, "").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 16);
  await gravarNoCacheDoBanco("token-oficial", { ca, simbolo: ca ? limpo : "", em: Date.now() });
  return NextResponse.json({ ok: true, ca, simbolo: ca ? limpo : "" });
}
