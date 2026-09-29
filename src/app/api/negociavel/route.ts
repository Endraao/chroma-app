import { NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";

import { cached } from "@/lib/cache";
import { verificarNegociavel } from "@/lib/negociavel-evm";
import { robinhoodChain } from "@/lib/web3";

/**
 * A moeda externa da Robinhood pode ser comprada E vendida pela Chroma?
 * Ver `src/lib/negociavel-evm.ts`. Resposta guardada por 30 min: a regra de
 * um hook não muda de um minuto pro outro, e a checagem custa ~10 consultas.
 */
const cliente = createPublicClient({
  chain: robinhoodChain,
  transport: http(process.env.ROBINHOOD_RPC || robinhoodChain.rpcUrls.default.http[0]),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const moeda = searchParams.get("moeda") ?? "";
  const pool = searchParams.get("pool");
  if (!/^0x[0-9a-fA-F]{40}$/.test(moeda)) return NextResponse.json({ error: "moeda inválida" }, { status: 400 });

  try {
    const r = await cached(`negociavel:${moeda.toLowerCase()}:${pool ?? ""}`, 30 * 60_000, () =>
      verificarNegociavel(cliente as never, moeda as Address, pool),
    );
    return NextResponse.json(r, { headers: { "cache-control": "public, s-maxage=600" } });
  } catch (e) {
    console.warn("[negociavel]", e);
    return NextResponse.json({ ok: false, motivo: "erro" }, { status: 502 });
  }
}
