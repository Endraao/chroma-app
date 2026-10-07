import { NextResponse } from "next/server";

import { cached } from "@/lib/cache";

/**
 * MINI-GRÁFICOS DOS CARDS (pedido do dono, 07/10/2026: "deixa com cara de
 * gráfico, igual na pump.fun").
 *
 * O histórico de preço das últimas 24 h em velas de 15 min (96 pontos), da
 * mesma fonte que o site da Jupiter usa. Só Solana; guardado 3 min por moeda,
 * então a vitrine inteira custa poucos pedidos por minuto.
 */
const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM = /^0x[0-9a-fA-F]{40}$/;

/*
 * ROBINHOOD CHAIN: a Jupiter só tem Solana, então o histórico vem da
 * GeckoTerminal — que limita ~30 pedidos por minuto e já é usada pela vitrine.
 * Por isso: guardado 15 min por moeda e no máximo 8 buscas NOVAS por minuto
 * nesta instância; o resto entra nas próximas leituras (o card fica com a
 * linha simples até lá).
 */
const serieEvm = new Map<string, { v: number[]; em: number }>();
let janela = { inicio: 0, usadas: 0 };
const GUARDA_EVM_MS = 15 * 60_000;
const NOVAS_POR_MINUTO = 8;

async function fechamentosEvm(endereco: string): Promise<number[]> {
  const k = endereco.toLowerCase();
  const guardado = serieEvm.get(k);
  if (guardado && Date.now() - guardado.em < GUARDA_EVM_MS) return guardado.v;
  if (Date.now() - janela.inicio > 60_000) janela = { inicio: Date.now(), usadas: 0 };
  if (janela.usadas >= NOVAS_POR_MINUTO) return guardado?.v ?? [];
  janela.usadas++;
  try {
    const { fetchCandles } = await import("@/lib/market");
    const v = (await fetchCandles(endereco, "15m", 96)).map((c) => c.close).filter((x) => Number.isFinite(x) && x > 0);
    serieEvm.set(k, { v, em: Date.now() });
    return v;
  } catch {
    serieEvm.set(k, { v: guardado?.v ?? [], em: Date.now() });
    return guardado?.v ?? [];
  }
}
const MAX = 200;
// (vale pra cada rede separadamente)

async function fechamentos(mint: string): Promise<number[]> {
  return cached(`minigrafico:${mint}`, 180_000, async () => {
    const r = await fetch(
      `https://datapi.jup.ag/v2/charts/${mint}?interval=15_MINUTE&to=${Date.now()}&candles=96&type=price`,
      { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(6_000) },
    );
    if (!r.ok) return [];
    const j = (await r.json()) as { candles?: { close: number }[] };
    return (j.candles ?? []).map((c) => Number(c.close)).filter((v) => Number.isFinite(v) && v > 0);
  }).catch(() => []);
}

export async function GET(request: Request) {
  return responder((new URL(request.url).searchParams.get("mints") ?? "").split(","));
}

/** POST { mints: [...] }: a vitrine inteira não cabe numa URL. */
export async function POST(request: Request) {
  const corpo = (await request.json().catch(() => ({}))) as { mints?: unknown };
  return responder(Array.isArray(corpo.mints) ? corpo.mints.map(String) : []);
}

async function responder(lista: string[]) {
  const mints = [...new Set(lista.filter((m) => MINT.test(m)))].slice(0, MAX);
  const evms = [...new Set(lista.filter((m) => EVM.test(m)).map((m) => m.toLowerCase()))].slice(0, MAX);
  const saida: Record<string, number[]> = {};
  const series = await Promise.all(evms.map(fechamentosEvm));
  evms.forEach((m, j) => {
    if (series[j].length >= 4) saida[m] = series[j];
  });
  // Em lotes de 25: rajada grande demais vira recusa.
  for (let i = 0; i < mints.length; i += 25) {
    const lote = mints.slice(i, i + 25);
    const series = await Promise.all(lote.map(fechamentos));
    lote.forEach((m, j) => {
      if (series[j].length >= 4) saida[m] = series[j];
    });
  }
  return NextResponse.json(saida);
}
