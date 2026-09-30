"use client";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useWallet } from "@solana/wallet-adapter-react";
import { useAccount } from "wagmi";
import { useChromaAccount } from "@/hooks/useChromaAccount";

import { chainIcon } from "@/lib/chain-icons";
import { CHAINS, CHAIN_IDS, REDE_PADRAO } from "@/lib/web3";
import { cn } from "@/lib/utils";
import type { ChainId } from "@/lib/types";

/**
 * O seletor de rede do cabeçalho.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ELE EXISTE SE JÁ HAVIA ABAS
 * ---------------------------------------------------------------------------
 * As abas de rede vivem dentro do feed, e só aparecem lá. Quem está numa
 * página de moeda, no airdrop ou no painel de afiliado não tem como dizer
 * "quero ver a outra rede" sem voltar pra home primeiro e procurar a aba.
 *
 * No cabeçalho, a escolha está sempre à mão e sempre visível — e visível é a
 * metade que importa: uma plataforma de duas redes precisa dizer em qual
 * delas você está ANTES de você clicar numa moeda que não consegue comprar.
 *
 * As duas continuam existindo e mexem no MESMO `?chain=`, então nunca
 * discordam entre si.
 *
 * ---------------------------------------------------------------------------
 * SOLANA É O PADRÃO, E "TODAS" DEIXOU DE EXISTIR
 * ---------------------------------------------------------------------------
 * Antes o padrão era mostrar as duas redes misturadas. O problema é que a
 * plataforma não é igual nas duas: em Solana o swap funciona, o lançamento na
 * curva funciona e a comissão de afiliado é paga na própria transação; na
 * Robinhood Chain hoje só existe LEITURA de preço e gráfico.
 *
 * Misturando, a primeira tela entregava moedas que a pessoa não consegue
 * comprar, sem nada explicando por quê. Abrir na rede que funciona por
 * inteiro e deixar a outra a um clique é mais honesto e menos frustrante.
 *
 * Quem chega por link com `?chain=` continua vendo o que o link pediu — é o
 * que mantém link de indicação de moeda da outra rede funcionando.
 *
 * A carteira conectada NÃO muda o filtro. Ela só acende um ponto na rede
 * correspondente, pra a pessoa saber onde consegue operar agora.
 */
const TEXTOS = traducoes({
  en: { conectada: "wallet connected", semCarteira: "no wallet" },
  pt: { conectada: "carteira conectada", semCarteira: "sem carteira" },
  zh: { conectada: "已连接钱包", semCarteira: "未连接钱包" },
});

export function SeletorDeRede() {
  const t = useTextos(TEXTOS);
  const router = useRouter();
  const parametros = useSearchParams();

  /*
   * Sem parâmetro na URL = Solana. Tem que casar com o padrão da home
   * (`src/app/page.tsx`), senão o cabeçalho diz uma rede e a lista mostra
   * outra.
   */
  const daUrl = parametros.get("chain") as ChainId | null;
  const atual: ChainId = daUrl && CHAIN_IDS.includes(daUrl) ? daUrl : REDE_PADRAO;

  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);

  const { connected } = useWallet();
  const { isConnected: evmConectada } = useAccount();
  // Vinculada à conta também conta: é carteira da pessoa, mesmo sem estar
  // plugada nesta aba.
  const { account } = useChromaAccount();
  const conectada: Record<ChainId, boolean> = {
    solana: connected || Boolean(account?.carteiras?.solana),
    robinhood: evmConectada || Boolean(account?.carteiras?.robinhood),
  };

  /* Fecha ao clicar fora ou apertar Esc — igual aos outros menus do site. */
  useEffect(() => {
    if (!aberto) return;
    const naTecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    const noClique = (e: MouseEvent) => {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    };
    window.addEventListener("keydown", naTecla);
    window.addEventListener("mousedown", noClique);
    return () => {
      window.removeEventListener("keydown", naTecla);
      window.removeEventListener("mousedown", noClique);
    };
  }, [aberto]);

  /**
   * Trocar de rede leva pro feed, não fica na página atual.
   *
   * Escolher "Robinhood" parado numa moeda da Solana não tem o que significar
   * — a moeda continua sendo daquela rede. O que a pessoa quer dizer com esse
   * clique é "me mostre a outra rede", e isso é a vitrine.
   *
   * A ordenação escolhida é preservada: trocar de rede não é motivo pra
   * perder o "mais negociados" que a pessoa selecionou.
   */
  function escolher(chain: ChainId) {
    const q = new URLSearchParams();
    const sort = parametros.get("sort");
    if (sort && sort !== "new") q.set("sort", sort);

    // Sempre na URL: "/" abre a rede padrão (Robinhood), não a Solana.
    q.set("chain", chain);

    const s = q.toString();
    router.push(s ? `/?${s}` : "/");
    setAberto(false);
  }

  return (
    <div className="relative" ref={caixaRef}>
      <button
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        className={cn(
          "flex h-9 items-center gap-2 rounded-lg border px-2.5 text-[13px] font-semibold transition-colors",
          aberto
            ? "border-marca/50 bg-marca/[0.08] text-zinc-100"
            : "border-ink-600 bg-ink-800 text-zinc-300 hover:border-marca/40 hover:text-zinc-100",
        )}
      >
        <Image
          src={chainIcon(atual)}
          alt=""
          width={32}
          height={32}
          className="size-[18px] shrink-0 rounded-full"
        />

        <span className="hidden sm:inline">{CHAINS[atual].label}</span>
        <Seta aberto={aberto} />
      </button>

      {aberto && (
        <div className="panel absolute right-0 z-50 mt-2 w-[208px] p-1" role="listbox">
          {/*
            `CHAIN_IDS` já vem com a Solana primeiro. A ordem da lista é a
            ordem de importância — a rede que funciona por inteiro encabeça.
          */}
          {CHAIN_IDS.map((chain) => (
            <Opcao
              key={chain}
              rotulo={CHAINS[chain].label}
              nota={conectada[chain] ? t.conectada : t.semCarteira}
              ativa={atual === chain}
              destacada={conectada[chain]}
              onClick={() => escolher(chain)}
              icone={
                <Image
                  src={chainIcon(chain)}
                  alt=""
                  width={32}
                  height={32}
                  className="size-[18px] shrink-0 rounded-full"
                />
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Opcao({
  rotulo,
  nota,
  ativa,
  destacada = false,
  icone,
  onClick,
}: {
  rotulo: string;
  nota: string;
  ativa: boolean;
  /** Carteira conectada nesta rede: acende o ponto. */
  destacada?: boolean;
  icone: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      role="option"
      aria-selected={ativa}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
        ativa ? "bg-marca/10" : "hover:bg-white/5",
      )}
    >
      {icone}

      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-[12.5px] font-bold",
            ativa ? "text-marca" : "text-zinc-200",
          )}
        >
          {rotulo}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-zinc-600">
          {destacada && <span className="size-1 rounded-full bg-bull" />}
          {nota}
        </span>
      </span>

      {ativa && (
        <svg
          viewBox="0 0 24 24"
          className="size-3.5 shrink-0 text-marca"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        >
          <path d="m5 13 5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function Seta({ aberto }: { aberto: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn(
        "size-3 shrink-0 text-zinc-500 transition-transform duration-200",
        aberto && "rotate-180",
      )}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
