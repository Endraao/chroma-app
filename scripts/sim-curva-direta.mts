// Simula (nada é enviado) compra/venda DIRETO na curva com as taxas da Chroma e da indicação.
// Uso: npx tsx scripts/sim-curva-direta.mts <mint> <carteira> <buy|sell> <valor bruto: lamports na compra, tokens brutos na venda> [afiliado]
import fs from "fs";
import { ComputeBudgetProgram, Connection, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { computeFeesRaw } from "../src/lib/fees.ts";
import { instrucoesNaCurva } from "../src/lib/pumpfun.ts";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const conn = new Connection(env.NEXT_PUBLIC_SOLANA_RPC, "confirmed");
const [mint, carteira, lado, bruto, afiliado] = process.argv.slice(2);
const SOL = "So11111111111111111111111111111111111111112";
const venda = lado === "sell";
const split0 = computeFeesRaw(BigInt(bruto), afiliado ?? null, "solana");
const valorDaRota = venda ? BigInt(bruto) : split0.netAmount;
const q = await (await fetch(`https://chromalaunch.fun/api/swap?inputMint=${venda ? mint : SOL}&outputMint=${venda ? SOL : mint}&amount=${valorDaRota}&slippageBps=300`)).json();
console.log("rota:", q.routePlan?.map((r: any) => r.swapInfo.label).join(">"), "in", q.inAmount, "out", q.outAmount);
const user = new PublicKey(carteira);
const ixs = await instrucoesNaCurva({ conn, usuario: user, mint: new PublicKey(mint), lado: venda ? "sell" : "buy", lamports: BigInt(venda ? q.outAmount : q.inAmount), tokens: BigInt(venda ? q.inAmount : q.outAmount), slippagePct: 3 });
const split = computeFeesRaw(venda ? BigInt(q.otherAmountThreshold) : BigInt(bruto), afiliado ?? null, "solana");
const taxas = [SystemProgram.transfer({ fromPubkey: user, toPubkey: new PublicKey(env.NEXT_PUBLIC_PLATFORM_FEE_WALLET_SOL), lamports: split.platformFee })];
if (afiliado && split.affiliateFee > 0n) taxas.push(SystemProgram.transfer({ fromPubkey: user, toPubkey: new PublicKey(afiliado), lamports: split.affiliateFee }));
const orc = [ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 400_000 })];
const bh = (await conn.getLatestBlockhash()).blockhash;
const tx = new VersionedTransaction(new TransactionMessage({ payerKey: user, recentBlockhash: bh, instructions: venda ? [...orc, ...ixs, ...taxas] : [...orc, ...taxas, ...ixs] }).compileToV0Message());
console.log("tamanho:", tx.serialize().length, "taxas:", split.platformFee, "+ indicação", split.affiliateFee);
const r = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
console.log("erro:", JSON.stringify(r.value.err), "CU:", r.value.unitsConsumed);
if (r.value.err) console.log((r.value.logs ?? []).slice(-10).join("\n"));
