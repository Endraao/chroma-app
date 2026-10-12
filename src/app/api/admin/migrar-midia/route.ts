import { NextResponse } from "next/server";
import { list } from "@vercel/blob";
import { getStore } from "@netlify/blobs";

import { chaveInterna } from "@/lib/chave-interna";

/**
 * GET /api/admin/migrar-midia?cursor=… (cabeçalho authorization: Bearer <chave>)
 *
 * Copia o que está no Vercel Blob pro Netlify Blobs, em lotes (a função tem
 * poucos segundos). Mídia vai pra loja "midia"; backups pra "backups". Devolve
 * o próximo cursor até acabar. Uso único da saída da Vercel (12/10/2026).
 */
export const maxDuration = 26;

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${chaveInterna("migrar")}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const credencial = process.env.BLOB_READ_WRITE_TOKEN;
  if (!credencial) return NextResponse.json({ error: "sem BLOB_READ_WRITE_TOKEN" }, { status: 500 });

  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
  const pagina = await list({ cursor, limit: 8 });
  const midia = getStore({ name: "midia", consistency: "strong" });
  const backups = getStore({ name: "backups", consistency: "strong" });
  const copiados: string[] = [];
  const falhas: string[] = [];

  for (const b of pagina.blobs) {
    const ehBackup = b.pathname.startsWith("backups/");
    const loja = ehBackup ? backups : midia;
    const chave = ehBackup ? b.pathname.slice("backups/".length) : b.pathname;
    try {
      if (await loja.getMetadata(chave)) continue; // já está lá
      const r = await fetch(b.url, { headers: { authorization: `Bearer ${credencial}` }, cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      await loja.set(chave, await r.arrayBuffer());
      copiados.push(b.pathname);
    } catch {
      falhas.push(b.pathname);
    }
  }
  return NextResponse.json({ copiados, falhas, proximo: pagina.hasMore ? pagina.cursor : null });
}
