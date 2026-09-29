"use client";

import { useState } from "react";
import Link from "next/link";

import { useTextos } from "@/components/IdiomaProvider";
import { Sparkline } from "@/components/ui/Sparkline";
import { traducoes } from "@/lib/idiomas";
import type { TokenSummary } from "@/lib/types";
import { cn, formatPct, formatUsd, miniatura, shortenAddress, timeAgo } from "@/lib/utils";

const TEXTOS = traducoes({
  en: { nova: "NEW", curva: "CURVE" },
  pt: { nova: "NOVA", curva: "CURVA" },
  zh: { nova: "新", curva: "曲线" },
});

/** Até quando a moeda leva o selo de nova. */
const NOVA_POR_MS = 15 * 60_000;

/**
 * Card no formato da vitrine da pump.fun: arte grande e quadrada primeiro,
 * números depois. Numa vitrine de memecoin a imagem é o que faz a pessoa
 * parar — o resto só confirma se vale clicar.
 */
export function CardDaMoeda({ token, destaque = false }: { token: TokenSummary; destaque?: boolean }) {
  const t = useTextos(TEXTOS);
  const up = token.change24h >= 0;
  const naCurva = token.bondingProgress !== null;
  const [agora] = useState(() => Date.now());
  const nova = agora - token.createdAt < NOVA_POR_MS;

  return (
    <Link href={`/token/${token.address}`} className="group block min-w-0">
      <div
        className={cn(
          "relative aspect-square overflow-hidden rounded-lg border bg-ink-800 transition-colors",
          destaque || nova ? "border-bull/60" : "border-ink-700 group-hover:border-marca/50",
        )}
      >
        <ImagemDaMoeda token={token} />

        {/* Mini-gráfico sobre a arte, como na pump.fun */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="pointer-events-none absolute bottom-1.5 right-2 h-8 w-1/2 opacity-90">
          <Sparkline changes={token.priceChanges} up={up} />
        </div>

        {nova ? (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-bull">
            <span className="size-1.5 animate-pulse rounded-full bg-bull" />
            {t.nova}
          </span>
        ) : naCurva ? (
          <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-marca">
            {t.curva} {Math.round(token.bondingProgress ?? 0)}%
          </span>
        ) : null}
      </div>

      <div className="mt-2 px-0.5">
        <p className="truncate text-[14px] font-bold leading-tight text-zinc-50 group-hover:text-white">{token.name}</p>
        <p className="truncate text-[12px] text-zinc-500">${token.symbol}</p>

        <p className="tnum mt-1 flex items-baseline gap-1.5">
          <span className="text-[15px] font-bold text-zinc-100">{formatUsd(token.marketCapUsd)}</span>
          <span className="text-[11px] text-zinc-500">MC</span>
          <span className={cn("ml-auto text-[11px] font-semibold", up ? "text-bull" : "text-bear")}>
            {formatPct(token.change24h)}
          </span>
        </p>

        <p className="tnum mt-1 flex items-center gap-1.5 text-[11.5px] text-zinc-500">
          {token.creator ? (
            <>
              <span
                className="size-3.5 shrink-0 rounded-full"
                style={{ background: corDoEndereco(token.creator) }}
                aria-hidden
              />
              <span className="truncate">{shortenAddress(token.creator, 4)}</span>
            </>
          ) : null}
          <span className="shrink-0 text-bull">{timeAgo(token.createdAt)}</span>
        </p>

        {token.description ? (
          <p className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-zinc-500">{token.description}</p>
        ) : null}
      </div>
    </Link>
  );
}

/**
 * A arte, com reserva: se a imagem falhar (IPFS lento, link morto), mostra as
 * letras do símbolo em vez do ícone de imagem quebrada.
 */
export function ImagemDaMoeda({ token, px = 256 }: { token: TokenSummary; px?: number }) {
  const [falhou, setFalhou] = useState(false);

  if (!token.imageUrl || falhou) {
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
      src={miniatura(token.imageUrl, px)}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFalhou(true)}
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
