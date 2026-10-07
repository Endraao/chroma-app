import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, type TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";

/**
 * A "Curva da Chroma" na Solana: Meteora Dynamic Bonding Curve (DBC).
 *
 * ---------------------------------------------------------------------------
 * POR QUE EXISTE, SE JÁ LANÇAMOS NA PUMP.FUN
 * ---------------------------------------------------------------------------
 * Na pump.fun a Chroma só ganha quando a pessoa negocia pelo NOSSO site. Na
 * DBC a Chroma é "parceira" da curva: leva uma parte da taxa de TODA
 * negociação da moeda, em qualquer site ou carteira (Jupiter, Phantom...), e
 * a taxa de lançamento é cobrada pela própria curva. Receita que não depende
 * de a pessoa voltar aqui (decisão do dono, 02/10/2026).
 *
 * As regras da curva ficam numa conta "config" criada UMA vez pela Chroma
 * (ver /admin/curva-chroma). Cada lançamento aponta pra ela.
 *
 * O kit da Meteora é pesado (~6 MB): é importado só na hora do lançamento.
 */

/** Conta de configuração da curva da Chroma (criada uma vez; ver /admin/curva-chroma). */
// Criada em 02/10/2026 pela carteira de testes; as taxas da Chroma vão pra carteira da plataforma.
export const CONFIG_DA_CURVA = process.env.NEXT_PUBLIC_CHROMA_DBC_CONFIG || "BbbaZGSkhjFMfFQNfUrgbDFX9pWATSZvWoVF9jkaFQXw";
export const CURVA_CHROMA_DISPONIVEL = CONFIG_DA_CURVA.length > 30;

/**
 * Configs ANTERIORES da curva. Moeda lançada nelas continua sendo da Chroma
 * (saque do criador, bônus, resgate da plataforma); lançamento novo usa só a
 * atual. Trocar a config (ex.: mudar a taxa anti-sniper) = mover a atual pra cá.
 */
const CONFIGS_ANTIGAS: string[] = [];
export const CONFIGS_DA_CURVA = [...new Set([CONFIG_DA_CURVA, ...CONFIGS_ANTIGAS])];

type KitDbc = typeof import("@meteora-ag/dynamic-bonding-curve-sdk");
type ClienteDbc = InstanceType<KitDbc["DynamicBondingCurveClient"]>;

/** A pool da moeda em qualquer config da Chroma (a atual primeiro). */
async function acharPool(sdk: KitDbc, cliente: ClienteDbc, mint: string) {
  for (const config of CONFIGS_DA_CURVA) {
    const pool = sdk.deriveDbcPoolAddress(SOL, new PublicKey(mint), new PublicKey(config));
    // Mais duas tentativas, curtas: o RPC devolve 429 em rajada, e moeda
    // recém-lançada sem a curva vira "Token sem liquidez" na página. (No
    // servidor a espera automática do web3.js em 429 fica desligada — ela
    // chegava a 30 s e travava a página da moeda.)
    const ler = () => cliente.state.getPool(pool);
    const depois = (ms: number) => () => new Promise((ok) => setTimeout(ok, ms)).then(ler);
    const estado = (await ler().catch(depois(400)).catch(depois(900)).catch(() => null))?.poolState;
    if (estado && estado.config.toBase58() === config) return { pool, estado, config };
  }
  return null;
}

/** As pools de todas as configs da Chroma. */
async function poolsDeTodasAsConfigs(cliente: ClienteDbc) {
  return (await Promise.all(CONFIGS_DA_CURVA.map((c) => cliente.state.getPoolsByConfig(new PublicKey(c))))).flat();
}

const SOL = new PublicKey("So11111111111111111111111111111111111111112");

/**
 * As regras da curva.
 *
 *  - Começa em 30 SOL de valor de mercado e gradua em 420 SOL (parecido com a
 *    pump.fun), migrando sozinha pra uma pool DAMM v2 da Meteora.
 *  - Taxa anti-robô: 25% nos primeiros 40 segundos, depois 1%. (A config
 *    anterior, BbbaZG…, caía de 25% a 1% em 2 minutos.) A
 *    PRIMEIRA compra — a do criador, na mesma transação do lançamento — paga
 *    a taxa mínima. É o "criador compra primeiro" feito pela própria curva.
 *  - Da taxa de negociação, 20% vão pra Meteora; do resto, metade é do criador
 *    e metade da Chroma. Indicação (referral) recebe 20% da taxa, pago pela curva.
 *  - Taxa de lançamento: 0,02 SOL, cobrada pela curva e paga à Chroma.
 *  - Depois de graduar, a liquidez fica travada pra sempre (metade criador,
 *    metade Chroma), e as duas partes seguem recebendo as taxas da pool.
 */
export async function parametrosDaCurva() {
  const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
  return sdk.buildCurveWithMarketCap({
    token: {
      tokenType: sdk.TokenType.SPLToken,
      tokenBaseDecimal: sdk.TokenDecimal.SIX,
      tokenQuoteDecimal: 9,
      tokenAuthorityOption: sdk.TokenAuthorityOption.Immutable,
      totalTokenSupply: 1_000_000_000,
      leftover: 0,
    },
    fee: {
      baseFeeParams: {
        // 25% fixos nos primeiros 40 s, depois 1% (pedido do dono, 07/10/2026:
        // "sniper só entra nos primeiros segundos, depois é trade real").
        baseFeeMode: sdk.BaseFeeMode.FeeSchedulerLinear,
        feeSchedulerParam: { startingFeeBps: 2500, endingFeeBps: 100, numberOfPeriod: 1, totalDuration: 40 },
      },
      dynamicFeeEnabled: false,
      collectFeeMode: sdk.CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: 50,
      poolCreationFee: 0.02,
      enableFirstSwapWithMinFee: true,
    },
    migration: {
      migrationOption: sdk.MigrationOption.MET_DAMM_V2,
      migrationFeeOption: sdk.MigrationFeeOption.FixedBps100,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
    },
    liquidityDistribution: {
      partnerPermanentLockedLiquidityPercentage: 50,
      partnerLiquidityPercentage: 0,
      creatorPermanentLockedLiquidityPercentage: 50,
      creatorLiquidityPercentage: 0,
    },
    lockedVesting: {
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },
    activationType: sdk.ActivationType.Timestamp,
    initialMarketCap: 30,
    migrationMarketCap: 420,
  });
}

/** Transação que cria a config da curva (uso único, assinada pela carteira da Chroma). */
export async function transacaoDeCriarConfig(conexao: Connection, pagador: PublicKey, plataforma: PublicKey) {
  const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
  const cliente = new sdk.DynamicBondingCurveClient(conexao, "confirmed");
  const config = Keypair.generate();
  const tx = await cliente.partner.createConfig({
    ...(await parametrosDaCurva()),
    config: config.publicKey,
    feeClaimer: plataforma,
    leftoverReceiver: plataforma,
    quoteMint: SOL,
    payer: pagador,
  });
  tx.feePayer = pagador;
  tx.recentBlockhash = (await conexao.getLatestBlockhash("confirmed")).blockhash;
  return { tx, config };
}

/**
 * O lançamento numa transação só: cria a moeda e a pool na curva da Chroma e
 * faz a primeira compra do criador. A taxa de lançamento é cobrada pela curva.
 *
 * Quem chama assina com a carteira PRIMEIRO e só depois acrescenta a
 * assinatura da moeda nova (`partialSign(mint)`) — ordem recomendada pela
 * Phantom pra não acender aviso de segurança.
 */
export async function transacaoDeLancamentoNaCurva(params: {
  conexao: Connection;
  criador: PublicKey;
  mint: Keypair;
  nome: string;
  simbolo: string;
  uri: string;
  compraSol: number;
}): Promise<Transaction> {
  const { conexao, criador, mint, nome, simbolo, uri, compraSol } = params;
  if (!CURVA_CHROMA_DISPONIVEL) throw new Error("Curva da Chroma ainda não configurada.");
  const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
  const cliente = new sdk.DynamicBondingCurveClient(conexao, "confirmed");
  const lamports = Math.floor(compraSol * LAMPORTS_PER_SOL);
  const tx = await cliente.creator.createPoolWithFirstBuy({
    createPoolParam: {
      name: nome,
      symbol: simbolo,
      uri,
      payer: criador,
      poolCreator: criador,
      config: new PublicKey(CONFIG_DA_CURVA),
      baseMint: mint.publicKey,
    },
    firstBuyParam:
      lamports > 0
        ? { buyer: criador, buyAmount: new BN(lamports), minimumAmountOut: new BN(1), referralTokenAccount: null }
        : undefined,
  });
  tx.feePayer = criador;
  tx.recentBlockhash = (await conexao.getLatestBlockhash("confirmed")).blockhash;
  return tx;
}

/**
 * A prova de que a moeda nasceu na curva da Chroma: a pool derivada de
 * (SOL, moeda, NOSSA config) existe na rede. Devolve quem criou.
 */
export async function lerPoolDaCurva(conexao: Connection, mint: string): Promise<{ criador: string; pool: string } | null> {
  if (!CURVA_CHROMA_DISPONIVEL) return null;
  const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
  const cliente = new sdk.DynamicBondingCurveClient(conexao, "confirmed");
  const achado = await acharPool(sdk, cliente, mint);
  if (!achado) return null;
  return { criador: achado.estado.creator.toBase58(), pool: achado.pool.toBase58() };
}

/**
 * Estado ao vivo de uma moeda na curva da Chroma: preço em SOL, SOL guardado
 * e progresso até graduar. Null se a moeda não está na nossa curva.
 *
 * A DexScreener mostra liquidez 0 pra moeda em curva (não é pool de DEX) e
 * demora a indexar a moeda recém-criada; a página precisa disto pra mostrar
 * preço, liquidez e "Curva X%" desde o primeiro segundo.
 */
export async function estadoNaCurvaDaChroma(
  conexao: Connection,
  mint: string,
): Promise<{ precoSol: number; solReal: number; progresso: number; completa: boolean; criador: string; pool: string } | null> {
  if (!CURVA_CHROMA_DISPONIVEL) return null;
  const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
  const cliente = new sdk.DynamicBondingCurveClient(conexao, "confirmed");
  const achado = await acharPool(sdk, cliente, mint);
  if (!achado) return null;
  const { estado } = achado;
  const config = await cliente.state.getPoolConfig(new PublicKey(achado.config));
  if (!config) return null;
  const limite = Number(config.migrationQuoteThreshold.toString());
  const reserva = Number(estado.quoteReserve.toString());
  return {
    precoSol: Number(sdk.getPriceFromSqrtPrice(estado.sqrtPrice, sdk.TokenDecimal.SIX, 9).toString()),
    solReal: reserva / LAMPORTS_PER_SOL,
    progresso: limite > 0 ? Math.min(100, (reserva / limite) * 100) : 0,
    completa: Number(estado.isMigrated) !== 0 || (limite > 0 && reserva >= limite),
    criador: estado.creator.toBase58(),
    pool: achado.pool.toBase58(),
  };
}

/**
 * O que a Chroma tem pra receber na curva e as transações pra resgatar.
 *
 * Na DBC as taxas não caem sozinhas na carteira: ficam guardadas em cada
 * pool até o "fee claimer" (a carteira da plataforma) resgatar — taxa de
 * negociação de cada pool e a taxa de lançamento (0,02 SOL) de cada moeda.
 * Cada pool vira uma transação, simulada antes: a que não tem nada a
 * resgatar (ou já foi resgatada) fica de fora.
 */
export async function transacoesDeResgate(conexao: Connection, carteira: PublicKey) {
  const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
  const cliente = new sdk.DynamicBondingCurveClient(conexao, "confirmed");
  const pools = (await Promise.all(CONFIGS_DA_CURVA.map((c) => cliente.state.getPoolsFeesByConfig(new PublicKey(c))))).flat();
  const max = new BN("18446744073709551615");
  const { blockhash } = await conexao.getLatestBlockhash("confirmed");
  // Cada moeda vira um GRUPO de instruções já simulado; no fim os grupos são
  // empacotados no menor número de transações — com 100 moedas eram 100
  // confirmações na carteira (07/10/2026).
  const grupos: TransactionInstruction[][] = [];
  let lamports = 0;

  for (const p of pools) {
    const pendente = Number(p.partnerQuoteFee.toString());
    // Menos de 0,0001 SOL de negociação não vale uma confirmação sozinho.
    const migalha = pendente < 100_000;

    const negociacao = await cliente.partner.claimPartnerTradingFee({
      feeClaimer: carteira,
      payer: carteira,
      pool: p.poolAddress,
      maxBaseAmount: max,
      maxQuoteAmount: max,
      receiver: carteira,
    });
    const lancamento = await cliente.partner
      .claimPartnerPoolCreationFee({ pool: p.poolAddress, feeReceiver: carteira })
      .catch(() => null);

    // Tenta as duas juntas; se falhar, cada uma sozinha. A de lançamento vem
    // PRIMEIRO: o SOL dela paga a conta temporária que o resgate da negociação
    // abre — com a carteira da plataforma quase vazia, a ordem inversa falhava.
    const tentativas = [
      [...(lancamento?.instructions ?? []), ...negociacao.instructions],
      migalha ? [] : negociacao.instructions,
      lancamento?.instructions ?? [],
    ];
    for (const instrucoes of tentativas) {
      if (!instrucoes.length) continue;
      const tx = new Transaction().add(...instrucoes);
      tx.feePayer = carteira;
      tx.recentBlockhash = blockhash;
      const sim = await conexao.simulateTransaction(tx, undefined, [carteira]).catch(() => null);
      if (!sim || sim.value.err) continue;
      grupos.push(instrucoes);
      lamports += pendente;
      break;
    }
  }

  // Empacota: junta grupos enquanto couber em 1232 bytes E a simulação passar.
  const nova = (instrucoes: TransactionInstruction[]) => {
    const tx = new Transaction().add(...instrucoes);
    tx.feePayer = carteira;
    tx.recentBlockhash = blockhash;
    return tx;
  };
  const cabe = (tx: Transaction) => {
    try {
      return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).length <= 1232;
    } catch {
      return false;
    }
  };
  const lotes: TransactionInstruction[][] = [];
  for (const g of grupos) {
    const ultimo = lotes[lotes.length - 1];
    const junto = ultimo ? nova([...ultimo, ...g]) : null;
    const passa =
      junto && cabe(junto) && (await conexao.simulateTransaction(junto, undefined, [carteira]).then((r) => !r.value.err).catch(() => false));
    if (passa) lotes[lotes.length - 1] = [...ultimo, ...g];
    else lotes.push(g);
  }
  return { txs: lotes.map(nova), pools: pools.length, taxaNegociacaoSol: lamports / LAMPORTS_PER_SOL };
}

/**
 * ---------------------------------------------------------------------------
 * DEPOIS QUE A MOEDA SE FORMA (pool DAMM v2 da Meteora)
 * ---------------------------------------------------------------------------
 * Quando a curva enche, a moeda migra sozinha pra uma pool DAMM v2 (taxa fixa
 * de 1%, config FixedBps100 da Meteora). A liquidez fica travada pra sempre em
 * DUAS posições: metade da Chroma, metade do criador. Cada posição recebe sua
 * parte da taxa da pool (80% da taxa vai pras posições, 20% pra Meteora) —
 * as mesmas proporções da curva: 0,4% do volume pra cada lado.
 *
 * A pool cobra a taxa só em SOL (collectFeeMode = OnlyB), então tudo aqui
 * soma lamports. A curva continua existindo depois da migração: o que sobrou
 * de taxa nela ainda se saca por ela.
 */
async function poolNaMeteora(conexao: Connection, mint: string) {
  const [dbc, amm] = await Promise.all([import("@meteora-ag/dynamic-bonding-curve-sdk"), import("@meteora-ag/cp-amm-sdk")]);
  const pool = dbc.deriveDammV2PoolAddress(
    dbc.DAMM_V2_MIGRATION_FEE_ADDRESS[dbc.MigrationFeeOption.FixedBps100],
    new PublicKey(mint),
    SOL,
  );
  const cliente = new amm.CpAmm(conexao);
  const estado = await cliente.fetchPoolState(pool).catch(() => null);
  return estado ? { amm, cliente, pool, estado } : null;
}

/** A parte de cada lado (Chroma ou criador) na taxa da pool da Meteora: metade, em lamports. */
function metadeDaTaxaNaMeteora(estado: { metrics: { totalLpBFee: BN } }): number {
  return Number(estado.metrics.totalLpBFee.toString()) / 2;
}

/** As posições de uma carteira na pool da Meteora, com a taxa ainda não sacada. */
async function posicoesNaMeteora(conexao: Connection, mint: string, dono: PublicKey) {
  const m = await poolNaMeteora(conexao, mint);
  if (!m) return null;
  const posicoes = await m.cliente.getUserPositionByPool(m.pool, dono).catch(() => []);
  return {
    ...m,
    posicoes: posicoes.map((p) => ({ ...p, aReceber: Number(m.amm.getUnClaimLpFee(m.estado, p.positionState).feeTokenB.toString()) })),
  };
}

/** Grupos de instruções que sacam a taxa das posições de `dono` na pool da Meteora. */
async function instrucoesDeSaqueNaMeteora(conexao: Connection, mint: string, dono: PublicKey) {
  const m = await posicoesNaMeteora(conexao, mint, dono);
  if (!m) return { grupos: [] as TransactionInstruction[][], lamports: 0 };
  const comTaxa = m.posicoes.filter((p) => p.aReceber > 0);
  const txs = await Promise.all(
    comTaxa.map((p) =>
      m.cliente.claimPositionFee({
        owner: dono,
        position: p.position,
        pool: m.pool,
        positionNftAccount: p.positionNftAccount,
        tokenAMint: m.estado.tokenAMint,
        tokenBMint: m.estado.tokenBMint,
        tokenAVault: m.estado.tokenAVault,
        tokenBVault: m.estado.tokenBVault,
        tokenAProgram: m.amm.getTokenProgram(m.estado.tokenAFlag),
        tokenBProgram: m.amm.getTokenProgram(m.estado.tokenBFlag),
      }),
    ),
  );
  return { grupos: txs.map((tx) => tx.instructions), lamports: comTaxa.reduce((s, p) => s + p.aReceber, 0) };
}

/**
 * Junta grupos de instruções no menor número de transações que cabem (limite
 * de 1232 bytes) e devolve só as que passam na simulação.
 */
async function montarTransacoes(conexao: Connection, pagador: PublicKey, grupos: TransactionInstruction[][]) {
  const { blockhash } = await conexao.getLatestBlockhash("confirmed");
  const nova = (instrucoes: TransactionInstruction[]) => {
    const tx = new Transaction().add(...instrucoes);
    tx.feePayer = pagador;
    tx.recentBlockhash = blockhash;
    return tx;
  };
  const cabe = (tx: Transaction) => {
    try {
      return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).length <= 1232;
    } catch {
      return false;
    }
  };
  const lotes: TransactionInstruction[][] = [];
  for (const g of grupos.filter((x) => x.length)) {
    const ultimo = lotes[lotes.length - 1];
    if (ultimo && cabe(nova([...ultimo, ...g]))) lotes[lotes.length - 1] = [...ultimo, ...g];
    else lotes.push(g);
  }
  const txs: Transaction[] = [];
  for (const l of lotes) {
    const tx = nova(l);
    const sim = await conexao.simulateTransaction(tx).catch(() => null);
    if (sim && !sim.value.err) txs.push(tx);
  }
  return txs;
}

/**
 * Quanto a Chroma já ganhou com uma moeda da curva, em SOL: na curva e, se a
 * moeda já se formou, na pool da Meteora. Base do bônus do criador (ver
 * lib/bonus-criador.ts) — conta TODA negociação, antes e depois de formar.
 */
export async function ganhoDaChromaNaMoeda(conexao: Connection, mint: string): Promise<{ sol: number; pool: string } | null> {
  if (!CURVA_CHROMA_DISPONIVEL) return null;
  const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
  const cliente = new sdk.DynamicBondingCurveClient(conexao, "confirmed");
  const achado = await acharPool(sdk, cliente, mint);
  if (!achado) return null;
  const { pool } = achado;
  const [b, m] = await Promise.all([cliente.state.getPoolFeeBreakdown(pool).catch(() => null), poolNaMeteora(conexao, mint)]);
  if (!b) return null;
  const lamports = Number(b.partner.totalQuoteFee.toString()) + (m ? metadeDaTaxaNaMeteora(m.estado) : 0);
  return { sol: lamports / LAMPORTS_PER_SOL, pool: pool.toBase58() };
}

/** Todas as moedas da curva com o ganho da Chroma e o criador (painel de bônus). */
export async function ganhosDeTodasAsMoedas(conexao: Connection) {
  const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
  const cliente = new sdk.DynamicBondingCurveClient(conexao, "confirmed");
  const pools = await poolsDeTodasAsConfigs(cliente);
  return Promise.all(
    pools.map(async (p) => {
      const mint = p.account.poolState.baseMint.toBase58();
      const [b, m] = await Promise.all([cliente.state.getPoolFeeBreakdown(p.publicKey).catch(() => null), poolNaMeteora(conexao, mint)]);
      const lamports = (b ? Number(b.partner.totalQuoteFee.toString()) : 0) + (m ? metadeDaTaxaNaMeteora(m.estado) : 0);
      return {
        pool: p.publicKey.toBase58(),
        mint,
        criador: p.account.poolState.creator.toBase58(),
        ganhoSol: lamports / LAMPORTS_PER_SOL,
      };
    }),
  );
}

/**
 * O que o CRIADOR tem pra sacar numa moeda da curva: 40% da taxa de cada
 * negociação fica guardado (na curva e, depois que a moeda se forma, na
 * posição dele na pool da Meteora) até ele resgatar.
 */
export async function ganhosDoCriador(
  conexao: Connection,
  mint: string,
): Promise<{ pool: string; criador: string; aReceberSol: number; totalSol: number } | null> {
  if (!CURVA_CHROMA_DISPONIVEL) return null;
  const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
  const cliente = new sdk.DynamicBondingCurveClient(conexao, "confirmed");
  const achado = await acharPool(sdk, cliente, mint);
  if (!achado) return null;
  const { pool, estado } = achado;
  const b = await cliente.state.getPoolFeeBreakdown(pool).catch(() => null);
  if (!b) return null;
  const m = await posicoesNaMeteora(conexao, mint, estado.creator);
  const naMeteoraAReceber = m ? m.posicoes.reduce((s, p) => s + p.aReceber, 0) : 0;
  const naMeteoraTotal = m ? metadeDaTaxaNaMeteora(m.estado) : 0;
  return {
    pool: pool.toBase58(),
    criador: estado.creator.toBase58(),
    aReceberSol: (Number(b.creator.unclaimedQuoteFee.toString()) + naMeteoraAReceber) / LAMPORTS_PER_SOL,
    totalSol: (Number(b.creator.totalQuoteFee.toString()) + naMeteoraTotal) / LAMPORTS_PER_SOL,
  };
}

/**
 * Transações de saque do criador (assinadas pela carteira dele): a taxa
 * guardada na curva + a da posição dele na pool da Meteora, se a moeda já se
 * formou. Normalmente cabe tudo numa transação só.
 */
export async function transacoesDeSaqueDoCriador(conexao: Connection, criador: PublicKey, mint: string): Promise<Transaction[]> {
  const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
  const cliente = new sdk.DynamicBondingCurveClient(conexao, "confirmed");
  const achado = await acharPool(sdk, cliente, mint);
  if (!achado) return [];
  const { pool } = achado;
  const max = new BN("18446744073709551615");
  const b = await cliente.state.getPoolFeeBreakdown(pool).catch(() => null);
  const naCurva =
    b && Number(b.creator.unclaimedQuoteFee.toString()) > 0
      ? (
          await cliente.creator.claimCreatorTradingFee({
            creator: criador,
            payer: criador,
            pool,
            maxBaseAmount: max,
            maxQuoteAmount: max,
            receiver: criador,
          })
        ).instructions
      : [];
  const naMeteora = await instrucoesDeSaqueNaMeteora(conexao, mint, criador);
  return montarTransacoes(conexao, criador, [naCurva, ...naMeteora.grupos]);
}

/**
 * Transações que sacam a parte da CHROMA nas pools da Meteora (moedas que já
 * se formaram). Complementa transacoesDeResgate, que cuida da curva.
 */
export async function transacoesDeResgateNaMeteora(conexao: Connection, carteira: PublicKey) {
  const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
  const cliente = new sdk.DynamicBondingCurveClient(conexao, "confirmed");
  const pools = await poolsDeTodasAsConfigs(cliente);
  let lamports = 0;
  const grupos: TransactionInstruction[][] = [];
  for (const p of pools) {
    const r = await instrucoesDeSaqueNaMeteora(conexao, p.account.poolState.baseMint.toBase58(), carteira);
    lamports += r.lamports;
    grupos.push(...r.grupos);
  }
  return { txs: await montarTransacoes(conexao, carteira, grupos), taxaSol: lamports / LAMPORTS_PER_SOL };
}
