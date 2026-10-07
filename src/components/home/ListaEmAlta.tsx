"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { NumeroVivo, useHistoricoVivo, useTokenVivo } from "@/components/home/AoVivo";
import { Sparkline } from "@/components/ui/Sparkline";
import { ImagemDaMoeda } from "@/components/home/CardDaMoeda";
import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";
import type { TokenSummary } from "@/lib/types";
import { cn, formatPct, formatPrice, formatUsd } from "@/lib/utils";

const TEXTOS = traducoes({
  en: { titulo: "Trending", aoVivo: "live" },
  pt: { titulo: "Em alta", aoVivo: "ao vivo" },
  zh: { titulo: "热门", aoVivo: "实时" },
});

/**
 * A coluna "Em alta" fixa na esquerda, no formato da fomo (pedido do dono,
 * 06/10/2026): logo, nome, preço, valor de mercado e variação — tudo ao vivo.
 */
export function ListaEmAlta({ tokens }: { tokens: TokenSummary[] }) {
  const t = useTextos(TEXTOS);
  const caixa = useRef<HTMLDivElement>(null);
  const [altura, setAltura] = useState<number>();

  // Altura em linhas inteiras: a última moeda nunca aparece cortada pela metade.
  useEffect(() => {
    const medir = () => {
      const el = caixa.current;
      const linha = el?.firstElementChild as HTMLElement | null;
      if (!el || !linha?.offsetHeight) return;
      // Mede pela posição FIXA (a coluna gruda a 80px do topo), não por onde a
      // página está agora — medir rolado/carregando deixava só 3 moedas.
      const coluna = el.closest(".sticky") ?? el.parentElement!;
      const dentro = el.getBoundingClientRect().top - coluna.getBoundingClientRect().top;
      const livre = window.innerHeight - 80 - dentro - 24;
      const cabem = Math.max(3, Math.floor(livre / linha.offsetHeight));
      setAltura(cabem * linha.offsetHeight);
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);

  // Mesmo símbolo duas vezes (cópia): fica só a de maior valor de mercado.
  const unicas = [...tokens]
    .sort((a, b) => b.marketCapUsd - a.marketCapUsd)
    .filter((x, i, todas) => todas.findIndex((y) => y.symbol.toUpperCase() === x.symbol.toUpperCase()) === i);
  const lista = tokens.filter((x) => unicas.includes(x));

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-900/70">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <p className="text-[14px] font-black text-zinc-50">🔥 {t.titulo}</p>
        <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-bull">
          <span className="size-1.5 animate-pulse rounded-full bg-bull" />
          {t.aoVivo}
        </span>
      </div>
      <div ref={caixa} style={{ maxHeight: altura }} className="rolagem-discreta max-h-[calc(100vh-150px)] overflow-y-auto">
        {lista.slice(0, 40).map((x) => (
          <Linha key={`${x.chain}:${x.address}`} token={x} />
        ))}
      </div>
    </div>
  );
}

function Linha({ token: base }: { token: TokenSummary }) {
  const token = useTokenVivo(base);
  const vivos = useHistoricoVivo(base);
  const pct = token.change24h;
  const temPct = Number.isFinite(pct) && pct !== 0 && Math.abs(pct) <= 5_000_000;
  return (
    <Link
      href={`/token/${token.address}`}
      className="group flex items-center gap-3 border-b border-white/[0.04] px-3 py-2.5 transition-colors last:border-0 hover:bg-white/[0.03]"
    >
      <div className="size-10 shrink-0 overflow-hidden rounded-full bg-ink-800">
        <ImagemDaMoeda token={token} px={80} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-bold text-zinc-100">{token.symbol.toUpperCase()}</p>
        <NumeroVivo valor={token.priceUsd} formatar={(n) => `$${formatPrice(n)}`} className="tnum block truncate text-[11.5px] text-zinc-500" />
      </div>
      <div className="w-12 shrink-0">
        <Sparkline changes={base.priceChanges} vivos={vivos} up={pct >= 0} altura={22} />
      </div>
      <div className="shrink-0 text-right">
        <p className="tnum text-[13.5px] font-black text-zinc-50">
          <NumeroVivo valor={token.marketCapUsd} formatar={formatUsd} /> <span className="text-[10.5px] font-semibold text-zinc-500">MC</span>
        </p>
        {temPct && (
          <p className={cn("tnum text-[11.5px] font-bold", pct >= 0 ? "text-bull" : "text-bear")}>
            {pct >= 0 ? "▲" : "▼"} <NumeroVivo valor={Math.abs(pct)} formatar={(n) => formatPct(n).replace(/^[+-]/, "")} />
          </p>
        )}
      </div>
    </Link>
  );
}
