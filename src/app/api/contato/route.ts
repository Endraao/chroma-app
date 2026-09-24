import { NextResponse } from "next/server";

import {
  LIMITES,
  limpar,
  origemAnonima,
  pareceCarteira,
  pareceEmail,
  passouDoLimite,
  registrarMensagem,
} from "@/lib/recados";

/**
 * POST /api/contato → mensagem do formulário de contato e suporte.
 *
 * ---------------------------------------------------------------------------
 * O E-MAIL DE DESTINO NÃO SAI DAQUI
 * ---------------------------------------------------------------------------
 * Ele vive em `CONTATO_EMAIL_DESTINO`, no servidor, e nunca é devolvido ao
 * navegador nem escrito em página nenhuma. Endereço publicado em site vira
 * alvo de coleta automatizada em questão de dias, e o inbox de suporte de uma
 * plataforma de cripto é alvo de valor: é por onde chegam as tentativas de se
 * passar por usuário pra pedir "recuperação" de carteira.
 *
 * Quem escreve fala com o formulário; a caixa fica atrás dele.
 */

/** `node:crypto` no hash do IP: precisa do runtime completo, não do edge. */
export const runtime = "nodejs";

/** Assuntos fechados — mesma razão da lista de motivos em /api/denuncia. */
const ASSUNTOS = ["ajuda", "problema", "sugestao", "parceria", "juridico", "outro"] as const;

/** O rótulo que vai no e-mail, já que o valor que trafega é só a chave. */
const ROTULO: Record<(typeof ASSUNTOS)[number], string> = {
  ajuda: "Preciso de ajuda",
  problema: "Relatar um problema",
  sugestao: "Sugestão",
  parceria: "Parceria",
  juridico: "Assunto jurídico",
  outro: "Outro",
};

export async function POST(request: Request) {
  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }

  /* Campo invisível: só robô preenche. Ver a nota em /api/denuncia. */
  if (typeof corpo.website === "string" && corpo.website.length > 0) {
    return NextResponse.json({ ok: true });
  }

  const nome = limpar(corpo.nome, LIMITES.nome);
  const email = limpar(corpo.email, LIMITES.email);
  const texto = limpar(corpo.texto, LIMITES.texto);
  const assunto = limpar(corpo.assunto, LIMITES.assunto) ?? "outro";

  if (!nome || !email || !texto) {
    return NextResponse.json(
      { error: "Preencha nome, e-mail e mensagem." },
      { status: 400 },
    );
  }
  if (!pareceEmail(email)) {
    return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
  }
  if (!(ASSUNTOS as readonly string[]).includes(assunto)) {
    return NextResponse.json({ error: "assunto desconhecido" }, { status: 400 });
  }

  /*
   * Mensagem de uma palavra quase sempre é teste de robô, e responder 400 dá
   * um recado útil a quem é gente: o formulário não engoliu o texto.
   */
  if (texto.length < 10) {
    return NextResponse.json({ error: "Escreva um pouco mais na mensagem." }, { status: 400 });
  }

  const carteira = limpar(corpo.carteira, LIMITES.carteira);
  if (carteira && !pareceCarteira(carteira)) {
    return NextResponse.json({ error: "Endereço de carteira inválido." }, { status: 400 });
  }

  const origem = origemAnonima(request);
  if (await passouDoLimite("mensagens", origem)) {
    return NextResponse.json(
      { error: "Você enviou muitas mensagens em pouco tempo. Tente novamente mais tarde." },
      { status: 429 },
    );
  }

  await registrarMensagem(
    { nome, email, carteira, assunto: ROTULO[assunto as (typeof ASSUNTOS)[number]], texto },
    origem,
  );

  return NextResponse.json({ ok: true });
}
