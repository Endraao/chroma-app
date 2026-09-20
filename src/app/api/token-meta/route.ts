import { NextResponse } from "next/server";

import { getTokenMeta } from "@/lib/jupiter";
import { cached } from "@/lib/cache";

/** GET /api/token-meta?mint=... -> decimais, token program e holders (Solana). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mint = searchParams.get("mint");

  if (!mint) {
    return NextResponse.json({ error: "parâmetro 'mint' é obrigatório" }, { status: 400 });
  }

  try {
    // Decimais nunca mudam; o resto muda devagar. 5 minutos é folgado.
    const meta = await cached(`meta:${mint}`, 300_000, () => getTokenMeta(mint));
    if (!meta) {
      return NextResponse.json({ error: "token não encontrado na Jupiter" }, { status: 404 });
    }
    return NextResponse.json(meta);
  } catch (error) {
    console.warn("[api/token-meta]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "falha ao buscar metadados" },
      { status: 502 },
    );
  }
}
