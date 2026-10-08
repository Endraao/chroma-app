import { NextResponse } from "next/server";
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";

import { gravarNoCacheDoBanco, lerDoCacheDoBanco } from "@/lib/db";

/**
 * "MEU LINK" DENTRO DO POST DO X (pedido do dono, 08/10/2026): quem quer gerar
 * o próprio link sem entrar na Chroma paga uma taxa de registro de 0,005 SOL
 * pra carteira da plataforma. Aqui só se CONFERE na rede que o pagamento
 * existe (assinado pela carteira, SOL chegou na plataforma) e se guarda.
 */
const TAXA_DO_LINK_SOL = 0.005;
const PLATAFORMA = process.env.NEXT_PUBLIC_PLATFORM_FEE_WALLET_SOL ?? "";
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET(request: Request) {
  const carteira = new URL(request.url).searchParams.get("carteira") ?? "";
  if (!SOLANA.test(carteira)) return NextResponse.json({ pago: false });
  const r = await lerDoCacheDoBanco<{ tx: string }>(`link-pago:${carteira}`).catch(() => null);
  return NextResponse.json({ pago: Boolean(r) });
}

export async function POST(request: Request) {
  const { carteira, tx } = (await request.json().catch(() => ({}))) as { carteira?: string; tx?: string };
  if (!carteira || !SOLANA.test(carteira) || !tx || !PLATAFORMA) return NextResponse.json({ ok: false, erro: "dados inválidos" }, { status: 400 });
  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC;
  if (!rpc?.startsWith("http")) return NextResponse.json({ ok: false, erro: "sem rpc" }, { status: 503 });
  const conexao = new Connection(rpc, { commitment: "confirmed", disableRetryOnRateLimit: true });
  const t = await conexao.getParsedTransaction(tx, { maxSupportedTransactionVersion: 1, commitment: "confirmed" }).catch(() => null);
  if (!t?.meta || t.meta.err) return NextResponse.json({ ok: false, erro: "transação não encontrada" }, { status: 400 });
  const contas = t.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
  const i = contas.indexOf(PLATAFORMA);
  const recebido = i >= 0 ? (t.meta.postBalances[i] - t.meta.preBalances[i]) / LAMPORTS_PER_SOL : 0;
  if (contas[0] !== carteira || recebido < TAXA_DO_LINK_SOL * 0.99) return NextResponse.json({ ok: false, erro: "pagamento não confere" }, { status: 400 });
  await gravarNoCacheDoBanco(`link-pago:${carteira}`, { tx, em: Date.now() });
  return NextResponse.json({ ok: true });
}
