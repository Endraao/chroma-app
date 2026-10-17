import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

import { naCdn } from "@/lib/cdn";
import { maioresHolders } from "@/lib/holders";
import { fetchToken } from "@/lib/market";

/**
 * GET /api/holders?address=… → as 20 maiores contas da moeda (Solana), com o
 * valor em dólar e quantos holders ela tem no total (17/10/2026).
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address");
  try {
    new PublicKey(address ?? "");
  } catch {
    return NextResponse.json({ error: "endereço inválido" }, { status: 400 });
  }
  try {
    const [quadro, token] = await Promise.all([maioresHolders(address!), fetchToken(address!).catch(() => null)]);
    return NextResponse.json(
      { ...quadro, precoUsd: token?.priceUsd ?? 0, totalDeHolders: token?.holders ?? 0, at: Date.now() },
      { headers: naCdn(30) },
    );
  } catch (erro) {
    console.warn("[holders] falhou:", erro);
    return NextResponse.json({ error: "Não foi possível ler os holders agora." }, { status: 502 });
  }
}
