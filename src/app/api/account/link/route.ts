import { NextResponse } from "next/server";

import { findByWallet, linkWallet, walletForChain } from "@/lib/accounts";
import { assinaturaConfere, mensagemDeVinculo } from "@/lib/wallet-auth";
import { CHAIN_IDS } from "@/lib/web3";
import type { ChainId } from "@/lib/types";

/**
 * POST /api/account/link — liga a carteira de uma segunda rede à conta.
 *
 * Esta é a ÚNICA operação de conta que exige assinatura, e é a única que muda
 * pra onde o dinheiro vai. Sem prova, qualquer um plugaria a própria MetaMask
 * no apelido de um divulgador e passaria a receber as comissões da Robinhood
 * dele. O raciocínio completo está em `src/lib/wallet-auth.ts`.
 *
 * Quem assina é uma carteira que JÁ pertence à conta — é isso que prova que a
 * conta é sua. A carteira nova não precisa assinar: vincular um endereço que
 * você não controla só prejudica você mesmo, e uma segunda janela de
 * assinatura afastaria gente por um risco que não existe.
 */

const LIMITE = { janelaMs: 60_000, max: 10 };
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
    return NextResponse.json({ error: "Muitas tentativas. Aguarde um minuto e tente novamente." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }

  const assinante = String(body.assinante ?? "");
  const endereco = String(body.endereco ?? "");
  const assinatura = String(body.assinatura ?? "");
  const mensagem = String(body.mensagem ?? "");
  const chainBruta = String(body.chain ?? "");

  if (!CHAIN_IDS.includes(chainBruta as ChainId)) {
    return NextResponse.json({ error: "rede desconhecida" }, { status: 400 });
  }
  const chain = chainBruta as ChainId;

  if (!assinante || !endereco || !assinatura || !mensagem) {
    return NextResponse.json({ error: "faltam campos" }, { status: 400 });
  }

  const conta = await findByWallet(assinante);
  if (!conta) {
    return NextResponse.json({ error: "Esta carteira ainda não tem conta na Chroma." }, { status: 404 });
  }

  /*
   * A mensagem é remontada AQUI, a partir dos campos, e comparada com a que
   * veio. Verificar só a assinatura sobre o texto recebido deixaria a pessoa
   * assinar uma coisa e o servidor usar a assinatura pra outra — o texto é
   * parte do que está sendo autorizado, não enfeite.
   */
  const momento = /^Momento: (.+)$/m.exec(mensagem);
  const esperada = momento
    ? mensagemDeVinculo({
        nickname: conta.nickname,
        chain,
        endereco,
        momento: Date.parse(momento[1]),
      })
    : null;

  if (!esperada || esperada !== mensagem) {
    return NextResponse.json({ error: "A assinatura não confere. Tente novamente." }, { status: 400 });
  }

  if (!(await assinaturaConfere({ assinante, mensagem, assinatura }))) {
    return NextResponse.json({ error: "A assinatura é inválida ou expirou. Tente novamente." }, { status: 401 });
  }

  /*
   * Trocar uma carteira já vinculada por outra também muda o destino do
   * dinheiro, então passa pelo mesmo caminho — mas vale avisar quem chamou.
   */
  const anterior = walletForChain(conta, chain);

  const resultado = await linkWallet({ contaDe: assinante, chain, endereco });
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: resultado.status });
  }

  return NextResponse.json({
    ok: true,
    account: resultado.account,
    substituiu: anterior && anterior !== endereco ? anterior : null,
  });
}
