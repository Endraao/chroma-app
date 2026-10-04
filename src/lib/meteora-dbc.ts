import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
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

const SOL = new PublicKey("So11111111111111111111111111111111111111112");

/**
 * As regras da curva.
 *
 *  - Começa em 30 SOL de valor de mercado e gradua em 420 SOL (parecido com a
 *    pump.fun), migrando sozinha pra uma pool DAMM v2 da Meteora.
 *  - Taxa anti-robô: 25% no primeiro segundo, caindo até 1% em 2 minutos. A
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
        baseFeeMode: sdk.BaseFeeMode.FeeSchedulerExponential,
        feeSchedulerParam: { startingFeeBps: 2500, endingFeeBps: 100, numberOfPeriod: 120, totalDuration: 120 },
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

/** Endereço da pool de uma moeda lançada na curva da Chroma. */
export async function poolDaMoeda(mint: string): Promise<string> {
  const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
  return sdk.deriveDbcPoolAddress(SOL, new PublicKey(mint), new PublicKey(CONFIG_DA_CURVA)).toBase58();
}

/**
 * A prova de que a moeda nasceu na curva da Chroma: a pool derivada de
 * (SOL, moeda, NOSSA config) existe na rede. Devolve quem criou.
 */
export async function lerPoolDaCurva(conexao: Connection, mint: string): Promise<{ criador: string; pool: string } | null> {
  if (!CURVA_CHROMA_DISPONIVEL) return null;
  const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
  const cliente = new sdk.DynamicBondingCurveClient(conexao, "confirmed");
  const pool = sdk.deriveDbcPoolAddress(SOL, new PublicKey(mint), new PublicKey(CONFIG_DA_CURVA));
  const lido = await cliente.state.getPool(pool).catch(() => null);
  const estado = lido?.poolState;
  if (!estado || estado.config.toBase58() !== CONFIG_DA_CURVA) return null;
  return { criador: estado.creator.toBase58(), pool: pool.toBase58() };
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
): Promise<{ precoSol: number; solReal: number; progresso: number; completa: boolean; criador: string } | null> {
  if (!CURVA_CHROMA_DISPONIVEL) return null;
  const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
  const cliente = new sdk.DynamicBondingCurveClient(conexao, "confirmed");
  const pool = sdk.deriveDbcPoolAddress(SOL, new PublicKey(mint), new PublicKey(CONFIG_DA_CURVA));
  const lido = await cliente.state.getPool(pool).catch(() => null);
  const estado = lido?.poolState;
  if (!estado || estado.config.toBase58() !== CONFIG_DA_CURVA) return null;
  const config = await cliente.state.getPoolConfig(new PublicKey(CONFIG_DA_CURVA));
  if (!config) return null;
  const limite = Number(config.migrationQuoteThreshold.toString());
  const reserva = Number(estado.quoteReserve.toString());
  return {
    precoSol: Number(sdk.getPriceFromSqrtPrice(estado.sqrtPrice, sdk.TokenDecimal.SIX, 9).toString()),
    solReal: reserva / LAMPORTS_PER_SOL,
    progresso: limite > 0 ? Math.min(100, (reserva / limite) * 100) : 0,
    completa: Number(estado.isMigrated) !== 0 || (limite > 0 && reserva >= limite),
    criador: estado.creator.toBase58(),
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
  const pools = await cliente.state.getPoolsFeesByConfig(new PublicKey(CONFIG_DA_CURVA));
  const max = new BN("18446744073709551615");
  const { blockhash } = await conexao.getLatestBlockhash("confirmed");
  const txs: Transaction[] = [];
  let lamports = 0;

  for (const p of pools) {
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
      negociacao.instructions,
      lancamento?.instructions ?? [],
    ];
    for (const instrucoes of tentativas) {
      if (!instrucoes.length) continue;
      const tx = new Transaction().add(...instrucoes);
      tx.feePayer = carteira;
      tx.recentBlockhash = blockhash;
      const sim = await conexao.simulateTransaction(tx, undefined, [carteira]).catch(() => null);
      if (!sim || sim.value.err) continue;
      txs.push(tx);
      lamports += Number(p.partnerQuoteFee.toString());
      break;
    }
  }
  return { txs, pools: pools.length, taxaNegociacaoSol: lamports / LAMPORTS_PER_SOL };
}

/**
 * Quanto a Chroma já ganhou (taxa de parceira, resgatada ou não) com uma
 * moeda da curva, em SOL. Base do bônus do criador (ver lib/bonus-criador.ts).
 */
export async function ganhoDaChromaNaMoeda(conexao: Connection, mint: string): Promise<{ sol: number; pool: string } | null> {
  if (!CURVA_CHROMA_DISPONIVEL) return null;
  const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
  const cliente = new sdk.DynamicBondingCurveClient(conexao, "confirmed");
  const pool = sdk.deriveDbcPoolAddress(SOL, new PublicKey(mint), new PublicKey(CONFIG_DA_CURVA));
  const b = await cliente.state.getPoolFeeBreakdown(pool).catch(() => null);
  if (!b) return null;
  return { sol: Number(b.partner.totalQuoteFee.toString()) / LAMPORTS_PER_SOL, pool: pool.toBase58() };
}

/** Todas as moedas da curva com o ganho da Chroma e o criador (painel de bônus). */
export async function ganhosDeTodasAsMoedas(conexao: Connection) {
  const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
  const cliente = new sdk.DynamicBondingCurveClient(conexao, "confirmed");
  const pools = await cliente.state.getPoolsByConfig(new PublicKey(CONFIG_DA_CURVA));
  return Promise.all(
    pools.map(async (p) => {
      const b = await cliente.state.getPoolFeeBreakdown(p.publicKey).catch(() => null);
      return {
        pool: p.publicKey.toBase58(),
        mint: p.account.poolState.baseMint.toBase58(),
        criador: p.account.poolState.creator.toBase58(),
        ganhoSol: b ? Number(b.partner.totalQuoteFee.toString()) / LAMPORTS_PER_SOL : 0,
      };
    }),
  );
}
