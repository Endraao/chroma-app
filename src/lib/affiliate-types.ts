import type { ChainId } from "./types";

/**
 * Formato do que `/api/affiliate` devolve.
 *
 * Mora fora de `affiliate-store.ts` de propósito: aquele arquivo é
 * `server-only` e o componente do painel não pode importá-lo. Com o tipo aqui,
 * servidor e interface usam a MESMA definição.
 *
 * Isso não é purismo. Duas vezes seguidas o formato da resposta mudou e a tela
 * continuou compilando, porque `fetch` devolve `any` e cada lado declarava a
 * própria interface — o resultado foi tela mostrando zero em silêncio. Tipo
 * compartilhado faz o `tsc` apontar o erro em vez do usuário.
 */

/**
 * Ganhos de UMA rede.
 *
 * Cada rede paga na própria moeda — Solana em SOL, Robinhood Chain em ETH.
 * Os totais NUNCA se somam entre si.
 */
export interface GanhosDaRede {
  chain: ChainId;
  /** símbolo da moeda em que essa rede paga */
  symbol: string;
  trades: number;
  volumeNative: number;
  commissionNative: number;
  commissionToday: number;
  commissionWeek: number;
  /** últimos 14 dias, do mais antigo pro mais recente */
  daily: { day: string; commission: number; trades: number }[];
  /** de quais moedas veio, da que mais rendeu pra que menos */
  byToken: { symbol: string; address: string; commission: number; trades: number }[];
  recentTrades: {
    txHash?: string;
    at: number;
    volumeNative?: number;
    commissionNative?: number;
    tokenSymbol?: string;
  }[];
}

export interface AffiliateSummary {
  wallet: string;
  /** apelido da conta, quando existe */
  nickname?: string | null;
  /**
   * Carteira vinculada em cada rede.
   *
   * O painel precisa disto pra dizer "você não recebe na Robinhood porque não
   * vinculou carteira lá". Sem o aviso, a comissão dessa rede vai pra
   * plataforma e o promotor nunca descobre por quê — foi exatamente o bug que
   * motivou a carteira por rede.
   */
  carteiras?: Partial<Record<ChainId, string>>;
  clicks: number;
  trades: number;
  /** uma entrada por rede em que a pessoa já recebeu alguma coisa */
  porRede: GanhosDaRede[];
  lastActivity: number | null;
}

/** Moeda em que cada rede paga a comissão. */
export const MOEDA_DA_REDE: Record<ChainId, string> = {
  solana: "SOL",
  robinhood: "ETH",
};
