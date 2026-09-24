import { NextResponse } from "next/server";

import {
  LIMITES,
  limpar,
  origemAnonima,
  passouDoLimite,
  pareceCarteira,
  registrarDenuncia,
} from "@/lib/recados";

/**
 * POST /api/denuncia → registra uma moeda denunciada.
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO PEDE LOGIN
 * ---------------------------------------------------------------------------
 * Exigir carteira conectada pra denunciar transformaria o canal em enfeite.
 * Quem topa com conteúdo criminoso na vitrine em geral nem tem carteira aqui —
 * chegou por um link. Se só quem já é cliente pode avisar, o canal existe no
 * papel e nunca é usado, que é o pior dos mundos: o risco continua e ainda
 * fica a aparência de que há moderação.
 *
 * O preço disso é que o formulário é aberto à internet, então o que segura o
 * abuso é o limite de frequência por origem, e não a identidade de ninguém.
 */

/** `node:crypto` no hash do IP: precisa do runtime completo, não do edge. */
export const runtime = "nodejs";

/**
 * Os motivos são uma LISTA FECHADA, não texto livre.
 *
 * Duas razões. A primeira é de triagem: "conteúdo de ódio" e "golpe" pedem
 * respostas diferentes, em prazos diferentes, e agrupar por categoria é o que
 * torna a fila administrável quando ela crescer.
 *
 * A segunda é de defesa: campo livre que vira assunto de e-mail é vetor de
 * injeção. Com lista fechada, o assunto que sai daqui nunca é texto de
 * estranho.
 */
const MOTIVOS = [
  "conteudo-odioso",
  "conteudo-sexual",
  "golpe",
  "falsificacao",
  "violencia",
  "outro",
] as const;

export async function POST(request: Request) {
  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }

  /*
   * Armadilha pra robô.
   *
   * O formulário tem um campo escondido por CSS que pessoa nenhuma enxerga.
   * Robô que preenche tudo que encontra cai aqui. Respondemos 200 de
   * propósito: um 400 ensina o autor do robô que existe checagem e onde ela
   * está — o silêncio não ensina nada.
   */
  if (typeof corpo.website === "string" && corpo.website.length > 0) {
    return NextResponse.json({ ok: true });
  }

  const token = limpar(corpo.token, LIMITES.token);
  const motivo = limpar(corpo.motivo, LIMITES.motivo);

  if (!token || !motivo) {
    return NextResponse.json({ error: "token e motivo são obrigatórios" }, { status: 400 });
  }
  if (!(MOTIVOS as readonly string[]).includes(motivo)) {
    return NextResponse.json({ error: "motivo desconhecido" }, { status: 400 });
  }

  const carteira = limpar(corpo.carteira, LIMITES.carteira);
  if (carteira && !pareceCarteira(carteira)) {
    return NextResponse.json({ error: "Endereço de carteira inválido." }, { status: 400 });
  }

  const origem = origemAnonima(request);
  if (await passouDoLimite("denuncias", origem)) {
    return NextResponse.json(
      { error: "Você enviou muitas denúncias em pouco tempo. Tente novamente mais tarde." },
      { status: 429 },
    );
  }

  await registrarDenuncia(
    {
      token,
      rede: limpar(corpo.rede, 24),
      simbolo: limpar(corpo.simbolo, LIMITES.simbolo),
      motivo,
      detalhe: limpar(corpo.detalhe, LIMITES.detalhe),
      carteira,
    },
    origem,
  );

  return NextResponse.json({ ok: true });
}
