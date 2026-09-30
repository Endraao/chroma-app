import {
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  type Connection,
  TransactionInstruction,
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
export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

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

/**
 * Lançamento com UMA aprovação na carteira (par SOL).
 *
 * Tudo numa transação só não cabe (1.419 bytes contra o limite de 1.232 —
 * medido em scripts/medir-tx-unica.mts). Então são duas, montadas JUNTAS e
 * assinadas de uma vez (signAllTransactions):
 *   1. criação + compra inicial (create_v2 + buy), atômicas: a compra do
 *      criador sai no mesmo instante em que a moeda nasce, antes de qualquer
 *      robô. Sem instruções de prioridade — não caberia.
 *   2. taxa de lançamento da Chroma + divisão da taxa de criador (70/30).
 *      Não lê nada da curva, por isso pode ser montada antes da 1 existir.
 * No modo detentores não há divisão: a 2 leva só a taxa.
 */
export async function transacoesDeLancamento({
  conn,
  criador,
  mint,
  nome,
  simbolo,
  uri,
  carteiraDaChroma,
  taxaSol,
  compraSol,
  paraDetentores = false,
}: {
  conn: Connection;
  criador: PublicKey;
  mint: PublicKey;
  nome: string;
  simbolo: string;
  uri: string;
  carteiraDaChroma: PublicKey;
  taxaSol: number;
  compraSol: number;
  paraDetentores?: boolean;
}): Promise<{ criacao: VersionedTransaction; divisao: VersionedTransaction }> {
  const { PUMP_SDK, OnlinePumpSdk, getBuyTokenAmountFromSolAmount } = await sdk();
  const BN = (await import("bn.js")).default;

  const comum = {
    mint,
    name: nome,
    symbol: simbolo,
    uri,
    creator: criador,
    user: criador,
    mayhemMode: false,
    ...(paraDetentores ? { holderReward: true } : {}),
  };

  const ixs: TransactionInstruction[] = [];
  if (compraSol > 0) {
    const online = new OnlinePumpSdk(conn);
    const [global, feeConfig] = await Promise.all([online.fetchGlobal(), online.fetchFeeConfig()]);
    const solAmount = new BN(Math.round(compraSol * LAMPORTS_PER_SOL));
    const amount = getBuyTokenAmountFromSolAmount({
      global,
      feeConfig,
      mintSupply: null,
      bondingCurve: null,
      amount: solAmount,
      quoteMint: NATIVE_MINT,
    });
    ixs.push(...(await PUMP_SDK.createV2AndBuyInstructions({ ...comum, global, amount, solAmount })));
  } else {
    ixs.push(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRECO_POR_CU }),
      await PUMP_SDK.createV2Instruction(comum),
    );
  }
  const criacao = await montar(conn, criador, ixs);

  const divisao = await transacaoDeTaxaEDivisao({ conn, criador, mint, carteiraDaChroma, taxaSol, paraDetentores });
  return { criacao, divisao };
}

/**
 * Transação 2 do lançamento com uma aprovação: taxa de lançamento (com memo
 * da moeda) + divisão da taxa de criador. Também é remontada sozinha se a
 * versão assinada junto com a criação falhar.
 */
export async function transacaoDeTaxaEDivisao({
  conn,
  criador,
  mint,
  carteiraDaChroma,
  taxaSol,
  paraDetentores = false,
}: {
  conn: Connection;
  criador: PublicKey;
  mint: PublicKey;
  carteiraDaChroma: PublicKey;
  taxaSol: number;
  paraDetentores?: boolean;
}): Promise<VersionedTransaction> {
  const { PUMP_SDK } = await sdk();
  const ixsDaDivisao: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRECO_POR_CU }),
  ];
  if (taxaSol > 0) {
    ixsDaDivisao.push(
      SystemProgram.transfer({
        fromPubkey: criador,
        toPubkey: carteiraDaChroma,
        lamports: Math.round(taxaSol * LAMPORTS_PER_SOL),
      }),
      // Amarra o pagamento a ESTA moeda: o cadastro confere o memo, e o mesmo
      // pagamento não serve para registrar outra.
      new TransactionInstruction({
        programId: MEMO_PROGRAM_ID,
        keys: [],
        data: Buffer.from(mint.toBase58(), "utf8"),
      }),
    );
  }
  if (!paraDetentores) {
    ixsDaDivisao.push(
      await PUMP_SDK.createFeeSharingConfig({ creator: criador, mint, pool: null }),
      await PUMP_SDK.updateFeeSharesV2({
        authority: criador,
        mint,
        currentShareholders: [criador],
        newShareholders: [
          { address: criador, shareBps: 10_000 - PARTE_DA_CHROMA_BPS },
          { address: carteiraDaChroma, shareBps: PARTE_DA_CHROMA_BPS },
        ],
        quoteMint: NATIVE_MINT,
        quoteTokenProgram: TOKEN_PROGRAM_ID,
      }),
    );
  }
  return montar(conn, criador, ixsDaDivisao);
}

/**
 * Compra ou venda DIRETO na curva de lançamento (moeda que ainda não migrou).
 *
 * A rota da Jupiter para a curva embrulha e desembrulha SOL e, somada às
 * transferências de taxa (Chroma + indicação), passava do limite de 1.232
 * bytes: a carteira mostrava "reverted during simulation". Direto no programa
 * a transação é bem menor e as taxas cabem.
 *
 * Devolve só as instruções da troca; quem chama põe as taxas e o orçamento.
 *   compra: `lamports` é o SOL que entra na curva; `tokens` o esperado.
 *   venda:  `tokens` é o que sai da carteira; `lamports` o SOL esperado.
 */
export async function instrucoesNaCurva({
  conn,
  usuario,
  mint,
  lado,
  lamports,
  tokens,
  slippagePct,
}: {
  conn: Connection;
  usuario: PublicKey;
  mint: PublicKey;
  lado: "buy" | "sell";
  lamports: bigint;
  tokens: bigint;
  slippagePct: number;
}): Promise<TransactionInstruction[]> {
  const { PUMP_SDK, OnlinePumpSdk } = await sdk();
  const BN = (await import("bn.js")).default;
  const online = new OnlinePumpSdk(conn);
  const contaDoMint = await conn.getAccountInfo(mint, "confirmed");
  if (!contaDoMint) throw new Error("moeda não encontrada");
  const tokenProgram = contaDoMint.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  const global = await online.fetchGlobal();

  if (lado === "buy") {
    const estado = await online.fetchBuyState(mint, usuario, tokenProgram);
    return PUMP_SDK.buyInstructions({
      global,
      bondingCurveAccountInfo: estado.bondingCurveAccountInfo,
      bondingCurve: estado.bondingCurve,
      associatedUserAccountInfo: estado.associatedUserAccountInfo,
      mint,
      user: usuario,
      amount: new BN(tokens.toString()),
      solAmount: new BN(lamports.toString()),
      slippage: slippagePct,
      tokenProgram,
    });
  }
  const estado = await online.fetchSellState(mint, usuario, tokenProgram);
  return PUMP_SDK.sellInstructions({
    global,
    bondingCurveAccountInfo: estado.bondingCurveAccountInfo,
    bondingCurve: estado.bondingCurve,
    mint,
    user: usuario,
    amount: new BN(tokens.toString()),
    solAmount: new BN(lamports.toString()),
    slippage: slippagePct,
    tokenProgram,
    mayhemMode: estado.bondingCurve.isMayhemMode,
  });
}

/**
 * Preço de uma moeda na curva de lançamento, em SOL por token, lido direto da
 * conta da curva. Só muda quando alguém negocia — é o que faz o gráfico ficar
 * parado sem negócio (a cotação da Jupiter oscila sozinha em moeda rasa).
 * `null` quando não há curva, ela terminou ou não é cotada em SOL.
 */
export async function precoNaCurvaEmSol(conn: Connection, mint: PublicKey): Promise<number | null> {
  // Lido dos bytes da conta, sem o SDK: no servidor ele falha ao carregar por
  // esta rota ("exports is not defined"). Formato conferido contra o SDK.
  const programa = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
  const [curva] = PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mint.toBuffer()], programa);
  const conta = await conn.getAccountInfo(curva, "confirmed");
  if (!conta || !conta.owner.equals(programa) || conta.data.length < 49) return null;
  const d = conta.data;
  if (d[48] !== 0) return null; // curva completa: a moeda já migrou
  const token = Number(d.readBigUInt64LE(8)) / 1e6;
  const sol = Number(d.readBigUInt64LE(16)) / LAMPORTS_PER_SOL;
  return token > 0 ? sol / token : null;
}

/**
 * LANÇAMENTO EM UMA TRANSAÇÃO SÓ (decisão do dono, 30/09/2026).
 *
 * Taxa de lançamento da Chroma + criação + compra do criador, juntas e
 * atômicas: ou tudo acontece, ou nada. Não há segunda aprovação para negar
 * (antes, negar a 2ª deixava a Chroma sem taxa), e o criador compra antes de
 * qualquer um. Sem a divisão 70/30 da taxa de criador — não cabe; o criador
 * fica com 100% dela. Cabe graças à tabela de endereços (lib/tabela-solana.ts).
 */
export async function transacaoUnicaDeLancamento({
  conn,
  criador,
  mint,
  nome,
  simbolo,
  uri,
  carteiraDaChroma,
  taxaSol,
  compraSol,
  paraDetentores = false,
  tabela,
}: {
  conn: Connection;
  criador: PublicKey;
  mint: PublicKey;
  nome: string;
  simbolo: string;
  uri: string;
  carteiraDaChroma: PublicKey;
  taxaSol: number;
  compraSol: number;
  paraDetentores?: boolean;
  tabela: PublicKey;
}): Promise<VersionedTransaction> {
  const { PUMP_SDK, OnlinePumpSdk, getBuyTokenAmountFromSolAmount } = await sdk();
  const BN = (await import("bn.js")).default;

  const conta = await conn.getAddressLookupTable(tabela);
  if (!conta.value) throw new Error("tabela de endereços não encontrada");

  const ixs: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
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
  const comum = {
    mint,
    name: nome,
    symbol: simbolo,
    uri,
    creator: criador,
    user: criador,
    mayhemMode: false,
    ...(paraDetentores ? { holderReward: true } : {}),
  };
  if (compraSol > 0) {
    const online = new OnlinePumpSdk(conn);
    const [global, feeConfig] = await Promise.all([online.fetchGlobal(), online.fetchFeeConfig()]);
    const solAmount = new BN(Math.round(compraSol * LAMPORTS_PER_SOL));
    const amount = getBuyTokenAmountFromSolAmount({
      global,
      feeConfig,
      mintSupply: null,
      bondingCurve: null,
      amount: solAmount,
      quoteMint: NATIVE_MINT,
    });
    ixs.push(...(await PUMP_SDK.createV2AndBuyInstructions({ ...comum, global, amount, solAmount })));
  } else {
    ixs.push(await PUMP_SDK.createV2Instruction(comum));
  }

  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  return new VersionedTransaction(
    new TransactionMessage({ payerKey: criador, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message([conta.value]),
  );
}
