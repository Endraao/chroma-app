import type { ChainId } from "./types";

/**
 * Símbolo de cada rede, baixado por `npm run tokens:icons`.
 *
 * Não confundir com o logo da MOEDA da rede: o símbolo da Robinhood Chain é a
 * marca dela, não o losango do Ethereum — apesar de o gás ser pago em ETH.
 * Usar o do ETH ali dava a impressão de que a aba era "Ethereum", que é uma
 * rede diferente e que a Chroma não suporta.
 */
export const CHAIN_ICONS: Record<ChainId, string> = {
  solana: "/chains/solana.png",
  robinhood: "/chains/robinhood.png",
};

export function chainIcon(chain: ChainId): string {
  return CHAIN_ICONS[chain];
}
