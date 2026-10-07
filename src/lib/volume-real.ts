import { cached } from "@/lib/cache";
import { PARTE_DA_CHROMA } from "@/lib/bonus-criador";
import { gravarNoCacheDoBanco, lerDoCacheDoBanco } from "@/lib/db";

/**
 * VOLUME REAL de uma moeda da Curva da Chroma, pro bônus do criador (pedido do
 * dono, 07/10/2026).
 *
 * O volume era deduzido da taxa que a Chroma ganhou (taxa ÷ 0,4%). Só que nos
 * primeiros 2 minutos a taxa anti-sniper chega a 25%, e um único sniper de
 * 4 SOL fez a LUMN, com ~$800 negociados, aparecer com "$15,2K de volume". O
 * criador já é recompensado por esse sniper nos ganhos de criador; o bônus é
 * só por volume de verdade.
 *
 * Por isso, passada a janela anti-sniper, a gente tira uma FOTO uma vez só:
 * soma os negócios de verdade até ali (GeckoTerminal, em SOL) e guarda junto
 * quanto a Chroma tinha ganhado nesse momento. Dali pra frente a taxa já é a
 * normal, então o que a Chroma ganhar a mais vira volume pela conta de sempre.
 */
const WSOL = "So11111111111111111111111111111111111111112";
/** A janela anti-sniper dura 2 min; o resto é folga pro GeckoTerminal indexar. */
const ESPERA_MS = 5 * 60_000;
/** O GeckoTerminal só devolve os últimos 300 negócios das últimas 24 h. */
const MAX_NEGOCIOS = 300;
const UM_DIA_MS = 24 * 3600_000;

interface Foto {
  volumeSol: number;
  ganhoSol: number;
  em: number;
}

async function gecko<T>(caminho: string): Promise<T | null> {
  const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/${caminho}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  return r.ok ? ((await r.json()) as T) : null;
}

/** Quando a pool nasceu (não muda nunca: fica 1 h na memória). */
function criadaEm(pool: string): Promise<number | null> {
  return cached(`pool-criada:${pool}`, 3600_000, async () => {
    const j = await gecko<{ data?: { attributes?: { pool_created_at?: string } } }>(`pools/${pool}`);
    const t = Date.parse(j?.data?.attributes?.pool_created_at ?? "");
    return Number.isFinite(t) ? t : null;
  });
}

/** Soma em SOL de todos os negócios da pool, ou null se não dá pra ver todos. */
async function volumeDosNegocios(pool: string): Promise<number | null> {
  type Negocio = { attributes: { from_token_address: string; from_token_amount: string; to_token_amount: string } };
  const j = await gecko<{ data?: Negocio[] }>(`pools/${pool}/trades`);
  const negocios = j?.data;
  if (!Array.isArray(negocios) || negocios.length >= MAX_NEGOCIOS) return null;
  return negocios.reduce((soma, { attributes: a }) => {
    const sol = a.from_token_address === WSOL ? a.from_token_amount : a.to_token_amount;
    return soma + (Number(sol) || 0);
  }, 0);
}

/**
 * Volume real em SOL, ou null quando não dá pra medir (moeda que passou de
 * 24 h ou de 300 negócios antes da foto) — aí vale a conta antiga pela taxa.
 */
export async function volumeRealSol(pool: string, ganhoSol: number): Promise<number | null> {
  const chave = `volume-real:${pool}`;
  const foto = await lerDoCacheDoBanco<Foto>(chave).catch(() => null);
  if (foto) return foto.volumeSol + Math.max(0, ganhoSol - foto.ganhoSol) / PARTE_DA_CHROMA;

  const criada = await criadaEm(pool).catch(() => null);
  if (!criada) return null;
  const idade = Date.now() - criada;
  if (idade > UM_DIA_MS) return null;

  const volumeSol = await volumeDosNegocios(pool).catch(() => null);
  if (volumeSol === null) return null;
  // Janela anti-sniper encerrada: a foto fica guardada pra sempre.
  if (idade >= ESPERA_MS) await gravarNoCacheDoBanco(chave, { volumeSol, ganhoSol, em: Date.now() } satisfies Foto).catch(() => {});
  return volumeSol;
}
