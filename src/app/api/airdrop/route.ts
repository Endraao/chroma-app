import { NextResponse } from "next/server";

import {
  placar,
  resumoDaTemporada,
  saldoDe,
  verificarSwapECreditar,
  verificarSwapEvmECreditar,
} from "@/lib/airdrop";

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
const ENDERECO_EVM = /^0x[0-9a-fA-F]{40}$/;
const valido = (c: string) => ENDERECO.test(c) || ENDERECO_EVM.test(c);
/* Pontos EVM são gravados em minúsculas; Solana, como vier (base58 tem caixa). */
const normal = (c: string) => (ENDERECO_EVM.test(c) ? c.toLowerCase() : c);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  /*
   * Uma ou duas carteiras (a da Solana e a da Robinhood da mesma pessoa),
   * separadas por vírgula. O saldo mostrado é a soma.
   */
  const donos = (searchParams.get("dono") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(valido)
    .slice(0, 2)
    .map(normal);

  const [tabela, temporada] = await Promise.all([placar(50), resumoDaTemporada()]);

  /*
   * Sem carteira ainda é resposta útil: a página mostra o placar e o resumo
   * pra quem não conectou. Recusar com 400 deixaria a tela vazia justamente
   * pra quem ainda está decidindo se entra.
   */
  if (donos.length === 0) {
    return NextResponse.json({ pontos: null, placar: tabela, temporada });
  }

  const saldos = await Promise.all(donos.map((d) => saldoDe(d)));

  /*
   * Só o TOTAL sai daqui, de propósito (27/09/2026, decisão do dono): quanto
   * vale cada ação é segredo da temporada. Detalhar por tipo ensinaria a
   * farmar a regra em vez de usar a plataforma.
   */
  return NextResponse.json({
    pontos: saldos.reduce((soma, s) => soma + s.total, 0),
    placar: tabela,
    temporada,
    /* A melhor posição entre as carteiras da pessoa; null fora do top. */
    posicao: (() => {
      const posicoes = donos
        .map((d) => tabela.findIndex((l) => l.carteira === d))
        .filter((i) => i >= 0);
      return posicoes.length ? Math.min(...posicoes) + 1 : null;
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

  if (!assinatura || !valido(carteira)) {
    return NextResponse.json({ error: "assinatura e carteira são obrigatórias" }, { status: 400 });
  }

  try {
    const r = ENDERECO_EVM.test(carteira)
      ? await verificarSwapEvmECreditar(assinatura, carteira)
      : await verificarSwapECreditar(assinatura, carteira);

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
