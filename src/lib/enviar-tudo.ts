import { createBurnInstruction, createCloseAccountInstruction, NATIVE_MINT } from "@solana/spl-token";
import { ComputeBudgetProgram, type Connection, PublicKey, SystemProgram, Transaction, type TransactionInstruction } from "@solana/web3.js";

import { transacoesDeResgateDaCarteira } from "@/lib/meteora-dbc";

/**
 * "Enviar tudo" (31/10/2026, pedido do dono — igual ao da J7 Tracker): zera a
 * carteira mandando TODO o SOL pra outra, sem sobrar centavo. Antes, resgata
 * sozinho tudo que ficou pra trás:
 *  1. taxas de criador e de dono de curva na Curva da Chroma e na pool da
 *     Meteora (moedas formadas) — ver transacoesDeResgateDaCarteira;
 *  2. taxas de criador na pump.fun (cofre de criador da curva e da PumpSwap, e
 *     as moedas com divisão de taxa, que precisam ser "distribuídas");
 *  3. o "aluguel" (~0,002 SOL) de cada conta de token vazia, como o Sol
 *     Incinerator: a conta é fechada e o SOL vai direto pro destino. Contas
 *     com moeda só são queimadas se o dono pedir (e nunca NFTs, que podem ser
 *     posições de liquidez com taxa a receber).
 * Por último vai o SOL, com a taxa exata da rede, e a carteira termina em 0
 * (a Solana aceita 0 — o que ela recusa é sobrar menos que o mínimo de aluguel).
 */

const PROGRAMAS_DE_TOKEN = [
  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
  new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
];
/** Contas fechadas por transação (com a transferência final ainda cabendo em 1232 bytes). */
const FECHAR_POR_TX = 16;

export interface ContaDeToken {
  conta: PublicKey;
  programa: PublicKey;
  mint: PublicKey;
  quantidade: bigint;
  decimais: number;
  lamports: number;
  /** Dá pra fechar sem queimar nada: vazia, ou SOL embrulhado (fechar devolve o SOL). */
  fechavel: boolean;
  /** Pode ser queimada se o dono pedir: tem moeda e não é NFT. */
  queimavel: boolean;
}

/** As contas de token da carteira (programa Token e Token-2022). */
export async function contasDeToken(conexao: Connection, dono: PublicKey): Promise<ContaDeToken[]> {
  const listas = await Promise.all(
    PROGRAMAS_DE_TOKEN.map((programa) =>
      conexao.getParsedTokenAccountsByOwner(dono, { programId: programa }, "confirmed").then((r) =>
        r.value.map((c): ContaDeToken => {
          const info = (c.account.data as { parsed?: { info?: { mint?: string; state?: string; tokenAmount?: { amount?: string; decimals?: number } } } }).parsed?.info;
          const mint = new PublicKey(info?.mint ?? PublicKey.default);
          const quantidade = BigInt(info?.tokenAmount?.amount ?? "0");
          const decimais = info?.tokenAmount?.decimals ?? 0;
          // Conta congelada (a moeda travou) não fecha nem queima.
          const livre = info?.state !== "frozen";
          return {
            conta: c.pubkey,
            programa,
            mint,
            quantidade,
            decimais,
            lamports: c.account.lamports,
            fechavel: livre && (quantidade === 0n || mint.equals(NATIVE_MINT)),
            queimavel: livre && quantidade > 0n && decimais > 0 && !mint.equals(NATIVE_MINT),
          };
        }),
      ),
    ),
  );
  return listas.flat();
}

/** Preço de prioridade explícito e mínimo: sem ele a carteira (Phantom etc.) põe o dela e o saldo não fecha em 0. */
const orcamento = (unidades: number) => [
  ComputeBudgetProgram.setComputeUnitLimit({ units: unidades }),
  ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
];

/**
 * Taxas de criador na pump.fun. Moeda sem divisão: o cofre do criador (curva
 * e PumpSwap) cai direto na carteira. Moeda com divisão (as lançadas pela
 * Chroma): a taxa é "distribuída" entre os sócios — a carteira recebe a parte
 * dela, a Chroma a dela. As moedas com divisão são achadas pelas configs de
 * divisão em que a carteira é a administradora.
 */
async function transacoesDaPump(conexao: Connection, carteira: PublicKey): Promise<Transaction[]> {
  const { OnlinePumpSdk, PUMP_FEE_PROGRAM_ID, PUMP_SDK } = await import("@pump-fun/pump-sdk");
  const online = new OnlinePumpSdk(conexao);
  const grupos: TransactionInstruction[][] = [];

  const cofre = await online.getCreatorVaultBalanceBothPrograms(carteira).catch(() => null);
  if (cofre && cofre.gtn(0)) grupos.push(await online.collectCoinCreatorFeeAllQuotesInstructions(carteira, carteira).catch(() => []));

  // SharingConfig: discriminador(8) + bump(1) + versão(1) + status(1) + mint(32) → admin no byte 43.
  const divisoes = await conexao
    .getProgramAccounts(PUMP_FEE_PROGRAM_ID, { filters: [{ memcmp: { offset: 43, bytes: carteira.toBase58() } }] })
    .catch(() => []);
  for (const d of divisoes) {
    try {
      const mint = PUMP_SDK.decodeSharingConfig(d.account).mint;
      const minimo = await online.getMinimumDistributableFee(mint, carteira);
      if (!minimo.canDistribute) continue;
      grupos.push((await online.buildDistributeCreatorFeesInstructions(mint, { payer: carteira })).instructions);
    } catch {
      // Conta que não é config de divisão, ou moeda sem nada a distribuir.
    }
  }

  const { blockhash } = await conexao.getLatestBlockhash("finalized");
  const txs: Transaction[] = [];
  for (const g of grupos.filter((x) => x.length)) {
    const tx = new Transaction().add(...g);
    tx.feePayer = carteira;
    tx.recentBlockhash = blockhash;
    const sim = await conexao.simulateTransaction(tx).catch(() => null);
    if (sim && !sim.value.err) txs.push(tx);
  }
  return txs;
}

/** Tudo que a carteira tem pra resgatar antes de ser zerada (Curva da Chroma + pump.fun). */
export async function transacoesDeResgateAntesDeEnviar(conexao: Connection, carteira: PublicKey): Promise<Transaction[]> {
  const [chroma, pump] = await Promise.all([
    transacoesDeResgateDaCarteira(conexao, carteira).catch(() => []),
    transacoesDaPump(conexao, carteira).catch(() => []),
  ]);
  return [...chroma, ...pump];
}

/**
 * As transações finais: fecham as contas de token (o aluguel e o SOL embrulhado
 * vão direto pro destino; com `queimar`, as moedas que sobraram são queimadas
 * antes) e, na última, mandam TODO o SOL da carteira, descontada a taxa exata
 * de todas elas. Têm de ser enviadas na ordem, uma depois da outra.
 */
export async function transacoesDeEnviarTudo(
  conexao: Connection,
  de: PublicKey,
  para: PublicKey,
  contas: ContaDeToken[],
  queimar: boolean,
): Promise<{ txs: Transaction[]; lamports: number }> {
  const alvo = contas.filter((c) => c.fechavel || (queimar && c.queimavel));
  const lotes: ContaDeToken[][] = [];
  for (let i = 0; i < alvo.length; i += FECHAR_POR_TX) lotes.push(alvo.slice(i, i + FECHAR_POR_TX));
  if (!lotes.length) lotes.push([]);

  // Blockhash "finalized": o "confirmed" às vezes ainda não existe no nó que
  // faz a simulação do envio ("Blockhash not found", 01/11/2026).
  const [saldo, { blockhash }] = await Promise.all([conexao.getBalance(de, "confirmed"), conexao.getLatestBlockhash("finalized")]);
  const montar = (lote: ContaDeToken[], ultima: boolean, lamports: number) => {
    const ixs: TransactionInstruction[] = [];
    for (const c of lote) {
      if (queimar && c.queimavel) ixs.push(createBurnInstruction(c.conta, c.mint, de, c.quantidade, [], c.programa));
      ixs.push(createCloseAccountInstruction(c.conta, para, de, [], c.programa));
    }
    if (ultima) ixs.push(SystemProgram.transfer({ fromPubkey: de, toPubkey: para, lamports }));
    const tx = new Transaction().add(...orcamento(Math.max(1_000, lote.length * 12_000 + 1_000)), ...ixs);
    tx.feePayer = de;
    tx.recentBlockhash = blockhash;
    return tx;
  };

  // A taxa não depende do valor: mede com 1 lamport e monta de novo com o valor certo.
  let taxas = 0;
  for (const [i, lote] of lotes.entries()) {
    const tx = montar(lote, i === lotes.length - 1, 1);
    taxas += (await conexao.getFeeForMessage(tx.compileMessage(), "confirmed")).value ?? 5_001;
  }
  const lamports = saldo - taxas;
  if (lamports <= 0) throw new Error("sem saldo pra enviar");
  return { txs: lotes.map((lote, i) => montar(lote, i === lotes.length - 1, lamports)), lamports };
}
