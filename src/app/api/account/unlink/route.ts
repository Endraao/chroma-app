import { NextResponse } from "next/server";

import { findByWallet, unlinkWallet } from "@/lib/accounts";
import { assinaturaConfere, mensagemDeDesvinculo } from "@/lib/wallet-auth";
import { CHAIN_IDS } from "@/lib/web3";
import type { ChainId } from "@/lib/types";

/**
 * POST /api/account/unlink — tira da conta a carteira de uma rede.
 *
 * Mesma proteção do vínculo: só passa com a assinatura de uma carteira que JÁ
 * é da conta, sobre a mensagem exata de `mensagemDeDesvinculo` (com prazo).
 * As regras (não deixar a conta sem carteira etc.) ficam em `unlinkWallet`.
 */
const LIMITE = { janelaMs: 60_000, max: 10 };
const acessos = new Map<string, { contagem: number; expiraEm: number }>();

function excedeuLimite(request: Request): boolean {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? request.headers.get("x-real-ip") ?? "local";
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
    return NextResponse.json({ error: "Muitas tentativas. Aguarde um minuto e tente novamente." }, { status: 429 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }
  const assinante = String(body.assinante ?? "");
  const assinatura = String(body.assinatura ?? "");
  const mensagem = String(body.mensagem ?? "");
  const chainBruta = String(body.chain ?? "");
  if (!CHAIN_IDS.includes(chainBruta as ChainId)) {
    return NextResponse.json({ error: "rede desconhecida" }, { status: 400 });
  }
  const chain = chainBruta as ChainId;
  if (!assinante || !assinatura || !mensagem) {
    return NextResponse.json({ error: "faltam campos" }, { status: 400 });
  }

  const conta = await findByWallet(assinante);
  if (!conta) {
    return NextResponse.json({ error: "Esta carteira ainda não tem conta na Chroma." }, { status: 404 });
  }

  const momento = /^Time: (.+)$/m.exec(mensagem);
  const esperada = momento ? mensagemDeDesvinculo({ nickname: conta.nickname, chain, momento: Date.parse(momento[1]) }) : null;
  if (!esperada || esperada !== mensagem) {
    return NextResponse.json({ error: "A assinatura não confere. Tente novamente." }, { status: 400 });
  }
  if (!(await assinaturaConfere({ assinante, mensagem, assinatura }))) {
    return NextResponse.json({ error: "A assinatura é inválida ou expirou. Tente novamente." }, { status: 401 });
  }

  const resultado = await unlinkWallet({ contaDe: assinante, chain });
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: resultado.status });
  }
  return NextResponse.json({ ok: true, account: resultado.account });
}
