import { NextResponse } from "next/server";

import { resolverIndicador } from "@/lib/accounts";
import { CHAIN_IDS } from "@/lib/web3";
import type { ChainId } from "@/lib/types";

/**
 * GET /api/affiliate/indicador?wallet=…&chain=… → quem recebe a comissão.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO EXISTE, SE JÁ HAVIA O `?ref=` NO NAVEGADOR
 * ---------------------------------------------------------------------------
 * A atribuição vivia só no `localStorage` de quem clicou no link. Funciona
 * enquanto a pessoa fica no mesmo navegador, e some quando ela troca de
 * aparelho, limpa o histórico ou abre em aba anônima — e o promotor perde a
 * comissão sem jamais saber por quê.
 *
 * Aqui a resposta vem da CONTA de quem está operando. Como a conta junta as
 * carteiras das duas redes, quem entrou pelo link na Solana e depois conectou
 * a Robinhood com outro endereço continua pagando o mesmo promotor.
 *
 * ---------------------------------------------------------------------------
 * ISTO NÃO MOVE DINHEIRO
 * ---------------------------------------------------------------------------
 * A rota só RESPONDE um endereço. Quem paga é a transação, assinada pela
 * própria pessoa, com a divisão feita on-chain. Se esta rota cair, o swap
 * continua funcionando — o que se perde é a comissão daquele swap, não a
 * operação.
 *
 * O endereço devolvido é público (está na blockchain) e só sai quando existe
 * um vínculo de indicação de verdade; não dá pra usar isto pra descobrir a
 * carteira de alguém, porque a resposta é a do PROMOTOR de quem perguntou.
 */

export const runtime = "nodejs";

/** Quem indica muda pouco; 60s de borda corta a maior parte das consultas. */
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get("wallet")?.trim() ?? "";
  const chain = searchParams.get("chain") as ChainId | null;

  if (!wallet || !chain || !CHAIN_IDS.includes(chain)) {
    return NextResponse.json({ error: "wallet e chain são obrigatórios" }, { status: 400 });
  }

  try {
    const indicador = await resolverIndicador(wallet, chain);

    /*
     * Sem indicador NÃO é erro: a imensa maioria das pessoas chega sozinha.
     * Devolver 404 faria a tela tratar o caso comum como falha.
     */
    return NextResponse.json({ indicador });
  } catch (erro) {
    console.error("[afiliado] falha ao resolver indicador:", erro);
    /*
     * 200 com `null`, e não 500.
     *
     * Um erro aqui não pode impedir o swap. Devolvendo nulo, a tela segue o
     * caminho de "sem indicação" — que é exatamente o que acontece hoje
     * quando o banco está fora — em vez de mostrar erro pra quem só queria
     * comprar uma moeda.
     */
    return NextResponse.json({ indicador: null });
  }
}
