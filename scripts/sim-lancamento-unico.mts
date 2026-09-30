// Simula (nada é enviado) o lançamento em UMA transação: taxa + criação + compra, com a tabela da Chroma.
// Uso: npx tsx scripts/sim-lancamento-unico.mts <criador> [compraSol] [detentores] [nome] [simbolo]
import fs from "fs";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { transacaoUnicaDeLancamento } from "../src/lib/pumpfun.ts";
import { TABELA_SOLANA } from "../src/lib/tabela-solana.ts";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const conn = new Connection(env.NEXT_PUBLIC_SOLANA_RPC, "confirmed");
const [criador, compra, modo, nome, simbolo] = process.argv.slice(2);
const mint = Keypair.generate();
const tx = await transacaoUnicaDeLancamento({
  conn, criador: new PublicKey(criador), mint: mint.publicKey, nome: nome ?? "Neon Frog", simbolo: simbolo ?? "NFROG",
  uri: "https://chromalaunch.fun/api/media/0123456789abcdef0123456789abcdef.json",
  carteiraDaChroma: new PublicKey(env.NEXT_PUBLIC_PLATFORM_FEE_WALLET_SOL), taxaSol: 0.02,
  compraSol: Number(compra ?? 0.01), paraDetentores: modo === "detentores", tabela: new PublicKey(TABELA_SOLANA!),
});
tx.sign([mint]);
console.log("tamanho:", tx.serialize().length, "(limite 1232)");
const r = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
console.log("erro:", JSON.stringify(r.value.err), "CU:", r.value.unitsConsumed);
console.log((r.value.logs ?? []).filter((l) => /Instruction: (CreateV2|Buy)|Transfer|failed|error/i.test(l)).join("\n"));
