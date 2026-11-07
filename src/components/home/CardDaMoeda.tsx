"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { NumeroVivo, useHistoricoVivo, useSerieDoGrafico, useTokenVivo } from "@/components/home/AoVivo";
import { Sparkline } from "@/components/ui/Sparkline";
import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";
import type { TokenSummary } from "@/lib/types";
import { cn, formatPct, formatUsd, miniatura } from "@/lib/utils";

const TEXTOS = traducoes({
  en: { nova: "NEW", curva: "CURVE", emAlta: "HOT" },
  pt: { nova: "NOVA", curva: "CURVA", emAlta: "EM ALTA" },
  zh: { nova: "新", curva: "曲线", emAlta: "热门" },
});

/** Até quando a moeda leva o selo de nova. */
const NOVA_POR_MS = 15 * 60_000;
/** Acima disso é dado quebrado da fonte, não alta de verdade. */
const ALTA_MAXIMA = 5_000_000;

/**
 * Card da vitrine: nome e valor à esquerda, arte grande e apagada à direita.
 * Valor de mercado e variação são AO VIVO (ver AoVivo.tsx).
 */
export function CardDaMoeda({ token: base, destaque = false }: { token: TokenSummary; destaque?: boolean }) {
  const t = useTextos(TEXTOS);
  const token = useTokenVivo(base);
  const vivos = useHistoricoVivo(base);
  const serie = useSerieDoGrafico(base);
  const serieSobe = serie ? serie[serie.length - 1] >= serie[0] : true;
  const naCurva = token.bondingProgress !== null;
  const [agora] = useState(() => Date.now());
  const nova = agora - token.createdAt < NOVA_POR_MS;

  const m5 = Number(token.priceChanges?.m5) || 0;
  const pct = token.change24h;
  const temPct = Number.isFinite(pct) && pct !== 0 && Math.abs(pct) <= ALTA_MAXIMA;
  const emAlta = (m5 >= 30 && m5 <= ALTA_MAXIMA) || (agora - token.createdAt < 30 * 60_000 && pct >= 300 && pct <= ALTA_MAXIMA);

  return (
    <Link
      href={`/token/${token.address}`}
      className={cn(
        "group relative flex h-[232px] min-w-0 overflow-hidden rounded-2xl border bg-gradient-to-br from-[#0d1c33] to-[#0a1220] p-5 transition-all duration-200 hover:-translate-y-0.5",
        destaque ? "border-marca/40 hover:border-marca/70" : "border-white/[0.08] hover:border-marca/40",
      )}
    >
      {/* A arte no canto, com anéis em volta. */}
      <div className="pointer-events-none absolute -bottom-12 -right-10 grid size-[230px] origin-bottom-right place-items-center rounded-full border border-white/[0.07] max-sm:scale-[0.72]">
        <div className="grid size-[190px] place-items-center rounded-full border border-white/[0.09]">
          <div className="size-[144px] overflow-hidden rounded-full bg-ink-800 opacity-90 transition-opacity duration-200 group-hover:opacity-100">
            <ImagemDaMoeda token={token} />
          </div>
        </div>
      </div>

      <div className="relative z-[1] flex min-w-0 flex-1 flex-col">
        <div className="size-11 shrink-0 overflow-hidden rounded-full bg-ink-800 ring-1 ring-white/10">
          <ImagemDaMoeda token={token} px={88} />
        </div>
        <p className="mt-4 max-w-[60%] truncate text-[14px] font-bold text-marca">${token.symbol}</p>
        <p className="max-w-[60%] truncate text-[14px] text-zinc-400">{token.name}</p>
        <NumeroVivo
          valor={token.marketCapUsd}
          formatar={formatUsd}
          className="tnum mt-1 block text-[30px] font-bold leading-tight tracking-tight text-zinc-50"
        />
        <div className="tnum mt-auto flex max-w-[62%] items-center gap-3 border-t border-white/[0.07] pt-2.5 text-[13px] text-zinc-400">
          {token.volume24hUsd > 0 && (
            <span className="shrink-0">
              Vol <NumeroVivo valor={token.volume24hUsd} formatar={formatUsd} className="text-zinc-300" />
            </span>
          )}
          {temPct && (
            <span className={cn("shrink-0 font-semibold", pct >= 0 ? "text-bull" : "text-bear")}>
              {pct >= 0 ? "+" : "-"}
              <NumeroVivo valor={Math.abs(pct)} formatar={(n) => formatPct(n).replace(/^[+-]/, "")} />
            </span>
          )}
          <div className="hidden min-w-0 flex-1 xl:block">
            <Sparkline serie={serie} changes={base.priceChanges} vivos={vivos} up={serie ? serieSobe : pct >= 0} altura={24} />
          </div>
        </div>
      </div>

      {emAlta ? (
        <span className="absolute right-4 top-4 z-[1] rounded-full bg-orange-500/90 px-2.5 py-0.5 text-[11px] font-bold text-black">
          🔥 {t.emAlta}
        </span>
      ) : nova ? (
        <span className="absolute right-4 top-4 z-[1] rounded-full border border-bull/40 bg-black/50 px-2.5 py-0.5 text-[11px] font-semibold text-bull">
          {t.nova}
        </span>
      ) : naCurva ? (
        <span className="absolute right-4 top-4 z-[1] rounded-full border border-marca/40 bg-black/50 px-2.5 py-0.5 text-[11px] font-semibold text-marca">
          {t.curva} {Math.round(token.bondingProgress ?? 0)}%
        </span>
      ) : null}
    </Link>
  );
}

/**
 * A arte, com reserva: se a imagem falhar (IPFS lento, link morto), mostra as
 * letras do símbolo em vez do ícone de imagem quebrada.
 */
export function ImagemDaMoeda({ token, px = 256 }: { token: TokenSummary; px?: number }) {
  // 0 = arte da moeda; 1 = /api/logo (procura em outras fontes); 2 = letras.
  const [tentativa, setTentativa] = useState(token.imageUrl ? 0 : 1);
  const proxima = () => setTentativa((t) => t + 1);
  const ref = useRef<HTMLImageElement>(null);

  // Imagem que falhou ANTES da página acordar no navegador não dispara o
  // onError — confere na montagem.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) proxima();
  }, []);

  if (tentativa >= 2) {
    return (
      <div
        className="grid size-full place-items-center text-[28px] font-black text-white/80"
        style={{ background: `linear-gradient(135deg, ${corDoEndereco(token.address)}, #15171c)` }}
      >
        {token.symbol.slice(0, 2).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      key={tentativa}
      src={tentativa === 0 ? miniatura(token.imageUrl, px) : `/api/logo/${token.address}`}
      alt=""
      loading="lazy"
      decoding="async"
      ref={ref}
      onError={proxima}
      className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
    />
  );
}

/** Uma cor estável por endereço — o mesmo criador tem sempre a mesma bolinha. */
function corDoEndereco(endereco: string): string {
  let h = 0;
  for (let i = 0; i < endereco.length; i++) h = (h * 31 + endereco.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 70% 55%)`;
}
