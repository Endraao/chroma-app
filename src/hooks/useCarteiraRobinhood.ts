"use client";

import { useCallback } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { getWalletClient } from "wagmi/actions";
import type { Hash, PublicClient } from "viem";

import { robinhoodChain, wagmiConfig } from "@/lib/web3";

/**
 * A carteira EVM pronta para assinar NA Robinhood Chain.
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO `useWalletClient()`
 * ---------------------------------------------------------------------------
 * `useWalletClient()` devolve `undefined` quando a MetaMask está conectada mas
 * parada em outra rede (Ethereum, Base…) — a rede dela não está na config do
 * site, então o wagmi não monta cliente nenhum. A tela lia isso como "sem
 * carteira" e mandava a pessoa conectar uma carteira que JÁ estava conectada.
 *
 * Aqui a troca de rede é pedida à MetaMask na hora de assinar, e só depois o
 * cliente é montado — já na rede certa.
 */
export function useCarteiraRobinhood() {
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const obterCarteira = useCallback(async () => {
    if (!address) throw new Error("Conecte uma carteira da Robinhood Chain antes.");
    if (chainId !== robinhoodChain.id) {
      await switchChainAsync({ chainId: robinhoodChain.id });
    }
    /* A config tipada do site, e não a de `useConfig()`: é ela que diz ao
       TypeScript em que rede o cliente assina. */
    return getWalletClient(wagmiConfig, { chainId: robinhoodChain.id });
  }, [address, chainId, switchChainAsync]);

  return { address, obterCarteira };
}

/**
 * Espera o recibo sem desistir cedo.
 *
 * Com o prazo padrão do viem, a publicação dos contratos (27/09/2026) terminou
 * duas vezes em "Timed out while waiting for transaction" com a transação JÁ
 * confirmada na rede. Aqui o prazo é longo e, se mesmo assim estourar, o
 * recibo é pedido uma última vez diretamente antes de dar erro: dizer "falhou"
 * pra quem já pagou é o pior desfecho possível.
 */
export async function esperarRecibo(publicClient: PublicClient, hash: Hash) {
  try {
    return await publicClient.waitForTransactionReceipt({
      hash,
      timeout: 5 * 60_000,
      pollingInterval: 2_000,
    });
  } catch (erro) {
    const recibo = await publicClient.getTransactionReceipt({ hash }).catch(() => null);
    if (recibo) return recibo;
    throw erro;
  }
}
