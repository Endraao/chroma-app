import type { Metadata } from "next";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  CHAIN_FEES,
  distributeFees,
  feeLabel,
  feeLabelFor,
  formatBps,
  swapFeeBps,
} from "@/lib/fees";
import { CHAINS, CHAIN_IDS } from "@/lib/web3";
import { cn, formatUsd } from "@/lib/utils";
import type { ChainId } from "@/lib/types";
import { idiomaAtual } from "@/lib/idioma-servidor";
import { PARTE_DA_CHROMA_BPS } from "@/lib/pumpfun";
import { traducoes } from "@/lib/idiomas";

const METADADOS = {
  "en": [
    "Fees and limits — Chroma",
    "Every Chroma fee, network by network, nothing hidden in a tooltip."
  ],
  "pt": [
    "Taxas e limites — Chroma",
    "Todas as taxas da Chroma, rede por rede, sem nada escondido em tooltip."
  ],
  "zh": [
    "费用与限制 — Chroma",
    "Chroma 的所有费用，按网络列出，没有隐藏在提示框里的内容。"
  ]
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const [title, description] = METADADOS[await idiomaAtual()];
  return { title, description };
}

const TEXTOS = traducoes({
  en: {
    faixas: ["Launch", "Gaining traction", "Established", "Top"],
    solLancarNota: "Coins are created on pump.fun and trade there and here. pump.fun itself charges nothing to create.",
    solTrade: "Trade through Chroma", solTradeNota: "Charged on buys and sells made through Chroma, on any Solana coin — including the ones launched here.",
    solDivisao: "pump.fun creator fee",
    solDivisaoNota: (c: number, p: number) => `The creator fee pump.fun charges on every trade is split: ${c}% to the creator, ${p}% to Chroma. The creator manages this split on pump.fun.`,
    titulo: "Fees and limits", intro1: "Each network has its own table. Everything you pay on Chroma is on this page.", intro2: "No fee shows up only when you confirm a trade.",
    qualquerRede: "On every network",
    divisao: "Referrer's share", divisaoNota: "Comes out of the platform's cut, not the trader's pocket, and lands in the referrer's wallet in the same swap transaction. Without a referral, this share stays with the platform.",
    limite: "Launch limit", nenhum: "none", limiteNota: "You can launch as many coins as you want. The only cost is the launch fee, charged when you submit.",
    fora: "Coin launched outside Chroma", pagaMenos: "costs less", foraNota: "There is no creator fee on these coins, so it is not charged. You pay only the platform fee and the referrer's share.",
    estado: "current status", emVigor: "What is live today",
    vigorRobinhood: "all fees on this page are live, charged by the contract itself inside each transaction: trading, creator share, referrer share and launch fee.",
    vigorSolana: "launch fee, swap fee, referrer share and the pump.fun creator-fee split are live.",
    comparacao: (n: string, total: string, criador: string) => `comparison: ${n} charges ${total} in total, ${criador} to the creator`,
    tradeCurva: "Trade on the curve",
    igual: (n: string) => `Exactly what ${n} charges.`,
    acima: (d: string, n: string) => `${d} above ${n}. The difference pays the referrer, without reducing the creator's share.`,
    abaixo: (d: string, n: string) => `${d} below ${n}.`,
    externo: "External token swap", externoNota: "The trade is routed through an aggregator. Since the coin was not launched on Chroma, there is no creator fee.",
    lancar: "Launch", gratis: "free",
    faixa: "Tier", volume: "Total volume", criador: "Creator", afiliado: "Referrer", plataforma: "Platform",
    acimaDe: (v: string) => `above ${v}`, ate: (v: string) => `up to ${v}`,
    vocePaga: (total: string, n: string, c: string) => `You always pay ${total}; what changes is how it is split. In green, the tiers where the creator gets at least what they would get on ${n} (${c}). Total volume only goes up, so a tier once reached never drops.`,
    semIndicacaoForte: "Without a referral, that share stays with the platform",
    semIndicacao: (b: React.ReactNode, p1: string, p2: string, total: string) => <>The table shows the case where the buy came through a referral link. {b} — which becomes {p1} in the first tier and {p2} at the top. Either way you pay {total}: a referral never makes your trade more expensive.</>,
  },
  pt: {
    faixas: ["Lançamento", "Pegando tração", "Consolidada", "Topo"],
    solLancarNota: "A moeda é criada na pump.fun e negocia lá e aqui. A própria pump.fun não cobra nada para criar.",
    solTrade: "Operar pela Chroma", solTradeNota: "Cobrada nas compras e vendas feitas pela Chroma, em qualquer moeda da Solana — inclusive as lançadas aqui.",
    solDivisao: "Taxa de criador da pump.fun",
    solDivisaoNota: (c: number, p: number) => `A taxa de criador que a pump.fun cobra em cada operação é dividida: ${c}% para o criador, ${p}% para a Chroma. Quem administra essa divisão na pump.fun é o criador.`,
    titulo: "Taxas e limites", intro1: "Cada rede tem a sua própria tabela. Tudo o que você paga na Chroma está nesta página.", intro2: "Nenhuma taxa aparece só na hora de confirmar a operação.",
    qualquerRede: "Vale em qualquer rede",
    divisao: "Divisão com quem indicou", divisaoNota: "Sai da parte da plataforma, não do bolso do trader, e cai na carteira de quem indicou na mesma transação do swap. Quando não há indicação, essa parte fica com a plataforma.",
    limite: "Limite de lançamentos", nenhum: "nenhum", limiteNota: "Você pode lançar quantas moedas quiser. O único custo é a taxa de lançamento, cobrada no envio.",
    fora: "Moeda lançada fora da Chroma", pagaMenos: "paga menos", foraNota: "Não existe taxa de criador nessas moedas, então ela não é cobrada. Você paga apenas a taxa da plataforma e a parte de quem indicou.",
    estado: "estado atual", emVigor: "O que está em vigor hoje",
    vigorRobinhood: "todas as taxas desta página estão em vigor, cobradas pelo próprio contrato dentro de cada transação: negociação, parte do criador, parte de quem indicou e taxa de lançamento.",
    vigorSolana: "taxa de lançamento, taxa de swap, parte de quem indicou e divisão da taxa de criador da pump.fun em vigor.",
    comparacao: (n: string, total: string, criador: string) => `comparação: ${n} cobra ${total} no total, ${criador} para o criador`,
    tradeCurva: "Trade na curva",
    igual: (n: string) => `Exatamente o que o ${n} cobra.`,
    acima: (d: string, n: string) => `${d} acima do ${n}. Essa diferença remunera quem indicou, sem reduzir a parte do criador.`,
    abaixo: (d: string, n: string) => `${d} abaixo do ${n}.`,
    externo: "Swap de token externo", externoNota: "A operação é roteada por um agregador. Como a moeda não foi lançada na Chroma, não há taxa de criador.",
    lancar: "Lançar", gratis: "grátis",
    faixa: "Faixa", volume: "Volume acumulado", criador: "Criador", afiliado: "Afiliado", plataforma: "Plataforma",
    acimaDe: (v: string) => `acima de ${v}`, ate: (v: string) => `até ${v}`,
    vocePaga: (total: string, n: string, c: string) => `Você paga sempre ${total}; o que muda é a divisão desse valor. Em verde, as faixas em que o criador recebe pelo menos o mesmo que receberia no ${n} (${c}). O volume acumulado só aumenta, então a faixa alcançada nunca diminui.`,
    semIndicacaoForte: "Sem indicação, essa parte fica com a plataforma",
    semIndicacao: (b: React.ReactNode, p1: string, p2: string, total: string) => <>A tabela mostra o caso em que a compra veio por um link de indicação. {b} — que passa a {p1} na primeira faixa e {p2} no topo. Em qualquer caso você paga {total}: a indicação nunca encarece a sua operação.</>,
  },
  zh: {
    faixas: ["发行期", "起势期", "成熟期", "顶级"],
    solLancarNota: "代币在 pump.fun 上创建，可在那里和这里交易。pump.fun 本身创建免费。",
    solTrade: "通过 Chroma 交易", solTradeNota: "对通过 Chroma 进行的买卖收取，适用于任何 Solana 代币 —— 包括在这里发行的代币。",
    solDivisao: "pump.fun 创作者费用",
    solDivisaoNota: (c: number, p: number) => `pump.fun 每笔交易收取的创作者费用会被分成：${c}% 归创作者，${p}% 归 Chroma。该分成由创作者在 pump.fun 上管理。`,
    titulo: "费用与限制", intro1: "每条链都有自己的费率表。你在 Chroma 上支付的所有费用都在此页面。", intro2: "不会有任何费用只在确认交易时才出现。",
    qualquerRede: "所有网络通用",
    divisao: "推荐人分成", divisaoNota: "来自平台的份额，而不是交易者的口袋，并在同一笔兑换交易中进入推荐人的钱包。没有推荐时，这部分归平台所有。",
    limite: "发行数量限制", nenhum: "无", limiteNota: "你可以发行任意数量的代币。唯一的成本是提交时收取的发行费。",
    fora: "在 Chroma 以外发行的代币", pagaMenos: "费用更低", foraNota: "这些代币没有创作者费用，因此不收取。你只需支付平台费和推荐人分成。",
    estado: "当前状态", emVigor: "目前已生效",
    vigorRobinhood: "本页所有费用均已生效，由合约在每笔交易中直接收取：交易费、创作者分成、推荐人分成和发行费。",
    vigorSolana: "发行费、兑换费、推荐人分成以及 pump.fun 创作者费用分成均已生效。",
    comparacao: (n: string, total: string, criador: string) => `对比：${n} 总共收取 ${total}，其中 ${criador} 给创作者`,
    tradeCurva: "曲线交易",
    igual: (n: string) => `与 ${n} 收费完全相同。`,
    acima: (d: string, n: string) => `比 ${n} 高 ${d}。差额用于支付推荐人，不会减少创作者的分成。`,
    abaixo: (d: string, n: string) => `比 ${n} 低 ${d}。`,
    externo: "外部代币兑换", externoNota: "交易通过聚合器路由。由于该代币不是在 Chroma 发行的，没有创作者费用。",
    lancar: "发行", gratis: "免费",
    faixa: "档位", volume: "累计交易量", criador: "创作者", afiliado: "推荐人", plataforma: "平台",
    acimaDe: (v: string) => `${v} 以上`, ate: (v: string) => `最高 ${v}`,
    vocePaga: (total: string, n: string, c: string) => `你始终支付 ${total}，变化的只是分配方式。绿色表示创作者获得不少于在 ${n} 上所得（${c}）的档位。累计交易量只增不减，因此已达到的档位不会下降。`,
    semIndicacaoForte: "没有推荐时，这部分归平台所有",
    semIndicacao: (b: React.ReactNode, p1: string, p2: string, total: string) => <>此表显示通过推荐链接买入的情况。{b} —— 第一档为 {p1}，最高档为 {p2}。无论如何你都支付 {total}：推荐永远不会让你的交易更贵。</>,
  },
});

type T = (typeof TEXTOS)["en"];

export default async function FeesPage() {
  const t = TEXTOS[await idiomaAtual()];
  return (
    <div className="mx-auto max-w-4xl space-y-10 pt-6">
      <header>
        <h1 className="text-3xl font-black tracking-tight text-zinc-50">{t.titulo}</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-zinc-400">
          {t.intro1}
          <br />
          {t.intro2}
        </p>
      </header>

      {CHAIN_IDS.map((chain) => (
        <ChainFeeSection key={chain} chain={chain} t={t} />
      ))}

      {/* Regras que valem em qualquer rede */}
      <section>
        <h2 className="text-xl font-bold tracking-tight text-zinc-50">{t.qualquerRede}</h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <FeeCard
            icon="users"
            label={t.divisao}
            value={feeLabel.affiliate}
            note={t.divisaoNota}
            highlight
          />
          <FeeCard
            icon="layers"
            label={t.limite}
            value={t.nenhum}
            note={t.limiteNota}
          />
          <FeeCard
            icon="percent"
            label={t.fora}
            value={t.pagaMenos}
            note={t.foraNota}
          />
        </div>
      </section>

      {/* O que ainda não vale */}
      <section>
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <Badge tone="warn">{t.estado}</Badge>
            <span className="text-[13px] font-bold text-zinc-200">{t.emVigor}</span>
          </div>
          <ul className="space-y-1.5 text-[12px] leading-relaxed text-zinc-500">
            <li className="flex gap-2">
              <span className="text-bull">✓</span>
              <span>
                <strong className="text-zinc-300">{CHAINS.robinhood.label}</strong> — {t.vigorRobinhood}
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-bull">✓</span>
              <span>
                <strong className="text-zinc-300">{CHAINS.solana.label}</strong> — {t.vigorSolana}
              </span>
            </li>
          </ul>
        </Card>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ChainFeeSection({ chain, t }: { chain: ChainId; t: T }) {
  const meta = CHAINS[chain];
  const labels = feeLabelFor(chain);
  const config = CHAIN_FEES[chain];
  const diffBps = config.curveTotalBps - config.reference.totalBps;

  // Na Solana a moeda nasce na pump.fun: não há curva da Chroma nem faixas.
  if (chain === "solana") {
    return (
      <section>
        <h2 className={cn("text-xl font-bold tracking-tight", meta.accent)}>{meta.label}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <FeeCard
            icon="box"
            label={t.lancar}
            value={labels.launchFee > 0 ? `${labels.launchFee} ${meta.nativeSymbol}` : t.gratis}
            note={t.solLancarNota}
          />
          <FeeCard icon="percent" label={t.solTrade} value={labels.swap} note={t.solTradeNota} />
          <FeeCard
            icon="users"
            label={t.solDivisao}
            value={`${100 - PARTE_DA_CHROMA_BPS / 100}% / ${PARTE_DA_CHROMA_BPS / 100}%`}
            note={t.solDivisaoNota(100 - PARTE_DA_CHROMA_BPS / 100, PARTE_DA_CHROMA_BPS / 100)}
          />
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className={cn("text-xl font-bold tracking-tight", meta.accent)}>{meta.label}</h2>
        <span className="text-[12px] text-zinc-600">
          {t.comparacao(config.reference.name, labels.referenceTotal, labels.referenceCreator)}
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <FeeCard
          icon="percent"
          label={t.tradeCurva}
          value={labels.curveTotal}
          note={
            diffBps === 0
              ? t.igual(config.reference.name)
              : diffBps > 0
                ? t.acima(formatBps(diffBps), config.reference.name)
                : t.abaixo(formatBps(-diffBps), config.reference.name)
          }
        />
        <FeeCard
          icon="percent"
          label={t.externo}
          value={labels.swap}
          note={t.externoNota}
        />
        <FeeCard
          icon="box"
          label={t.lancar}
          value={labels.launchFee > 0 ? `${labels.launchFee} ${meta.nativeSymbol}` : t.gratis}
          note={`${config.reference.name}: ${config.reference.launchFee === "grátis" ? t.gratis : config.reference.launchFee.replace(",", ".")}.`}
        />
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl border border-white/[0.06]">
        <table className="w-full text-left">
          <thead className="bg-white/[0.02] text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-2.5 font-semibold">{t.faixa}</th>
              <th className="px-4 py-2.5 font-semibold">{t.volume}</th>
              <th className="px-4 py-2.5 text-right font-semibold">{t.criador}</th>
              <th className="px-4 py-2.5 text-right font-semibold">{t.afiliado}</th>
              <th className="px-4 py-2.5 text-right font-semibold">{t.plataforma}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {config.creatorTiers.map((tier, i) => {
              const d = distributeFees(chain, tier.fromVolumeUsd, true);
              const next = config.creatorTiers[i + 1];
              const beatsReference = tier.creatorBps >= config.reference.creatorBps;

              return (
                <tr key={tier.label} className="text-[12px]">
                  <td className="px-4 py-2.5 font-semibold text-zinc-300">{t.faixas[i] ?? tier.label}</td>
                  <td className="tnum px-4 py-2.5 text-zinc-500">
                    {!next
                      ? t.acimaDe(formatUsd(tier.fromVolumeUsd))
                      : tier.fromVolumeUsd === 0
                        ? // "$0.00 – $100K" fica estranho; a primeira faixa é só um teto.
                          t.ate(formatUsd(next.fromVolumeUsd))
                        : `${formatUsd(tier.fromVolumeUsd)} – ${formatUsd(next.fromVolumeUsd)}`}
                  </td>
                  <td
                    className={cn(
                      "tnum px-4 py-2.5 text-right font-bold",
                      beatsReference ? "text-bull" : "text-zinc-300",
                    )}
                  >
                    {formatBps(d.creatorBps)}
                  </td>
                  <td className="tnum px-4 py-2.5 text-right text-marca">
                    {formatBps(d.affiliateBps)}
                  </td>
                  <td className="tnum px-4 py-2.5 text-right text-zinc-400">
                    {formatBps(d.platformBps)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">
        {t.vocePaga(labels.curveTotal, config.reference.name, labels.referenceCreator)}
      </p>

      {/*
        A tabela acima mostra o caso COM indicação. Sem ela a coluna do afiliado
        zera e a plataforma absorve a diferença — o trader paga o mesmo.
        Sem esta linha, dá pra ler a tabela achando que a plataforma sempre
        fica com a fatia menor.
      */}
      <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-600">
        {t.semIndicacao(
          <strong className="text-zinc-400">{t.semIndicacaoForte}</strong>,
          formatBps(distributeFees(chain, 0, false).platformBps),
          formatBps(
            distributeFees(chain, config.creatorTiers[config.creatorTiers.length - 1].fromVolumeUsd, false)
              .platformBps,
          ),
          labels.curveTotal,
        )}
      </p>
    </section>
  );
}

function FeeCard({
  icon,
  label,
  value,
  note,
  highlight,
}: {
  icon: "percent" | "box" | "layers" | "users";
  label: string;
  value: string;
  note: string;
  highlight?: boolean;
}) {
  return (
    <Card interactive className={cn("p-4", highlight && "border-marca/30 bg-marca/[0.04]")}>
      <div className="flex items-center gap-2">
        <Icon name={icon} />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          {label}
        </span>
      </div>
      <div
        className={cn(
          "tnum mt-2 text-2xl font-black tracking-tight",
          highlight ? "text-chroma" : "text-zinc-50",
        )}
      >
        {value}
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-zinc-500">{note}</p>
    </Card>
  );
}

function Icon({ name }: { name: "percent" | "box" | "layers" | "users" }) {
  const common = {
    className: "size-4 text-zinc-500",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
  };

  if (name === "box") {
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <path d="M3 7h18l-1.5 12a2 2 0 0 1-2 1.8H6.5a2 2 0 0 1-2-1.8z" />
        <path d="M8 7a4 4 0 0 1 8 0" />
      </svg>
    );
  }
  if (name === "layers") {
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <path d="m12 3 9 5-9 5-9-5z" />
        <path d="m3 14 9 5 9-5" />
      </svg>
    );
  }
  if (name === "users") {
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
        <path d="M16.5 5.2a3.2 3.2 0 0 1 0 5.6M18 20a6.4 6.4 0 0 0-1.6-4.2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" {...common}>
      <circle cx="7.5" cy="7.5" r="2.5" />
      <circle cx="16.5" cy="16.5" r="2.5" />
      <path d="m19 5-14 14" />
    </svg>
  );
}
