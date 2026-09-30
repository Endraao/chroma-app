// Mede (nada é enviado) se criação + taxa + divisão + compra cabem numa transação só.
import fs from "fs";
import { Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction, AddressLookupTableAccount } from "@solana/web3.js";
import { transacaoDeCriacao, transacaoDeDivisao } from "../src/lib/pumpfun.ts";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const conn = new Connection(env.NEXT_PUBLIC_SOLANA_RPC, "confirmed");
const criador = new PublicKey("xWfy44May5fDZpEKS7Vnc8MZjMoUUjo4beU31tWWqJ5");
const chroma = new PublicKey(env.NEXT_PUBLIC_PLATFORM_FEE_WALLET_SOL);
const mint = Keypair.generate().publicKey;
const a = await transacaoDeCriacao({ conn, criador, mint, nome: "Neon Frog Coin Long", simbolo: "NFROGXX", uri: "https://chromalaunch.fun/api/media/0f7a756df1de52bf34288c1e7a51e3f4.json", carteiraDaChroma: chroma, taxaSol: 0.02 });
const b = await transacaoDeDivisao({ conn, criador, mint: new PublicKey("Fn4QycXx5JN5uocWtzMxkBJFrVtNrEJu49WF8KWYKhjc"), carteiraDaChroma: chroma, compraSol: 0.01 });
console.log("A", a.serialize().length, "B", b.serialize().length);
const dec = (t: VersionedTransaction) => TransactionMessage.decompile(t.message).instructions;
const ia = dec(a), ib = dec(b).filter((i) => !i.programId.equals(new PublicKey("ComputeBudget111111111111111111111111111111")));
const ixs = [...ia, ...ib];
const bh = (await conn.getLatestBlockhash()).blockhash;
const sem = new VersionedTransaction(new TransactionMessage({ payerKey: criador, recentBlockhash: bh, instructions: ixs }).compileToV0Message());
let semLen = -1; try { semLen = sem.serialize().length + 64; } catch (e) { semLen = -2; }
console.log("junto sem tabela:", semLen);
// Tabela com as contas que se repetem em todo lançamento (não-assinantes que não dependem da moeda).
const porMoeda = new Set<string>();
const contagem = new Map<string, number>();
for (const i of ixs) for (const k of i.keys) contagem.set(k.pubkey.toBase58(), (contagem.get(k.pubkey.toBase58()) ?? 0) + 1);
const todas = new Set<string>(); for (const i of ixs) { todas.add(i.programId.toBase58()); i.keys.forEach((k) => todas.add(k.pubkey.toBase58())); }
console.log("contas distintas:", todas.size);
const fixas = [...todas].filter((k) => k !== criador.toBase58() && k !== mint.toBase58());
const tabela = new AddressLookupTableAccount({ key: Keypair.generate().publicKey, state: { deactivationSlot: BigInt("18446744073709551615"), lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, authority: undefined, addresses: fixas.map((k) => new PublicKey(k)) } });
const com = new VersionedTransaction(new TransactionMessage({ payerKey: criador, recentBlockhash: bh, instructions: ixs }).compileToV0Message([tabela]));
console.log("junto com tabela (todas as contas):", com.serialize().length + 64, "assinaturas:", com.message.header.numRequiredSignatures);
// Realista: só entra na tabela o que é igual para OUTRA moeda e OUTRO criador.
const outro = new PublicKey("2jbvKgnxGz6s6Bn1TmfuDVgVHJsbG8S9U8dNfGtWomY".length >= 43 ? "11111111111111111111111111111111" : criador);
const mint2 = Keypair.generate().publicKey;
const criador2 = Keypair.generate().publicKey;
const a2 = await transacaoDeCriacao({ conn, criador: criador2, mint: mint2, nome: "x", simbolo: "X", uri: "https://chromalaunch.fun/a.json", carteiraDaChroma: chroma, taxaSol: 0.02 });
const b2 = await transacaoDeDivisao({ conn, criador: criador2, mint: new PublicKey("AnecQ9R36fLGJ5MKBDouVxQnJNB9YQq38LfE89yBpump"), carteiraDaChroma: chroma, compraSol: 0.01 });
const outras = new Set<string>(); for (const i of [...dec(a2), ...dec(b2)]) { outras.add(i.programId.toBase58()); i.keys.forEach((k) => outras.add(k.pubkey.toBase58())); }
const fixasReais = [...todas].filter((k) => outras.has(k) && k !== criador.toBase58());
console.log("fixas:", fixasReais.length, "por moeda/criador:", todas.size - fixasReais.length);
const tabela2 = new AddressLookupTableAccount({ key: Keypair.generate().publicKey, state: { deactivationSlot: BigInt("18446744073709551615"), lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, authority: undefined, addresses: fixasReais.map((k) => new PublicKey(k)) } });
const real = new VersionedTransaction(new TransactionMessage({ payerKey: criador, recentBlockhash: bh, instructions: ixs }).compileToV0Message([tabela2]));
console.log("junto com tabela REAL:", real.serialize().length + 64, "(limite 1232)");
console.log(JSON.stringify(fixasReais));
