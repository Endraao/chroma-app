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

export const metadata: Metadata = {
  title: "Taxas e limites — Chroma",
  description: "Todas as taxas da Chroma, rede por rede, sem nada escondido em tooltip.",
};

export default function FeesPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-10 pt-6">
      <header>
        <h1 className="text-3xl font-black tracking-tight text-zinc-50">Taxas e limites</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-zinc-400">
          Cada rede tem a sua própria tabela. Tudo o que você paga na Chroma está nesta página.
          <br />
          Nenhuma taxa aparece só na hora de confirmar a operação.
        </p>
      </header>

      {CHAIN_IDS.map((chain) => (
        <ChainFeeSection key={chain} chain={chain} />
      ))}

      {/* Regras que valem em qualquer rede */}
      <section>
        <h2 className="text-xl font-bold tracking-tight text-zinc-50">Vale em qualquer rede</h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <FeeCard
            icon="users"
            label="Divisão com quem indicou"
            value={feeLabel.affiliate}
            note="Sai da parte da plataforma, não do bolso do trader, e cai na carteira de quem indicou na mesma transação do swap. Quando não há indicação, essa parte fica com a plataforma."
            highlight
          />
          <FeeCard
            icon="percent"
            label="Taxa de criador opcional"
            value={feeLabel.creatorTaxDefault}
            note={`Zero por padrão. Quem quiser cobrar define no lançamento, até ${feeLabel.creatorTaxMax}, e não pode mudar depois.`}
          />
          <FeeCard
            icon="layers"
            label="Limite de lançamentos"
            value="nenhum"
            note="Você pode lançar quantas moedas quiser. O único custo é a taxa de lançamento, cobrada no envio."
          />
          <FeeCard
            icon="percent"
            label="Moeda lançada fora da Chroma"
            value="paga menos"
            note="Não existe taxa de criador nessas moedas, então ela não é cobrada. Você paga apenas a taxa da plataforma e a parte de quem indicou."
          />
        </div>
      </section>

      {/* O que ainda não vale */}
      <section>
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <Badge tone="warn">estado atual</Badge>
            <span className="text-[13px] font-bold text-zinc-200">O que está em vigor hoje</span>
          </div>
          <ul className="space-y-1.5 text-[12px] leading-relaxed text-zinc-500">
            <li className="flex gap-2">
              <span className="text-bull">✓</span>
              <span>
                <strong className="text-zinc-300">Taxa de swap e parte de quem indicou</strong> — em
                vigor, cobradas dentro da própria transação de swap na Solana.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-zinc-700">○</span>
              <span>
                <strong className="text-zinc-400">Taxas de criador e de lançamento</strong> — os
                valores já estão definidos, mas ainda não são cobradas.
              </span>
            </li>
          </ul>
        </Card>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ChainFeeSection({ chain }: { chain: ChainId }) {
  const meta = CHAINS[chain];
  const labels = feeLabelFor(chain);
  const config = CHAIN_FEES[chain];
  const diffBps = config.curveTotalBps - config.reference.totalBps;

  return (
    <section>
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className={cn("text-xl font-bold tracking-tight", meta.accent)}>{meta.label}</h2>
        <span className="text-[12px] text-zinc-600">
          comparação: {config.reference.name} cobra {labels.referenceTotal} no total,{" "}
          {labels.referenceCreator} para o criador
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <FeeCard
          icon="percent"
          label="Trade na curva"
          value={labels.curveTotal}
          note={
            diffBps === 0
              ? `Exatamente o que o ${config.reference.name} cobra.`
              : diffBps > 0
                ? `${formatBps(diffBps)} acima do ${config.reference.name}. Essa diferença remunera quem indicou, sem reduzir a parte do criador.`
                : `${formatBps(-diffBps)} abaixo do ${config.reference.name}.`
          }
        />
        <FeeCard
          icon="percent"
          label="Swap de token externo"
          value={labels.swap}
          note="A operação é roteada por um agregador. Como a moeda não foi lançada na Chroma, não há taxa de criador."
        />
        <FeeCard
          icon="box"
          label="Lançar"
          value={labels.launchFee > 0 ? `${labels.launchFee} ${meta.nativeSymbol}` : "grátis"}
          note={`${config.reference.name}: ${config.reference.launchFee}.`}
        />
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl border border-white/[0.06]">
        <table className="w-full text-left">
          <thead className="bg-white/[0.02] text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Faixa</th>
              <th className="px-4 py-2.5 font-semibold">Volume acumulado</th>
              <th className="px-4 py-2.5 text-right font-semibold">Criador</th>
              <th className="px-4 py-2.5 text-right font-semibold">Afiliado</th>
              <th className="px-4 py-2.5 text-right font-semibold">Plataforma</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {config.creatorTiers.map((tier, i) => {
              const d = distributeFees(chain, tier.fromVolumeUsd, true);
              const next = config.creatorTiers[i + 1];
              const beatsReference = tier.creatorBps >= config.reference.creatorBps;

              return (
                <tr key={tier.label} className="text-[12px]">
                  <td className="px-4 py-2.5 font-semibold text-zinc-300">{tier.label}</td>
                  <td className="tnum px-4 py-2.5 text-zinc-500">
                    {!next
                      ? `acima de ${formatUsd(tier.fromVolumeUsd)}`
                      : tier.fromVolumeUsd === 0
                        ? // "$0.00 – $100K" fica estranho; a primeira faixa é só um teto.
                          `até ${formatUsd(next.fromVolumeUsd)}`
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
        Você paga sempre {labels.curveTotal}; o que muda é a divisão desse valor. Em verde, as faixas
        em que o criador recebe pelo menos o mesmo que receberia no {config.reference.name} (
        {labels.referenceCreator}). O volume acumulado só aumenta, então a faixa alcançada nunca
        diminui.
      </p>

      {/*
        A tabela acima mostra o caso COM indicação. Sem ela a coluna do afiliado
        zera e a plataforma absorve a diferença — o trader paga o mesmo.
        Sem esta linha, dá pra ler a tabela achando que a plataforma sempre
        fica com a fatia menor.
      */}
      <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-600">
        A tabela mostra o caso em que a compra veio por um link de indicação.{" "}
        <strong className="text-zinc-400">Sem indicação, essa parte fica com a plataforma</strong> —
        que passa a {formatBps(distributeFees(chain, 0, false).platformBps)} na primeira faixa e{" "}
        {formatBps(
          distributeFees(chain, config.creatorTiers[config.creatorTiers.length - 1].fromVolumeUsd, false)
            .platformBps,
        )}{" "}
        no topo. Em qualquer caso você paga {labels.curveTotal}: a indicação nunca encarece a sua
        operação.
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
