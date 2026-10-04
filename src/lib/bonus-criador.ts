/**
 * BÔNUS DO CRIADOR na Curva da Chroma (ideia do dono, 03/10/2026).
 *
 * O prêmio se paga sozinho: é METADE do que a Chroma já ganhou com a moeda.
 * Na Curva da Chroma a Chroma é parceira e leva ~0,4% de todo o volume (taxa
 * de 1%, 20% pra Meteora, o resto meio a meio com o criador). Então, quando a
 * moeda bate a meta, o dinheiro do bônus já entrou — o caixa nunca adianta.
 *
 * Fraude não compensa: quem negocia a própria moeda pra bater meta paga 1% e
 * recebe de volta 0,4% como criador, perdendo 0,6% do volume — US$ 150 pra
 * ganhar US$ 50 na primeira meta.
 *
 * O progresso é medido pelo que a Chroma ganhou de verdade (taxa de parceira
 * lida da pool), não por volume declarado. O "volume" mostrado é esse ganho
 * convertido pela taxa normal de 1% — aproximação honesta: nos 2 primeiros
 * minutos a taxa anti-robô é maior, e a meta chega um pouco antes.
 */

/** Quanto da negociação vira ganho da Chroma (1% × 80% × 50%). */
export const PARTE_DA_CHROMA = 0.004;

/** Metas: volume da moeda → bônus TOTAL acumulado do criador. */
export const METAS = [
  { volumeUsd: 25_000, bonusUsd: 50 },
  { volumeUsd: 100_000, bonusUsd: 200 },
  { volumeUsd: 250_000, bonusUsd: 500 },
  { volumeUsd: 500_000, bonusUsd: 1_000 },
] as const;

export interface ProgressoDoBonus {
  /** volume aproximado da moeda, em US$ */
  volumeUsd: number;
  /** bônus total já conquistado (meta mais alta batida), em US$ */
  conquistadoUsd: number;
  /** a próxima meta, ou null se bateu todas */
  proxima: (typeof METAS)[number] | null;
  /** 0–100 até a próxima meta */
  pct: number;
}

export function progressoDoBonus(ganhoDaChromaUsd: number): ProgressoDoBonus {
  const volumeUsd = ganhoDaChromaUsd / PARTE_DA_CHROMA;
  let conquistadoUsd = 0;
  let anterior = 0;
  for (const meta of METAS) {
    if (volumeUsd >= meta.volumeUsd) {
      conquistadoUsd = meta.bonusUsd;
      anterior = meta.volumeUsd;
      continue;
    }
    return {
      volumeUsd,
      conquistadoUsd,
      proxima: meta,
      pct: Math.max(0, Math.min(100, ((volumeUsd - anterior) / (meta.volumeUsd - anterior)) * 100)),
    };
  }
  return { volumeUsd, conquistadoUsd, proxima: null, pct: 100 };
}
