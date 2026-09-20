import Link from "next/link";

import { TokenCard } from "@/components/ui/TokenCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ChainTabs } from "@/components/ui/ChainTabs";
import { listTokens, type SortKey } from "@/lib/tokens";
import { CHAIN_IDS } from "@/lib/web3";
import type { ChainId } from "@/lib/types";
import { feeLabel, feeLabelFor } from "@/lib/fees";
import { formatUsd } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "new", label: "Recentes" },
  { key: "gainers", label: "Maiores altas" },
  { key: "volume", label: "Volume 24h" },
  { key: "marketCap", label: "Market cap" },
];

export default async function HomePage({
  searchParams,
}: {
  searchParams: { sort?: string; chain?: string };
}) {
  const sort = (searchParams.sort as SortKey) || "new";

  /*
   * Rede vinda da URL, e não do estado da carteira: assim o link que a pessoa
   * compartilha abre a mesma lista pra quem receber. A carteira conectada só
   * decide qual aba vem MARCADA — ver ChainTabs.
   */
  const chain = CHAIN_IDS.includes(searchParams.chain as ChainId)
    ? (searchParams.chain as ChainId)
    : null;

  const { tokens, isDemo } = await listTokens(sort, chain);
  const totalVolume = tokens.reduce((acc, t) => acc + t.volume24hUsd, 0);

  /** Preserva a rede ao trocar de ordenação, e vice-versa. */
  const linkCom = (params: { sort?: SortKey; chain?: ChainId | null }) => {
    const proximoSort = params.sort ?? sort;
    const proximaChain = params.chain === undefined ? chain : params.chain;
    const q = new URLSearchParams();
    if (proximoSort !== "new") q.set("sort", proximoSort);
    if (proximaChain) q.set("chain", proximaChain);
    const s = q.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="flex flex-col items-start gap-6 pt-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <Badge tone="chroma" className="mb-4">
            Solana · Robinhood Chain
          </Badge>
          <h1 className="text-4xl font-black leading-[1.05] tracking-tight text-zinc-50 sm:text-5xl">
            Lance, negocie e <span className="text-chroma">ganhe indicando</span>.
          </h1>
          {/*
            zinc-300, não zinc-400: é aqui que a proposta e a taxa de
            indicação são lidas. Texto que o visitante precisa ler não pode
            ficar no mesmo cinza de uma legenda secundária.
          */}
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-zinc-300">
            Terminal não-custodial com gráfico ao vivo, auditoria de contrato na mesma tela e{" "}
            <strong className="font-semibold text-zinc-200">{feeLabel.affiliate} de cada swap</strong> indo direto
            pra carteira de quem indicou — na mesma transação, sem saque, sem espera.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/create">
              <Button variant="chroma" size="lg">
                Criar meu token
              </Button>
            </Link>
            <Link href="/affiliate">
              <Button variant="outline" size="lg">
                Pegar link de afiliado
              </Button>
            </Link>
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-3 text-center">
          <HeroStat label="Tokens" value={String(tokens.length)} />
          <HeroStat label="Volume 24h" value={formatUsd(totalVolume)} />
          <HeroStat label="Taxa" value={feeLabelFor("solana").swap} />
        </dl>
      </section>

      {isDemo && (
        <div className="rounded-xl border border-warn/25 bg-warn/[0.06] px-4 py-2.5 text-[12px] text-warn">
          A Dexscreener não respondeu agora — a lista abaixo é de demonstração. Recarregue em alguns segundos.
        </div>
      )}

      {/* Filtros */}
      <section>
        <ChainTabs ativa={chain} sort={sort} />

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {SORTS.map((s) => (
            <Link key={s.key} href={linkCom({ sort: s.key })}>
              <span
                className={
                  sort === s.key
                    ? "inline-flex rounded-lg bg-chroma-violet/20 px-3 py-1.5 text-[13px] font-semibold text-chroma-violet"
                    : "inline-flex rounded-lg px-3 py-1.5 text-[13px] font-medium text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
                }
              >
                {s.label}
              </span>
            </Link>
          ))}
        </div>

        {/* Denso como o pump.fun: a arte é o que faz a pessoa clicar. */}
        {tokens.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-12 text-center">
            <p className="text-[14px] font-semibold text-zinc-300">
              Nenhuma moeda nessa rede agora.
            </p>
            <p className="mt-1 text-[12px] text-zinc-600">
              A lista vem do mercado ao vivo e muda o tempo todo.{" "}
              <Link href={linkCom({ chain: null })} className="text-chroma-violet hover:text-chroma-cyan">
                Ver as duas redes
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {tokens.map((token) => (
              <TokenCard key={token.address} token={token} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass min-w-[110px] px-4 py-3 ring-1 ring-inset ring-chroma-violet/[0.12]">
      <dt className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</dt>
      <dd className="tnum mt-1 text-lg font-bold text-zinc-100">{value}</dd>
    </div>
  );
}
