import "server-only";

import { PublicKey } from "@solana/web3.js";

import { cached } from "@/lib/cache";
import type { NegocioDoPool } from "@/lib/market";

const PROGRAMA_DA_CURVA = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

interface TxDaHelius {
  signature: string;
  timestamp: number;
  transactionError?: unknown;
  tokenTransfers?: { mint: string; fromUserAccount?: string; toUserAccount?: string; tokenAmount: number }[];
  nativeTransfers?: { fromUserAccount: string; toUserAccount: string; amount: number }[];
  accountData?: { account: string; nativeBalanceChange: number }[];
}

/**
 * Negócios de uma moeda da Solana na curva de lançamento, lidos DIRETO da
 * rede (API de transações da Helius, a mesma do nosso RPC).
 *
 * A GeckoTerminal leva quase 1 minuto pra registrar cada negócio — a pessoa
 * comprava e a lista não mostrava (30/09/2026). Daqui chega em segundos.
 *
 * Cada transação vira um negócio pelo que a CURVA trocou: token saindo da
 * curva é compra de quem recebeu; entrando, venda. O SOL é o que passou
 * entre a carteira e a curva (sem taxas). `null` se não der pra ler — quem
 * chama cai na fonte de sempre.
 */
export async function negociosDaCurvaSolana(mint: string, precoDoSol: number): Promise<NegocioDoPool[] | null> {
  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC;
  const chave = rpc ? new URL(rpc).searchParams.get("api-key") : null;
  if (!chave || precoDoSol <= 0) return null;

  const [curva] = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve"), new PublicKey(mint).toBuffer()],
    PROGRAMA_DA_CURVA,
  );
  const enderecoDaCurva = curva.toBase58();

  return cached(`negocios-curva-sol:${mint}`, 3_000, async () => {
    const r = await fetch(
      `https://api.helius.xyz/v0/addresses/${enderecoDaCurva}/transactions?api-key=${chave}&limit=50`,
      { cache: "no-store", signal: AbortSignal.timeout(8_000) },
    );
    if (!r.ok) throw new Error(`helius ${r.status}`);
    const lista = (await r.json()) as TxDaHelius[];

    const negocios: NegocioDoPool[] = [];
    for (const tx of lista) {
      if (tx.transactionError) continue;
      const doToken = (tx.tokenTransfers ?? []).filter(
        (t) => t.mint === mint && (t.fromUserAccount === enderecoDaCurva || t.toUserAccount === enderecoDaCurva),
      );
      if (doToken.length === 0) continue; // criação da conta, taxa, etc.
      const saiuDaCurva = doToken.some((t) => t.fromUserAccount === enderecoDaCurva);
      const carteira = saiuDaCurva ? doToken[0].toUserAccount : doToken[0].fromUserAccount;
      if (!carteira) continue;
      const tokens = doToken.reduce((s, t) => s + t.tokenAmount, 0);
      /*
       * SOL do negócio = quanto o saldo da CURVA mudou. Na venda o programa
       * debita a curva direto (não há "transferência" listada) — ler só as
       * transferências fazia toda venda sumir da lista (30/09/2026).
       */
      const lamports = Math.abs(
        (tx.accountData ?? []).find((a) => a.account === enderecoDaCurva)?.nativeBalanceChange ?? 0,
      );
      if (tokens <= 0 || lamports <= 0) continue;
      negocios.push({
        carteira,
        lado: saiuDaCurva ? "compra" : "venda",
        tokens,
        usd: (lamports / 1e9) * precoDoSol,
        em: tx.timestamp * 1000,
        txHash: tx.signature,
      });
    }
    return negocios;
  }).catch(() => null);
}
