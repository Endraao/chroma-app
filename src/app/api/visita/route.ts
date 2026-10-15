import { NextResponse } from "next/server";

import { chaveInterna } from "@/lib/chave-interna";
import { banco, sql } from "@/lib/db";

/**
 * Contador de visitas (15/10/2026). O dono queria saber se alguém entra no
 * site além dos robôs.
 *
 * POST { v, p, r } — v: id sorteado no navegador, p: página, r: site de onde
 * veio. GET com a chave interna ("migrar") → visitantes dos últimos 14 dias.
 */
export const dynamic = "force-dynamic";

const ROBO = /bot|crawl|spider|slurp|headless|preview|lighthouse/i;

export async function POST(request: Request) {
  if (ROBO.test(request.headers.get("user-agent") ?? "")) return new NextResponse(null, { status: 204 });
  const { v, p, r } = (await request.json().catch(() => ({}))) as { v?: string; p?: string; r?: string };
  if (!v || !/^[a-z0-9]{8,40}$/i.test(v)) return new NextResponse(null, { status: 204 });

  const dia = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10); // dia de Brasília
  const pagina = String(p ?? "/").slice(0, 120);
  const origem = r ? String(r).slice(0, 80) : null;
  await banco();
  await sql`
    INSERT INTO visitas (dia, visitante, entrada, origem) VALUES (${dia}, ${v}, ${pagina}, ${origem})
    ON CONFLICT (dia, visitante) DO UPDATE SET paginas = visitas.paginas + 1`;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${chaveInterna("migrar")}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  await banco();
  const dias = await sql`
    SELECT dia, count(*)::int AS visitantes, sum(paginas)::int AS paginas
    FROM visitas GROUP BY dia ORDER BY dia DESC LIMIT 14`;
  const origens = await sql`
    SELECT coalesce(origem, 'direto') AS origem, count(*)::int AS visitantes
    FROM visitas WHERE dia = ${dias[0]?.dia ?? ""} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`;
  const entradas = await sql`
    SELECT entrada, count(*)::int AS visitantes
    FROM visitas WHERE dia = ${dias[0]?.dia ?? ""} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`;
  return NextResponse.json({ dias, origens, entradas }, { headers: { "cache-control": "no-store" } });
}
