import type { Candle } from "./types";

/**
 * Preço por token x capitalização de mercado.
 *
 * As duas curvas são A MESMA COISA multiplicada por uma constante: market cap
 * é preço vezes o fornecimento em circulação. O desenho não muda; muda o que
 * está escrito no eixo.
 *
 * Isso importa em moeda nova. "$0,000284" não diz nada a quase ninguém, e o
 * eixo vira uma pilha de zeros; "$283,7K de market cap" a pessoa compara na
 * hora com outra moeda. É por isso que os terminais de meme coin mostram MCap
 * por padrão.
 *
 * O fornecimento não vem de lugar nenhum novo: é `marketCap / preço`, os dois
 * já entregues pela fonte de mercado. Assim não há uma segunda leitura pra
 * ficar desencontrada da primeira.
 */

export type EscalaDoGrafico = "preco" | "mcap";

/**
 * Quantos tokens existem, deduzido do que a fonte já informa.
 *
 * Devolve 0 quando não dá pra deduzir — e aí a interface esconde a opção de
 * MCap em vez de mostrar um eixo inventado.
 */
export function fornecimentoEmCirculacao(token: {
  marketCapUsd: number;
  priceUsd: number;
}): number {
  if (!Number.isFinite(token.priceUsd) || token.priceUsd <= 0) return 0;
  if (!Number.isFinite(token.marketCapUsd) || token.marketCapUsd <= 0) return 0;
  return token.marketCapUsd / token.priceUsd;
}

/**
 * Converte as velas para a escala escolhida.
 *
 * O volume NÃO é multiplicado: ele já está em dólar, não em preço por token.
 * Multiplicar pelo fornecimento daria um número sem significado nenhum.
 */
export function aplicarEscala(
  candles: Candle[],
  escala: EscalaDoGrafico,
  fornecimento: number,
): Candle[] {
  if (escala === "preco" || fornecimento <= 0) return candles;

  return candles.map((c) => ({
    ...c,
    open: c.open * fornecimento,
    high: c.high * fornecimento,
    low: c.low * fornecimento,
    close: c.close * fornecimento,
  }));
}

/**
 * Rótulo curto do eixo: 283700 vira "283.7K".
 *
 * Sem abreviar, o eixo de uma moeda grande fica com números de nove dígitos e
 * come metade da largura do gráfico.
 */
export function rotuloCompacto(valor: number): string {
  const abs = Math.abs(valor);
  if (abs >= 1e9) return `${(valor / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(valor / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(valor / 1e3).toFixed(1)}K`;
  return valor.toFixed(2);
}
