import type { Metadata } from "next";
import Link from "next/link";

import { METAS, PARTE_DA_CHROMA } from "@/lib/bonus-criador";
import { idiomaAtual } from "@/lib/idioma-servidor";
import { traducoes } from "@/lib/idiomas";

/**
 * /creator-bonus — as regras do bônus do criador na Curva da Chroma (ver
 * lib/bonus-criador.ts). Tudo que a página promete tem de bater com as METAS.
 */
const TEXTOS = traducoes({
  en: {
    meta: ["Creator bonus — Chroma", "Launch on Chroma Launchpad and earn a cash bonus when your coin hits volume goals."],
    titulo: "Creator bonus",
    intro:
      "Launch your coin on Chroma Launchpad and get paid twice: 40% of the fee on every trade, plus a cash bonus for every volume goal your coin hits. The more your community trades, the more you earn.",
    ganhosTitulo: "What you earn per coin",
    paraVoce: "to you",
    volume: "volume",
    colVolume: "Your coin's volume",
    colTaxas: "Trading fees (40%)",
    colBonus: "Cash bonus",
    colTotal: "Total to you",
    nota: "Trading fees are claimed instantly with the Claim button on your coin's page. The bonus is requested with the same button and paid in SOL within 7 days. Everything goes straight to the wallet that created the coin.",
    destaque: "No other launchpad pays you trading fees and a cash bonus for volume.",
    regras: "Rules",
    itens: [
      "Valid only for coins launched on Chroma Launchpad, on the Solana network.",
      "Every trade counts, wherever it happens: Chroma, Jupiter, Phantom, Fomo or any other app. The fee is charged by the coin itself, not by the app.",
      "Track your progress live on your coin's page — everything is measured on-chain.",
    ],
    cta: "Launch on Chroma",
  },
  pt: {
    meta: ["Bônus do criador — Chroma", "Lance na Chroma Launchpad e ganhe um bônus em dinheiro quando sua moeda bater metas de volume."],
    titulo: "Bônus do criador",
    intro:
      "Lance sua moeda na Chroma Launchpad e ganhe duas vezes: 40% da taxa de cada negociação e um bônus em dinheiro a cada meta de volume que sua moeda bater. Quanto mais sua comunidade negocia, mais você ganha.",
    ganhosTitulo: "Quanto você ganha por moeda",
    paraVoce: "pra você",
    volume: "de volume",
    colVolume: "Volume da sua moeda",
    colTaxas: "Taxas de negociação (40%)",
    colBonus: "Bônus em dinheiro",
    colTotal: "Total pra você",
    nota: "As taxas você saca na hora, pelo botão Sacar na página da sua moeda. O bônus é pedido no mesmo botão e pago em SOL em até 7 dias. Tudo vai direto pra carteira que criou a moeda.",
    destaque: "Nenhuma outra launchpad paga taxa de negociação e bônus em dinheiro por volume.",
    regras: "Regras",
    itens: [
      "Vale para moedas lançadas dentro da Chroma Launchpad, apenas na rede Solana.",
      "Toda negociação conta, não importa onde aconteça: Chroma, Jupiter, Phantom, Fomo ou qualquer outro app. A taxa é cobrada pela própria moeda, não pelo app.",
      "Acompanhe seu progresso ao vivo na página da sua moeda — tudo é medido direto na rede.",
    ],
    cta: "Lançar na Chroma",
  },
  zh: {
    meta: ["创作者奖金 — Chroma", "在 Chroma Launchpad 发币，代币达到交易量目标即可获得现金奖金。"],
    titulo: "创作者奖金",
    intro:
      "在 Chroma Launchpad 发币，双重收益：每笔交易 40% 的手续费，外加代币每达成一个交易量目标的现金奖金。你的社区交易越多，你赚得越多。",
    ganhosTitulo: "每个代币你能赚多少",
    paraVoce: "归你",
    volume: "交易量",
    colVolume: "你的代币交易量",
    colTaxas: "交易手续费（40%）",
    colBonus: "现金奖金",
    colTotal: "你的总收益",
    nota: "交易手续费可随时通过代币页面的「领取」按钮即时领取。奖金通过同一按钮申请，7 天内以 SOL 支付。全部直接进入创建代币的钱包。",
    destaque: "没有其他发射平台同时为交易量支付交易手续费和现金奖金。",
    regras: "规则",
    itens: [
      "仅适用于在 Chroma Launchpad 上发行的代币，且仅限 Solana 网络。",
      "每笔交易都计入，无论在哪里发生：Chroma、Jupiter、Phantom、Fomo 或任何其他应用。手续费由代币本身收取，而不是由应用收取。",
      "在你的代币页面实时查看进度——一切都在链上计算。",
    ],
    cta: "在 Chroma 发币",
  },
});

export async function generateMetadata(): Promise<Metadata> {
  const [title, description] = TEXTOS[await idiomaAtual()].meta;
  return { title, description };
}

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
const taxa = (volume: number) => volume * PARTE_DA_CHROMA;

export default async function CreatorBonus() {
  const t = TEXTOS[await idiomaAtual()];
  return (
    <div className="mx-auto max-w-3xl space-y-8 pt-6">
      <header>
        <h1 className="text-3xl font-black tracking-tight text-zinc-50">{t.titulo}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-zinc-400">{t.intro}</p>
      </header>

      {/* Os números grandes: taxa (40%) + bônus, por meta. */}
      <section>
        <h2 className="text-xl font-bold tracking-tight text-zinc-50">{t.ganhosTitulo}</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {METAS.map((m, i) => (
            <div
              key={m.volumeUsd}
              className={`rounded-2xl border p-4 text-center ${i === 1 ? "border-marca/60 bg-marca/[0.07]" : "border-ink-700 bg-ink-900"}`}
            >
              <p className="text-[12px] font-semibold text-zinc-400">
                {usd(m.volumeUsd)} {t.volume}
              </p>
              <p className="holo-texto tnum mt-2 text-[30px] font-black leading-none">{usd(taxa(m.volumeUsd) + m.bonusUsd)}</p>
              <p className="mt-2 text-[12.5px] font-bold text-zinc-200">{t.paraVoce}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Quebra de cada meta: taxa + bônus = total. */}
      <div className="overflow-hidden rounded-xl border border-marca/30">
        <div className="grid grid-cols-4 gap-2 bg-marca/[0.08] px-4 py-2.5 text-[10.5px] font-bold uppercase tracking-wider text-marca sm:px-5">
          <span>{t.colVolume}</span>
          <span className="text-right">{t.colTaxas}</span>
          <span className="text-right">{t.colBonus}</span>
          <span className="text-right">{t.colTotal}</span>
        </div>
        {METAS.map((m) => (
          <div key={m.volumeUsd} className="tnum grid grid-cols-4 gap-2 border-t border-ink-700 px-4 py-3 text-[14px] sm:px-5 sm:text-[15px]">
            <span className="text-zinc-300">{usd(m.volumeUsd)}</span>
            <span className="text-right text-zinc-200">{usd(taxa(m.volumeUsd))}</span>
            <span className="text-right text-zinc-200">+ {usd(m.bonusUsd)}</span>
            <span className="text-right font-black text-bull">{usd(taxa(m.volumeUsd) + m.bonusUsd)}</span>
          </div>
        ))}
        <p className="border-t border-ink-700 px-4 py-2.5 text-[12.5px] text-zinc-400 sm:px-5">{t.nota}</p>
      </div>

      <p className="rounded-xl border border-bull/30 bg-bull/[0.06] px-4 py-3 text-center text-[14px] font-bold text-zinc-50">
        🏆 {t.destaque}
      </p>

      <section>
        <h2 className="text-xl font-bold tracking-tight text-zinc-50">{t.regras}</h2>
        <ul className="mt-3 space-y-2">
          {t.itens.map((i) => (
            <li key={i} className="flex gap-2.5 text-[14px] leading-relaxed text-zinc-400">
              <span aria-hidden className="mt-[9px] size-1 shrink-0 rounded-full bg-marca" />
              {i}
            </li>
          ))}
        </ul>
      </section>

      <Link href="/create" className="inline-block rounded-lg bg-marca px-5 py-2.5 text-[14px] font-bold text-[#08090b] hover:bg-marca-forte">
        {t.cta} →
      </Link>
    </div>
  );
}
