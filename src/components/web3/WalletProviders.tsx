"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import type { Adapter } from "@solana/wallet-adapter-base";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ConectarPeloLink } from "@/components/web3/ConectarPeloLink";
import { SOLANA_RPC, SOLANA_WS, wagmiConfig } from "@/lib/web3";

import "@solana/wallet-adapter-react-ui/styles.css";

/**
 * Empilha os dois mundos: wagmi (EVM) por fora, wallet-adapter (Solana) por dentro.
 * Eles não conversam entre si — o usuário pode estar conectado nos dois ao mesmo tempo.
 */
export function WalletProviders({ children }: { children: React.ReactNode }) {
  const queryClient = useMemo(() => new QueryClient(), []);

  /**
   * Phantom e Solflare se registram sozinhos via Wallet Standard desde 2023.
   * Por isso a lista vai vazia: adicionar adapters aqui só duplicaria os botões.
   * Carteiras legadas (sem Wallet Standard) é que precisariam entrar nesta lista.
   */
  const wallets = useMemo<Adapter[]>(() => [], []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ConnectionProvider endpoint={SOLANA_RPC} config={{ commitment: "confirmed", wsEndpoint: SOLANA_WS }}>
          <WalletProvider wallets={wallets} autoConnect>
            <WalletModalProvider>
              <ConectarPeloLink />
              {children}
            </WalletModalProvider>
          </WalletProvider>
        </ConnectionProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
