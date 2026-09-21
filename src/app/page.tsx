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
  /** Promise desde o Next 16. */
  searchParams: Promise<{ sort?: string; chain?: string }>;
}) {
  const filtros = await searchParams;
  const sort = (filtros.sort as SortKey) || "new";

  /*
   * Rede vinda da URL, e não do estado da carteira: assim o link que a pessoa
   * compartilha abre a mesma lista pra quem receber. A carteira conectada só
   * decide qual aba vem MARCADA — ver ChainTabs.
   */
  const chain = CHAIN_IDS.includes(filtros.chain as ChainId)
    ? (filtros.chain as ChainId)
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
    <div className="space-y-4">
      {/*
        ---------------------------------------------------------------------
        A FAIXA DE ABERTURA, NO LUGAR DO TÍTULO GIGANTE
        ---------------------------------------------------------------------
        O que estava aqui era um título de três linhas com uma palavra em
        gradiente, dois botões grandes e muito respiro — e a lista de moedas só
        começava depois de tudo isso.

        Numa launchpad, a lista É o produto. Quem chega quer ver o que está
        subindo agora, não ler a proposta. Então a abertura virou uma faixa
        baixa: o que a plataforma é, os números ao vivo e as duas ações, tudo
        numa linha só, e a lista logo abaixo.
      */}
      <section className="flex flex-col gap-3 border-b border-ink-700 pb-4 pt-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rotulo">Solana · Robinhood Chain</span>
            <span className="h-px w-8 bg-chroma-gradient" />
          </div>

          {/*
            Uma linha, peso alto, sem gradiente. O que vende aqui é a taxa que
            vai pro afiliado — e ela cabe na mesma frase.
          */}
          <h1 className="mt-1.5 text-[22px] font-bold leading-tight tracking-tight text-zinc-50 sm:text-[26px]">
            Lance, negocie e ganhe indicando.
          </h1>

          <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
            Terminal não-custodial, gráfico ao vivo e auditoria na mesma tela.{" "}
            <strong className="font-semibold text-marca">
              {feeLabel.affiliate} de cada swap
            </strong>{" "}
            vai direto pra carteira de quem indicou, na mesma transação.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Numero rotulo="Tokens" valor={String(tokens.length)} />
          <Numero rotulo="Volume 24h" valor={formatUsd(totalVolume)} />
          <Numero rotulo="Taxa" valor={feeLabelFor("solana").swap} />

          <Link href="/create">
            <Button variant="chroma" size="md">
              Criar token
            </Button>
          </Link>
          <Link href="/affiliate">
            <Button variant="outline" size="md">
              Link de afiliado
            </Button>
          </Link>
        </div>
      </section>

      {isDemo && (
        <div className="rounded border border-warn/30 bg-warn/[0.06] px-3 py-2 text-[12px] text-warn">
          A Dexscreener não respondeu agora — a lista abaixo é de demonstração. Recarregue em alguns segundos.
        </div>
      )}

      {/* Filtros */}
      <section>
        <ChainTabs ativa={chain} sort={sort} />

        <div className="mb-3 flex flex-wrap items-center gap-1">
          {SORTS.map((s) => (
            <Link key={s.key} href={linkCom({ sort: s.key })}>
              <span
                className={
                  /*
                   * Aba sublinhada, não pílula colorida. A pílula preenchida
                   * competia com os cartões logo abaixo; o sublinhado marca a
                   * escolha sem virar mais um bloco de cor na tela.
                   */
                  sort === s.key
                    ? "inline-flex border-b-2 border-marca px-2.5 pb-1.5 pt-1 text-[13px] font-semibold text-zinc-100"
                    : "inline-flex border-b-2 border-transparent px-2.5 pb-1.5 pt-1 text-[13px] font-medium text-zinc-500 transition-colors hover:text-zinc-200"
                }
              >
                {s.label}
              </span>
            </Link>
          ))}
        </div>

        {/* Denso como o pump.fun: a arte é o que faz a pessoa clicar. */}
        {tokens.length === 0 ? (
          <div className="rounded-lg border border-ink-700 bg-ink-900 px-6 py-12 text-center">
            <p className="text-[14px] font-semibold text-zinc-300">
              Nenhuma moeda nessa rede agora.
            </p>
            <p className="mt-1 text-[12px] text-zinc-600">
              A lista vem do mercado ao vivo e muda o tempo todo.{" "}
              <Link href={linkCom({ chain: null })} className="text-marca hover:underline">
                Ver as duas redes
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {tokens.map((token) => (
              <TokenCard key={token.address} token={token} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** Um número da faixa de abertura: rótulo minúsculo em cima, valor em mono. */
function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded border border-ink-700 bg-ink-900 px-2.5 py-1.5">
      <div className="rotulo">{rotulo}</div>
      <div className="tnum text-[13px] font-bold text-zinc-100">{valor}</div>
    </div>
  );
}
