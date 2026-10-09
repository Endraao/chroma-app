/**
 * Cliente da Jupiter (agregador de DEX da Solana).
 *
 * Endpoint: `lite-api.jup.ag` — o antigo `quote-api.jup.ag` foi desligado.
 * O plano gratuito não pede chave, mas tem rate limit por IP; por isso as
 * chamadas passam pelo nosso servidor (o IP é um só e dá pra cachear).
 *
 * Decisão importante sobre a taxa: NÃO usamos o `platformFeeBps` da Jupiter.
 * Ele exigiria abrir uma conta no programa de referral da Jupiter e ainda
 * assim entregaria o valor num lugar só — sem como dividir com o afiliado.
 * Em vez disso, cobramos o 1% ANTES do swap, com instruções de transferência
 * nossas dentro da mesma transação. Ver `src/lib/solana-swap.ts`.
 */

const JUPITER = "https://lite-api.jup.ag/swap/v1";

export const SOL_MINT = "So11111111111111111111111111111111111111112";

export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: { swapInfo: { label?: string; ammKey: string } }[];
  [key: string]: unknown;
}

export interface QuoteParams {
  inputMint: string;
  outputMint: string;
  /** já líquido da taxa da Chroma, em unidades brutas (lamports / menor unidade) */
  amount: string;
  slippageBps: number;
}

export async function getQuote(params: QuoteParams): Promise<JupiterQuote> {
  const url = new URL(`${JUPITER}/quote`);
  url.searchParams.set("inputMint", params.inputMint);
  url.searchParams.set("outputMint", params.outputMint);
  url.searchParams.set("amount", params.amount);
  url.searchParams.set("slippageBps", String(params.slippageBps));
  // Rotas com token intermediário exótico têm muito mais chance de falhar.
  url.searchParams.set("restrictIntermediateTokens", "true");

  // A Jupiter às vezes cai por segundos (503/502/429 com página HTML): tenta de
  // novo sozinho antes de mostrar erro pra pessoa.
  let status = 0;
  let body = "";
  for (const espera of [0, 500, 1500]) {
    if (espera) await new Promise((r) => setTimeout(r, espera));
    const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
    status = res.status;
    body = await res.text();
    if (res.ok) return JSON.parse(body) as JupiterQuote;
    if (status !== 429 && status < 500) break;
  }
  if (status === 429 || status >= 500) {
    throw new Error("Jupiter (the price router) is busy right now. Try again in a few seconds.");
  }
  throw new Error(`Jupiter /quote ${status}: ${body.trimStart().startsWith("<") ? "" : body.slice(0, 200)}`);
}

export interface SwapBuildResult {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
}

export async function buildSwapTransaction(
  quote: JupiterQuote,
  userPublicKey: string,
): Promise<SwapBuildResult> {
  const res = await fetch(`${JUPITER}/swap`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey,
      // Embrulha e desembrulha SOL sozinho — sem isso o usuário teria que ter WSOL.
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      // Meme coin em momento de volume exige priority fee ou a tx não entra.
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: 4_000_000,
          priorityLevel: "high",
        },
      },
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Jupiter /swap ${res.status}: ${body.slice(0, 200)}`);
  }
  return JSON.parse(body) as SwapBuildResult;
}

/*
 * PELO NAVEGADOR PRIMEIRO (09/10/2026). O plano grátis da Jupiter limita por
 * IP; passando pelo nosso servidor, TODOS os visitantes saem pelo mesmo IP da
 * Vercel (dividido ainda com outros sites) e a cota estoura — "the price
 * router is busy". Do navegador, cada pessoa usa a própria cota. O servidor
 * (/api/swap) fica de reserva se o pedido direto falhar.
 */
export async function cotar(params: QuoteParams): Promise<JupiterQuote> {
  try {
    return await getQuote(params);
  } catch (direto) {
    const q = new URLSearchParams({
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amount: params.amount,
      slippageBps: String(params.slippageBps),
    });
    const res = await fetch(`/api/swap?${q}`, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error ?? (direto instanceof Error ? direto.message : "sem rota disponível"));
    return data as JupiterQuote;
  }
}

export async function montarSwap(quote: JupiterQuote, userPublicKey: string): Promise<SwapBuildResult> {
  try {
    return await buildSwapTransaction(quote, userPublicKey);
  } catch (direto) {
    const res = await fetch("/api/swap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quote, userPublicKey }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error ?? (direto instanceof Error ? direto.message : "falha ao montar a transação"));
    return data as SwapBuildResult;
  }
}

/* ------------------------------------------------------------------ */
/* Metadados do token                                                  */
/* ------------------------------------------------------------------ */

const JUPITER_TOKENS = "https://lite-api.jup.ag/tokens/v2";

export interface JupiterTokenMeta {
  id: string;
  name: string;
  symbol: string;
  icon?: string;
  decimals: number;
  /** TokenkegQ… (SPL clássico) ou TokenzQd… (Token-2022) */
  tokenProgram: string;
  dev?: string;
  holderCount?: number;
  /** Auditoria da Jupiter: % do top 10 já sem cofres de pool (bate com a fomo). */
  audit?: { topHoldersPercentage?: number };
  /** Primeira pool da moeda — a hora do lançamento. */
  firstPool?: { createdAt?: string };
  /** Onde a moeda nasceu: "pump.fun", "met-dbc", "stonkfun", "letsbonk.fun"… */
  launchpad?: string;
  /** Na curva da Meteora (met-dbc): a config — diz QUAL launchpad (a da Chroma, por ex.). */
  partnerConfig?: string;
  usdPrice?: number;
  mcap?: number;
  liquidity?: number;
  twitter?: string;
  telegram?: string;
  website?: string;
}

/**
 * Decimais, token program e holders de um mint.
 *
 * Por que não ler direto da rede com `getMint()`: o RPC público da Solana
 * responde 403 para requisições vindas do browser. Esta rota resolve isso
 * sem obrigar o usuário a ter um RPC dedicado só para abrir a página —
 * o RPC dedicado continua sendo necessário para ENVIAR a transação.
 */
export async function getTokenMeta(mint: string): Promise<JupiterTokenMeta | null> {
  const res = await fetch(`${JUPITER_TOKENS}/search?query=${encodeURIComponent(mint)}`, {
    headers: { accept: "application/json" },
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Jupiter /tokens ${res.status}`);

  const list = (await res.json()) as JupiterTokenMeta[];
  return list.find((t) => t.id === mint) ?? null;
}
