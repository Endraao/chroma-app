"use client";

import Link from "next/link";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";
import type { TokenSummary } from "@/lib/types";
import { cn, formatPct, formatUsd, miniatura } from "@/lib/utils";

const TEXTOS = traducoes({
  en: { titulo: "Pumping now" },
  pt: { titulo: "Subindo agora" },
  zh: { titulo: "正在上涨" },
});

/** A alta que mais diz "agora": 5 min; sem ela, 1 h; moeda nova, desde o lançamento. */
function altaAgora(t: TokenSummary): number {
  const c = t.priceChanges ?? {};
  const m5 = Number(c.m5) || 0;
  const h1 = Number(c.h1) || 0;
  if (m5) return m5;
  if (h1) return h1;
  return Date.now() - t.createdAt < 24 * 3600_000 ? t.change24h : 0;
}

/**
 * Faixa que corre sozinha com as moedas que mais sobem NESTE momento (pedido
 * do dono, 06/10/2026: "na fomo as moedas se mexem sem parar"). Os números
 * são os mesmos da vitrine, nada inventado: só os que estão subindo.
 */
export function SubindoAgora({ tokens }: { tokens: TokenSummary[] }) {
  const t = useTextos(TEXTOS);
  const subindo = tokens
    .map((x) => ({ x, alta: altaAgora(x) }))
    // Acima de 50.000% é dado quebrado da fonte, não alta de verdade.
    .filter((v) => v.alta >= 5 && v.alta <= 50_000 && v.x.marketCapUsd > 0)
    .sort((a, b) => b.alta - a.alta)
    .slice(0, 16);
  if (subindo.length < 3) return null;
  const itens = [...subindo, ...subindo]; // duplicado: a faixa dá a volta sem emenda

  return (
    <div className="relative mb-5 overflow-hidden rounded-xl border border-bull/25 bg-bull/[0.04]">
      <div className="absolute inset-y-0 left-0 z-10 flex items-center gap-1.5 bg-gradient-to-r from-ink-950 via-ink-950 to-transparent pl-3 pr-8 text-[11px] font-black uppercase tracking-[0.14em] text-bull">
        <span className="size-1.5 animate-pulse rounded-full bg-bull" />
        🔥 {t.titulo}
      </div>
      <div className="faixa-correndo flex w-max gap-2 py-2 pl-[170px]">
        {itens.map(({ x, alta }, i) => (
          <Link
            key={`${x.address}-${i}`}
            href={`/token/${x.address}`}
            className="flex shrink-0 items-center gap-2 rounded-full border border-white/[0.06] bg-ink-900/80 py-1 pl-1 pr-3 transition-colors hover:border-bull/50"
          >
            <img
              src={x.imageUrl ? miniatura(x.imageUrl, 32) : `/api/logo/${x.address}`}
              alt=""
              className="size-6 rounded-full object-cover"
              loading="lazy"
            />
            <span className="text-[12.5px] font-bold text-zinc-100">${x.symbol}</span>
            <span className="tnum text-[11.5px] text-zinc-500">{formatUsd(x.marketCapUsd)}</span>
            <span className={cn("tnum text-[12.5px] font-black", alta >= 0 ? "text-bull" : "text-bear")}>{formatPct(alta)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
