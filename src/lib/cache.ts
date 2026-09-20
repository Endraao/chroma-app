/**
 * Cache em memória com TTL, para não estourar o rate limit das APIs públicas.
 *
 * Dexscreener corta em ~300 req/min e a GoPlus é mais rígida ainda. Sem isto,
 * cada usuário abrindo a mesma página dispara uma requisição nova.
 *
 * Limitação honesta: é memória do processo. Com várias instâncias em produção,
 * cada uma terá o seu cache. Para valer de verdade, trocar por Redis.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();
/** Evita o mapa crescer sem limite num servidor de vida longa. */
const MAX_ENTRIES = 2000;

function prune() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
  if (store.size > MAX_ENTRIES) {
    const excess = store.size - MAX_ENTRIES;
    let i = 0;
    for (const key of store.keys()) {
      store.delete(key);
      if (++i >= excess) break;
    }
  }
}

/**
 * Busca no cache; se não houver (ou tiver vencido), roda `loader` e guarda.
 *
 * Requisições simultâneas para a mesma chave compartilham a MESMA promessa —
 * sem isso, dez usuários abrindo a página ao mesmo tempo disparariam dez
 * chamadas idênticas à API externa.
 */
const inflight = new Map<string, Promise<unknown>>();

export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;

  const promise = loader()
    .then((value) => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      if (store.size % 100 === 0) prune();
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

/** Último valor guardado, mesmo vencido. Serve de rede de segurança quando a API externa cai. */
export function stale<T>(key: string): T | null {
  return (store.get(key)?.value as T) ?? null;
}

export function putStale<T>(key: string, value: T, ttlMs: number) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}
