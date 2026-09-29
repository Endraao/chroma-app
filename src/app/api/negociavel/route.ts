import { NextResponse } from "next/server";

import { classificar, statusDasMoedas } from "@/lib/negociaveis";

/**
 * A moeda externa da Robinhood pode ser comprada E vendida pela Chroma?
 * Responde do banco (classificado em segundo plano — ver lib/negociaveis.ts);
 * só checa na hora se a moeda nunca foi vista.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const moeda = searchParams.get("moeda") ?? "";
  const pool = searchParams.get("pool");
  if (!/^0x[0-9a-fA-F]{40}$/.test(moeda)) return NextResponse.json({ error: "moeda inválida" }, { status: 400 });

  const guardado = (await statusDasMoedas([moeda])).get(moeda.toLowerCase());
  if (guardado) return NextResponse.json(guardado.r, { headers: { "cache-control": "public, s-maxage=300" } });

  const r = await classificar(moeda, pool);
  if (!r) return NextResponse.json({ ok: false, motivo: "erro" }, { status: 502 });
  return NextResponse.json(r, { headers: { "cache-control": "public, s-maxage=300" } });
}
