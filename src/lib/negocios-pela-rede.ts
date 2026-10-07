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
  const pagador = tx.transaction.message.accountKeys[0]?.pubkey.toBase58();

  // Variação do token, por dono, nesta transação.
  const porDono = new Map<string, { antes: number; depois: number }>();
  const somar = (lista: typeof tx.meta.preTokenBalances, m: string, campo: "antes" | "depois", alvo: Map<string, { antes: number; depois: number }>) => {
    for (const b of lista ?? []) {
      if (b.mint !== m || !b.owner) continue;
      const atual = alvo.get(b.owner) ?? { antes: 0, depois: 0 };
      atual[campo] += b.uiTokenAmount.uiAmount ?? 0;
      alvo.set(b.owner, atual);
    }
  };
  somar(tx.meta.preTokenBalances, mint, "antes", porDono);
  somar(tx.meta.postTokenBalances, mint, "depois", porDono);
  const mudaram = [...porDono.entries()]
    .map(([dono, v]) => ({ dono, antes: v.antes, delta: v.depois - v.antes }))
    .filter((x) => Math.abs(x.delta) > 1e-9);
  if (!mudaram.length) return null;

  /*
   * O POOL é quem mais tinha da moeda entre os que mudaram (o cofre do par).
   * Ele perdeu moeda = alguém comprou; ganhou = alguém vendeu. Quem negociou
   * é o maior movimento do outro lado — não necessariamente quem pagou a
   * transação: em agregador e em transação nova (versão 1) o pagador muitas
   * vezes nem aparece com saldo mudando.
   */
  const pool = mudaram.reduce((a, b) => (b.antes > a.antes ? b : a));
  const tokens = -pool.delta;
  const lado = tokens > 0 ? "compra" : "venda";
  const contraparte = mudaram
    .filter((x) => x !== pool && Math.sign(x.delta) === Math.sign(tokens))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
  const carteira = contraparte?.dono ?? pagador;
  if (!carteira) return null;

  // Valor: o SOL que entrou/saiu do mesmo cofre (par contra SOL); senão, preço atual.
  const wsol = new Map<string, { antes: number; depois: number }>();
  somar(tx.meta.preTokenBalances, WSOL, "antes", wsol);
  somar(tx.meta.postTokenBalances, WSOL, "depois", wsol);
  const solDoPool = wsol.get(pool.dono);
  const sol = solDoPool ? Math.abs(solDoPool.depois - solDoPool.antes) : 0;
  const usd = sol > 0.0001 && precoSol > 0 ? sol * precoSol : Math.abs(tokens) * precoUsd;

  return {
    carteira,
    lado,
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
        // Versão 1: o formato novo de transação da Solana (2026) — com 0 o nó recusa o pacote.
        .getParsedTransactions(lote, { maxSupportedTransactionVersion: 1, commitment: "confirmed" })
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
