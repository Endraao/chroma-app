import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getStore } from "@netlify/blobs";

import { exportarBanco } from "@/lib/backup";
import { chaveInterna } from "@/lib/chave-interna";

export const maxDuration = 60;

/**
 * Cópia diária do banco pro Blob da Vercel (agendada em vercel.json).
 * Com CRON_SECRET configurado, só a Vercel consegue disparar.
 */
export async function GET(request: Request) {
  // Sempre exige a chave (na Netlify não há CRON_SECRET; ver lib/chave-interna.ts).
  if (request.headers.get("authorization") !== `Bearer ${chaveInterna("backup")}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  try {
    const dados = await exportarBanco();
    const dia = dados.em.slice(0, 10);
    // Netlify Blobs (12/10/2026); fora da Netlify, o Vercel Blob de antes.
    let naNetlify = false;
    try {
      await getStore({ name: "backups", consistency: "strong" }).set(`${dia}-${Date.now()}.json`, JSON.stringify(dados));
      naNetlify = true;
    } catch {
      /* sem loja da Netlify */
    }
    if (!naNetlify) await put(`backups/${dia}.json`, JSON.stringify(dados), {
      access: "private", // o armazenamento da Chroma é privado: só o servidor lê
      addRandomSuffix: true,
      contentType: "application/json",
    });
    const linhas = Object.fromEntries(Object.entries(dados.tabelas).map(([t, l]) => [t, l.length]));
    return NextResponse.json({ ok: true, linhas });
  } catch (e) {
    console.error("[backup]", e);
    return NextResponse.json({ error: "falhou" }, { status: 500 });
  }
}
