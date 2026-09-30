// Mede (nada é enviado) a transação única de lançamento — taxa + criação + compra — com a
// tabela de endereços da Chroma, e lista os endereços fixos que vão na tabela.
import fs from "fs";
import { AddressLookupTableAccount, ComputeBudgetProgram, Connection, Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { transacoesDeLancamento } from "../src/lib/pumpfun.ts";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const conn = new Connection(env.NEXT_PUBLIC_SOLANA_RPC, "confirmed");
const chroma = new PublicKey(env.NEXT_PUBLIC_PLATFORM_FEE_WALLET_SOL);
const dec = (t: VersionedTransaction) => TransactionMessage.decompile(t.message).instructions;
async function ixsDe(criador: PublicKey, mint: PublicKey, nome: string, simbolo: string, detentores = false) {
  const { criacao } = await transacoesDeLancamento({ conn, criador, mint, nome, simbolo, uri: "https://chromalaunch.fun/api/media/0123456789abcdef0123456789abcdef.json", carteiraDaChroma: chroma, taxaSol: 0.02, compraSol: 0.01, paraDetentores: detentores });
  return [ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200_000 }), SystemProgram.transfer({ fromPubkey: criador, toPubkey: chroma, lamports: 20_000_000 }), ...dec(criacao)];
}
const chaves = (ixs: any[]) => { const s = new Set<string>(); for (const i of ixs) { s.add(i.programId.toBase58()); i.keys.forEach((k: any) => s.add(k.pubkey.toBase58())); } return s; };
const a = await ixsDe(Keypair.generate().publicKey, Keypair.generate().publicKey, "A", "A");
const b = await ixsDe(Keypair.generate().publicKey, Keypair.generate().publicKey, "B", "B");
const c = await ixsDe(Keypair.generate().publicKey, Keypair.generate().publicKey, "C", "C", true);
const ka = chaves(a), kb = chaves(b), kc = chaves(c);
const fixas = [...new Set([...ka].filter((k) => kb.has(k)).concat([...kc].filter((k) => kb.has(k) || ka.has(k))))];
console.log("fixas:", fixas.length);
const tabela = new AddressLookupTableAccount({ key: Keypair.generate().publicKey, state: { deactivationSlot: BigInt("18446744073709551615"), lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, authority: undefined, addresses: fixas.map((k) => new PublicKey(k)) } });
const criador = new PublicKey("xWfy44May5fDZpEKS7Vnc8MZjMoUUjo4beU31tWWqJ5");
for (const [nome, simb, det] of [["Neon Frog", "NFROG", false], ["A".repeat(32), "B".repeat(10), false], ["A".repeat(32), "B".repeat(10), true]] as const) {
  const mint = Keypair.generate().publicKey;
  const ixs = await ixsDe(criador, mint, nome, simb, det);
  const bh = (await conn.getLatestBlockhash()).blockhash;
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: criador, recentBlockhash: bh, instructions: ixs }).compileToV0Message([tabela]));
  console.log(`nome ${nome.length} simbolo ${simb.length} detentores ${det}:`, tx.serialize().length + 64, "bytes (2 assinaturas; limite 1232)");
}
fs.writeFileSync("scripts/enderecos-da-tabela.json", JSON.stringify(fixas, null, 2));
