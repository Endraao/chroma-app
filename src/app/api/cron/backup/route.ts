import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

import { exportarBanco } from "@/lib/backup";

export const maxDuration = 60;

/**
 * Cópia diária do banco pro Blob da Vercel (agendada em vercel.json).
 * Com CRON_SECRET configurado, só a Vercel consegue disparar.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (segredo && request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  try {
    const dados = await exportarBanco();
    const dia = dados.em.slice(0, 10);
    const arquivo = await put(`backups/${dia}.json`, JSON.stringify(dados), {
      access: "public",
      addRandomSuffix: true, // nome impossível de adivinhar
      contentType: "application/json",
    });
    const linhas = Object.fromEntries(Object.entries(dados.tabelas).map(([t, l]) => [t, l.length]));
    return NextResponse.json({ ok: true, linhas, tamanho: arquivo.pathname.length ? undefined : 0 });
  } catch (e) {
    console.error("[backup]", e);
    return NextResponse.json({ error: "falhou" }, { status: 500 });
  }
}
