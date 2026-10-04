import { NextResponse } from "next/server";

import { cached } from "@/lib/cache";
import { progressoDoBonus } from "@/lib/bonus-criador";
import { precosNativos } from "@/lib/precos-nativos";

/**
 * GET /api/bonus-criador?address=<mint> → progresso do bônus do criador de
 * uma moeda da Curva da Chroma (ver lib/bonus-criador.ts). 404 se a moeda não
 * está na nossa curva.
 */
export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address") ?? "";
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return NextResponse.json({ error: "endereço inválido" }, { status: 400 });
  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC;
  if (!rpc?.startsWith("http")) return NextResponse.json({ error: "sem rpc" }, { status: 503 });

  const dados = await cached(`bonus:${address}`, 60_000, async () => {
    const [{ Connection }, { ganhoDaChromaNaMoeda }] = await Promise.all([import("@solana/web3.js"), import("@/lib/meteora-dbc")]);
    const [ganho, precos] = await Promise.all([
      ganhoDaChromaNaMoeda(new Connection(rpc, "confirmed"), address),
      precosNativos().catch(() => null),
    ]);
    const sol = precos?.solana ?? 0;
    if (!ganho || sol <= 0) return null;
    return progressoDoBonus(ganho.sol * sol);
  }).catch(() => null);

  if (!dados) return NextResponse.json({ error: "fora da curva" }, { status: 404 });
  return NextResponse.json(dados, { headers: { "cache-control": "public, s-maxage=60" } });
}
