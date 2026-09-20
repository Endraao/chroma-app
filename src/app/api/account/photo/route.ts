import { NextResponse } from "next/server";

import { saveProfileMedia } from "@/lib/accounts";
import { salvarFoto } from "@/lib/media-store";
import { ESPECS, type CampoDeFoto } from "@/lib/profile-media";

/**
 * POST /api/account/photo — troca a foto de perfil ou a de capa.
 *
 * Recebe `multipart/form-data` com `wallet`, `campo` ("avatar" | "cover") e
 * `file`. Multipart em vez de base64 porque base64 infla o corpo em 33% e
 * obrigaria a carregar a imagem inteira em texto na memória.
 *
 * LIMITE CONHECIDO, o mesmo do apelido: sem assinatura, o servidor acredita na
 * carteira informada. Dá pra trocar a foto de outra conta — vandalismo, não
 * roubo, e nada disso toca em dinheiro. A decisão de não pedir assinatura está
 * explicada em `src/lib/accounts.ts`; exigir só aqui não faria sentido, já que
 * trocar o apelido alheio teria o mesmo efeito.
 */

/** Teto absoluto do corpo, antes de olhar o conteúdo. */
const MAIOR_LIMITE_MB = Math.max(...Object.values(ESPECS).map((e) => e.maxMb));

const LIMITE = { janelaMs: 60_000, max: 12 };
const acessos = new Map<string, { contagem: number; expiraEm: number }>();

function excedeuLimite(request: Request): boolean {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "local";

  const agora = Date.now();
  const atual = acessos.get(ip);

  if (!atual || atual.expiraEm <= agora) {
    acessos.set(ip, { contagem: 1, expiraEm: agora + LIMITE.janelaMs });
    return false;
  }
  atual.contagem++;
  return atual.contagem > LIMITE.max;
}

export async function POST(request: Request) {
  if (excedeuLimite(request)) {
    return NextResponse.json({ error: "muitas tentativas; espere um minuto" }, { status: 429 });
  }

  /*
   * Corta pelo cabeçalho antes de ler o corpo. Sem isto, recusar um arquivo
   * de 500 MB custaria receber os 500 MB primeiro.
   */
  const tamanho = Number(request.headers.get("content-length") ?? 0);
  if (tamanho > (MAIOR_LIMITE_MB + 1) * 1024 * 1024) {
    return NextResponse.json(
      { error: `Arquivo grande demais. O limite é ${MAIOR_LIMITE_MB} MB.` },
      { status: 413 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "envio inválido" }, { status: 400 });
  }

  const wallet = String(form.get("wallet") ?? "");
  const campoBruto = String(form.get("campo") ?? "");
  const arquivo = form.get("file");

  if (!wallet) {
    return NextResponse.json({ error: "informe a carteira" }, { status: 400 });
  }
  if (campoBruto !== "avatar" && campoBruto !== "cover") {
    return NextResponse.json({ error: "campo deve ser avatar ou cover" }, { status: 400 });
  }
  if (!(arquivo instanceof File)) {
    return NextResponse.json({ error: "nenhum arquivo enviado" }, { status: 400 });
  }

  const campo: CampoDeFoto = campoBruto;

  try {
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const salvo = await salvarFoto(campo, bytes);
    if (!salvo.ok) {
      return NextResponse.json({ error: salvo.erro }, { status: 400 });
    }

    const conta = await saveProfileMedia({
      wallet,
      [campo]: salvo.url,
    });
    if (!conta.ok) {
      return NextResponse.json({ error: conta.error }, { status: conta.status });
    }

    return NextResponse.json({ ok: true, url: salvo.url, account: conta.account });
  } catch (error) {
    console.error("[api/account/photo] falha:", error);
    return NextResponse.json({ error: "não consegui guardar a imagem" }, { status: 500 });
  }
}
