// Monta (e simula) a configuração da "Curva da Chroma" na Meteora DBC.
// Uso: node scripts/dbc-config.mjs [pagador] — só simula, não envia nada.
import { readFileSync } from "node:fs";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  DynamicBondingCurveClient,
  buildCurveWithMarketCap,
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  MigrationFeeOption,
  MigrationOption,
  TokenAuthorityOption,
  TokenDecimal,
  TokenType,
} from "@meteora-ag/dynamic-bonding-curve-sdk";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
const conexao = new Connection(env.NEXT_PUBLIC_SOLANA_RPC, "confirmed");
const PLATAFORMA = new PublicKey(env.NEXT_PUBLIC_PLATFORM_FEE_WALLET_SOL);
const SOL = new PublicKey("So11111111111111111111111111111111111111112");

export const PARAMETROS = buildCurveWithMarketCap({
  token: {
    tokenType: TokenType.SPLToken,
    tokenBaseDecimal: TokenDecimal.SIX,
    tokenQuoteDecimal: 9,
    tokenAuthorityOption: TokenAuthorityOption.Immutable,
    totalTokenSupply: 1_000_000_000,
    leftover: 0,
  },
  fee: {
    // Anti-robô: começa em 25% e cai até 1% em 2 minutos. A primeira compra
    // (a do criador, na mesma transação do lançamento) paga a taxa mínima.
    baseFeeParams: {
      baseFeeMode: BaseFeeMode.FeeSchedulerExponential,
      feeSchedulerParam: { startingFeeBps: 2500, endingFeeBps: 100, numberOfPeriod: 120, totalDuration: 120 },
    },
    dynamicFeeEnabled: false,
    collectFeeMode: CollectFeeMode.QuoteToken,
    creatorTradingFeePercentage: 50,
    poolCreationFee: 0.02,
    enableFirstSwapWithMinFee: true,
  },
  migration: {
    migrationOption: MigrationOption.MET_DAMM_V2,
    migrationFeeOption: MigrationFeeOption.FixedBps100,
    migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
  },
  liquidityDistribution: {
    partnerPermanentLockedLiquidityPercentage: 50,
    partnerLiquidityPercentage: 0,
    creatorPermanentLockedLiquidityPercentage: 50,
    creatorLiquidityPercentage: 0,
  },
  lockedVesting: { totalLockedVestingAmount: 0, numberOfVestingPeriod: 0, cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0 },
  activationType: ActivationType.Timestamp,
  initialMarketCap: 30,
  migrationMarketCap: 420,
});

if (process.argv[1].endsWith("dbc-config.mjs")) {
  const cliente = new DynamicBondingCurveClient(conexao, "confirmed");
  const config = Keypair.generate();
  const pagador = new PublicKey(process.argv[2] ?? "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9");
  const tx = await cliente.partner.createConfig({
    ...PARAMETROS,
    config: config.publicKey,
    feeClaimer: PLATAFORMA,
    leftoverReceiver: PLATAFORMA,
    quoteMint: SOL,
    payer: pagador,
  });
  tx.feePayer = pagador;
  tx.recentBlockhash = (await conexao.getLatestBlockhash()).blockhash;
  const sim = await conexao.simulateTransaction(tx, undefined, false).catch((e) => ({ value: { err: e.message } }));
  console.log("tamanho:", tx.serialize({ requireAllSignatures: false, verifySignatures: false }).length, "bytes");
  console.log("simulação:", sim.value.err ? JSON.stringify(sim.value.err) : "OK");
  console.log((sim.value.logs ?? []).slice(-6).join("\n"));
  const rent = await conexao.getMinimumBalanceForRentExemption(1040);
  console.log("aluguel aproximado da conta de config:", rent / 1e9, "SOL");
}
