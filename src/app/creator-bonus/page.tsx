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
    meta: ["Creator bonus — Chroma", "Launch on the Chroma Curve and earn a cash bonus when your coin hits volume goals."],
    titulo: "Creator bonus",
    intro:
      "Launch on the Chroma Curve and, on top of 40% of every trade fee, earn a bonus when your coin hits volume goals. The bonus is paid from the fees Chroma earned on your coin — so it grows with your community, not with our marketing budget.",
    ganhosTitulo: "What you earn per coin",
    ganhosNota: "40% of every trade fee + the cash bonus. Trading fees are yours to claim anytime, on-chain.",
    paraVoce: "to you",
    volume: "volume",
    tabelaVolume: "Your coin's volume",
    tabelaBonus: "Your bonus (total)",
    regras: "Rules",
    itens: [
      "Only coins launched on the Chroma Curve (Solana) qualify.",
      "Volume counts on every app — Jupiter, Phantom, Chroma or any other — because the fee is charged by the curve itself.",
      "Progress is measured on-chain from the fees Chroma earned on your coin; you can follow it live on your coin's page.",
      "The bonus is the total for each goal: reaching $100K pays $200 in total (including the $50 of the first goal).",
      "Paid in SOL to the creator's wallet within 7 days of reaching a goal.",
      "Wash trading doesn't pay: each trade costs 1% and returns only 0.4% to the creator.",
      "Chroma may update or end the program for new goals at any time; goals already reached are always paid.",
    ],
    cta: "Launch on the Chroma Curve",
  },
  pt: {
    meta: ["Bônus do criador — Chroma", "Lance na Curva da Chroma e ganhe um bônus em dinheiro quando sua moeda bater metas de volume."],
    titulo: "Bônus do criador",
    intro:
      "Lance na Curva da Chroma e, além de 40% da taxa de toda negociação, ganhe um bônus quando sua moeda bater metas de volume. O bônus sai das taxas que a Chroma ganhou com a sua moeda — então ele cresce com a sua comunidade, não com o nosso orçamento de marketing.",
    ganhosTitulo: "Quanto você ganha por moeda",
    ganhosNota: "40% da taxa de toda negociação + o bônus em dinheiro. As taxas são suas pra sacar quando quiser, na rede.",
    paraVoce: "pra você",
    volume: "de volume",
    tabelaVolume: "Volume da sua moeda",
    tabelaBonus: "Seu bônus (total)",
    regras: "Regras",
    itens: [
      "Só valem moedas lançadas na Curva da Chroma (Solana).",
      "O volume conta em qualquer app — Jupiter, Phantom, Chroma ou outro — porque a taxa é cobrada pela própria curva.",
      "O progresso é medido na rede, pelas taxas que a Chroma ganhou com a sua moeda; dá pra acompanhar ao vivo na página dela.",
      "O bônus é o total de cada meta: chegar a $100 mil paga $200 no total (incluindo os $50 da primeira meta).",
      "Pago em SOL na carteira do criador em até 7 dias depois de bater a meta.",
      "Volume falso não compensa: cada negociação custa 1% e devolve só 0,4% ao criador.",
      "A Chroma pode atualizar ou encerrar o programa para metas novas a qualquer momento; metas já batidas são sempre pagas.",
    ],
    cta: "Lançar na Curva da Chroma",
  },
  zh: {
    meta: ["创作者奖金 — Chroma", "在 Chroma 曲线上发币，代币达到交易量目标即可获得现金奖金。"],
    titulo: "创作者奖金",
    intro:
      "在 Chroma 曲线上发币，除了每笔交易 40% 的交易费外，代币达到交易量目标时还可获得奖金。奖金来自 Chroma 从你的代币获得的费用——因此它随你的社区增长，而不是靠我们的营销预算。",
    ganhosTitulo: "每个代币你能赚多少",
    ganhosNota: "每笔交易 40% 的交易费 + 现金奖金。交易费随时可在链上领取。",
    paraVoce: "归你",
    volume: "交易量",
    tabelaVolume: "你的代币交易量",
    tabelaBonus: "你的奖金（累计）",
    regras: "规则",
    itens: [
      "仅限在 Chroma 曲线（Solana）上发行的代币。",
      "在任何应用中的交易量都计入——Jupiter、Phantom、Chroma 或其他——因为费用由曲线本身收取。",
      "进度根据 Chroma 从你的代币获得的费用在链上计算；可在代币页面实时查看。",
      "奖金为每个目标的累计总额：达到 10 万美元共支付 200 美元（包括第一个目标的 50 美元）。",
      "达成目标后 7 天内以 SOL 支付到创作者钱包。",
      "刷量无利可图：每笔交易花费 1%，只返还 0.4% 给创作者。",
      "Chroma 可随时更新或结束新目标的计划；已达成的目标始终会支付。",
    ],
    cta: "在 Chroma 曲线上发币",
  },
});

export async function generateMetadata(): Promise<Metadata> {
  const [title, description] = TEXTOS[await idiomaAtual()].meta;
  return { title, description };
}

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

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
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {METAS.map((m, i) => (
            <div
              key={m.volumeUsd}
              className={`rounded-2xl border p-5 text-center ${i === 1 ? "border-marca/60 bg-marca/[0.07]" : "border-ink-700 bg-ink-900"}`}
            >
              <p className="text-[13px] font-semibold text-zinc-400">
                {usd(m.volumeUsd)} {t.volume}
              </p>
              <p className="holo-texto tnum mt-2 text-[40px] font-black leading-none">{usd(m.volumeUsd * PARTE_DA_CHROMA + m.bonusUsd)}</p>
              <p className="mt-2 text-[13px] font-bold text-zinc-200">{t.paraVoce}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12.5px] text-zinc-500">{t.ganhosNota}</p>
      </section>

      <div className="overflow-hidden rounded-xl border border-marca/30">
        <div className="grid grid-cols-2 bg-marca/[0.08] px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-marca">
          <span>{t.tabelaVolume}</span>
          <span className="text-right">{t.tabelaBonus}</span>
        </div>
        {METAS.map((m) => (
          <div key={m.volumeUsd} className="tnum grid grid-cols-2 border-t border-ink-700 px-5 py-3 text-[15px]">
            <span className="text-zinc-300">{usd(m.volumeUsd)}</span>
            <span className="text-right font-bold text-zinc-50">{usd(m.bonusUsd)}</span>
          </div>
        ))}
      </div>

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
