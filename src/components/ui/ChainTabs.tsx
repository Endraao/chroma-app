"use client";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";

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
const TEXTOS = traducoes({
  en: { conectada: "wallet connected on this network" },
  pt: { conectada: "carteira conectada nesta rede" },
  zh: { conectada: "该网络已连接钱包" },
});

export function ChainTabs({ ativa, sort }: { ativa: ChainId; sort: string }) {
  const t = useTextos(TEXTOS);
  const hrefDe = (chain: ChainId) => {
    const q = new URLSearchParams();
    if (sort && sort !== "new") q.set("sort", sort);
    /* Solana é o padrão e não precisa ir na URL — igual ao seletor do topo. */
    if (chain !== "solana") q.set("chain", chain);
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
      {/*
        A aba "Todas" saiu junto com a opção do cabeçalho.

        Não é só limpeza: se ela ficasse, o seletor do topo diria "Solana"
        enquanto a lista mostraria as duas redes misturadas. Os dois controles
        mexem no MESMO `?chain=`, então precisam oferecer as mesmas escolhas.
      */}
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
              title={t.conectada}
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
          ? "border-marca/40 bg-marca/15 text-marca"
          : "border-white/[0.06] bg-white/[0.02] text-zinc-500 hover:border-white/[0.12] hover:text-zinc-200",
      )}
    >
      {children}
    </Link>
  );
}
