import { NextResponse } from "next/server";

import { placar, resumoDaTemporada, saldoDe, verificarSwapECreditar } from "@/lib/airdrop";
import { nivelDe } from "@/lib/airdrop-regras";

/**
 * O endpoint do airdrop.
 *
 * `GET`  → o extrato de uma carteira, o placar e o resumo da temporada.
 * `POST` → "acabei de fazer este swap"; o servidor confere na rede e credita.
 *
 * ---------------------------------------------------------------------------
 * O QUE O NAVEGADOR PODE E NÃO PODE DIZER
 * ---------------------------------------------------------------------------
 * Pode dizer: uma assinatura de transação e um endereço.
 * Não pode dizer: quantos pontos ganhou, qual foi o volume, ou que a operação
 * existiu.
 *
 * Tudo que vira ponto é conferido na blockchain em `verificarSwapECreditar`.
 * Se um dia este endpoint aceitar um número vindo da tela, o airdrop acabou —
 * e quem levar não vai ser quem usou a plataforma.
 */

/** `@solana/web3.js` precisa do runtime completo. */
export const runtime = "nodejs";

/** O saldo muda a cada operação: nada de cache. */
export const dynamic = "force-dynamic";

const ENDERECO = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dono = searchParams.get("dono")?.trim() ?? "";

  const [tabela, temporada] = await Promise.all([placar(50), resumoDaTemporada()]);

  /*
   * Sem carteira ainda é resposta útil: a página mostra o placar e o resumo
   * pra quem não conectou. Recusar com 400 deixaria a tela vazia justamente
   * pra quem ainda está decidindo se entra.
   */
  if (!dono || !ENDERECO.test(dono)) {
    return NextResponse.json({ saldo: null, nivel: null, placar: tabela, temporada });
  }

  const saldo = await saldoDe(dono);

  return NextResponse.json({
    saldo,
    nivel: nivelDe(saldo.total),
    placar: tabela,
    temporada,
    /* A posição sai da lista que já veio; `null` quando está fora do top. */
    posicao: (() => {
      const i = tabela.findIndex((l) => l.carteira === dono);
      return i >= 0 ? i + 1 : null;
    })(),
  });
}

export async function POST(request: Request) {
  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }

  const assinatura = typeof corpo.assinatura === "string" ? corpo.assinatura.trim() : "";
  const carteira = typeof corpo.carteira === "string" ? corpo.carteira.trim() : "";

  if (!assinatura || !ENDERECO.test(carteira)) {
    return NextResponse.json({ error: "assinatura e carteira são obrigatórias" }, { status: 400 });
  }

  try {
    const r = await verificarSwapECreditar(assinatura, carteira);

    /*
     * 422, não 400: o pedido estava bem formado, mas a rede não confirmou o
     * que ele afirmava. A distinção importa pra tela saber se vale a pena
     * tentar de novo — e vale, porque uma transação recém-enviada pode ainda
     * não ter sido indexada pelo RPC.
     */
    if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: 422 });

    return NextResponse.json({
      ok: true,
      pontos: r.pontos,
      volumeUsd: r.volumeUsd,
      jaCreditado: r.jaCreditado,
    });
  } catch (erro) {
    console.error("[airdrop] falha ao verificar swap:", erro);
    return NextResponse.json({ error: "Não foi possível verificar agora. Tente novamente." }, { status: 503 });
  }
}
