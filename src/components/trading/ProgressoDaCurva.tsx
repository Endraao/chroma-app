"use client";

import { useEffect, useState } from "react";

import { useTextos } from "@/components/IdiomaProvider";
import type { CurvaDaMoeda } from "@/app/api/curva/route";
import { traducoes } from "@/lib/idiomas";
import { formatUsd } from "@/lib/utils";

/**
 * Progresso da curva de lançamento das moedas da Solana, como o painel da
 * pump.fun (pedido do dono, 18/10/2026): quanto já encheu, em que market cap
 * ela forma, quanto SOL tem dentro e quanto falta. Relido a cada 5 s.
 *
 * Ao formar, a liquidez sai da curva pra uma pool de verdade e fica travada —
 * os tokens da moeda NÃO são queimados (o que se queima/trava é a liquidez).
 */
const TEXTOS = traducoes({
  en: {
    titulo: "Bonding curve progress",
    forma: "Graduates at",
    naCurva: "SOL in the curve",
    falta: "Still needed",
    cheia: "Curve full: moving to the pool",
    rodape: (dex: string) => `At 100% the liquidity moves to ${dex} and is locked forever.`,
  },
  pt: {
    titulo: "Progresso da curva",
    forma: "Forma em",
    naCurva: "SOL na curva",
    falta: "Falta",
    cheia: "Curva cheia: indo pra pool",
    rodape: (dex: string) => `Em 100% a liquidez vai pra ${dex} e fica travada pra sempre.`,
  },
  zh: {
    titulo: "联合曲线进度",
    forma: "毕业市值",
    naCurva: "曲线中的 SOL",
    falta: "还需",
    cheia: "曲线已满：正在迁移到池子",
    rodape: (dex: string) => `达到 100% 时，流动性将迁移到 ${dex} 并永久锁定。`,
  },
});

const sol = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 1 : 2 })} SOL`;

export function ProgressoDaCurva({ mint }: { mint: string }) {
  const t = useTextos(TEXTOS);
  const [curva, setCurva] = useState<CurvaDaMoeda | null>(null);

  useEffect(() => {
    let cancelado = false;
    const ler = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch(`/api/curva?mint=${mint}`);
        if (!r.ok) return;
        const { curva } = (await r.json()) as { curva: CurvaDaMoeda | null };
        if (!cancelado) setCurva(curva);
      } catch {
        /* rede oscilou: a próxima leitura tenta de novo */
      }
    };
    void ler();
    const id = window.setInterval(() => void ler(), 5_000);
    return () => {
      cancelado = true;
      window.clearInterval(id);
    };
  }, [mint]);

  if (!curva) return null;

  const pct = Math.max(0, Math.min(100, curva.progresso));
  const falta = Math.max(0, curva.solNaFormatura - curva.solNaCurva);
  const dex = curva.tipo === "pump" ? "PumpSwap" : "Meteora";

  return (
    <div className="rounded-xl border border-marca/20 bg-marca/[0.04] p-4">
      <div className="flex items-baseline justify-between">
        <span className="flex items-center gap-2 text-[14px] font-bold text-zinc-100">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-marca opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-marca" />
          </span>
          {t.titulo}
        </span>
        <span className="tnum text-[15px] font-black text-marca">{pct.toFixed(pct < 10 ? 2 : 1)}%</span>
      </div>

      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-marca transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(pct > 0 ? 1.5 : 0, pct)}%` }}
        />
      </div>

      {curva.completa ? (
        <p className="mt-3 text-[13px] font-semibold text-marca">{t.cheia}</p>
      ) : (
        <div className="tnum mt-3 space-y-1.5 text-[13px]">
          {curva.mcNaFormaturaUsd > 0 && (
            <Linha rotulo={t.forma} valor={`${formatUsd(curva.mcNaFormaturaUsd)} MC`} destaque />
          )}
          <Linha rotulo={t.naCurva} valor={`${sol(curva.solNaCurva)} (${formatUsd(curva.solNaCurva * curva.solUsd)})`} />
          <Linha rotulo={t.falta} valor={`${sol(falta)} (${formatUsd(falta * curva.solUsd)})`} />
        </div>
      )}

      <p className="mt-3 text-[11.5px] text-zinc-500">💎 {t.rodape(dex)}</p>
    </div>
  );
}

function Linha({ rotulo, valor, destaque = false }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-zinc-500">{rotulo}</span>
      <span className={destaque ? "font-bold text-zinc-50" : "text-zinc-200"}>{valor}</span>
    </div>
  );
}
