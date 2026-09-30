// Simula (nada é enviado) uma compra pela rota da Jupiter com a taxa da Chroma e a do afiliado.
// Uso: npx tsx scripts/sim-compra-jupiter.mts <mint> <comprador> <lamports> [afiliado]
import fs from "fs";
import { Connection, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { computeFeesRaw } from "../src/lib/fees.ts";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const conn = new Connection(env.NEXT_PUBLIC_SOLANA_RPC, "confirmed");
const [mint, comprador, lamports, afiliado] = process.argv.slice(2);
const SITE = "https://chromalaunch.fun";
const quote = await (await fetch(`${SITE}/api/swap?inputMint=So11111111111111111111111111111111111111112&outputMint=${mint}&amount=${lamports}&slippageBps=300`)).json();
console.log("cotação:", quote.outAmount, quote.routePlan?.map((r: any) => r.swapInfo?.label).join(" > "), quote.error ?? "");
const build = await (await fetch(`${SITE}/api/swap`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quote, userPublicKey: comprador }) })).json();
if (!build.swapTransaction) { console.log("montagem falhou:", build); process.exit(); }
const tx = VersionedTransaction.deserialize(Buffer.from(build.swapTransaction, "base64"));
const lookups = [];
for (const l of tx.message.addressTableLookups) lookups.push((await conn.getAddressLookupTable(l.accountKey)).value!);
const msg = TransactionMessage.decompile(tx.message, { addressLookupTableAccounts: lookups });
const split = computeFeesRaw(BigInt(lamports), afiliado ?? null, "solana");
console.log("taxas:", split);
const pay = new PublicKey(comprador);
const fees = [SystemProgram.transfer({ fromPubkey: pay, toPubkey: new PublicKey(env.NEXT_PUBLIC_PLATFORM_FEE_WALLET_SOL), lamports: split.platformFee })];
if (afiliado && split.affiliateFee > 0n) fees.push(SystemProgram.transfer({ fromPubkey: pay, toPubkey: new PublicKey(afiliado), lamports: split.affiliateFee }));
let at = 0; while (msg.instructions[at]?.programId.toBase58() === "ComputeBudget111111111111111111111111111111") at++;
msg.instructions.splice(at, 0, ...fees);
for (const [nome, t] of [["só jupiter", tx], ["com taxas", new VersionedTransaction(msg.compileToV0Message(lookups))]] as const) {
  const r = await conn.simulateTransaction(t, { sigVerify: false, replaceRecentBlockhash: true });
  console.log(nome, "->", JSON.stringify(r.value.err));
  if (r.value.err) console.log((r.value.logs ?? []).slice(-12).join("\n"));
}
