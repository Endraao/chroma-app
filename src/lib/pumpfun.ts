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
import {
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";

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
/** "SOL" ou o endereço da moeda de cotação, da lista de PARES_DA_PUMP. */
export type ParDaPump = string;

/** Moeda de cotação e o programa de token dela: USDC é SPL, ações são Token-2022. */
async function cotacaoDoPar(conn: Connection, par: ParDaPump) {
  if (par === "SOL") return { quoteMint: NATIVE_MINT, quoteTokenProgram: TOKEN_PROGRAM_ID, casas: 9 };
  const { OnlinePumpSdk } = await sdk();
  const quoteMint = new PublicKey(par);
  const quoteTokenProgram = await new OnlinePumpSdk(conn).fetchQuoteTokenProgram(quoteMint);
  const casas = (await getMint(conn, quoteMint, "confirmed", quoteTokenProgram)).decimals;
  return { quoteMint, quoteTokenProgram, casas };
}

/** A parte da taxa de criador que vai para a Chroma, em bps (3000 = 30%). */
export const PARTE_DA_CHROMA_BPS = 3000;
export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

/** Priority fee: sem ela, a criação pode ficar minutos na fila em hora de pico. */
const PRECO_POR_CU = 200_000; // micro-lamports

async function sdk() {
  return import("@pump-fun/pump-sdk");
}

async function montar(conn: Connection, pagador: PublicKey, ixs: TransactionInstruction[]) {
  // "finalized": o "confirmed" às vezes ainda não existe no nó que recebe da carteira.
  const { blockhash } = await conn.getLatestBlockhash("finalized");
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
  const cotacao = await cotacaoDoPar(conn, par);
  const ixs: TransactionInstruction[] = [
    // Cotação em token gasta bem mais processamento que em SOL.
    ComputeBudgetProgram.setComputeUnitLimit({ units: par === "SOL" ? 250_000 : 500_000 }),
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
      ...(par === "SOL" ? {} : { quoteMint: cotacao.quoteMint, quoteTokenProgram: cotacao.quoteTokenProgram }),
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
  par,
}: {
  conn: Connection;
  criador: PublicKey;
  mint: PublicKey;
  carteiraDaChroma: PublicKey;
  /** compra inicial em SOL; em par de token ela vai em transacaoUnicaPareada */
  compraSol: number;
  paraDetentores?: boolean;
  par?: ParDaPump;
}) {
  const { PUMP_SDK, OnlinePumpSdk, feeSharingConfigPda, getBuyTokenAmountFromSolAmount } = await sdk();
  const BN = (await import("bn.js")).default;
  const cotacao = par ? await cotacaoDoPar(conn, par) : await cotacaoDaCurva(conn, mint);

  const ixs: TransactionInstruction[] = paraDetentores ? [] : [
    ...(cotacao.quoteMint.equals(NATIVE_MINT) ? [] : [ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 })]),
    ...(await contasDaDivisao(criador, carteiraDaChroma, mint, cotacao.quoteMint, cotacao.quoteTokenProgram)),
    ...(await receberTaxaParada(conn, criador, mint, cotacao.quoteMint, cotacao.quoteTokenProgram)),
    await PUMP_SDK.createFeeSharingConfig({ creator: criador, mint, pool: null }),
    await PUMP_SDK.updateFeeSharesV2({
      authority: criador,
      mint,
      currentShareholders: [criador],
      newShareholders: acionistas(criador, carteiraDaChroma),
      quoteMint: cotacao.quoteMint,
      quoteTokenProgram: cotacao.quoteTokenProgram,
    }),
  ];

  if (compraSol > 0) {
    const online = new OnlinePumpSdk(conn);
    const [global, feeConfig] = await Promise.all([online.fetchGlobal(), online.fetchFeeConfig()]);
    const estado = await online.fetchBuyState(mint, criador, TOKEN_2022_PROGRAM_ID, cotacao.quoteMint);
    // Depois da divisão, a taxa de criador vai para a conta de divisão, não
    // mais para o criador: a compra precisa apontar para ela.
    if (!paraDetentores) estado.bondingCurve = { ...estado.bondingCurve, creator: feeSharingConfigPda(mint) };
    const solAmount = new BN(Math.round(compraSol * 10 ** cotacao.casas));
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
      ...(cotacao.quoteMint.equals(NATIVE_MINT)
        ? await PUMP_SDK.buyInstructions({ ...base, solAmount })
        : await PUMP_SDK.buyV2Instructions({ ...base, quoteAmount: solAmount, quoteTokenProgram: cotacao.quoteTokenProgram })),
    );
  }
  return montar(conn, criador, ixs);
}

/** O par de uma moeda já criada, lido da curva. Sem curva ainda, vale SOL. */
async function cotacaoDaCurva(conn: Connection, mint: PublicKey) {
  const { PUMP_SDK, bondingCurvePda } = await sdk();
  const conta = await conn.getAccountInfo(bondingCurvePda(mint), "confirmed");
  const curva = conta ? PUMP_SDK.decodeBondingCurveNullable(conta) : null;
  const moeda = curva?.quoteMint;
  if (!moeda || moeda.equals(PublicKey.default) || moeda.equals(NATIVE_MINT)) return cotacaoDoPar(conn, "SOL");
  return cotacaoDoPar(conn, moeda.toBase58());
}

/**
 * Taxa de criador parada na curva bloqueia a divisão (erro 6095). Basta alguém ter
 * comprado a moeda para isso acontecer, então ela é recebida antes de dividir.
 */
async function receberTaxaParada(
  conn: Connection,
  pagador: PublicKey,
  mint: PublicKey,
  quoteMint: PublicKey,
  quoteTokenProgram: PublicKey,
): Promise<TransactionInstruction[]> {
  const { PUMP_SDK, bondingCurvePda } = await sdk();
  const conta = await conn.getAccountInfo(bondingCurvePda(mint), "confirmed");
  const curva = conta ? PUMP_SDK.decodeBondingCurveNullable(conta) : null;
  if (!curva || curva.creatorFee.isZero()) return [];
  return [await PUMP_SDK.sweepCreatorFeeInstruction({ payer: pagador, mint, creator: curva.creator, quoteMint, quoteTokenProgram })];
}

/**
 * Par em token: a divisão paga em contas dessa moeda, e o programa não as cria.
 * Sem a do cofre da divisão, ela falha com InvalidAccountData. Em SOL não há nada a criar.
 */
async function contasDaDivisao(
  criador: PublicKey,
  carteiraDaChroma: PublicKey,
  mint: PublicKey,
  quoteMint: PublicKey,
  quoteTokenProgram: PublicKey,
): Promise<TransactionInstruction[]> {
  if (quoteMint.equals(NATIVE_MINT)) return [];
  const { creatorVaultPda, feeSharingConfigPda } = await sdk();
  return [criador, carteiraDaChroma, creatorVaultPda(feeSharingConfigPda(mint))].map((dono) =>
    createAssociatedTokenAccountIdempotentInstruction(
      criador,
      getAssociatedTokenAddressSync(quoteMint, dono, true, quoteTokenProgram),
      dono,
      quoteMint,
      quoteTokenProgram,
    ),
  );
}

const JUPITER = "https://lite-api.jup.ag/swap/v1";
const LIMITE_DA_TRANSACAO = 1232;

type InstrucaoDaJupiter = {
  programId: string;
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  data: string;
};

const instrucaoDaJupiter = (i: InstrucaoDaJupiter) =>
  new TransactionInstruction({
    programId: new PublicKey(i.programId),
    keys: i.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
    data: Buffer.from(i.data, "base64"),
  });

/**
 * Primeira compra em par de token: troca SOL pelo par ANTES de a moeda existir.
 * Não cabe na transação de criação (~1.400 bytes), e aqui não há o que um sniper
 * possa fazer. Devolve o mínimo garantido, que é o valor usado na compra.
 */
export async function transacaoDeTrocaParaOPar({
  conn,
  criador,
  compraSol,
  par,
  tabela,
}: {
  conn: Connection;
  criador: PublicKey;
  compraSol: number;
  par: ParDaPump;
  tabela: PublicKey;
}): Promise<{ tx: VersionedTransaction; minimo: string }> {
  const lamports = Math.round(compraSol * LAMPORTS_PER_SOL);
  const cotado = await (
    await fetch(`${JUPITER}/quote?inputMint=${NATIVE_MINT.toBase58()}&outputMint=${par}&amount=${lamports}&slippageBps=200`)
  ).json();
  if (!cotado?.outAmount) throw new Error("no-route");
  const troca = await (
    await fetch(`${JUPITER}/swap-instructions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quoteResponse: cotado, userPublicKey: criador.toBase58(), wrapAndUnwrapSol: true }),
    })
  ).json();
  if (!troca?.swapInstruction) throw new Error("no-route");
  const tabelas = [];
  for (const t of [tabela.toBase58(), ...(troca.addressLookupTableAddresses ?? [])]) {
    const conta = (await conn.getAddressLookupTable(new PublicKey(t))).value;
    if (conta) tabelas.push(conta);
  }
  const { blockhash } = await conn.getLatestBlockhash("finalized");
  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: criador,
      recentBlockhash: blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRECO_POR_CU }),
        ...(troca.setupInstructions ?? []).map(instrucaoDaJupiter),
        instrucaoDaJupiter(troca.swapInstruction),
        ...(troca.cleanupInstruction ? [instrucaoDaJupiter(troca.cleanupInstruction)] : []),
      ],
    }).compileToV0Message(tabelas),
  );
  return { tx, minimo: String(cotado.otherAmountThreshold) };
}

/**
 * Lançamento pareado com outro ativo: cria a moeda e compra na MESMA transação,
 * como no lançamento em SOL. Ou as duas acontecem, ou nada, e ninguém entra no
 * meio. Cabe graças à tabela de endereços (lib/tabela-solana.ts).
 */
export async function transacaoUnicaPareada({
  conn,
  criador,
  mint,
  nome,
  simbolo,
  uri,
  compraNoPar,
  par,
  paraDetentores = false,
  tabela,
}: {
  conn: Connection;
  criador: PublicKey;
  mint: PublicKey;
  nome: string;
  simbolo: string;
  uri: string;
  /** quanto do par comprar, na menor unidade; null sem primeira compra */
  compraNoPar: string | null;
  par: ParDaPump;
  paraDetentores?: boolean;
  tabela: PublicKey;
}): Promise<VersionedTransaction> {
  const { PUMP_SDK, OnlinePumpSdk, getBuyTokenAmountFromSolAmount } = await sdk();
  const BN = (await import("bn.js")).default;
  const { quoteMint, quoteTokenProgram } = await cotacaoDoPar(conn, par);
  const conta = await conn.getAddressLookupTable(tabela);
  if (!conta.value) throw new Error("tabela de endereços não encontrada");
  const tabelas = [conta.value];
  const comum = {
    mint,
    name: nome,
    symbol: simbolo,
    uri,
    creator: criador,
    user: criador,
    mayhemMode: false,
    quoteMint,
    quoteTokenProgram,
    ...(paraDetentores ? { holderReward: true } : {}),
  };

  const ixs: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRECO_POR_CU }),
  ];
  if (compraNoPar) {
    const online = new OnlinePumpSdk(conn);
    const global = await online.fetchGlobal();
    const feeConfig = await online.fetchFeeConfig();
    const quoteControl = await online.fetchQuoteControl();
    const quoteAmount = new BN(compraNoPar);
    const amount = getBuyTokenAmountFromSolAmount({
      global,
      feeConfig,
      mintSupply: null,
      bondingCurve: null,
      amount: quoteAmount,
      quoteMint,
      quoteControl,
    });
    ixs.push(...(await PUMP_SDK.createV2AndBuyV2Instructions({ ...comum, global, amount, quoteAmount, slippage: 2 })));
  } else {
    ixs.push(await PUMP_SDK.createV2Instruction(comum));
  }

  const { blockhash } = await conn.getLatestBlockhash("finalized");
  return new VersionedTransaction(
    new TransactionMessage({ payerKey: criador, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message(tabelas),
  );
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
 * Quem recebe a taxa de criador: normalmente criador + Chroma. Só no site
 * local, `?taxaPara=<carteira>` na tela de criar manda 100% pra essa carteira
 * (03/11/2026: robô do $DIVVY, que repassa aos holders).
 */
function acionistas(criador: PublicKey, carteiraDaChroma: PublicKey) {
  const destino =
    process.env.NODE_ENV !== "production" && typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("taxaPara") : null;
  if (destino) return [{ address: new PublicKey(destino), shareBps: 10_000 }];
  return [
    { address: criador, shareBps: 10_000 - PARTE_DA_CHROMA_BPS },
    { address: carteiraDaChroma, shareBps: PARTE_DA_CHROMA_BPS },
  ];
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
  const cotacao = await cotacaoDaCurva(conn, mint);
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
      ...(await contasDaDivisao(criador, carteiraDaChroma, mint, cotacao.quoteMint, cotacao.quoteTokenProgram)),
      ...(await receberTaxaParada(conn, criador, mint, cotacao.quoteMint, cotacao.quoteTokenProgram)),
      await PUMP_SDK.createFeeSharingConfig({ creator: criador, mint, pool: null }),
      await PUMP_SDK.updateFeeSharesV2({
        authority: criador,
        mint,
        currentShareholders: [criador],
        newShareholders: acionistas(criador, carteiraDaChroma),
        quoteMint: cotacao.quoteMint,
        quoteTokenProgram: cotacao.quoteTokenProgram,
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

const OFFSET_DO_PAR = 83;
const validadeDoFator = 60_000;
const fatores = new Map<string, { valor: number; ate: number }>();

/**
 * Quanto vale, em SOL, 1 unidade mínima da moeda de cotação da curva. Em SOL é
 * fixo. Em par de token (SPCX, NVDAx...), vem do preço de mercado do par.
 */
async function fatorDoPar(d: Buffer): Promise<number> {
  if (d.length < OFFSET_DO_PAR + 32) return 1 / LAMPORTS_PER_SOL;
  const par = new PublicKey(d.subarray(OFFSET_DO_PAR, OFFSET_DO_PAR + 32));
  if (par.equals(PublicKey.default) || par.equals(NATIVE_MINT)) return 1 / LAMPORTS_PER_SOL;
  const chave = par.toBase58();
  const guardado = fatores.get(chave);
  if (guardado && guardado.ate > Date.now()) return guardado.valor;
  try {
    const r = await fetch(`https://lite-api.jup.ag/price/v3?ids=${chave},${NATIVE_MINT.toBase58()}`);
    const precos = (await r.json()) as Record<string, { usdPrice?: number; decimals?: number } | undefined>;
    const doPar = precos[chave];
    const doSol = precos[NATIVE_MINT.toBase58()]?.usdPrice;
    if (!doPar?.usdPrice || !doSol || doPar.decimals == null) throw new Error("sem preço do par");
    const valor = doPar.usdPrice / doSol / 10 ** doPar.decimals;
    fatores.set(chave, { valor, ate: Date.now() + validadeDoFator });
    return valor;
  } catch (e) {
    // A API de preço às vezes falha: vale o último preço lido, e a curva não some da tela.
    if (guardado) return guardado.valor;
    throw e;
  }
}

/**
 * Preço de uma moeda na curva de lançamento, em SOL por token, lido direto da
 * conta da curva. Só muda quando alguém negocia — é o que faz o gráfico ficar
 * parado sem negócio (a cotação da Jupiter oscila sozinha em moeda rasa).
 * Em par de token, convertido para SOL pelo preço do par.
 * `null` quando não há curva ou ela terminou.
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
  const sol = Number(d.readBigUInt64LE(16)) * (await fatorDoPar(d));
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

/** Tokens à venda na curva quando ela nasce (793,1 milhões, 6 casas). */
const TOKENS_A_VENDA_INICIAL = 793_100_000_000_000n;

/**
 * Progresso da curva (0–100) e SOL que ela guarda, lidos dos bytes da conta.
 * A DexScreener não informa progresso: sem isto o card mostrava "Liquidez
 * $0" e o selo da rede em vez de "Curva" com a barra.
 */
export async function estadoDaCurvaPump(
  conn: Connection,
  mint: PublicKey,
): Promise<{ progresso: number; solReal: number; completa: boolean; solNaFormatura: number; mcNaFormaturaSol: number } | null> {
  const programa = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
  const [curva] = PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mint.toBuffer()], programa);
  const conta = await conn.getAccountInfo(curva, "confirmed");
  if (!conta || !conta.owner.equals(programa) || conta.data.length < 49) return null;
  const d = conta.data;
  const tokenVirtual = d.readBigUInt64LE(8);
  const solVirtual = d.readBigUInt64LE(16);
  const tokenReal = d.readBigUInt64LE(24);
  const fator = await fatorDoPar(d);
  const solReal = Number(d.readBigUInt64LE(32)) * fator;
  const emissao = d.readBigUInt64LE(40);
  const completa = d[48] !== 0;
  const vendidos = TOKENS_A_VENDA_INICIAL > tokenReal ? TOKENS_A_VENDA_INICIAL - tokenReal : 0n;
  const progresso = completa ? 100 : Number((vendidos * 10_000n) / TOKENS_A_VENDA_INICIAL) / 100;

  /*
   * Onde ela forma (18/10/2026, painel "como na pump.fun"): produto constante
   * nas reservas VIRTUAIS. Vendido o último token, a reserva virtual de token
   * vira (virtual − real) e a de SOL, k / isso. Daí saem o SOL guardado e o
   * preço no instante da formatura — ~410 SOL de market cap na curva padrão.
   */
  const tokenNoFim = tokenVirtual > tokenReal ? tokenVirtual - tokenReal : 0n;
  let solNaFormatura = solReal;
  let mcNaFormaturaSol = 0;
  if (tokenNoFim > 0n) {
    const solVirtualNoFim = (tokenVirtual * solVirtual) / tokenNoFim;
    solNaFormatura = solReal + Number(solVirtualNoFim - solVirtual) * fator;
    mcNaFormaturaSol = (Number(solVirtualNoFim) / Number(tokenNoFim)) * Number(emissao) * fator;
  }
  return { progresso, solReal, completa, solNaFormatura, mcNaFormaturaSol };
}
