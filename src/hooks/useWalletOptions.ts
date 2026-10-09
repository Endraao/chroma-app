"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { useConnect } from "wagmi";

import { WALLET_CATALOG, findCatalogWallet } from "@/lib/wallet-catalog";
import { chainIcon } from "@/lib/chain-icons";
import { avisarErroDaCarteira } from "@/lib/erro-carteira";
import type { WalletOption, WalletNetwork } from "@/components/web3/WalletRow";

const RECENT_KEY = "chroma.lastWallet";

/** Símbolo de cada rede, usado como selo no canto do logo da carteira. */
const SELO_DA_REDE: Record<WalletNetwork, string> = {
  solana: chainIcon("solana"),
  evm: chainIcon("robinhood"),
};

/**
 * A carteira serve as duas redes? Se sim, ela aparece nos dois grupos e
 * precisa do selo pra pessoa saber qual conta está escolhendo.
 */
function serveAsDuasRedes(name: string): boolean {
  return (findCatalogWallet(name)?.networks.length ?? 0) > 1;
}

function seloPara(name: string, network: WalletNetwork): string | undefined {
  return serveAsDuasRedes(name) ? SELO_DA_REDE[network] : undefined;
}

/** "Trust Wallet" -> "trustwallet" */
const slugify = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

/**
 * As carteiras da tela de login, separadas por rede.
 *
 * Três fontes, nessa ordem de confiança:
 *
 *  1. Wallet Standard (Solana) — as instaladas se anunciam sozinhas, com nome
 *     e logo próprios. Phantom, Solflare, Backpack, MetaMask-Solana, Magic
 *     Eden e qualquer uma nova que apareça amanhã, sem tocar no código.
 *  2. EIP-6963 (EVM) — mesma ideia do lado Ethereum, via wagmi.
 *  3. Catálogo estático — as que a pessoa NÃO tem. Nome, logo oficial e link
 *     de instalação, gerados por `npm run wallets:catalog`.
 *
 * A separação por rede importa: conectar a Phantom não te deixa operar na
 * Robinhood Chain, e conectar a MetaMask-EVM não te deixa comprar na Solana.
 * Misturar tudo numa lista só faz a pessoa escolher errado.
 */
export function useWalletOptions() {
  const { wallets, select, wallet: selecionada, connect: conectarSolana } = useWallet();
  const { connect, connectors } = useConnect();
  const [recent, setRecent] = useState<string | null>(null);

  useEffect(() => {
    try {
      setRecent(window.localStorage.getItem(RECENT_KEY));
    } catch {
      /* storage bloqueado: segue sem o selo de "recente" */
    }
  }, []);

  const remember = useCallback((name: string) => {
    try {
      window.localStorage.setItem(RECENT_KEY, name);
    } catch {}
    setRecent(name);
  }, []);

  /* --- Detectadas: Solana ------------------------------------------ */

  const solanaDetected = useMemo<WalletOption[]>(
    () =>
      wallets
        .filter(
          (w) =>
            w.readyState === WalletReadyState.Installed ||
            w.readyState === WalletReadyState.Loadable,
        )
        .map((w) => ({
          key: `sol:${w.adapter.name}`,
          name: w.adapter.name,
          icon: w.adapter.icon || findCatalogWallet(w.adapter.name)?.icon,
          network: "solana" as const,
          networkBadge: seloPara(w.adapter.name, "solana"),
          state: recent === w.adapter.name ? ("recent" as const) : ("detected" as const),
          onSelect: () => {
            remember(w.adapter.name);
            // Já selecionada (mas desconectada): select() não faria nada —
            // o botão parecia morto. Pede a conexão direto.
            if (selecionada?.adapter.name === w.adapter.name) void conectarSolana().catch(avisarErroDaCarteira);
            else select(w.adapter.name);
          },
        })),
    [wallets, select, selecionada, conectarSolana, recent, remember],
  );

  /* --- Detectadas: EVM --------------------------------------------- */

  /*
   * Um conector aparecer na lista do wagmi NÃO significa que a carteira está
   * instalada. Só depois de `getProvider()` responder é que dá pra dizer
   * "detectada" — antes disso a tela mentiria pro usuário.
   */
  const [evmPresent, setEvmPresent] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const presentes = await Promise.all(
        connectors.map(async (c) => {
          try {
            return (await c.getProvider()) ? c.uid : null;
          } catch {
            return null;
          }
        }),
      );
      if (!cancelled) setEvmPresent(new Set(presentes.filter((uid): uid is string => Boolean(uid))));
    })();

    return () => {
      cancelled = true;
    };
  }, [connectors]);

  const evmDetected = useMemo<WalletOption[]>(
    () =>
      connectors
        .filter((c) => evmPresent.has(c.uid))
        .map((c) => ({
          key: `evm:${c.uid}`,
          // O EIP-6963 entrega nome e logo oficiais de quem está instalado.
          name: c.name,
          icon: c.icon || findCatalogWallet(c.name)?.icon,
          network: "evm" as const,
          networkBadge: seloPara(c.name, "evm"),
          state: recent === c.name ? ("recent" as const) : ("detected" as const),
          onSelect: () => {
            remember(c.name);
            connect({ connector: c });
          },
        })),
    [connectors, evmPresent, connect, recent, remember],
  );

  /* --- Não instaladas, por rede ------------------------------------ */

  const naoInstaladas = useCallback(
    (network: WalletNetwork, detectadas: WalletOption[]): WalletOption[] => {
      const jaTem = new Set(detectadas.map((o) => slugify(o.name)));

      return WALLET_CATALOG.filter(
        (w) => w.networks.includes(network) && !jaTem.has(slugify(w.name)),
      ).map((w) => ({
        key: `catalog:${network}:${w.name}`,
        name: w.name,
        icon: w.icon,
        network,
        networkBadge: w.networks.length > 1 ? SELO_DA_REDE[network] : undefined,
        state: "not-installed" as const,
        onSelect: () =>
          w.url ? window.open(w.url, "_blank", "noopener,noreferrer") : undefined,
      }));
    },
    [],
  );

  /* --- Montagem por rede ------------------------------------------- */

  /**
   * Os destaques de cada rede. Procura entre as detectadas primeiro e, se não
   * achar, entre as não instaladas — assim quem não tem nenhuma carteira
   * ainda vê os nomes que reconhece, com o link pra instalar.
   */
  const montar = useCallback(
    (network: WalletNetwork, detectadas: WalletOption[], destaques: RegExp[]) => {
      const faltando = naoInstaladas(network, detectadas);
      const todas = [...detectadas, ...faltando];

      const featured: WalletOption[] = [];
      for (const matcher of destaques) {
        const achada = todas.find((o) => matcher.test(o.name) && !featured.includes(o));
        if (achada) featured.push(achada);
      }

      // A recente sempre sobe pro topo, mesmo que não seja uma das fixas.
      const recentOption = detectadas.find((o) => o.state === "recent");
      if (recentOption && !featured.some((o) => o.key === recentOption.key)) {
        featured.unshift(recentOption);
      }

      return { featured, detected: detectadas, notInstalled: faltando, all: todas };
    },
    [naoInstaladas],
  );

  /*
   * Os destaques de cada rede. MetaMask e Phantom aparecem nas DUAS: as duas
   * ganharam suporte à outra rede, e é o par que a maioria tem instalado.
   * São contas diferentes em cada rede, apesar de ser o mesmo aplicativo.
   */
  const solana = useMemo(
    () => montar("solana", solanaDetected, [/^phantom$/i, /^solflare$/i, /^metamask$/i]),
    [montar, solanaDetected],
  );

  const evm = useMemo(
    () => montar("evm", evmDetected, [/^metamask$/i, /^phantom$/i]),
    [montar, evmDetected],
  );

  return {
    solana,
    evm,
    hasAny: solanaDetected.length + evmDetected.length > 0,
  };
}
