import { pairIcon } from "./pair-icons";
import type { ChainId } from "./types";

/**
 * Moedas aceitas como par de liquidez no lançamento de um token.
 *
 * ---------------------------------------------------------------------------
 * ATENÇÃO — ENDEREÇOS DE CONTRATO
 * ---------------------------------------------------------------------------
 * Cada endereço aqui foi verificado no explorador oficial da rede em 19/09/2026.
 * Na Robinhood Chain existem VÁRIOS tokens falsos usando os mesmos símbolos:
 * uma busca por "NVDA" devolve quatro contratos diferentes, e por "USDC"
 * devolve seis. O que identifica o token oficial é o nome terminando em
 * "• Robinhood Token".
 *
 * Nunca adicione um par aqui por símbolo. Confira o endereço no explorador,
 * confira o nome completo e confira os decimais. Um endereço errado nesta
 * lista manda o dinheiro do usuário para um contrato de golpe.
 *
 * USDC na Robinhood Chain está ausente de propósito: os contratos chamados
 * "USD Coin" encontrados lá têm 18 decimais e ~200 holders, enquanto o USDC
 * real tem 6 decimais. São falsificações. Quando a Circle publicar o
 * canônico, adicione com o endereço conferido.
 */

export interface LiquidityPair {
  symbol: string;
  name: string;
  /** mint (Solana) ou contrato ERC-20 (EVM); vazio = moeda nativa da rede */
  address: string;
  decimals: number;
  /** explicação curta que aparece na interface */
  hint: string;
}

export const LIQUIDITY_PAIRS: Record<ChainId, LiquidityPair[]> = {
  solana: [
    {
      symbol: "SOL",
      name: "Solana",
      address: "So11111111111111111111111111111111111111112",
      decimals: 9,
      hint: "Padrão. Maior liquidez e o que todo comprador já tem na carteira.",
    },
    // Só SOL: na pump.fun toda moeda nasce pareada com SOL (ver src/lib/pumpfun.ts).
  ],
  robinhood: [
    {
      symbol: "ETH",
      name: "Ethereum",
      address: "", // nativa da rede
      decimals: 18,
      hint: "Moeda de gás da Robinhood Chain. Par mais líquido da rede.",
    },
    /*
     * NVDA, SPCX e as outras ações tokenizadas saíram da lista em 27/09/2026:
     * a ChromaCurve só aceita ETH. A tela oferecia NVDA, a pessoa escolhia, e
     * a moeda nascia pareada com ETH do mesmo jeito — escolha que não fazia
     * nada. Os endereços conferidos estão no histórico do git e em
     * `scripts/gerar-pares-robinhood.mjs`; voltam quando a curva aceitar
     * ERC-20 como par.
     */
  ],
};

/** Logo oficial da moeda, baixado por `npm run tokens:icons`. */
export function pairLogo(chain: ChainId, symbol: string): string | undefined {
  return pairIcon(chain, symbol);
}

export function findPair(chain: ChainId, symbol: string): LiquidityPair | null {
  return LIQUIDITY_PAIRS[chain]?.find((p) => p.symbol === symbol) ?? null;
}

/** Par escolhido por padrão em cada rede. */
export const DEFAULT_PAIR: Record<ChainId, string> = {
  solana: "SOL",
  robinhood: "ETH",
};
