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
    <Link href="/creator-bonus" className="promo-card group block">
      <div className="promo-card-dentro flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-6">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-bull/15 px-2.5 py-0.5 text-[10.5px] font-black uppercase tracking-[0.14em] text-bull">
            <span className="size-1.5 animate-pulse rounded-full bg-bull" />
            {t.selo}
          </span>
          <p className="mt-2 text-[22px] font-black leading-tight text-zinc-50 sm:text-[26px]">{t.titulo}</p>
          <p className="mt-1 text-[13px] text-zinc-400">{t.sub}</p>
        </div>

        <div className="grid shrink-0 grid-cols-3 gap-2 lg:flex lg:flex-wrap lg:items-center lg:gap-2.5">
          {METAS.map((m, i) => (
            <div
              key={m.volumeUsd}
              className={`rounded-xl border px-3 py-2 text-center ${i === 1 ? "border-bull/50 bg-bull/[0.08]" : "border-white/[0.07] bg-white/[0.02]"}`}
            >
              <p className="tnum text-[10.5px] text-zinc-500">
                {curto(m.volumeUsd)} {t.volume}
              </p>
              <p className="tnum text-[18px] font-black text-bull">{cheio(m.volumeUsd * PARTE_DA_CHROMA + m.bonusUsd)}</p>
              <p className="text-[10px] font-semibold text-zinc-400">{t.paraVoce}</p>
            </div>
          ))}
          <span className="col-span-3 inline-flex h-10 items-center justify-center rounded-xl bg-bull/90 px-4 text-[13.5px] font-black text-[#03130d] transition-colors group-hover:bg-bull">
            {t.cta} <span className="ml-1.5 transition-transform group-hover:translate-x-0.5">→</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

/**
 * A versão CARD da promoção, flutuando no espaço vazio da abertura (telas
 * largas). Em tela menor quem aparece é o banner acima, embaixo da abertura.
 */
export function CardPromocao({ idioma }: { idioma: Idioma }) {
  const t = TEXTOS[idioma];
  return (
    <Link href="/creator-bonus" className="promo-card group block w-[340px]">
      <div className="promo-card-dentro px-5 py-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-bull/15 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-bull">
          <span className="size-1.5 animate-pulse rounded-full bg-bull" />
          {t.selo}
        </span>
        <p className="mt-2.5 text-[21px] font-black leading-[1.1] text-zinc-50">{t.titulo}</p>
        <p className="mt-1.5 text-[12px] leading-snug text-zinc-400">{t.sub}</p>

        <div className="mt-3 space-y-1.5">
          {METAS.map((m, i) => (
            <div
              key={m.volumeUsd}
              className={`flex items-center justify-between rounded-xl border px-3 py-1.5 ${
                i === 1 ? "border-bull/45 bg-bull/[0.09]" : "border-white/[0.07] bg-white/[0.02]"
              }`}
            >
              <span className="tnum text-[11.5px] text-zinc-400">
                {curto(m.volumeUsd)} {t.volume}
              </span>
              <span className="tnum flex items-baseline gap-1.5">
                <span className="promo-valor text-[19px] font-black">{cheio(m.volumeUsd * PARTE_DA_CHROMA + m.bonusUsd)}</span>
                <span className="text-[10.5px] font-semibold text-zinc-500">{t.paraVoce}</span>
              </span>
            </div>
          ))}
        </div>

        <span className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-bull/90 py-2 text-[13px] font-black text-[#03130d] transition-colors group-hover:bg-bull">
          {t.cta} <span className="transition-transform group-hover:translate-x-0.5">→</span>
        </span>
      </div>
    </Link>
  );
}
