export type ChainId = "solana" | "robinhood";

export type ChainKind = "solana" | "evm";

export interface TokenSummary {
  address: string;
  chain: ChainId;
  name: string;
  symbol: string;
  imageUrl?: string;
  description?: string;
  priceUsd: number;
  change24h: number;
  /**
   * Variação por janela de tempo, em %. É com isto que o mini-gráfico do
   * card é desenhado — são poucos pontos, mas são pontos REAIS, e não uma
   * curva inventada só pra enfeitar.
   */
  priceChanges?: { m5?: number; h1?: number; h6?: number; h24?: number };
  /**
   * A outra ponta do par (USDG, WETH, SOL…).
   *
   * Necessário pra ler o preço direto da rede: o evento de swap devolve as
   * duas quantidades, e sem saber qual token é qual — e com quantas casas —
   * não dá pra transformar isso em preço.
   */
  quoteAddress?: string;
  quoteSymbol?: string;
  /** quanto vale UMA unidade da moeda de cotação, em dólar */
  quotePriceUsd?: number;
  marketCapUsd: number;
  liquidityUsd: number;
  volume24hUsd: number;
  holders: number;
  createdAt: number;
  /**
   * Progresso da bonding curve até a migração pra DEX (0–100).
   * `null` = token que já nasceu listado, não passou por curva na Chroma.
   */
  bondingProgress: number | null;
  creator: string;
  /** Par de maior liquidez — é dele que saem as velas do gráfico. */
  pairAddress?: string;
  dexId?: string;
  /**
   * Links que o projeto declarou.
   *
   * Opcionais porque a maioria das meme coins não tem nenhum — e é justamente
   * por isso que a tela oferece uma busca no X quando faltam: a conversa sobre
   * a moeda existe mesmo quando o site não existe.
   */
  website?: string;
  twitter?: string;
  telegram?: string;
  /** lançada na Chroma com a taxa de criador indo pros holders */
  recompensasParaDetentores?: boolean;
}

export interface Candle {
  /** segundos desde epoch (formato do lightweight-charts) */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type RiskLevel = "safe" | "warn" | "danger" | "unknown";

export interface SecurityCheck {
  id: string;
  label: string;
  description: string;
  level: RiskLevel;
  /** valor exibido à direita, ex.: "5%", "Sim", "Travada 180d" */
  value: string;
  /**
   * A frase que vira ALERTA quando esta verificação reprova.
   *
   * Fica junto da verificação, e não numa lista separada, porque a lista
   * separada foi o defeito: ela era escrita à mão e ficou para trás. Havia
   * verificações marcadas como perigo máximo — transfer hook, conta fechável,
   * nenhuma pool — que não geravam aviso nenhum, porque ninguém lembrou de
   * acrescentá-las na outra ponta.
   *
   * Com a frase aqui, acrescentar uma verificação já acrescenta o alerta.
   */
  aviso?: string;
  /**
   * Perigo que zera o dinheiro, e não só incomoda.
   *
   * Pesa mais no score e alerta mesmo em nível de atenção. "O dono pode
   * retirar a liquidez" e "o dono pode trocar o nome do token" não podem
   * valer a mesma coisa: a primeira acaba com o investimento, a segunda é
   * chateação.
   */
  critico?: boolean;
}

export interface SecurityReport {
  address: string;
  chain: ChainId;
  source: "goplus" | "quickintel" | "mock";
  fetchedAt: number;
  /** 0–100, quanto maior melhor */
  score: number;
  checks: SecurityCheck[];
  holderConcentration: {
    top10Pct: number;
    creatorPct: number;
  };
  warnings: string[];
}

export type TradeSide = "buy" | "sell";

export interface FeeBreakdown {
  /** valor bruto da ordem, na moeda de entrada */
  grossAmount: number;
  /** 1% do bruto */
  totalFee: number;
  /** 0,5% (ou 1% se não houver afiliado) */
  platformFee: number;
  /** 0,5% quando há afiliado, senão 0 */
  affiliateFee: number;
  /** o que de fato entra no swap */
  netAmount: number;
  affiliate: string | null;
}

/** Para quem vão as recompensas de criador do token. */
export type CreatorRewardsMode = "creator" | "holders";

/** Mídia enviada no lançamento (imagem/vídeo da moeda e banner). */
export interface LaunchMedia {
  file: File;
  previewUrl: string;
  kind: "image" | "video";
  width?: number;
  height?: number;
}
