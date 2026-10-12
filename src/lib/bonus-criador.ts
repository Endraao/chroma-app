/**
 * BÔNUS DO CRIADOR na Curva da Chroma (ideia do dono, 03/10/2026).
 *
 * O prêmio se paga sozinho: é METADE do que a Chroma já ganhou com a moeda.
 * Na Curva da Chroma a Chroma é parceira e leva parte de todo o volume (0,40%
 * nas moedas da config antiga, ~0,50% nas da nova). Então, quando a moeda bate
 * a meta, o dinheiro do bônus já entrou — o caixa nunca adianta.
 *
 * Fraude não compensa: quem negocia a própria moeda pra bater meta paga 1% e
 * recebe de volta 0,3–0,4% como criador, perdendo 0,6–0,7% do volume — US$ 150
 * ou mais pra ganhar US$ 50 na primeira meta.
 *
 * O progresso é medido pelo que a Chroma ganhou de verdade (taxa de parceira
 * na curva + metade da taxa da pool da Meteora depois que a moeda se forma,
 * lidas da rede), não por volume declarado. O "volume" mostrado é esse ganho
 * convertido pela taxa normal de 1% — aproximação honesta: nos 2 primeiros
 * minutos a taxa anti-robô é maior, e a meta chega um pouco antes.
 */

/**
 * Quanto da negociação vira ganho da Chroma depende da config da moeda (ver
 * lib/curva-taxas.ts): 0,40% na antiga, ~0,50% na nova (11/10/2026). O bônus
 * (~0,20% do volume em cada meta) cabe com folga nas duas.
 */
export { divisaoDaConfig } from "@/lib/curva-taxas";
/** Quanto o criador ganha por negócio numa moeda nova (pra textos e exemplos). */
export { PARTE_DO_CRIADOR } from "@/lib/curva-taxas";

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

/** Recebe o VOLUME REAL da moeda (ver lib/volume-real.ts), não a taxa. */
export function progressoDoBonus(volumeUsd: number): ProgressoDoBonus {
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
