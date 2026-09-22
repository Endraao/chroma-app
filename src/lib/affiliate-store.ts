import "server-only";

import { AFFILIATE_FEE_BPS } from "./fees";
import type { ChainId } from "./types";
import { banco, sql } from "./db";
import { MOEDA_DA_REDE, type AffiliateSummary, type GanhosDaRede } from "./affiliate-types";

export type { AffiliateSummary, GanhosDaRede };

/**
 * Persistência dos eventos de afiliado.
 *
 * Mora em Postgres — ver `db.ts` pro porquê. Passou por dois formatos antes:
 * um arquivo JSONL, depois SQLite. Cada troca resolveu um problema concreto:
 *
 *   - **JSONL → SQLite**: o mesmo swap contava duas vezes. Um reenvio do
 *     registro de conversão, banal quando a rede demora e a tela tenta de
 *     novo, somava a comissão de novo no painel. Nos dados que vieram do
 *     formato antigo isso já tinha acontecido: 136 registros de trade eram 6
 *     transações repetidas. Hoje um índice único de transação barra.
 *
 *   - **SQLite → Postgres**: o site vai rodar na Vercel, onde o disco é
 *     descartado a cada publicação. Banco em arquivo ali significa histórico
 *     de comissão sumindo a cada deploy.
 *
 * Nada disso afeta o PAGAMENTO do afiliado, que acontece on-chain, na mesma
 * transação do swap. O que mora aqui é o histórico que o painel mostra.
 */


export type AffiliateEvent = "click" | "trade";

export interface AffiliateRecord {
  /** endereço que recebeu (ou receberia) a comissão deste evento */
  wallet: string;
  /**
   * Apelido da conta do promotor, quando ele tem uma.
   *
   * É o que costura os eventos: com uma carteira por rede, os ganhos da Solana
   * e os da Robinhood caem em endereços diferentes. Somando só por endereço, o
   * painel mostraria metade do que a pessoa ganhou e ela acharia que sumiu
   * dinheiro. Quem não tem apelido continua sendo agrupado pelo endereço.
   */
  conta?: string;
  event: AffiliateEvent;
  at: number;
  /**
   * Em qual rede a comissão foi paga.
   *
   * Sem isto o painel somava SOL com ETH no mesmo número — indicar na
   * Robinhood paga em ETH, e "0,5 + 0,01 = 0,51 SOL" é simplesmente falso.
   * Registros antigos não têm o campo e caem em Solana, que era a única rede
   * com swap ligado quando foram gravados.
   */
  chain?: ChainId;
  landedOn?: string;
  volumeUsd?: number;
  volumeNative?: number;
  /** comissão de fato paga, na moeda nativa — o número que o promotor recebeu */
  commissionNative?: number;
  /** de qual moeda veio, pra o painel dizer "você ganhou X em $POPCAT" */
  tokenAddress?: string;
  tokenSymbol?: string;
  txHash?: string;
}

/** Grava o evento. Reenvio do mesmo swap é ignorado, não somado. */
export async function recordEvent(record: AffiliateRecord): Promise<void> {
  await banco();

  /*
   * `ON CONFLICT DO NOTHING` em cima do índice único de `tx_hash`: reenvio do
   * mesmo swap é ignorado, não somado. É o que impede a mesma comissão de
   * entrar duas vezes quando a rede demora e a tela tenta de novo.
   */
  await sql.query(
    `INSERT INTO eventos_de_afiliado
       (wallet, conta, event, at, chain, landed_on, volume_usd, volume_native,
        commission_native, token_address, token_symbol, tx_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT DO NOTHING`,
    [
      record.wallet,
      record.conta ?? null,
      record.event,
      record.at,
      record.chain ?? null,
      record.landedOn ?? null,
      record.volumeUsd ?? null,
      record.volumeNative ?? null,
      record.commissionNative ?? null,
      record.tokenAddress ?? null,
      record.tokenSymbol ?? null,
      record.txHash ?? null,
    ],
  );
}

interface LinhaDeEvento {
  wallet: string;
  conta: string | null;
  event: string;
  at: number;
  chain: string | null;
  landed_on: string | null;
  volume_usd: number | null;
  volume_native: number | null;
  commission_native: number | null;
  token_address: string | null;
  token_symbol: string | null;
  tx_hash: string | null;
}

function paraRegistro(l: LinhaDeEvento): AffiliateRecord {
  return {
    wallet: l.wallet,
    conta: l.conta ?? undefined,
    event: l.event as AffiliateEvent,
    /* BIGINT chega como texto do Postgres; sem converter, o agrupamento por
       dia e todo cálculo de período dariam NaN em silêncio. */
    at: Number(l.at),
    chain: (l.chain ?? undefined) as ChainId | undefined,
    landedOn: l.landed_on ?? undefined,
    volumeUsd: l.volume_usd ?? undefined,
    volumeNative: l.volume_native ?? undefined,
    commissionNative: l.commission_native ?? undefined,
    tokenAddress: l.token_address ?? undefined,
    tokenSymbol: l.token_symbol ?? undefined,
    txHash: l.tx_hash ?? undefined,
  };
}

/**
 * Os eventos de UMA pessoa, mesmo espalhados por várias carteiras.
 *
 * Casa por apelido OU por qualquer endereço da conta. O apelido sozinho não
 * basta porque eventos antigos não o têm; os endereços sozinhos não bastam
 * porque a pessoa pode vincular uma carteira depois de já ter recebido nela.
 */
async function eventosDe(quem: IdentidadeDoPromotor): Promise<AffiliateRecord[]> {
  const enderecos = quem.wallets.filter(Boolean);

  const condicoes: string[] = [];
  const valores: (string | null)[] = [];

  /*
   * Postgres numera os parâmetros ($1, $2…) em vez de usar `?` posicional.
   * O contador cresce junto com a lista de valores, então a numeração não tem
   * como sair de sincronia com a ordem em que eles são empilhados — que era o
   * erro fácil de cometer ao converter isto na mão.
   */
  const proximo = () => `$${valores.length + 1}`;

  if (quem.nickname) {
    condicoes.push(`conta = ${proximo()}`);
    valores.push(quem.nickname);
  }
  if (enderecos.length > 0) {
    /*
     * Duas comparações: a exata e a em minúsculas. Endereço EVM é insensível
     * a maiúsculas — a mesma carteira pode ter sido gravada em grafias
     * diferentes — e o da Solana é sensível, então a exata precisa continuar
     * existindo. O filtro fino vem depois, em `summarize`.
     *
     * São no máximo duas ou três carteiras (uma por rede), então a lista é
     * curtíssima — e os valores continuam indo como parâmetro, nunca
     * concatenados na consulta.
     */
    const exatos = enderecos.map(() => proximo()).join(", ");
    condicoes.push(`wallet IN (${exatos})`);
    valores.push(...enderecos);

    const minusculos = enderecos.map(() => proximo()).join(", ");
    condicoes.push(`lower(wallet) IN (${minusculos})`);
    valores.push(...enderecos.map((e) => e.toLowerCase()));
  }

  if (condicoes.length === 0) return [];

  await banco();
  const linhas = (await sql.query(
    `SELECT * FROM eventos_de_afiliado
     WHERE ${condicoes.join(" OR ")}
     ORDER BY at ASC`,
    valores,
  )) as unknown as LinhaDeEvento[];

  return linhas.map(paraRegistro);
}


/** Chave YYYY-MM-DD no fuso local — é o "dia" que o promotor enxerga. */
function diaDe(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * O valor real pago, gravado na hora do swap. Registros antigos (de antes de
 * o campo existir) caem na estimativa pelo volume — nunca misturar os dois
 * sem deixar claro qual é qual.
 */
const comissao = (r: AffiliateRecord) =>
  r.commissionNative ?? ((r.volumeNative ?? 0) * AFFILIATE_FEE_BPS) / 10_000;

function resumirRede(chain: ChainId, trades: AffiliateRecord[]): GanhosDaRede {
  const agora = Date.now();
  const hoje = diaDe(agora);
  const semanaAtras = agora - 7 * 24 * 60 * 60 * 1000;

  // Últimos 14 dias, incluindo os vazios — gráfico com buraco confunde.
  const daily: GanhosDaRede["daily"] = [];
  for (let i = 13; i >= 0; i--) {
    const dia = diaDe(agora - i * 24 * 60 * 60 * 1000);
    const doDia = trades.filter((t) => diaDe(t.at) === dia);
    daily.push({
      day: dia,
      commission: doDia.reduce((a, t) => a + comissao(t), 0),
      trades: doDia.length,
    });
  }

  const porMoeda = new Map<string, GanhosDaRede["byToken"][number]>();
  for (const t of trades) {
    const chave = t.tokenAddress ?? t.tokenSymbol ?? "?";
    const atual = porMoeda.get(chave) ?? {
      symbol: t.tokenSymbol ?? "?",
      address: t.tokenAddress ?? "",
      commission: 0,
      trades: 0,
    };
    atual.commission += comissao(t);
    atual.trades++;
    porMoeda.set(chave, atual);
  }

  return {
    chain,
    symbol: MOEDA_DA_REDE[chain],
    trades: trades.length,
    volumeNative: trades.reduce((a, t) => a + (t.volumeNative ?? 0), 0),
    commissionNative: trades.reduce((a, t) => a + comissao(t), 0),
    commissionToday: trades.filter((t) => diaDe(t.at) === hoje).reduce((a, t) => a + comissao(t), 0),
    commissionWeek: trades.filter((t) => t.at >= semanaAtras).reduce((a, t) => a + comissao(t), 0),
    daily,
    byToken: [...porMoeda.values()].sort((a, b) => b.commission - a.commission).slice(0, 8),
    recentTrades: trades
      .slice(-15)
      .reverse()
      .map((t) => ({
        txHash: t.txHash,
        at: t.at,
        volumeNative: t.volumeNative,
        commissionNative: t.commissionNative,
        tokenSymbol: t.tokenSymbol,
      })),
  };
}

/** Endereço EVM é case-insensitive; o da Solana não é. */
const chaveDeEndereco = (a: string) => (a.startsWith("0x") ? a.toLowerCase() : a);

export interface IdentidadeDoPromotor {
  /** a carteira com que ele abriu o painel */
  wallet: string;
  /** apelido da conta, quando existe */
  nickname?: string | null;
  /** todos os endereços da conta — um por rede */
  wallets: string[];
  /** qual endereço em qual rede, pro painel avisar o que falta vincular */
  carteiras?: Partial<Record<ChainId, string>>;
}

/**
 * Junta tudo que pertence a UMA pessoa, mesmo espalhado por várias carteiras.
 *
 * Casa por apelido OU por qualquer endereço da conta. O apelido sozinho não
 * basta porque eventos antigos não o têm; os endereços sozinhos não bastam
 * porque a pessoa pode vincular uma carteira depois de já ter recebido nela.
 */
export async function summarize(quem: IdentidadeDoPromotor): Promise<AffiliateSummary> {
  const meusEnderecos = new Set(quem.wallets.map(chaveDeEndereco));
  const eDele = (r: AffiliateRecord) =>
    (quem.nickname != null && r.conta === quem.nickname) ||
    (Boolean(r.wallet) && meusEnderecos.has(chaveDeEndereco(r.wallet)));

  /*
   * O banco traz os candidatos; este filtro confirma. A consulta compara
   * endereço de duas formas pra não perder grafia de EVM, e isso pode trazer
   * algo a mais — o que entra na conta é o que passa aqui.
   */
  const mine = (await eventosDe(quem)).filter(eDele);
  const trades = mine.filter((r) => r.event === "trade");

  /*
   * Uma seção por rede, e só pras redes em que a pessoa realmente ganhou algo.
   * A tela completa as que faltam com zero — ver EarningsPanel.
   */
  const redes = [...new Set(trades.map((t) => t.chain ?? "solana"))] as ChainId[];

  return {
    wallet: quem.wallet,
    nickname: quem.nickname ?? null,
    carteiras: quem.carteiras ?? {},
    clicks: mine.filter((r) => r.event === "click").length,
    trades: trades.length,
    porRede: redes.map((chain) =>
      resumirRede(
        chain,
        trades.filter((t) => (t.chain ?? "solana") === chain),
      ),
    ),
    lastActivity: mine.at(-1)?.at ?? null,
  };
}
