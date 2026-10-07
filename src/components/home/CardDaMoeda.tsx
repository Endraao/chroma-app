"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { useTextos } from "@/components/IdiomaProvider";
import { chainIcon } from "@/lib/chain-icons";
import { traducoes } from "@/lib/idiomas";
import type { TokenSummary } from "@/lib/types";
import { cn, formatPct, formatUsd, miniatura, shortenAddress, timeAgo } from "@/lib/utils";

const TEXTOS = traducoes({
  en: { nova: "NEW", curva: "CURVE", emAlta: "HOT" },
  pt: { nova: "NOVA", curva: "CURVA", emAlta: "EM ALTA" },
  zh: { nova: "新", curva: "曲线", emAlta: "热门" },
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
  const naCurva = token.bondingProgress !== null;
  const [agora] = useState(() => Date.now());
  const nova = agora - token.createdAt < NOVA_POR_MS;

  /*
   * O card PISCA quando o valor muda entre uma atualização e outra (a home
   * atualiza sozinha): verde se subiu, vermelho se caiu. É o que dá a
   * sensação de mercado vivo (pedido do dono, 06/10/2026).
   */
  const anterior = useRef(token.marketCapUsd);
  const [pisca, setPisca] = useState<"" | "sobe" | "desce">("");
  useEffect(() => {
    const antes = anterior.current;
    anterior.current = token.marketCapUsd;
    if (!antes || antes === token.marketCapUsd) return;
    setPisca(token.marketCapUsd > antes ? "sobe" : "desce");
    const id = window.setTimeout(() => setPisca(""), 1200);
    return () => window.clearTimeout(id);
  }, [token.marketCapUsd]);

  const c = token.priceChanges ?? {};
  const m5 = Number(c.m5) || 0;
  const emAlta = (m5 >= 30 && m5 <= 50_000) || (agora - token.createdAt < 30 * 60_000 && token.change24h >= 300 && token.change24h <= 50_000);
  const pct = token.change24h;
  const temPct = Number.isFinite(pct) && pct !== 0 && Math.abs(pct) <= 50_000;

  return (
    <Link href={`/token/${token.address}`} className="group block min-w-0">
      <div
        className={cn(
          "relative aspect-square overflow-hidden rounded-lg border bg-ink-800 transition-colors",
          destaque || nova || emAlta ? "border-bull/60" : "border-ink-700 group-hover:border-marca/50",
          pisca === "sobe" && "card-pisca-sobe",
          pisca === "desce" && "card-pisca-desce",
        )}
      >
        <ImagemDaMoeda token={token} />

        {/* A rede da moeda, sempre visível: o painel da Chroma mistura as duas */}
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
            {pct >= 0 ? "▲" : "▼"} {formatPct(Math.abs(pct)).replace(/^[+-]/, "")}
          </span>
        )}
      </div>

      <div className="mt-2 px-0.5">
        <p className="truncate text-[14px] font-bold leading-tight text-zinc-50 group-hover:text-white">{token.name}</p>
        <p className="truncate text-[12px] text-zinc-500">${token.symbol}</p>

        <p className="tnum mt-1 flex items-baseline gap-1.5">
          <span
            className={cn(
              "text-[15px] font-bold transition-colors duration-500",
              pisca === "sobe" ? "text-bull" : pisca === "desce" ? "text-bear" : "text-zinc-100",
            )}
          >
            {formatUsd(token.marketCapUsd)}
          </span>
          <span className="text-[11px] text-zinc-500">MC</span>
          {token.volume24hUsd > 0 && (
            <span className="ml-auto text-[11px] text-zinc-500">
              Vol <span className="text-zinc-300">{formatUsd(token.volume24hUsd)}</span>
            </span>
          )}
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
