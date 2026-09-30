// Simula (nada é enviado) a transação 1 do lançamento com uma aprovação.
// Uso: npx tsx scripts/sim-lancamento-unico.mts <criador> [compraSol] [detentores]
import fs from "fs";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { transacoesDeLancamento } from "../src/lib/pumpfun.ts";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const conn = new Connection(env.NEXT_PUBLIC_SOLANA_RPC, "confirmed");
const [criador, compra, modo] = process.argv.slice(2);
const mint = Keypair.generate();
const { criacao, divisao } = await transacoesDeLancamento({
  conn, criador: new PublicKey(criador), mint: mint.publicKey, nome: "Neon Frog", simbolo: "NFROG",
  uri: "https://chromalaunch.fun/api/media/0123456789abcdef0123456789abcdef.json",
  carteiraDaChroma: new PublicKey(env.NEXT_PUBLIC_PLATFORM_FEE_WALLET_SOL), taxaSol: 0.02,
  compraSol: Number(compra ?? 0.01), paraDetentores: modo === "detentores",
});
criacao.sign([mint]);
console.log("tamanhos:", criacao.serialize().length, divisao?.serialize().length ?? "-");
const r = await conn.simulateTransaction(criacao, { sigVerify: false, replaceRecentBlockhash: true });
console.log("erro:", r.value.err, "CU:", r.value.unitsConsumed);
console.log((r.value.logs ?? []).filter((l) => /Instruction:|error|failed/i.test(l)).join("\n"));
