"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAccount } from "wagmi";

import { chainIcon } from "@/lib/chain-icons";
import { CHAINS, CHAIN_IDS } from "@/lib/web3";
import { cn } from "@/lib/utils";
import type { ChainId } from "@/lib/types";

/**
 * Abas de rede do feed.
 *
 * É FILTRO, não modo. A pessoa continua podendo ver as duas redes — o que ela
 * não pode mais é receber as duas embaralhadas sem perceber, porque cada rede
 * exige uma carteira diferente pra operar e ela acabaria clicando numa moeda
 * que não consegue comprar.
 *
 * Travar o site numa rede só seria pior pra este produto: quem chega por link
 * de indicação de uma moeda da outra rede cairia numa parede de "troque de
 * rede" — e essa é justamente a visita que a plataforma mais quer converter.
 *
 * A carteira conectada não muda o que aparece. Ela só acende um ponto na aba
 * da rede correspondente, pra a pessoa saber onde ela consegue operar agora.
 */
/*
 * Recebe a ordenação e monta os próprios links, em vez de receber uma função
 * que faça isso. Next não deixa passar função de Server Component pra Client
 * Component — e passar os dados em vez do comportamento é o que mantém o
 * componente utilizável em qualquer página que liste moedas.
 */
export function ChainTabs({ ativa, sort }: { ativa: ChainId | null; sort: string }) {
  const hrefDe = (chain: ChainId | null) => {
    const q = new URLSearchParams();
    if (sort && sort !== "new") q.set("sort", sort);
    if (chain) q.set("chain", chain);
    const s = q.toString();
    return s ? `/?${s}` : "/";
  };

  const { connected } = useWallet();
  const { isConnected: evmConectada } = useAccount();

  const conectada: Record<ChainId, boolean> = {
    solana: connected,
    robinhood: evmConectada,
  };

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <Aba href={hrefDe(null)} selecionada={ativa === null}>
        Todas
      </Aba>

      {CHAIN_IDS.map((chain) => (
        <Aba key={chain} href={hrefDe(chain)} selecionada={ativa === chain}>
          <img
            src={chainIcon(chain)}
            alt=""
            width={15}
            height={15}
            className="size-[15px] rounded-full"
          />
          {CHAINS[chain].label}
          {conectada[chain] && (
            <span
              title="carteira conectada nesta rede"
              className="size-1.5 rounded-full bg-bull"
            />
          )}
        </Aba>
      ))}
    </div>
  );
}

function Aba({
  href,
  selecionada,
  children,
}: {
  href: string;
  selecionada: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors",
        selecionada
          ? "border-chroma-violet/40 bg-chroma-violet/15 text-chroma-violet"
          : "border-white/[0.06] bg-white/[0.02] text-zinc-500 hover:border-white/[0.12] hover:text-zinc-200",
      )}
    >
      {children}
    </Link>
  );
}
