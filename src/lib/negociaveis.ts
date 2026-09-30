import { createPublicClient, http, type Address } from "viem";

import { gravarNoCacheDoBanco, lerVariosDoCacheDoBanco } from "@/lib/db";
import { verificarNegociavel, type Negociavel } from "@/lib/negociavel-evm";
import type { TokenSummary } from "@/lib/types";
import { robinhoodChain } from "@/lib/web3";

/**
 * Quais moedas externas da Robinhood a Chroma consegue negociar.
 *
 * A checagem (ver negociavel-evm.ts) custa várias consultas ao RPC, e o RPC
 * público recusa rajadas vindas da Vercel. Por isso ela NÃO roda quando alguém
 * abre a página: roda aos poucos, em segundo plano, e o resultado fica no
 * banco. A vitrine só mostra moeda já confirmada como negociável — regra do
 * dono (29/09/2026): "se ela tá na Chroma, ela vai ser negociável na Chroma".
 */

export interface StatusGuardado {
  r: Negociavel;
  em: number;
}

const VALIDADE_MS = {
  ok: 12 * 3600_000, // regra de hook não muda de uma hora pra outra
  bloqueada: 12 * 3600_000,
  semPool: 20 * 60_000, // moeda na curva de origem pode migrar a qualquer momento
};

export const cliente = createPublicClient({
  chain: robinhoodChain,
  transport: http(process.env.ROBINHOOD_RPC || robinhoodChain.rpcUrls.default.http[0], {
    retryCount: 6,
    retryDelay: 900,
  }),
});

const chave = (moeda: string) => `negociavel:${moeda.toLowerCase()}`;

function valido(s: StatusGuardado | undefined): boolean {
  if (!s) return false;
  const idade = Date.now() - s.em;
  if (s.r.ok) return idade < VALIDADE_MS.ok;
  return idade < (s.r.motivo === "sem-pool" ? VALIDADE_MS.semPool : VALIDADE_MS.bloqueada);
}

export async function statusDasMoedas(moedas: string[]): Promise<Map<string, StatusGuardado>> {
  const lidos = await lerVariosDoCacheDoBanco<StatusGuardado>(moedas.map(chave)).catch(
    () => new Map<string, StatusGuardado>(),
  );
  const saida = new Map<string, StatusGuardado>();
  for (const m of moedas) {
    const s = lidos.get(chave(m));
    if (s) saida.set(m.toLowerCase(), s);
  }
  return saida;
}

/** Checa uma moeda agora e guarda o resultado (erro de rede não é guardado). */
export async function classificar(moeda: string, pool?: string | null, criadaEm?: number): Promise<Negociavel | null> {
  try {
    const r = await verificarNegociavel(cliente as never, moeda as Address, pool, criadaEm);
    await gravarNoCacheDoBanco(chave(moeda), { r, em: Date.now() } satisfies StatusGuardado);
    return r;
  } catch (e) {
    console.warn("[negociaveis] falhou", moeda, e instanceof Error ? e.message.split("\n")[0] : e);
    return null;
  }
}

let rodando = false;

/**
 * Classifica, em fila e devagar, as moedas da Robinhood ainda sem resultado
 * válido. Chamado depois de responder a vitrine (`after`), então ninguém
 * espera por isso.
 */
export async function classificarPendentes(tokens: TokenSummary[], limite = 6): Promise<void> {
  if (rodando) return;
  rodando = true;
  try {
    const daRede = tokens.filter((t) => t.chain === "robinhood" && t.dexId !== "pons");
    const status = await statusDasMoedas(daRede.map((t) => t.address));
    const pendentes = daRede.filter((t) => !valido(status.get(t.address.toLowerCase()))).slice(0, limite);
    for (const t of pendentes) {
      await classificar(t.address, t.pairAddress ?? null, t.createdAt);
    }
  } finally {
    rodando = false;
  }
}

/** Filtra a lista: moedas da Robinhood só entram se confirmadas como negociáveis. */
export async function soNegociaveis(tokens: TokenSummary[]): Promise<TokenSummary[]> {
  const daRede = tokens.filter((t) => t.chain === "robinhood");
  if (!daRede.length) return tokens;
  const status = await statusDasMoedas(daRede.map((t) => t.address));
  // Moeda na curva da Pons negocia pelo ChromaPons, não pela Uniswap: passa direto.
  return tokens.filter(
    (t) => t.chain !== "robinhood" || t.dexId === "pons" || status.get(t.address.toLowerCase())?.r.ok === true,
  );
}
