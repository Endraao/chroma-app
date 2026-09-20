import "server-only";

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { AFFILIATE_FEE_BPS } from "./fees";
import type { ChainId } from "./types";
import { MOEDA_DA_REDE, type AffiliateSummary, type GanhosDaRede } from "./affiliate-types";

export type { AffiliateSummary, GanhosDaRede };
import path from "node:path";

/**
 * Persistência dos eventos de afiliado.
 *
 * Formato: JSONL (um JSON por linha) em `.data/affiliate-events.jsonl`.
 * Escrita é append puro, que o sistema operacional trata como atômico para
 * linhas curtas — sem risco de dois pedidos simultâneos corromperem o arquivo.
 *
 * POR QUE ARQUIVO E NÃO BANCO: o MVP roda numa máquina só e assim não exige
 * que o usuário instale Postgres pra testar. Os limites são reais e estão
 * listados abaixo. Quando for pra produção, troque só este arquivo — o resto
 * da aplicação não sabe onde os dados moram.
 *
 * Limites conhecidos:
 *  - uma instância só (em serverless, cada instância teria o seu arquivo);
 *  - a leitura carrega o arquivo inteiro na memória;
 *  - não há índice: consulta por carteira é varredura linear.
 *
 * Nada disso afeta o pagamento do afiliado, que acontece on-chain.
 */

const DATA_DIR = path.join(process.cwd(), ".data");
const EVENTS_FILE = path.join(DATA_DIR, "affiliate-events.jsonl");

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

/** Cache de leitura: evita reler o arquivo a cada request do dashboard. */
let cache: { records: AffiliateRecord[]; loadedAt: number } | null = null;
const CACHE_MS = 5_000;

export async function recordEvent(record: AffiliateRecord): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await appendFile(EVENTS_FILE, JSON.stringify(record) + "\n", "utf8");
  cache = null; // invalida, senão o painel mostraria número velho
}

export async function readEvents(): Promise<AffiliateRecord[]> {
  if (cache && Date.now() - cache.loadedAt < CACHE_MS) return cache.records;

  try {
    const raw = await readFile(EVENTS_FILE, "utf8");
    const records = raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as AffiliateRecord;
        } catch {
          return null; // linha truncada por um crash: ignora em vez de derrubar
        }
      })
      .filter((r): r is AffiliateRecord => r !== null);

    cache = { records, loadedAt: Date.now() };
    return records;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
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
  const all = await readEvents();

  const meusEnderecos = new Set(quem.wallets.map(chaveDeEndereco));
  const eDele = (r: AffiliateRecord) =>
    (quem.nickname != null && r.conta === quem.nickname) ||
    (Boolean(r.wallet) && meusEnderecos.has(chaveDeEndereco(r.wallet)));

  const mine = all.filter(eDele);
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
