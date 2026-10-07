"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { NumeroVivo, useTokenVivo } from "@/components/home/AoVivo";
import { useTextos } from "@/components/IdiomaProvider";
import { chainIcon } from "@/lib/chain-icons";
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
const ALTA_MAXIMA = 50_000;

/**
 * Card da vitrine, numa CAIXA própria (pedido do dono, 06/10/2026: "as
 * moedas tão tudo muito junto, falta separação tipo a stonk"). Arte grande
 * primeiro; valor de mercado e variação AO VIVO (ver AoVivo.tsx), rolando e
 * acendendo verde/vermelho quando mudam.
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
        "group flex min-w-0 flex-col rounded-2xl border bg-ink-900/70 p-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:bg-ink-900",
        destaque || emAlta ? "border-bull/35 hover:border-bull/70" : "border-white/[0.07] hover:border-white/20",
      )}
    >
      <div className="relative aspect-square overflow-hidden rounded-xl bg-ink-800">
        <ImagemDaMoeda token={token} />
        <img
          src={chainIcon(token.chain)}
          alt={token.chain}
          width={20}
          height={20}
          className="absolute left-2 top-2 size-5 rounded-full ring-2 ring-black/60"
        />
        {emAlta ? (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-orange-500/90 px-2 py-0.5 text-[10px] font-black text-black shadow-[0_0_12px_rgba(249,115,22,0.6)]">
            🔥 {t.emAlta}
          </span>
        ) : nova ? (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-bull">
            <span className="size-1.5 animate-pulse rounded-full bg-bull" />
            {t.nova}
          </span>
        ) : naCurva ? (
          <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-marca">
            {t.curva} {Math.round(token.bondingProgress ?? 0)}%
          </span>
        ) : null}
        {temPct && (
          <span
            className={cn(
              "tnum absolute bottom-2 left-2 rounded-md px-2 py-0.5 text-[13px] font-black shadow-lg",
              pct >= 0 ? "bg-bull text-black" : "bg-bear text-white",
            )}
          >
            {pct >= 0 ? "▲" : "▼"}{" "}
            <NumeroVivo valor={Math.abs(pct)} formatar={(n) => formatPct(n).replace(/^[+-]/, "")} />
          </span>
        )}
      </div>

      <div className="mt-2.5 min-w-0 px-0.5">
        <p className="truncate text-[11.5px] font-bold uppercase tracking-wide text-sky-300/90">${token.symbol}</p>
        <p className="truncate text-[13px] text-zinc-400">{token.name}</p>
        <NumeroVivo
          valor={token.marketCapUsd}
          formatar={formatUsd}
          className="tnum mt-1 block text-[20px] font-black leading-tight tracking-tight text-zinc-50"
        />
        <div className="tnum mt-1.5 flex items-center gap-2 border-t border-white/[0.06] pt-1.5 text-[11px] text-zinc-500">
          {token.volume24hUsd > 0 && (
            <span className="truncate">
              Vol <NumeroVivo valor={token.volume24hUsd} formatar={formatUsd} className="text-zinc-300" />
            </span>
          )}
          <span className="ml-auto shrink-0 text-bull">{timeAgo(token.createdAt)}</span>
        </div>
      </div>
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
