// GERADO POR scripts/build-token-icons.mjs — NÃO EDITE À MÃO.
//
// Caminho do logo de cada moeda usada como par de liquidez.
// Para atualizar: npm run tokens:icons

export const PAIR_ICONS: Record<string, string> = {
  "solana:SOL": "/tokens/solana-sol.png",
  "solana:USDC": "/tokens/solana-usdc.png",
  "robinhood:ETH": "/tokens/robinhood-eth.png",
  "robinhood:NVDA": "/tokens/robinhood-nvda.png",
  "robinhood:SPCX": "/tokens/robinhood-spcx.png",
};

/** Logo do par, ou undefined se não houver — a interface cai no texto. */
export function pairIcon(chain: string, symbol: string): string | undefined {
  return PAIR_ICONS[`${chain}:${symbol}`];
}
