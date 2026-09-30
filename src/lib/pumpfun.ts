import {
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  type Connection,
  type TransactionInstruction,
} from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";

/**
 * Lançamento na Solana pela própria pump.fun.
 *
 * ---------------------------------------------------------------------------
 * POR QUE PELA PUMP.FUN E NÃO PELO PROGRAMA DA CHROMA
 * ---------------------------------------------------------------------------
 * O programa de curva da Chroma na Solana nunca foi publicado na mainnet. A
 * pump.fun já tem a curva, a liquidez e o público: a moeda criada aqui aparece
 * lá também, e é negociada pelos dois sites.
 *
 * ---------------------------------------------------------------------------
 * COMO A CHROMA GANHA
 * ---------------------------------------------------------------------------
 * 1. Taxa de lançamento — uma transferência dentro da MESMA transação que
 *    cria a moeda. Sem pagar, a moeda não nasce.
 * 2. Parte da taxa de criador — a pump.fun deixa o criador dividir a taxa de
 *    criador dele com até 10 carteiras (fee sharing). Configuramos
 *    `PARTE_DA_CHROMA_BPS` para a Chroma. Isso vale também para as operações
 *    feitas direto no site da pump.fun.
 *    ATENÇÃO: quem administra a divisão é o criador. Ele pode mudar depois
 *    pela pump.fun; o programa não oferece como travar.
 * 3. Operações feitas pelo nosso site — taxa da Chroma no swap (Jupiter),
 *    como em qualquer moeda Solana. Ver `solana-swap.ts`.
 *
 * ---------------------------------------------------------------------------
 * POR QUE DUAS TRANSAÇÕES
 * ---------------------------------------------------------------------------
 * Criar + dividir + comprar numa só passa de 1232 bytes, o limite da Solana.
 * A: taxa + criação.  B: divisão + compra inicial (a compra tem que vir DEPOIS
 * da divisão, porque a divisão muda para onde a taxa de criador vai).
 * As duas foram simuladas na mainnet antes de entrar aqui.
 */

/** Pares aceitos no lançamento: a pump.fun cota a moeda em SOL ou em USDC. */
export const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
export type ParDaPump = "SOL" | "USDC";

/** A parte da taxa de criador que vai para a Chroma, em bps (3000 = 30%). */
export const PARTE_DA_CHROMA_BPS = 3000;

/** Priority fee: sem ela, a criação pode ficar minutos na fila em hora de pico. */
const PRECO_POR_CU = 200_000; // micro-lamports

async function sdk() {
  return import("@pump-fun/pump-sdk");
}

async function montar(conn: Connection, pagador: PublicKey, ixs: TransactionInstruction[]) {
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  return new VersionedTransaction(
    new TransactionMessage({ payerKey: pagador, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message(),
  );
}

/** Transação A: taxa da Chroma + criação da moeda na pump.fun. */
export async function transacaoDeCriacao({
  conn,
  criador,
  mint,
  nome,
  simbolo,
  uri,
  carteiraDaChroma,
  taxaSol,
  paraDetentores = false,
  par = "SOL",
}: {
  conn: Connection;
  criador: PublicKey;
  mint: PublicKey;
  nome: string;
  simbolo: string;
  uri: string;
  carteiraDaChroma: PublicKey;
  taxaSol: number;
  /** recompensas do criador vão para quem segura a moeda, não pro criador */
  paraDetentores?: boolean;
  par?: ParDaPump;
}) {
  const { PUMP_SDK } = await sdk();
  const ixs: TransactionInstruction[] = [
    // Cotação em token (USDC) gasta bem mais processamento que em SOL.
    ComputeBudgetProgram.setComputeUnitLimit({ units: par === "USDC" ? 500_000 : 250_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRECO_POR_CU }),
  ];
  if (taxaSol > 0) {
    ixs.push(
      SystemProgram.transfer({
        fromPubkey: criador,
        toPubkey: carteiraDaChroma,
        lamports: Math.round(taxaSol * LAMPORTS_PER_SOL),
      }),
    );
  }
  ixs.push(
    await PUMP_SDK.createV2Instruction({
      mint,
      name: nome,
      symbol: simbolo,
      uri,
      creator: criador,
      user: criador,
      mayhemMode: false,
      // Modo detentores: a pump.fun manda a taxa de criador pros holders.
      // Nesse modo a divisão com a Chroma não existe (o criador vira a conta
      // de recompensas e não pode ser alterado).
      ...(paraDetentores ? { holderReward: true } : {}),
      ...(par === "USDC" ? { quoteMint: USDC_MINT, quoteTokenProgram: TOKEN_PROGRAM_ID } : {}),
    }),
  );
  return montar(conn, criador, ixs);
}

/**
 * Transação B: divisão da taxa de criador + compra inicial (opcional).
 *
 * Só funciona depois que a A confirmou: a compra lê o estado da curva.
 */
export async function transacaoDeDivisao({
  conn,
  criador,
  mint,
  carteiraDaChroma,
  compraSol,
  paraDetentores = false,
  par = "SOL",
}: {
  conn: Connection;
  criador: PublicKey;
  mint: PublicKey;
  carteiraDaChroma: PublicKey;
  /** compra inicial, na moeda do par (SOL ou USDC) */
  compraSol: number;
  paraDetentores?: boolean;
  par?: ParDaPump;
}) {
  const { PUMP_SDK, OnlinePumpSdk, feeSharingConfigPda, getBuyTokenAmountFromSolAmount } = await sdk();
  const BN = (await import("bn.js")).default;

  const ixs: TransactionInstruction[] = paraDetentores ? [] : [
    await PUMP_SDK.createFeeSharingConfig({ creator: criador, mint, pool: null }),
    await PUMP_SDK.updateFeeSharesV2({
      authority: criador,
      mint,
      currentShareholders: [criador],
      newShareholders: [
        { address: criador, shareBps: 10_000 - PARTE_DA_CHROMA_BPS },
        { address: carteiraDaChroma, shareBps: PARTE_DA_CHROMA_BPS },
      ],
      quoteMint: par === "USDC" ? USDC_MINT : NATIVE_MINT,
      quoteTokenProgram: TOKEN_PROGRAM_ID,
    }),
  ];

  if (compraSol > 0) {
    const online = new OnlinePumpSdk(conn);
    const [global, feeConfig] = await Promise.all([online.fetchGlobal(), online.fetchFeeConfig()]);
    const estado = await online.fetchBuyState(mint, criador, TOKEN_2022_PROGRAM_ID, par === "USDC" ? USDC_MINT : undefined);
    // Depois da divisão, a taxa de criador vai para a conta de divisão, não
    // mais para o criador: a compra precisa apontar para ela.
    if (!paraDetentores) estado.bondingCurve = { ...estado.bondingCurve, creator: feeSharingConfigPda(mint) };
    // SOL tem 9 casas; USDC, 6.
    const solAmount = new BN(Math.round(compraSol * (par === "USDC" ? 1e6 : LAMPORTS_PER_SOL)));
    const amount = getBuyTokenAmountFromSolAmount({
      global,
      feeConfig,
      mintSupply: estado.bondingCurve.tokenTotalSupply,
      bondingCurve: estado.bondingCurve,
      amount: solAmount,
      quoteMint: estado.quoteMint,
    });
    const base = {
      global,
      bondingCurveAccountInfo: estado.bondingCurveAccountInfo,
      bondingCurve: estado.bondingCurve,
      associatedUserAccountInfo: estado.associatedUserAccountInfo,
      mint,
      user: criador,
      amount,
      slippage: 2,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    };
    ixs.push(
      ...(par === "USDC"
        ? await PUMP_SDK.buyV2Instructions({ ...base, quoteAmount: solAmount, quoteTokenProgram: TOKEN_PROGRAM_ID })
        : await PUMP_SDK.buyInstructions({ ...base, solAmount })),
    );
  }
  return montar(conn, criador, ixs);
}

/** Espera a curva da moeda existir (a A confirmou, mas o RPC pode atrasar). */
export async function esperarCurva(conn: Connection, mint: PublicKey, tentativas = 15) {
  const { bondingCurvePda } = await sdk();
  const curva = bondingCurvePda(mint);
  for (let i = 0; i < tentativas; i++) {
    if (await conn.getAccountInfo(curva, "confirmed")) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("curve-timeout");
}

/**
 * A divisão da taxa de criador (70% criador / 30% Chroma) já foi feita?
 * Quando a etapa B do lançamento falha, a moeda fica sem ela — e a página
 * da moeda oferece ao criador concluir depois.
 */
export async function divisaoFeita(conn: Connection, mint: PublicKey): Promise<boolean> {
  const { feeSharingConfigPda } = await sdk();
  return Boolean(await conn.getAccountInfo(feeSharingConfigPda(mint), "confirmed"));
}
