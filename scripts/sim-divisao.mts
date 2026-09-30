// Simula (nada é enviado) a etapa B do lançamento na pump.fun.
// Uso: npx tsx scripts/sim-divisao.mts <mint> <criador> [compraSol]
import fs from "fs";
import { Connection, PublicKey } from "@solana/web3.js";
import { transacaoDeDivisao } from "../src/lib/pumpfun.ts";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const conn = new Connection(env.NEXT_PUBLIC_SOLANA_RPC, "confirmed");
const [mint, criador, compra] = process.argv.slice(2);
const tx = await transacaoDeDivisao({ conn, criador: new PublicKey(criador), mint: new PublicKey(mint), carteiraDaChroma: new PublicKey(env.NEXT_PUBLIC_PLATFORM_FEE_WALLET_SOL), compraSol: Number(compra ?? 0.01) });
console.log("tamanho", tx.serialize().length);
const r = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
console.log(r.value.err, r.value.logs?.slice(-25).join("\n"));
