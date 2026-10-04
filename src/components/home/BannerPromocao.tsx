import Link from "next/link";

import { METAS, PARTE_DA_CHROMA } from "@/lib/bonus-criador";
import type { Idioma } from "@/lib/idiomas";

/**
 * O "post" da promoção do criador na home (pedido do dono, 03/10/2026):
 * "Lance moedas na Chroma e ganhe recompensas em dinheiro — até $1.000".
 * O cartão inteiro é um link pra /creator-bonus. Os números saem das METAS,
 * então a vitrine nunca promete diferente das regras.
 */
const TEXTOS: Record<Idioma, { selo: string; titulo: string; sub: string; volume: string; paraVoce: string; cta: string }> = {
  en: {
    selo: "Creator promo",
    titulo: "Launch on Chroma. Get paid in cash.",
    sub: "Up to $1,000 bonus per coin, on top of 40% of every trade fee, forever.",
    volume: "volume",
    paraVoce: "to you",
    cta: "See how it works",
  },
  pt: {
    selo: "Promoção do criador",
    titulo: "Lance na Chroma. Ganhe em dinheiro.",
    sub: "Bônus de até $1.000 por moeda, além de 40% da taxa de toda negociação, pra sempre.",
    volume: "de volume",
    paraVoce: "pra você",
    cta: "Veja como funciona",
  },
  zh: {
    selo: "创作者活动",
    titulo: "在 Chroma 发币，赚取现金。",
    sub: "每个代币最高 1,000 美元奖金，另外永久获得每笔交易 40% 的手续费。",
    volume: "交易量",
    paraVoce: "归你",
    cta: "查看规则",
  },
};

const curto = (n: number) => (n >= 1000 ? `$${n / 1000}K` : `$${n}`);
const cheio = (n: number) => `$${n.toLocaleString("en-US")}`;

export function BannerPromocao({ idioma }: { idioma: Idioma }) {
  const t = TEXTOS[idioma];
  return (
    <Link
      href="/creator-bonus"
      className="group relative block overflow-hidden rounded-xl border border-bull/35 bg-ink-900 transition-colors hover:border-bull/70"
    >
      {/* Luz verde atrás do texto: o cartão é dinheiro, não aviso. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(120% 140% at 0% 0%, rgba(0,209,143,0.16), transparent 55%)" }}
      />
      <div className="relative flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-6">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-bull/15 px-2.5 py-0.5 text-[10.5px] font-black uppercase tracking-[0.14em] text-bull">
            <span className="size-1.5 animate-pulse rounded-full bg-bull" />
            {t.selo}
          </span>
          <p className="mt-2 text-[22px] font-black leading-tight text-zinc-50 sm:text-[26px]">{t.titulo}</p>
          <p className="mt-1 text-[13px] text-zinc-400">{t.sub}</p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          {METAS.map((m, i) => (
            <div
              key={m.volumeUsd}
              className={`rounded-lg border px-3 py-2 text-center ${i === 1 ? "border-bull/50 bg-bull/[0.08]" : "border-ink-700 bg-ink-950/60"}`}
            >
              <p className="tnum text-[10.5px] text-zinc-500">
                {curto(m.volumeUsd)} {t.volume}
              </p>
              <p className="tnum text-[18px] font-black text-bull">{cheio(m.volumeUsd * PARTE_DA_CHROMA + m.bonusUsd)}</p>
              <p className="text-[10px] font-semibold text-zinc-400">{t.paraVoce}</p>
            </div>
          ))}
          <span className="botao-negocio compra inline-flex h-10 items-center px-4 text-[13.5px]">
            {t.cta} <span className="ml-1.5 transition-transform group-hover:translate-x-0.5">→</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
