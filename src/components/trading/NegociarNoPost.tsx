"use client";

import { Suspense } from "react";

import { NumeroVivo, AoVivoProvider, useTokenVivo } from "@/components/home/AoVivo";
import { ImagemDaMoeda } from "@/components/home/CardDaMoeda";
import { useTextos } from "@/components/IdiomaProvider";
import { SwapWidget } from "@/components/trading/SwapWidget";
import { traducoes } from "@/lib/idiomas";
import type { TokenSummary } from "@/lib/types";
import { cn, formatPct, formatPrice, formatUsd } from "@/lib/utils";

const TEXTOS = traducoes({
  en: { abrir: "Open on Chroma ↗", mc: "MC", rodape: "Trade right here — powered by" },
  pt: { abrir: "Abrir na Chroma ↗", mc: "MC", rodape: "Negocie aqui mesmo — feito pela" },
  zh: { abrir: "在 Chroma 打开 ↗", mc: "市值", rodape: "直接在这里交易 — 由" },
});

/** O que aparece dentro do post do X: cabeçalho da moeda + comprar/vender. */
export function NegociarNoPost({ token }: { token: TokenSummary }) {
  return (
    <AoVivoProvider tokens={[token]}>
      <Conteudo base={token} />
    </AoVivoProvider>
  );
}

function Conteudo({ base }: { base: TokenSummary }) {
  const t = useTextos(TEXTOS);
  const token = useTokenVivo(base);
  const pct = token.change24h;
  return (
    <main className="mx-auto flex min-h-screen max-w-[480px] flex-col gap-2.5 bg-ink-950 p-3">
      <div className="flex items-center gap-3">
        <div className="size-11 shrink-0 overflow-hidden rounded-full bg-ink-800">
          <ImagemDaMoeda token={token} px={88} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-black text-zinc-50">
            {token.name} <span className="text-[12.5px] font-semibold text-sky-300/90">${token.symbol}</span>
          </p>
          <p className="tnum text-[12px] text-zinc-400">
            $<NumeroVivo valor={token.priceUsd} formatar={formatPrice} /> ·{" "}
            <NumeroVivo valor={token.marketCapUsd} formatar={formatUsd} /> {t.mc}
            {Number.isFinite(pct) && pct !== 0 && (
              <span className={cn("ml-1.5 font-bold", pct >= 0 ? "text-bull" : "text-bear")}>{formatPct(pct)}</span>
            )}
          </p>
        </div>
        <a
          href={`/token/${token.address}`}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-lg border border-marca/40 px-2.5 py-1.5 text-[12px] font-bold text-marca hover:bg-marca/10"
        >
          {t.abrir}
        </a>
      </div>

      <Suspense fallback={null}>
        <SwapWidget
          symbol={token.symbol}
          chain={token.chain}
          tokenAddress={token.address}
          pool={token.pairAddress ?? null}
          priceUsd={token.priceUsd}
          naCurvaDaChroma={token.dexId === "chroma-curve"}
        />
      </Suspense>

      <p className="text-center text-[11px] text-zinc-500">
        {t.rodape}{" "}
        <a href="/" target="_blank" rel="noreferrer" className="font-bold text-marca">
          chromalaunch.fun
        </a>
      </p>
    </main>
  );
}
