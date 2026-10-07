"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useTextos } from "@/components/IdiomaProvider";
import { METAS, type ProgressoDoBonus } from "@/lib/bonus-criador";
import { traducoes } from "@/lib/idiomas";
import { formatUsd } from "@/lib/utils";

const TEXTOS = traducoes({
  en: {
    titulo: "Creator bonus",
    proxima: (v: string, b: string) => `Next: ${b} bonus at ${v} volume`,
    todas: "All goals reached",
    ganho: (b: string) => `${b} earned by the creator`,
    como: "How it works",
  },
  pt: {
    titulo: "Bônus do criador",
    proxima: (v: string, b: string) => `Próxima: bônus de ${b} com ${v} de volume`,
    todas: "Todas as metas batidas",
    ganho: (b: string) => `${b} conquistados pelo criador`,
    como: "Como funciona",
  },
  zh: {
    titulo: "创作者奖金",
    proxima: (v: string, b: string) => `下一目标：交易量达到 ${v}，奖金 ${b}`,
    todas: "所有目标均已达成",
    ganho: (b: string) => `创作者已获得 ${b}`,
    como: "规则说明",
  },
});

/**
 * Progresso do bônus do criador numa moeda da Curva da Chroma (ver
 * lib/bonus-criador.ts). Fora da curva a rota responde 404 e o cartão some.
 */
export function BonusDoCriador({ address }: { address: string }) {
  const t = useTextos(TEXTOS);
  const [p, setP] = useState<ProgressoDoBonus | null>(null);

  useEffect(() => {
    let cancelado = false;
    const ler = () =>
      fetch(`/api/bonus-criador?address=${address}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => !cancelado && setP(j))
        .catch(() => {});
    void ler();
    const id = window.setInterval(ler, 60_000);
    return () => {
      cancelado = true;
      window.clearInterval(id);
    };
  }, [address]);

  if (!p) return null;

  return (
    <div className="rounded-xl border border-marca/25 bg-ink-900 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-bold uppercase tracking-wider text-marca">{t.titulo}</p>
        <Link href="/creator-bonus" className="text-[11px] text-zinc-500 hover:text-zinc-200">
          {t.como} →
        </Link>
      </div>
      <p className="tnum mt-2 text-[13px] text-zinc-200">
        {p.proxima ? t.proxima(formatUsd(p.proxima.volumeUsd), formatUsd(p.proxima.bonusUsd)) : t.todas}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-700">
        <div className="h-full rounded-full bg-marca" style={{ width: `${Math.max(1.5, p.pct)}%` }} />
      </div>
      <div className="tnum mt-1.5 flex justify-between text-[11px] text-zinc-500">
        <span>{formatUsd(p.volumeUsd)}</span>
        <span>{p.proxima ? formatUsd(p.proxima.volumeUsd) : formatUsd(METAS[METAS.length - 1].volumeUsd)}</span>
      </div>
      {p.conquistadoUsd > 0 && <p className="mt-2 text-[12px] font-semibold text-marca">{t.ganho(formatUsd(p.conquistadoUsd))}</p>}
    </div>
  );
}
