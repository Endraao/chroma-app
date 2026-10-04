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
      "Launch coins with Chroma Launchpad and, on top of 40% of every trade fee, earn a cash bonus when your coin hits volume goals. The more your community trades, the more you earn.",
    ganhosTitulo: "What you earn per coin",
    paraVoce: "to you",
    volume: "volume",
    colVolume: "Your coin's volume",
    colTaxas: "Trading fees (40%)",
    colBonus: "Cash bonus",
    colTotal: "Total to you",
    nota: "Everything is claimed with the Claim button on your coin's page, straight to the wallet that created the coin.",
    destaque: "No other launchpad pays you trading fees plus a cash bonus for volume.",
    regras: "Rules",
    itens: [
      "Only coins launched on Chroma Launchpad, on Solana, qualify.",
      "Volume counts on every app — Jupiter, Phantom, Chroma or any other — because the fee is charged by the curve itself.",
      "Progress is measured on-chain, and you can follow it live on your coin's page.",
      "Trading fees arrive instantly; the bonus is paid in SOL to the creator's wallet within 7 days of the claim.",
    ],
    cta: "Launch on Chroma",
  },
  pt: {
    meta: ["Bônus do criador — Chroma", "Lance na Chroma Launchpad e ganhe um bônus em dinheiro quando sua moeda bater metas de volume."],
    titulo: "Bônus do criador",
    intro:
      "Lance moedas utilizando a Chroma Launchpad e, além de 40% da taxa de toda negociação, ganhe um bônus em dinheiro quando sua moeda bater metas de volume. Quanto mais sua comunidade negocia, mais você ganha.",
    ganhosTitulo: "Quanto você ganha por moeda",
    paraVoce: "pra você",
    volume: "de volume",
    colVolume: "Volume da sua moeda",
    colTaxas: "Taxas de negociação (40%)",
    colBonus: "Bônus em dinheiro",
    colTotal: "Total pra você",
    nota: "Tudo sacado pelo botão Sacar na página da sua moeda, direto pra carteira que criou o token.",
    destaque: "Nenhuma outra launchpad paga taxa de negociação + bônus em dinheiro por volume.",
    regras: "Regras",
    itens: [
      "Só valem moedas lançadas dentro da Chroma Launchpad, na rede Solana.",
      "O volume conta em qualquer app — Jupiter, Phantom, Chroma ou outro — porque a taxa é cobrada pela própria curva.",
      "O progresso é medido na rede, e dá pra acompanhar ao vivo na página da sua moeda.",
      "As taxas caem na hora; o bônus é pago em SOL na carteira do criador em até 7 dias depois do saque.",
    ],
    cta: "Lançar na Chroma",
  },
  zh: {
    meta: ["创作者奖金 — Chroma", "在 Chroma Launchpad 发币，代币达到交易量目标即可获得现金奖金。"],
    titulo: "创作者奖金",
    intro:
      "使用 Chroma Launchpad 发币，除了每笔交易 40% 的交易费外，代币达到交易量目标时还可获得现金奖金。你的社区交易越多，你赚得越多。",
    ganhosTitulo: "每个代币你能赚多少",
    paraVoce: "归你",
    volume: "交易量",
    colVolume: "你的代币交易量",
    colTaxas: "交易手续费（40%）",
    colBonus: "现金奖金",
    colTotal: "你的总收益",
    nota: "全部通过代币页面的「领取」按钮，直接领取到创建代币的钱包。",
    destaque: "没有其他发射平台同时支付交易手续费 + 交易量现金奖金。",
    regras: "规则",
    itens: [
      "仅限在 Chroma Launchpad 上（Solana 网络）发行的代币。",
      "在任何应用中的交易量都计入——Jupiter、Phantom、Chroma 或其他——因为费用由曲线本身收取。",
      "进度在链上计算，可在你的代币页面实时查看。",
      "交易手续费即时到账；奖金在领取后 7 天内以 SOL 支付到创作者钱包。",
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
