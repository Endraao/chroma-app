"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { NumeroVivo, useTokenVivo } from "@/components/home/AoVivo";
import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";
import type { TokenSummary } from "@/lib/types";
import { cn, formatPct, formatUsd, miniatura, timeAgo } from "@/lib/utils";

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
        "group relative flex h-[172px] min-w-0 overflow-hidden rounded-2xl border bg-gradient-to-br from-[#0d1c33] to-[#0a1220] p-5 transition-all duration-200 hover:-translate-y-0.5",
        destaque ? "border-marca/40 hover:border-marca/70" : "border-white/[0.08] hover:border-marca/40",
      )}
    >
      {/* A arte grande, apagada, entrando pela direita. */}
      <div className="pointer-events-none absolute -right-9 top-1/2 size-[186px] -translate-y-1/2 overflow-hidden rounded-full opacity-35 transition-opacity duration-200 [mask-image:linear-gradient(to_left,black_45%,transparent)] group-hover:opacity-55">
        <ImagemDaMoeda token={token} />
      </div>

      <div className="relative z-[1] flex min-w-0 flex-1 flex-col">
        <div className="size-11 shrink-0 overflow-hidden rounded-full bg-ink-800 ring-1 ring-white/10">
          <ImagemDaMoeda token={token} px={88} />
        </div>
        <p className="mt-auto max-w-[70%] truncate text-[14px] font-semibold text-zinc-300">${token.symbol}</p>
        <NumeroVivo
          valor={token.marketCapUsd}
          formatar={formatUsd}
          className="tnum block text-[28px] font-bold leading-tight tracking-tight text-zinc-50"
        />
        <div className="tnum mt-1 flex items-center gap-2 text-[13px] text-zinc-400">
          {temPct && (
            <span className={pct >= 0 ? "font-semibold text-bull" : "font-semibold text-bear"}>
              {pct >= 0 ? "▲" : "▼"} <NumeroVivo valor={Math.abs(pct)} formatar={(n) => formatPct(n).replace(/^[+-]/, "")} />
            </span>
          )}
          <span className="truncate">{timeAgo(token.createdAt)}</span>
        </div>
      </div>

      {emAlta ? (
        <span className="absolute right-3.5 top-3.5 z-[1] rounded-full bg-orange-500/90 px-2.5 py-0.5 text-[11px] font-bold text-black">
          🔥 {t.emAlta}
        </span>
      ) : nova ? (
        <span className="absolute right-3.5 top-3.5 z-[1] rounded-full border border-bull/40 bg-black/50 px-2.5 py-0.5 text-[11px] font-semibold text-bull">
          {t.nova}
        </span>
      ) : naCurva ? (
        <span className="absolute right-3.5 top-3.5 z-[1] rounded-full border border-marca/40 bg-black/50 px-2.5 py-0.5 text-[11px] font-semibold text-marca">
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
