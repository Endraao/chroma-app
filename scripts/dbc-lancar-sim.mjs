// Simula um lançamento na Meteora DBC (criação + primeira compra numa tx só).
// Usa uma config que já existe na rede (de outro projeto) só pra validar o fluxo.
// Uso: node scripts/dbc-lancar-sim.mjs [config] — não envia nada.
import { readFileSync } from "node:fs";
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import BN from "bn.js";
import { DynamicBondingCurveClient, DYNAMIC_BONDING_CURVE_PROGRAM_ID, deriveDbcPoolAddress, deriveDbcTokenVaultAddress, deriveMintMetadata } from "@meteora-ag/dynamic-bonding-curve-sdk";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
const conexao = new Connection(env.NEXT_PUBLIC_SOLANA_RPC, "confirmed");
const cliente = new DynamicBondingCurveClient(conexao, "confirmed");
const SOL = "So11111111111111111111111111111111111111112";

async function acharConfig() {
  const sigs = await conexao.getSignaturesForAddress(DYNAMIC_BONDING_CURVE_PROGRAM_ID, { limit: 60 });
  for (const s of sigs) {
    if (s.err) continue;
    const tx = await conexao.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
    for (const ix of tx?.transaction.message.instructions ?? []) {
      if (!ix.programId.equals(DYNAMIC_BONDING_CURVE_PROGRAM_ID) || !ix.accounts) continue;
      const log = (tx.meta.logMessages ?? []).join(" ");
      if (!/InitializeVirtualPoolWithSplToken/i.test(log)) continue;
      const config = ix.accounts[0];
      const cfg = await cliente.state.getPoolConfig(config).catch(() => null);
      if (cfg && cfg.quoteMint.toBase58() === SOL) return config;
    }
  }
  return null;
}

const config = process.argv[2] ? new PublicKey(process.argv[2]) : await acharConfig();
console.log("config:", config?.toBase58());
const criador = new PublicKey("5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9");
const mint = Keypair.generate();
const tx = await cliente.creator.createPoolWithFirstBuy({
  createPoolParam: {
    name: "Chroma Test",
    symbol: "CTEST",
    uri: "https://chromalaunch.fun/api/logo/teste",
    payer: criador,
    poolCreator: criador,
    config,
    baseMint: mint.publicKey,
  },
  firstBuyParam: {
    buyer: criador,
    buyAmount: new BN(0.001 * LAMPORTS_PER_SOL),
    minimumAmountOut: new BN(1),
    referralTokenAccount: null,
  },
});
tx.feePayer = criador;
tx.recentBlockhash = (await conexao.getLatestBlockhash()).blockhash;
tx.partialSign(mint);
const bytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).length;
const pool = deriveDbcPoolAddress(new PublicKey(SOL), mint.publicKey, config);
const novas = [mint.publicKey, pool, deriveDbcTokenVaultAddress(pool, mint.publicKey), deriveDbcTokenVaultAddress(pool, new PublicKey(SOL)), deriveMintMetadata(mint.publicKey)];
const sim = await conexao.simulateTransaction(tx, undefined, novas).catch((e) => ({ value: { err: e.message } }));
console.log("instruções:", tx.instructions.length, "| tamanho:", bytes, "bytes");
console.log("simulação:", sim.value.err ? JSON.stringify(sim.value.err) : "OK", "| CU:", sim.value.unitsConsumed);
console.log((sim.value.logs ?? []).filter((l) => /error|fail|Error/i.test(l)).slice(0, 6).join("\n"));

const aluguel = (sim.value.accounts ?? []).reduce((t, a) => t + (a?.lamports ?? 0), 0);
console.log("aluguel das contas novas:", aluguel / 1e9, "SOL", (sim.value.accounts ?? []).map((a) => a ? a.lamports / 1e9 : null));
