"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { useDadosVivos } from "@/components/home/AoVivo";
import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";
import type { TokenSummary } from "@/lib/types";
import { cn, formatUsd, miniatura, shortenAddress } from "@/lib/utils";

const TEXTOS = traducoes({
  en: { titulo: "Live trades", comprou: "bought", vendeu: "sold", de: "of", agora: "now", esperando: "Waiting for the next trade…" },
  pt: { titulo: "Negócios ao vivo", comprou: "comprou", vendeu: "vendeu", de: "de", agora: "agora", esperando: "Esperando o próximo negócio…" },
  zh: { titulo: "实时交易", comprou: "买入", vendeu: "卖出", de: "", agora: "刚刚", esperando: "等待下一笔交易…" },
});

interface Negocio {
  id: string;
  quando: number;
  carteira: string;
  compra: boolean;
  usd: number;
  token: TokenSummary;
}

const INTERVALO_MS = 3_000;
const MINIMO_USD = 3;

function haQuanto(ms: number, agora: string) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 5) return agora;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`;
}

/**
 * Feed de negócios REAIS das moedas em alta (pedido do dono, 06/10/2026):
 * "🟢 7xKp…a2 comprou $120 de X · agora". Lê as últimas negociações de um par
 * por vez na GeckoTerminal (grátis), revezando entre as moedas em alta.
 */
export function FeedAoVivo({ tokens }: { tokens: TokenSummary[] }) {
  const t = useTextos(TEXTOS);
  const vivos = useDadosVivos();
  const [negocios, setNegocios] = useState<Negocio[]>([]);
  const [, setRelogio] = useState(0);
  const vistos = useRef(new Set<string>());
  const alvo = useRef<{ token: TokenSummary; par: string }[]>([]);

  alvo.current = tokens
    .slice(0, 10)
    .map((token) => ({ token, par: vivos.get(token.address.toLowerCase())?.pairAddress ?? token.pairAddress ?? "" }))
    .filter((x) => x.par);

  useEffect(() => {
    let vez = 0;
    let vivo = true;
    const tick = async () => {
      if (document.visibilityState !== "visible" || !alvo.current.length) return;
      const { token, par } = alvo.current[vez++ % alvo.current.length];
      const rede = token.chain === "robinhood" ? "robinhood" : "solana";
      try {
        const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/${rede}/pools/${par}/trades`, {
          headers: { accept: "application/json" },
          cache: "no-store",
        });
        if (!r.ok || !vivo) return;
        const j = await r.json();
        const novos: Negocio[] = [];
        for (const d of (j?.data ?? []).slice(0, 12)) {
          const a = d.attributes ?? {};
          const usd = Number(a.volume_in_usd) || 0;
          if (usd < MINIMO_USD || vistos.current.has(d.id)) continue;
          vistos.current.add(d.id);
          novos.push({
            id: d.id,
            quando: Date.parse(a.block_timestamp) || Date.now(),
            carteira: a.tx_from_address ?? "",
            compra: a.kind === "buy",
            usd,
            token,
          });
        }
        if (novos.length) setNegocios((antes) => [...novos, ...antes].sort((x, y) => y.quando - x.quando).slice(0, 25));
      } catch {
        /* limite da fonte: tenta o próximo par no próximo tick */
      }
    };
    tick();
    const id = window.setInterval(tick, INTERVALO_MS);
    const relogio = window.setInterval(() => setRelogio((n) => n + 1), 1_000);
    return () => {
      vivo = false;
      window.clearInterval(id);
      window.clearInterval(relogio);
    };
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-900/70">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <p className="text-[14px] font-black text-zinc-50">⚡ {t.titulo}</p>
        <span className="size-1.5 animate-pulse rounded-full bg-bull" />
      </div>
      <div className="max-h-[42vh] overflow-y-auto [scrollbar-width:thin]">
        {negocios.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-zinc-500">{t.esperando}</p>
        ) : (
          negocios.map((n) => (
            <Link
              key={n.id}
              href={`/token/${n.token.address}`}
              className="negocio-entra flex items-center gap-2.5 border-b border-white/[0.04] px-3 py-2 text-[12px] transition-colors last:border-0 hover:bg-white/[0.03]"
            >
              <span className={cn("size-2 shrink-0 rounded-full", n.compra ? "bg-bull" : "bg-bear")} />
              <img
                src={n.token.imageUrl ? miniatura(n.token.imageUrl, 40) : `/api/logo/${n.token.address}`}
                alt=""
                className="size-6 shrink-0 rounded-full object-cover"
                loading="lazy"
              />
              <span className="min-w-0 flex-1 truncate text-zinc-400">
                <span className="font-mono text-zinc-500">{shortenAddress(n.carteira, 3)}</span>{" "}
                {n.compra ? t.comprou : t.vendeu}{" "}
                <span className={cn("tnum font-bold", n.compra ? "text-bull" : "text-bear")}>{formatUsd(n.usd)}</span> {t.de}{" "}
                <span className="font-bold text-zinc-100">${n.token.symbol}</span>
              </span>
              <span className="tnum shrink-0 text-[10.5px] text-zinc-600">{haQuanto(n.quando, t.agora)}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
