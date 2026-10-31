/**
 * As configs da Curva da Chroma (Meteora DBC) e como a taxa de 1% se divide em
 * cada uma — sem dependência pesada, pra qualquer página (inclusive no
 * navegador) poder ler.
 *
 * - CONFIG_ANTIGA (02/10/2026): criador 40% da taxa (0,40% do volume),
 *   Chroma 40% (0,40%), Meteora 20% (0,20%); lançamento 0,02 SOL; anti-sniper
 *   25% caindo até ~1% em 2 minutos.
 * - CONFIG_NOVA (11/10/2026, pedido do dono): criador ~30% da taxa (0,30% do
 *   volume, igual à pump.fun), Chroma ~50% (0,50%), Meteora 20% (0,20%);
 *   lançamento GRÁTIS; 1% fixo desde o primeiro segundo, sem anti-sniper
 *   (igual à pump.fun).
 *   Na conta da Meteora o criador fica com 38% da parte da parceira (80% da
 *   taxa): 0,8 × 38% = 30,4% da taxa = 0,304% do volume.
 *
 * Moedas lançadas na config antiga continuam com a divisão antiga pra sempre
 * (a config é imutável) — por isso a divisão é sempre POR CONFIG.
 */

export const CONFIG_ANTIGA = "BbbaZGSkhjFMfFQNfUrgbDFX9pWATSZvWoVF9jkaFQXw";

/** Preenchida quando a config nova é criada na rede (ver /admin/curva-chroma). */
export const CONFIG_NOVA = "9aB2qqbbdkB7H96XYbxqvPJ3miUEAmecLm1pHk8kp1aS";

/**
 * Config de 11/10/2026 (1% fixo, sem anti-sniper). Mesma divisão da atual;
 * moedas lançadas nela continuam reconhecidas. A atual (9aB2…, 18/10/2026)
 * só muda a taxa do começo: 10% caindo 0,3%/s até 1% em 30 s — experimento
 * do dono pra cobrar dos bots que entram no primeiro segundo.
 */
export const CONFIG_1_PORCENTO = "Di9WfmNMwTeM4ZYPFkdvGntu5swRKUathEKQPJ9UjfLs";

/**
 * Terceira curva (31/10/2026, pedido do dono): anti-sniper FORTE — 25% no
 * primeiro segundo caindo em linha reta até 1% em 30 s (−0,8%/s). Mesma
 * divisão da CONFIG_NOVA. Na tela de criar, ela e a de 10% ficam dentro de
 * "Lançar pela Meteora". Criada pelo dono em /admin/curva-chroma (opção 25%)
 * e conferida na rede; vazia = a opção de 25% some da tela.
 */
export const CONFIG_25 = "CsLRkgyVB79KAsxjFLKqoJpc75uwdjd3dLcLAipuC6Em";

/** Fatias da negociação (fração do VOLUME) numa moeda da curva. */
export interface DivisaoDaCurva {
  criador: number;
  chroma: number;
  meteora: number;
}

const DIVISAO_ANTIGA: DivisaoDaCurva = { criador: 0.004, chroma: 0.004, meteora: 0.002 };
const DIVISAO_NOVA: DivisaoDaCurva = { criador: 0.00304, chroma: 0.00496, meteora: 0.002 };

/** A divisão da taxa de 1% de uma moeda, pela config dela (desconhecida = a nova). */
export function divisaoDaConfig(config?: string | null): DivisaoDaCurva {
  return config === CONFIG_ANTIGA ? DIVISAO_ANTIGA : DIVISAO_NOVA;
}

/** A divisão em % da taxa de 1%, pra textos: 30/50/20 na nova, 40/40/20 na antiga. */
export function pctDaDivisao(config?: string | null): DivisaoDaCurva {
  const d = divisaoDaConfig(config);
  return { criador: Math.round(d.criador * 1e4), chroma: Math.round(d.chroma * 1e4), meteora: Math.round(d.meteora * 1e4) };
}

/** Pra textos de lançamento novo: o criador ganha 30% da taxa (0,3% de cada negócio). */
export const CRIADOR_PCT_DA_TAXA = 30;
/** Fração do volume que vai pro criador numa moeda nova, arredondada pra baixo (pra não prometer a mais). */
export const PARTE_DO_CRIADOR = 0.003;
