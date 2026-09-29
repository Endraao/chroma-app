import type { ChainId, FeeBreakdown } from "./types";

/**
 * Todas as taxas da Chroma, num lugar só.
 *
 * ---------------------------------------------------------------------------
 * POR QUE AS TAXAS SÃO POR REDE
 * ---------------------------------------------------------------------------
 * Cada rede tem um concorrente dominante diferente, com economia diferente:
 *
 *   Solana          → pump.fun: 1,25% no total, dos quais 0,30% vão pro criador.
 *                     Ou seja, a plataforma guarda 0,95%. Tem folga.
 *
 *   Robinhood Chain → PONS: 1,00% no total, dos quais 0,70% vão pro criador.
 *                     A plataforma guarda 0,30%. Não tem folga nenhuma.
 *
 * O afiliado da Chroma custa 0,30% — exatamente a margem inteira que o PONS
 * guarda pra si. Logo, na Robinhood Chain é IMPOSSÍVEL cobrar 1% igual ao
 * PONS, pagar o criador igual ao PONS e ainda sobrar algo. Alguma das três
 * pontas tem que ceder.
 *
 * A escolha foi ceder no lado do trader: 1,20% na Robinhood contra 1,00% do
 * PONS. Motivo: numa meme coin o slippage costuma passar de 3%, então 0,20
 * ponto percentual é ruído pro trader — enquanto 0,40 ponto a menos no
 * bolso do criador decide em qual plataforma ele lança.
 *
 * Tudo em basis points (100 bps = 1%), que evita erro de ponto flutuante.
 */

const BPS_DENOMINATOR = 10_000;

/* ------------------------------------------------------------------ */
/* Constantes que valem em todas as redes                              */
/* ------------------------------------------------------------------ */

/** Fatia de quem indicou. Igual nas duas redes, pra o link valer o mesmo. */
export const AFFILIATE_FEE_BPS = 30;

/**
 * Taxa de criador opcional, definida no lançamento e imutável depois.
 * Zero por padrão — no formulário do PONS o controle também começa em 0%.
 */
export const DEFAULT_CREATOR_TAX_BPS = 0;
/** Teto duro do protocolo, igual ao do PONS. */
export const MAX_CREATOR_TAX_BPS = 1_000;

/**
 * Piso da plataforma. Nenhuma faixa pode empurrar a nossa fatia abaixo disso,
 * senão a rede sai no prejuízo depois do custo de infraestrutura.
 */
export const PLATFORM_FLOOR_BPS = 20;

/* ------------------------------------------------------------------ */
/* Configuração por rede                                               */
/* ------------------------------------------------------------------ */

export interface CreatorTier {
  /** volume acumulado em USD a partir do qual esta faixa vale */
  fromVolumeUsd: number;
  creatorBps: number;
  label: string;
}

export interface ChainFeeConfig {
  /** o que o trader paga numa moeda lançada na Chroma, na curva */
  curveTotalBps: number;
  /** faixas da fatia do criador, por volume acumulado */
  creatorTiers: CreatorTier[];
  /** taxa de lançamento, na moeda nativa da rede */
  launchFee: number;
  /** quem estamos enfrentando nessa rede — aparece na página de taxas */
  reference: { name: string; totalBps: number; creatorBps: number; launchFee: string };
}

const TIER_LABELS = ["Lançamento", "Pegando tração", "Consolidada", "Topo"];
const TIER_VOLUMES = [0, 100_000, 500_000, 2_000_000];

/** Monta as faixas a partir de quatro valores de fatia do criador. */
function tiers(creatorBps: [number, number, number, number]): CreatorTier[] {
  return creatorBps.map((bps, i) => ({
    fromVolumeUsd: TIER_VOLUMES[i],
    creatorBps: bps,
    label: TIER_LABELS[i],
  }));
}

export const CHAIN_FEES: Record<ChainId, ChainFeeConfig> = {
  /**
   * Solana — empata o total do pump.fun (1,25%) e paga MUITO mais ao criador:
   * ele começa igual (0,30%) e chega a 0,75%, enquanto no pump.fun a fatia do
   * criador só cai conforme o market cap sobe.
   */
  solana: {
    curveTotalBps: 125,
    creatorTiers: tiers([30, 45, 60, 75]),
    launchFee: Number(process.env.NEXT_PUBLIC_LAUNCH_FEE_SOL || 0.02),
    reference: { name: "pump.fun", totalBps: 125, creatorBps: 30, launchFee: "grátis" },
  },

  /**
   * Robinhood Chain — 0,20 ponto acima do PONS no total, para conseguir
   * igualar a fatia de 0,70% que o PONS paga ao criador no topo e ainda
   * manter o afiliado. Ver a explicação no topo do arquivo.
   */
  robinhood: {
    curveTotalBps: 120,
    creatorTiers: tiers([45, 55, 62, 70]),
    launchFee: Number(process.env.NEXT_PUBLIC_LAUNCH_FEE_ETH || 0.0005),
    reference: { name: "PONS", totalBps: 100, creatorBps: 70, launchFee: "0,0005 ETH" },
  },
};

/**
 * Taxa de um swap em token que NÃO foi lançado na Chroma (roteado via
 * agregador). Não há criador nosso pra pagar, então essa fatia simplesmente
 * não é cobrada — o trader paga menos do que pagaria na curva.
 */
export function swapFeeBps(chain: ChainId): number {
  const config = CHAIN_FEES[chain];
  return config.curveTotalBps - config.creatorTiers[0].creatorBps;
}

/* ------------------------------------------------------------------ */
/* Distribuição                                                        */
/* ------------------------------------------------------------------ */

export interface FeeDistribution {
  tier: CreatorTier;
  tierIndex: number;
  creatorBps: number;
  affiliateBps: number;
  platformBps: number;
  traderTotalBps: number;
}

/**
 * Como a taxa da curva se divide, dado o volume acumulado da moeda.
 *
 * A fatia da plataforma é o RESTO — assim a soma fecha sempre no total da
 * rede, mesmo que as faixas mudem depois. Nunca some as partes à mão.
 *
 * A métrica é VOLUME ACUMULADO, não market cap: volume só cresce, então a
 * faixa nunca regride no meio do dia (market cap oscila e faria a taxa do
 * criador piscar pra frente e pra trás).
 *
 * Inflar volume pra subir de faixa não compensa: cada trade falso paga o
 * total da rede e devolve no máximo a fatia do criador, sempre menor.
 */
export function distributeFees(
  chain: ChainId,
  volumeUsd: number,
  hasAffiliate: boolean,
): FeeDistribution {
  const config = CHAIN_FEES[chain];

  let tierIndex = 0;
  for (let i = config.creatorTiers.length - 1; i >= 0; i--) {
    if (volumeUsd >= config.creatorTiers[i].fromVolumeUsd) {
      tierIndex = i;
      break;
    }
  }

  const tier = config.creatorTiers[tierIndex];
  const affiliateBps = hasAffiliate ? AFFILIATE_FEE_BPS : 0;

  return {
    tier,
    tierIndex,
    creatorBps: tier.creatorBps,
    affiliateBps,
    platformBps: config.curveTotalBps - tier.creatorBps - affiliateBps,
    traderTotalBps: config.curveTotalBps,
  };
}

/* ------------------------------------------------------------------ */
/* Taxa de swap — o caminho que já roda hoje                           */
/* ------------------------------------------------------------------ */

/**
 * Divisão da taxa de swap. Um único ponto de verdade — a interface e a
 * montagem da transação usam ESTA função, nunca recalculam à mão.
 */
export function computeFees(
  grossAmount: number,
  affiliate: string | null,
  chain: ChainId,
): FeeBreakdown {
  const totalBps = swapFeeBps(chain);
  const gross = Number.isFinite(grossAmount) && grossAmount > 0 ? grossAmount : 0;
  const totalFee = (gross * totalBps) / BPS_DENOMINATOR;
  const hasAffiliate = Boolean(affiliate);
  const affiliateFee = hasAffiliate ? (gross * AFFILIATE_FEE_BPS) / BPS_DENOMINATOR : 0;

  return {
    grossAmount: gross,
    totalFee,
    platformFee: totalFee - affiliateFee,
    affiliateFee,
    netAmount: gross - totalFee,
    affiliate: hasAffiliate ? affiliate : null,
  };
}

/** Mesma conta em inteiros (lamports / wei), que é o que a transação usa. */
export function computeFeesRaw(grossRaw: bigint, affiliate: string | null, chain: ChainId) {
  const totalFee = (grossRaw * BigInt(swapFeeBps(chain))) / BigInt(BPS_DENOMINATOR);
  const affiliateFee = affiliate
    ? (grossRaw * BigInt(AFFILIATE_FEE_BPS)) / BigInt(BPS_DENOMINATOR)
    : 0n;
  return {
    totalFee,
    affiliateFee,
    platformFee: totalFee - affiliateFee,
    netAmount: grossRaw - totalFee,
  };
}

/* ------------------------------------------------------------------ */
/* Taxa de criador opcional                                            */
/* ------------------------------------------------------------------ */

export function validateCreatorTax(bps: number): { ok: true; bps: number } | { ok: false; error: string } {
  if (!Number.isInteger(bps) || bps < 0) {
    return { ok: false, error: "A taxa de criador precisa ser um número positivo." };
  }
  if (bps > MAX_CREATOR_TAX_BPS) {
    return { ok: false, error: `A taxa de criador não pode passar de ${MAX_CREATOR_TAX_BPS / 100}%.` };
  }
  return { ok: true, bps };
}

/*
 * POOL DE TAXAS E QUEIMA: REMOVIDOS.
 * ---------------------------------------------------------------------------
 * Existia aqui um `POOL_SPLIT_BPS` (60% compra-e-queima da moeda vencedora,
 * 30% pro criador vencedor, 10% pra plataforma) e um `computePoolSplit()`.
 *
 * Nada no sistema alimentava esse pool: a função só era chamada pela página de
 * taxas, pra desenhar uma barra, e pelo teste. O mecanismo que ela descrevia
 * — moedas de um mesmo "tema" competindo, com "fechamento" e "épocas" — nunca
 * foi especificado nem implementado, e a página explicava esses três termos
 * para ninguém, porque nenhum deles existe no produto.
 *
 * Decisão do dono do projeto: sem queima por enquanto; a fatia da plataforma
 * fica integralmente em caixa. A fatia da plataforma é a coluna PLATAFORMA da
 * tabela de faixas, calculada em `distributeFees()` — nada além disso é
 * cobrado, e não há mais nenhuma redistribuição programada.
 */

/* ------------------------------------------------------------------ */
/* Rótulos prontos pra interface                                       */
/* ------------------------------------------------------------------ */

const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;

export { pct as formatBps };

/** Rótulos que não dependem de rede. */
export const feeLabel = {
  affiliate: pct(AFFILIATE_FEE_BPS),
  creatorTaxDefault: pct(DEFAULT_CREATOR_TAX_BPS),
  creatorTaxMax: pct(MAX_CREATOR_TAX_BPS),
};

/** Rótulos de uma rede específica. */
export function feeLabelFor(chain: ChainId) {
  const config = CHAIN_FEES[chain];
  const tiersList = config.creatorTiers;

  return {
    swap: pct(swapFeeBps(chain)),
    curveTotal: pct(config.curveTotalBps),
    creatorBase: pct(tiersList[0].creatorBps),
    creatorTop: pct(tiersList[tiersList.length - 1].creatorBps),
    launchFee: config.launchFee,
    reference: config.reference,
    referenceTotal: pct(config.reference.totalBps),
    referenceCreator: pct(config.reference.creatorBps),
  };
}
