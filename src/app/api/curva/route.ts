import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

import { cached } from "@/lib/cache";
import { naCdn } from "@/lib/cdn";
import { precosNativos } from "@/lib/precos-nativos";

/**
 * GET /api/curva?mint=… → onde a moeda da Solana está na curva de lançamento
 * (18/10/2026, painel "como na pump.fun"): progresso, SOL guardado, SOL e
 * market cap na formatura. Serve a curva clássica (pump.fun) e a da Chroma
 * (Meteora DBC). `{ curva: null }` quando a moeda não está numa curva.
 *
 * 4 s de cache por moeda: quem estiver na página relê a cada 5 s, e mil
 * pessoas na mesma moeda viram uma leitura da rede.
 */
export const dynamic = "force-dynamic";

export interface CurvaDaMoeda {
  tipo: "pump" | "chroma";
  progresso: number;
  completa: boolean;
  solNaCurva: number;
  solNaFormatura: number;
  mcNaFormaturaUsd: number;
  solUsd: number;
}

export async function GET(request: Request) {
  const mint = new URL(request.url).searchParams.get("mint") ?? "";
  try {
    new PublicKey(mint);
  } catch {
    return NextResponse.json({ error: "endereço inválido" }, { status: 400 });
  }
  const rpc = process.env.HELIUS_RPC || process.env.NEXT_PUBLIC_SOLANA_RPC;
  if (!rpc?.startsWith("http")) return NextResponse.json({ curva: null });

  const curva = await cached(`curva-painel:${mint}`, 4_000, async (): Promise<CurvaDaMoeda | null> => {
    const [{ Connection }, { estadoDaCurvaPump }, { estadoNaCurvaDaChroma }] = await Promise.all([
      import("@solana/web3.js"),
      import("@/lib/pumpfun"),
      import("@/lib/meteora-dbc"),
    ]);
    const conexao = new Connection(rpc, { commitment: "confirmed", disableRetryOnRateLimit: true });
    const solUsd = (await precosNativos().catch(() => null))?.solana ?? 0;

    const pump = await estadoDaCurvaPump(conexao, new PublicKey(mint)).catch(() => null);
    if (pump) {
      return {
        tipo: "pump",
        progresso: pump.progresso,
        completa: pump.completa,
        solNaCurva: pump.solReal,
        solNaFormatura: pump.solNaFormatura,
        mcNaFormaturaUsd: pump.mcNaFormaturaSol * solUsd,
        solUsd,
      };
    }
    const chroma = await estadoNaCurvaDaChroma(conexao, mint).catch(() => null);
    if (chroma) {
      return {
        tipo: "chroma",
        progresso: chroma.progresso,
        completa: chroma.completa,
        solNaCurva: chroma.solReal,
        solNaFormatura: chroma.solNaFormatura,
        mcNaFormaturaUsd: chroma.mcNaFormaturaSol * solUsd,
        solUsd,
      };
    }
    return null;
  }).catch(() => null);

  return NextResponse.json({ curva }, { headers: naCdn(4) });
}
