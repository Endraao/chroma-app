import { Connection, LAMPORTS_PER_SOL, PublicKey, type ParsedTransactionWithMeta } from "@solana/web3.js";

import { gravarNoCacheDoBanco, lerDoCacheDoBanco } from "@/lib/db";
import { ganhosDoCriador } from "@/lib/meteora-dbc";

/**
 * HISTÓRICO DE SAQUES do criador numa moeda da Curva da Chroma (pedido do
 * dono, 07/10/2026: "coloca um histórico dos valores já sacados pelo dev").
 *
 * Tudo sai da rede, nada é declarado pelo navegador: quando o total já sacado
 * (taxa total − a sacar, lido da pool) passa do que está no histórico, a gente
 * procura nas últimas transações da carteira do criador os saques desta moeda
 * e guarda no banco. Saque mais antigo que isso aparece como "anteriores".
 */
export interface Saque {
  assinatura: string;
  sol: number;
  em: number;
}

/** Saque na curva (DBC) ou na pool da Meteora depois que a moeda se forma (DAMM v2). */
const SAQUE = /Instruction: (ClaimCreatorTradingFee|ClaimPositionFee)/;
const ULTIMAS = 40;

const chave = (mint: string) => `saques-criador:${mint}`;

function valorDoSaque(tx: ParsedTransactionWithMeta | null, criador: string, alvos: string[]): number | null {
  if (!tx?.meta || tx.meta.err) return null;
  if (!(tx.meta.logMessages ?? []).some((l) => SAQUE.test(l))) return null;
  const contas = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
  // O criador assina e paga; e o saque tem que ser DESTA moeda.
  if (contas[0] !== criador || !alvos.some((a) => contas.includes(a))) return null;
  const sol = (tx.meta.postBalances[0] - tx.meta.preBalances[0] + tx.meta.fee) / LAMPORTS_PER_SOL;
  return sol > 0 ? sol : null;
}

export async function saquesDoCriador(conexao: Connection, mint: string): Promise<{ saques: Saque[]; sacadoSol: number } | null> {
  const g = await ganhosDoCriador(conexao, mint);
  if (!g) return null;
  const sacadoSol = Math.max(0, g.totalSol - g.aReceberSol);
  const saques = (await lerDoCacheDoBanco<Saque[]>(chave(mint)).catch(() => null)) ?? [];
  const registrado = saques.reduce((s, x) => s + x.sol, 0);
  if (sacadoSol - registrado < 0.00001) return { saques, sacadoSol };

  const conhecidas = new Set(saques.map((s) => s.assinatura));
  const assinaturas = (await conexao.getSignaturesForAddress(new PublicKey(g.criador), { limit: ULTIMAS }))
    .filter((s) => !s.err && !conhecidas.has(s.signature));
  const novos: Saque[] = [];
  // Em lotes pequenos: RPC público responde 429 a rajadas.
  for (let i = 0; i < assinaturas.length; i += 5) {
    const lote = assinaturas.slice(i, i + 5);
    const txs = await Promise.all(
      lote.map((s) => conexao.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 }).catch(() => null)),
    );
    txs.forEach((tx, j) => {
      const sol = valorDoSaque(tx, g.criador, [g.pool, mint]);
      if (sol) novos.push({ assinatura: lote[j].signature, sol, em: (lote[j].blockTime ?? 0) * 1000 });
    });
  }
  if (!novos.length) return { saques, sacadoSol };
  const lista = [...saques, ...novos].sort((a, b) => b.em - a.em);
  await gravarNoCacheDoBanco(chave(mint), lista).catch(() => {});
  return { saques: lista, sacadoSol };
}
