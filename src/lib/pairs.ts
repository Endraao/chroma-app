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
    {
      symbol: "USDC",
      name: "USD Coin",
      address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      decimals: 6,
      hint: "Preço cotado em dólar. O valor do seu token não oscila junto com o SOL.",
    },
  ],
  robinhood: [
    {
      symbol: "ETH",
      name: "Ethereum",
      address: "", // nativa da rede
      decimals: 18,
      hint: "Moeda de gás da Robinhood Chain. Par mais líquido da rede.",
    },
    {
      symbol: "NVDA",
      name: "NVIDIA • Robinhood Token",
      address: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
      decimals: 18,
      hint: "Ação tokenizada da Nvidia. O preço do par acompanha a ação.",
    },
    {
      symbol: "SPCX",
      name: "Space Exploration Technologies Corp • Robinhood Token",
      address: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa",
      decimals: 18,
      hint: "SpaceX tokenizada (empresa fechada). Liquidez menor que ETH.",
    },
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
