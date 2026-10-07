import "server-only";

import { Connection, PublicKey, type ParsedTransactionWithMeta } from "@solana/web3.js";

import { cached } from "@/lib/cache";
import type { NegocioDoPool } from "@/lib/market";

/**
 * NEGÓCIOS DE QUALQUER MOEDA DA SOLANA, DIRETO DA REDE (pedido do dono,
 * 07/10/2026: "quero que os trades novos apareçam sem dar F5").
 *
 * A GeckoTerminal entregava o último negócio com 45–80 s de atraso, numa
 * moeda que negocia várias vezes por segundo. Aqui: as últimas assinaturas do
 * par (pool) e as transações decodificadas, em UMA ida ao RPC (RPC Fast). Só
 * as transações novas são buscadas — as já lidas ficam na memória.
 *
 * Quem negociou = quem pagou a transação. Quanto = a variação do saldo DO
 * TOKEN dessa carteira (pre/postTokenBalances); o valor em dólar sai do SOL
 * que ela gastou/recebeu, ou, num par contra USDC, do preço atual.
 */
const WSOL = "So11111111111111111111111111111111111111112";
const LIDAS = new Map<string, NegocioDoPool | null>();
/** Última lista boa de cada moeda: uma leitura que falha não pode trocar a lista viva pela da fonte lenta. */
const ULTIMA = new Map<string, NegocioDoPool[]>();
const MAX_LIDAS = 4_000;

function lerNegocio(tx: ParsedTransactionWithMeta | null, mint: string, assinatura: string, precoUsd: number, precoSol: number): NegocioDoPool | null {
  if (!tx?.meta || tx.meta.err) return null;
  const contas = tx.transaction.message.accountKeys;
  const carteira = contas[0]?.pubkey.toBase58();
  if (!carteira) return null;
  const saldo = (lista: typeof tx.meta.preTokenBalances, m: string) =>
    (lista ?? []).filter((b) => b.mint === m && b.owner === carteira).reduce((s, b) => s + (b.uiTokenAmount.uiAmount ?? 0), 0);
  const tokens = saldo(tx.meta.postTokenBalances, mint) - saldo(tx.meta.preTokenBalances, mint);
  if (Math.abs(tokens) < 1e-9) return null; // não negociou esta moeda (transferência, outra coisa)
  const sol =
    (tx.meta.postBalances[0] - tx.meta.preBalances[0] + tx.meta.fee) / 1e9 +
    (saldo(tx.meta.postTokenBalances, WSOL) - saldo(tx.meta.preTokenBalances, WSOL));
  const usd = Math.abs(sol) > 0.0005 && precoSol > 0 ? Math.abs(sol) * precoSol : Math.abs(tokens) * precoUsd;
  return {
    carteira,
    lado: tokens > 0 ? "compra" : "venda",
    tokens: Math.abs(tokens),
    usd,
    em: (tx.blockTime ?? Math.floor(Date.now() / 1000)) * 1000,
    txHash: assinatura,
  };
}

export async function negociosPelaRede(mint: string, pool: string, precoUsd: number, precoSol: number): Promise<NegocioDoPool[] | null> {
  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC;
  if (!rpc?.startsWith("http")) return null;
  return cached(`negocios-rede:${mint}`, 2_500, async () => {
    const conexao = new Connection(rpc, { commitment: "confirmed", disableRetryOnRateLimit: true });
    const assinaturas = (await conexao.getSignaturesForAddress(new PublicKey(pool), { limit: 30 })).filter((s) => !s.err);
    const novas = assinaturas.filter((s) => !LIDAS.has(s.signature)).map((s) => s.signature);
    // Em lotes de 10: um pacote de 40 transações decodificadas às vezes falhava inteiro.
    for (let i = 0; i < novas.length; i += 10) {
      const lote = novas.slice(i, i + 10);
      const txs = await conexao
        .getParsedTransactions(lote, { maxSupportedTransactionVersion: 0, commitment: "confirmed" })
        .catch(() => null);
      if (!txs) continue; // tenta de novo na próxima leitura
      txs.forEach((tx, j) => LIDAS.set(lote[j], lerNegocio(tx, mint, lote[j], precoUsd, precoSol)));
    }
    {
      // Memória limitada: some o mais antigo.
      for (const k of LIDAS.keys()) {
        if (LIDAS.size <= MAX_LIDAS) break;
        LIDAS.delete(k);
      }
    }
    const lista = assinaturas.map((s) => LIDAS.get(s.signature)).filter((n): n is NegocioDoPool => !!n);
    ULTIMA.set(mint, lista);
    return lista;
  }).catch(() => ULTIMA.get(mint) ?? null);
}
