import { NextResponse } from "next/server";

import { cached } from "@/lib/cache";

const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Histórico de saques do criador de uma moeda da Curva da Chroma (ver lib/saques-do-criador.ts). */
export async function GET(request: Request) {
  const mint = new URL(request.url).searchParams.get("mint") ?? "";
  if (!MINT.test(mint)) return NextResponse.json({ error: "endereço inválido" }, { status: 400 });
  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC;
  if (!rpc?.startsWith("http")) return NextResponse.json({ error: "sem rpc" }, { status: 503 });
  const dados = await cached(`saques-criador:${mint}`, 20_000, async () => {
    const [{ Connection }, { saquesDoCriador }] = await Promise.all([import("@solana/web3.js"), import("@/lib/saques-do-criador")]);
    return saquesDoCriador(new Connection(rpc, { commitment: "confirmed", disableRetryOnRateLimit: true }), mint);
  }).catch(() => null);
  if (!dados) return NextResponse.json({ error: "fora da curva" }, { status: 404 });
  return NextResponse.json(dados, { headers: { "cache-control": "no-store" } });
}
