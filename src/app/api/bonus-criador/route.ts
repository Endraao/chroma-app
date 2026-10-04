import { NextResponse } from "next/server";

import { cached } from "@/lib/cache";
import { progressoDoBonus } from "@/lib/bonus-criador";
import { precosNativos } from "@/lib/precos-nativos";

/**
 * /api/bonus-criador — bônus do criador na Curva da Chroma (ver
 * lib/bonus-criador.ts).
 *
 * GET ?address=<mint>  → progresso + quanto já foi PEDIDO e PAGO.
 * POST {address}       → o criador pede o bônus conquistado (botão "Claim").
 *                        Não precisa provar quem é: o pagamento vai sempre pra
 *                        carteira que criou a moeda, lida da rede na hora.
 * POST {address, pago} → marca como pago — só no servidor LOCAL (painel
 *                        /admin/bonus), nunca em produção.
 */
const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

async function progresso(address: string) {
  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC;
  if (!rpc?.startsWith("http")) return null;
  return cached(`bonus:${address}`, 60_000, async () => {
    const [{ Connection }, { ganhoDaChromaNaMoeda }] = await Promise.all([import("@solana/web3.js"), import("@/lib/meteora-dbc")]);
    const [ganho, precos] = await Promise.all([
      ganhoDaChromaNaMoeda(new Connection(rpc, "confirmed"), address),
      precosNativos().catch(() => null),
    ]);
    const sol = precos?.solana ?? 0;
    if (!ganho || sol <= 0) return null;
    return progressoDoBonus(ganho.sol * sol);
  }).catch(() => null);
}

async function registros(address: string) {
  const { lerVariosDoCacheDoBanco } = await import("@/lib/db");
  const m = await lerVariosDoCacheDoBanco<{ usd: number; em: number }>([`bonus-pago:${address}`, `bonus-pedido:${address}`]).catch(
    () => new Map<string, { usd: number; em: number }>(),
  );
  return { pagoUsd: m.get(`bonus-pago:${address}`)?.usd ?? 0, pedidoUsd: m.get(`bonus-pedido:${address}`)?.usd ?? 0 };
}

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address") ?? "";
  if (!MINT.test(address)) return NextResponse.json({ error: "endereço inválido" }, { status: 400 });
  const dados = await progresso(address);
  if (!dados) return NextResponse.json({ error: "fora da curva" }, { status: 404 });
  return NextResponse.json({ ...dados, ...(await registros(address)) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const corpo = (await request.json().catch(() => ({}))) as { address?: string; pago?: number };
  const address = corpo.address ?? "";
  if (!MINT.test(address)) return NextResponse.json({ error: "endereço inválido" }, { status: 400 });
  const { gravarNoCacheDoBanco } = await import("@/lib/db");

  if (corpo.pago !== undefined) {
    if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "só no painel local" }, { status: 403 });
    await gravarNoCacheDoBanco(`bonus-pago:${address}`, { usd: Number(corpo.pago) || 0, em: Date.now() });
    return NextResponse.json({ ok: true });
  }

  const dados = await progresso(address);
  if (!dados) return NextResponse.json({ error: "fora da curva" }, { status: 404 });
  const { pagoUsd, pedidoUsd } = await registros(address);
  if (dados.conquistadoUsd <= pagoUsd) return NextResponse.json({ ok: true, pedidoUsd: 0 });
  if (dados.conquistadoUsd > pedidoUsd) {
    await gravarNoCacheDoBanco(`bonus-pedido:${address}`, { usd: dados.conquistadoUsd, em: Date.now() });
  }
  return NextResponse.json({ ok: true, pedidoUsd: dados.conquistadoUsd - pagoUsd });
}
