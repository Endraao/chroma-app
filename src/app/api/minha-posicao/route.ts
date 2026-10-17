import { NextResponse } from "next/server";
import { Connection, PublicKey, type ParsedTransactionWithMeta } from "@solana/web3.js";

import { cached } from "@/lib/cache";

/**
 * GET /api/minha-posicao?dono=…&mint=… → quanto a carteira GASTOU e RECEBEU
 * nesta moeda, lido do histórico da PRÓPRIA carteira (17/10/2026: "cadê meu
 * lucro? deveria aparecer igual na pump.fun").
 *
 * Antes o lucro saía dos últimos ~300 negócios da moeda: numa moeda agitada,
 * minutos — e a compra de quem entrou antes simplesmente não existia ("0
 * compras"). Aqui são as transações da conta do token da carteira: em cada
 * uma, o quanto de token entrou/saiu e o quanto de SOL saiu/entrou da carteira
 * (com a taxa de rede junto, que também é custo).
 */
export const dynamic = "force-dynamic";

const MAX_TRANSACOES = 150;

interface Resumo {
  gastoSol: number;
  recebidoSol: number;
  tokensComprados: number;
  tokensVendidos: number;
  compras: number;
  vendas: number;
  /** false quando a carteira tem mais transações do que lemos (o custo pode estar incompleto). */
  completo: boolean;
}

function somarTransacao(tx: ParsedTransactionWithMeta, dono: string, mint: string, r: Resumo) {
  if (!tx.meta || tx.meta.err) return;
  const chaves = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
  const i = chaves.indexOf(dono);
  const solDelta = i >= 0 ? (tx.meta.postBalances[i] - tx.meta.preBalances[i]) / 1e9 : 0;
  const tokens = (lista: typeof tx.meta.postTokenBalances) =>
    (lista ?? []).filter((b) => b.owner === dono && b.mint === mint).reduce((s, b) => s + Number(b.uiTokenAmount.uiAmount ?? 0), 0);
  const tokenDelta = tokens(tx.meta.postTokenBalances) - tokens(tx.meta.preTokenBalances);
  if (tokenDelta > 0) {
    r.compras++;
    r.tokensComprados += tokenDelta;
    r.gastoSol += Math.max(0, -solDelta);
  } else if (tokenDelta < 0) {
    r.vendas++;
    r.tokensVendidos += -tokenDelta;
    r.recebidoSol += Math.max(0, solDelta);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dono = searchParams.get("dono") ?? "";
  const mint = searchParams.get("mint") ?? "";
  try {
    new PublicKey(dono);
    new PublicKey(mint);
  } catch {
    return NextResponse.json({ error: "endereço inválido" }, { status: 400 });
  }
  const rpc = process.env.HELIUS_RPC || process.env.NEXT_PUBLIC_SOLANA_RPC;
  if (!rpc) return NextResponse.json({ error: "RPC não configurado" }, { status: 503 });

  try {
    const resumo = await cached(`minha-posicao:${dono}:${mint}`, 20_000, async () => {
      const conexao = new Connection(rpc, { commitment: "confirmed", disableRetryOnRateLimit: true });
      const contas = await conexao.getParsedTokenAccountsByOwner(new PublicKey(dono), { mint: new PublicKey(mint) });
      const assinaturas = new Set<string>();
      let completo = true;
      for (const c of contas.value) {
        const sigs = await conexao.getSignaturesForAddress(c.pubkey, { limit: MAX_TRANSACOES });
        if (sigs.length >= MAX_TRANSACOES) completo = false;
        for (const s of sigs) if (!s.err) assinaturas.add(s.signature);
      }
      const r: Resumo = { gastoSol: 0, recebidoSol: 0, tokensComprados: 0, tokensVendidos: 0, compras: 0, vendas: 0, completo };
      const lista = [...assinaturas];
      for (let i = 0; i < lista.length; i += 25) {
        const txs = await conexao.getParsedTransactions(lista.slice(i, i + 25), { maxSupportedTransactionVersion: 0 });
        for (const tx of txs) if (tx) somarTransacao(tx, dono, mint, r);
      }
      return r;
    });
    return NextResponse.json(resumo, { headers: { "cache-control": "no-store" } });
  } catch (erro) {
    console.warn("[minha-posicao] falhou:", erro);
    return NextResponse.json({ error: "Não foi possível ler o histórico agora." }, { status: 502 });
  }
}
