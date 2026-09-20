"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAccount as useWagmiAccount } from "wagmi";

import type { ChainId } from "@/lib/types";

/**
 * A MetaMask devolve o endereço com maiúsculas do checksum e o arquivo pode ter
 * guardado em minúsculas. Comparar direto faria a conta parecer de outra
 * pessoa; em EVM o endereço é case-insensitive, na Solana não é.
 */
function mesmoEndereco(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  if (a.startsWith("0x") || b.startsWith("0x")) return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

export interface ChromaAccount {
  nickname: string;
  displayName: string;
  wallet: string;
  kind: "solana" | "evm";
  /** uma carteira por rede — é daqui que sai o endereço que recebe indicação */
  carteiras?: Partial<Record<ChainId, string>>;
  /** foto enviada pela pessoa; sem ela a interface gera uma a partir do endereço */
  avatar?: string;
  cover?: string;
}

/**
 * A identidade da pessoa na Chroma.
 *
 * A carteira continua sendo a fonte de verdade (é ela que recebe o dinheiro),
 * mas o apelido é o que aparece na interface e no link de indicação — divulgar
 * `chroma.app/?ref=joaozinho` funciona muito melhor do que divulgar
 * `chroma.app/?ref=9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin`.
 *
 * Registrar NÃO pede assinatura da carteira — é só um nome de exibição. Ver
 * `src/lib/accounts.ts` para o raciocínio e os limites disso.
 */
export function useChromaAccount() {
  const { publicKey, disconnect: disconnectSolana, connected } = useWallet();
  const { address: evmAddress, isConnected: evmConnected } = useWagmiAccount();

  const [account, setAccount] = useState<ChromaAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enderecoSolana = publicKey?.toBase58() ?? null;
  const enderecoEvm = evmAddress ?? null;

  // A carteira Solana tem prioridade quando as duas estão conectadas.
  const wallet = enderecoSolana ?? enderecoEvm;
  const kind: "solana" | "evm" = publicKey ? "solana" : "evm";
  const isSignedIn = Boolean(wallet) && (connected || evmConnected);

  /** O que está conectado agora, por rede. Conectado ≠ vinculado à conta. */
  const conectadas: Partial<Record<ChainId, string>> = {};
  if (enderecoSolana) conectadas.solana = enderecoSolana;
  if (enderecoEvm) conectadas.robinhood = enderecoEvm;

  /* --- Carrega a conta de QUALQUER carteira conectada --------------- */
  /*
   * Pergunta pelas duas de uma vez. Perguntar só pela preferida faria quem
   * criou a conta com a MetaMask e depois conectou a Phantom ser tratado como
   * visitante sem conta — e a tela pediria um apelido que ele já tem.
   */
  const chaveDeBusca = [enderecoSolana, enderecoEvm].filter(Boolean).join(",");

  useEffect(() => {
    if (!chaveDeBusca) {
      setAccount(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/account?wallet=${chaveDeBusca}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setAccount(data ?? null);
      })
      .catch(() => {
        if (!cancelled) setAccount(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [chaveDeBusca]);

  /* --- Verifica disponibilidade em tempo real ---------------------- */
  const checkAvailability = useCallback(async (nickname: string) => {
    if (!nickname.trim()) return null;
    try {
      const res = await fetch(`/api/account?check=${encodeURIComponent(nickname)}`);
      return (await res.json()) as { available: boolean; reason: string | null };
    } catch {
      return null;
    }
  }, []);

  /* --- Registra o apelido ------------------------------------------ */
  const claim = useCallback(
    async (nickname: string): Promise<boolean> => {
      if (!wallet) {
        setError("Conecte uma carteira antes.");
        return false;
      }

      setClaiming(true);
      setError(null);

      try {
        /*
         * Sem assinatura de propósito: o apelido é só um nome de exibição.
         * Pedir pra assinar na primeira tela assusta quem está chegando —
         * parece que o site vai mexer nos fundos. Ver src/lib/accounts.ts.
         */
        const res = await fetch("/api/account", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ nickname, wallet, kind }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "não consegui registrar");

        setAccount(data.account);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      } finally {
        setClaiming(false);
      }
    },
    [wallet, kind],
  );

  /**
   * Aplica a foto recém-enviada no estado local.
   *
   * O servidor já gravou quando isto é chamado; sem este passo a tela só
   * mostraria a imagem nova depois de um recarregamento, e a pessoa acharia
   * que o upload falhou.
   */
  const aplicarFoto = useCallback((campo: "avatar" | "cover", url: string) => {
    setAccount((atual) => (atual ? { ...atual, [campo]: url } : atual));
  }, []);

  /** Reflete na tela a carteira recém-vinculada, sem esperar um recarregamento. */
  const aplicarCarteiras = useCallback((carteiras: Partial<Record<ChainId, string>>) => {
    setAccount((atual) => (atual ? { ...atual, carteiras } : atual));
  }, []);

  /** O que aparece na interface: apelido se existir, senão o endereço encurtado. */
  const label = useMemo(() => {
    if (account) return `@${account.displayName}`;
    if (!wallet) return null;
    return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
  }, [account, wallet]);

  /** O identificador usado no link de indicação. */
  const referralId = account?.nickname ?? wallet ?? null;

  /*
   * Endereço conectado que JÁ pertence à conta.
   *
   * É ele que assina ao vincular uma carteira nova — é isso que prova que a
   * conta é sua. A carteira que está sendo vinculada não serve pra assinar:
   * qualquer um controla a própria carteira, então isso não provaria nada.
   */
  const assinante =
    Object.values(account?.carteiras ?? {}).find(
      (endereco) =>
        mesmoEndereco(endereco, enderecoSolana) || mesmoEndereco(endereco, enderecoEvm),
    ) ?? null;

  return {
    wallet,
    kind,
    conectadas,
    carteiras: account?.carteiras ?? {},
    assinante,
    isSignedIn,
    account,
    label,
    referralId,
    needsNickname: isSignedIn && !loading && !account,
    loading,
    claiming,
    error,
    claim,
    aplicarFoto,
    aplicarCarteiras,
    checkAvailability,
    disconnectSolana,
  };
}
