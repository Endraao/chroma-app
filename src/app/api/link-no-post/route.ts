import { NextResponse } from "next/server";
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createPublicClient, http, parseEther } from "viem";

import { gravarNoCacheDoBanco, lerDoCacheDoBanco } from "@/lib/db";
import { robinhoodChain } from "@/lib/web3";
import { claimNickname, findByWallet } from "@/lib/accounts";
import { suggestNickname } from "@/lib/nickname-suggestions";

/**
 * "MEU LINK" DENTRO DO POST DO X (pedido do dono, 08/10/2026): quem quer gerar
 * o próprio link sem entrar na Chroma paga uma taxa de registro pra carteira
 * da plataforma — 0,005 SOL na Solana, 0,0002 ETH na Robinhood Chain. Aqui só
 * se CONFERE na rede que o pagamento existe, veio dessa carteira, e se guarda.
 */
const TAXA_DO_LINK_SOL = 0.005;
const TAXA_DO_LINK_ETH = "0.0002";
const PLATAFORMA_SOL = process.env.NEXT_PUBLIC_PLATFORM_FEE_WALLET_SOL ?? "";
const PLATAFORMA_EVM = (process.env.NEXT_PUBLIC_PLATFORM_FEE_WALLET_EVM ?? "").toLowerCase();
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM = /^0x[0-9a-fA-F]{40}$/;

const chave = (c: string) => `link-pago:${EVM.test(c) ? c.toLowerCase() : c}`;

export async function GET(request: Request) {
  const carteira = new URL(request.url).searchParams.get("carteira") ?? "";
  if (!SOLANA.test(carteira) && !EVM.test(carteira)) return NextResponse.json({ pago: false });
  // A carteira da própria Chroma não paga a si mesma (o pagamento sairia e
  // voltaria pra ela, e a conferência nunca fecharia).
  if (carteira === PLATAFORMA_SOL || carteira.toLowerCase() === PLATAFORMA_EVM) return NextResponse.json({ pago: true });
  const r = await lerDoCacheDoBanco<{ tx: string }>(chave(carteira)).catch(() => null);
  return NextResponse.json({ pago: Boolean(r) });
}

async function conferirNaSolana(carteira: string, tx: string): Promise<boolean> {
  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC;
  if (!rpc?.startsWith("http") || !PLATAFORMA_SOL) return false;
  const conexao = new Connection(rpc, { commitment: "confirmed", disableRetryOnRateLimit: true });
  const t = await conexao.getParsedTransaction(tx, { maxSupportedTransactionVersion: 1, commitment: "confirmed" }).catch(() => null);
  if (!t?.meta || t.meta.err) return false;
  const contas = t.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
  const i = contas.indexOf(PLATAFORMA_SOL);
  const recebido = i >= 0 ? (t.meta.postBalances[i] - t.meta.preBalances[i]) / LAMPORTS_PER_SOL : 0;
  return contas[0] === carteira && recebido >= TAXA_DO_LINK_SOL * 0.99;
}

async function conferirNaRobinhood(carteira: string, tx: string): Promise<boolean> {
  if (!PLATAFORMA_EVM || !/^0x[0-9a-fA-F]{64}$/.test(tx)) return false;
  const cliente = createPublicClient({ chain: robinhoodChain, transport: http(process.env.ROBINHOOD_RPC || robinhoodChain.rpcUrls.default.http[0]) });
  const hash = tx as `0x${string}`;
  const [t, recibo] = await Promise.all([
    cliente.getTransaction({ hash }).catch(() => null),
    cliente.getTransactionReceipt({ hash }).catch(() => null),
  ]);
  return Boolean(
    t &&
      recibo?.status === "success" &&
      t.from.toLowerCase() === carteira.toLowerCase() &&
      t.to?.toLowerCase() === PLATAFORMA_EVM &&
      t.value >= parseEther(TAXA_DO_LINK_ETH),
  );
}

/**
 * Link curto pra carteira nova (09/10/2026): quem registra o link sem nunca
 * ter entrado na Chroma não tem apelido, e o link sairia com o endereço
 * inteiro (?ref=7xKX…, 44 letras). Aqui ganha uma conta com apelido
 * automático (ex.: swiftfalcon42) — o ?ref= aceita apelido e resolve pra
 * carteira da rede. Quem já tem conta continua com o apelido dela.
 */
async function apelidoDaCarteira(carteira: string): Promise<string | null> {
  const conta = await findByWallet(carteira);
  if (conta) return conta.nickname;
  const kind = EVM.test(carteira) ? "evm" : "solana";
  for (let i = 0; i < 5; i++) {
    const r = await claimNickname({ nickname: suggestNickname(), wallet: carteira, kind, indicadoPor: null });
    if (r.ok) return (await findByWallet(carteira))?.nickname ?? null;
  }
  return null;
}

export async function POST(request: Request) {
  const { carteira, tx } = (await request.json().catch(() => ({}))) as { carteira?: string; tx?: string };
  if (!carteira || !tx || (!SOLANA.test(carteira) && !EVM.test(carteira))) {
    return NextResponse.json({ ok: false, erro: "dados inválidos" }, { status: 400 });
  }
  const ok = EVM.test(carteira) ? await conferirNaRobinhood(carteira, tx) : await conferirNaSolana(carteira, tx);
  if (!ok) return NextResponse.json({ ok: false, erro: "pagamento não confere" }, { status: 400 });
  await gravarNoCacheDoBanco(chave(carteira), { tx, em: Date.now() });
  return NextResponse.json({ ok: true, apelido: await apelidoDaCarteira(carteira).catch(() => null) });
}
