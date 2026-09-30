import "server-only";

import { fornecimentoDaRede } from "./fornecimento";
import { cached, putStale, stale } from "./cache";
import { gravarNoCacheDoBanco, lerDoCacheDoBanco } from "./db";
import { CHAINS } from "./web3";
import type { Candle, ChainId, TokenSummary } from "./types";

/**
 * Dados de mercado reais.
 *
 * - Dexscreener  → preço, liquidez, volume, market cap, pares (grátis, sem chave)
 * - GeckoTerminal → velas OHLCV (grátis, sem chave)
 *
 * Ambas cortam por rate limit, então tudo passa pelo cache de `./cache`.
 * Este arquivo é `server-only`: as chaves e o cache não vão pro browser.
 */

const DEXSCREENER = "https://api.dexscreener.com";
const GECKOTERMINAL = "https://api.geckoterminal.com/api/v2";

/** TTLs curtos o bastante pra parecer ao vivo, longos o bastante pra não tomar 429. */
const TTL = {
  price: 3_000,
  token: 10_000,
  list: 60_000,
  candles: 20_000,
  /*
   * Negócios: 30s.
   *
   * A tabela de traders recalcula posição e lucro de centenas de carteiras a
   * cada leitura. Buscar de poucos em poucos segundos gastaria o limite da API
   * pra mexer na terceira casa decimal de quem está em décimo lugar.
   */
  trades: 30_000,
} as const;

/* ------------------------------------------------------------------ */
/* Tradução de nomes de rede                                           */
/* ------------------------------------------------------------------ */

/**
 * Dexscreener e GeckoTerminal usam identificadores próprios pra cada rede.
 * Os dois mapas saem de CHAINS, pra existir um lugar só a mudar quando
 * entrar uma rede nova.
 */
const DEXSCREENER_TO_CHAIN: Record<string, ChainId> = Object.fromEntries(
  (Object.entries(CHAINS) as [ChainId, (typeof CHAINS)[ChainId]][]).map(([id, meta]) => [
    meta.dexscreener,
    id,
  ]),
);

const CHAIN_TO_GECKO: Record<ChainId, string> = Object.fromEntries(
  (Object.entries(CHAINS) as [ChainId, (typeof CHAINS)[ChainId]][]).map(([id, meta]) => [
    id,
    meta.gecko,
  ]),
) as Record<ChainId, string>;

export function chainFromDexscreener(id: string): ChainId | null {
  return DEXSCREENER_TO_CHAIN[id] ?? null;
}

/* ------------------------------------------------------------------ */
/* Tipos crus da Dexscreener (só o que usamos)                         */
/* ------------------------------------------------------------------ */

interface DexPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; symbol: string };
  priceUsd?: string;
  /** preço na moeda do par (ex.: HOLT por USDG) */
  priceNative?: string;
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  volume?: { m5?: number; h1?: number; h6?: number; h24?: number };
  liquidity?: { usd?: number };
  marketCap?: number;
  fdv?: number;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    websites?: { url?: string; label?: string }[];
    socials?: { url?: string; type?: string; platform?: string }[];
  };
}

/**
 * A GeckoTerminal corta em ~30 requisições por minuto, e o site inteiro bebe
 * dela: a vitrine da home faz várias leituras, cada página de moeda pede velas
 * e negócios, e a tabela de traders recarrega sozinha.
 *
 * Sem controle, um punhado de abas abertas estoura o limite e a fonte passa a
 * responder 429 para TUDO — inclusive para quem só abriu uma página. Foi o que
 * derrubou de uma vez o gráfico, a tabela de traders e o painel de posição.
 *
 * Duas requisições por segundo deixam folga sobre o limite anunciado. Quem
 * chega além disso espera na fila em vez de levar 429: um gráfico que demora
 * meio segundo a mais é melhor que um gráfico que não carrega.
 */
const INTERVALO_MINIMO_MS = 500;
let ultimaChamada = 0;
let filaDaFonte: Promise<unknown> = Promise.resolve();

function naFila<T>(tarefa: () => Promise<T>): Promise<T> {
  const proxima = filaDaFonte.then(async () => {
    const agora = Date.now();
    const espera = Math.max(0, ultimaChamada + INTERVALO_MINIMO_MS - agora);
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    ultimaChamada = Date.now();
    return tarefa();
  });

  /*
   * A fila não pode morrer quando uma tarefa falha: se `filaDaFonte` virasse
   * uma promessa rejeitada, toda chamada seguinte rejeitaria junto e a fonte
   * ficaria inacessível até reiniciar o servidor.
   */
  filaDaFonte = proxima.catch(() => undefined);
  return proxima;
}

/** Espera crescente entre tentativas, para não insistir no mesmo instante. */
/*
 * Na Vercel o IP de saída é dividido com milhares de outros sites, e a
 * GeckoTerminal limita por IP: 429 lá é a regra, não a exceção (28/09/2026 —
 * a vitrine da Robinhood caía pra lista de exemplo). Esperas curtas não
 * adiantavam; estas dão tempo de a janela do limite virar.
 */
const ESPERAS_APOS_429 = [1500, 4000, 8000];

async function getJson<T>(url: string, revalidateSeconds = 10): Promise<T> {
  const daGecko = url.startsWith(GECKOTERMINAL);

  const buscar = async () => {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      next: { revalidate: revalidateSeconds },
    });
    if (!res.ok) {
      const erro = new Error(`${url} respondeu ${res.status}`);
      (erro as Error & { status?: number }).status = res.status;
      throw erro;
    }
    return (await res.json()) as T;
  };

  if (!daGecko) return buscar();

  /*
   * 429 é temporário por definição: quer dizer "agora não, tente daqui a
   * pouco". Desistir na primeira recusa transformava um soluço de segundos em
   * tela vazia — enquanto duas tentativas espaçadas resolvem a maioria.
   */
  for (let tentativa = 0; ; tentativa++) {
    try {
      return await naFila(buscar);
    } catch (erro) {
      const status = (erro as Error & { status?: number }).status;
      if (status !== 429 || tentativa >= ESPERAS_APOS_429.length) throw erro;
      await new Promise((r) => setTimeout(r, ESPERAS_APOS_429[tentativa]));
    }
  }
}

/**
 * Site e redes sociais que o projeto declarou, se houver.
 *
 * A fonte identifica a rede social às vezes por `type`, às vezes por
 * `platform`, e o rótulo varia de caixa. Em vez de confiar nesses campos, o
 * reconhecimento é pela URL: quem manda é o domínio, que não muda de nome.
 *
 * `x.com` e `twitter.com` são a mesma coisa e as duas formas circulam.
 */
function linksDoProjeto(info: DexPair["info"]): {
  website?: string;
  twitter?: string;
  telegram?: string;
} {
  const urls = [
    ...(info?.websites ?? []).map((w) => w?.url),
    ...(info?.socials ?? []).map((s) => s?.url),
  ].filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u));

  const acha = (padrao: RegExp) => urls.find((u) => padrao.test(u));

  const twitter = acha(/(^|\/\/)([^/]*\.)?(twitter|x)\.com\//i);
  const telegram = acha(/(^|\/\/)([^/]*\.)?t\.me\//i);

  /* O site é a primeira URL que não é rede social conhecida. */
  const website = urls.find(
    (u) => u !== twitter && u !== telegram && !/(discord|t\.me|twitter\.com|x\.com)/i.test(u),
  );

  return { website, twitter, telegram };
}

/** Entre vários pares do mesmo token, o que vale é o de maior liquidez. */
function bestPair(pairs: DexPair[]): DexPair | null {
  const valid = pairs.filter((p) => DEXSCREENER_TO_CHAIN[p.chainId] && Number(p.priceUsd) > 0);
  if (!valid.length) return null;
  return valid.reduce((best, p) =>
    (p.liquidity?.usd ?? 0) > (best.liquidity?.usd ?? 0) ? p : best,
  );
}

function toSummary(pair: DexPair): TokenSummary {
  return {
    address: pair.baseToken.address,
    chain: DEXSCREENER_TO_CHAIN[pair.chainId] ?? "solana",
    name: pair.baseToken.name,
    symbol: pair.baseToken.symbol,
    imageUrl: pair.info?.imageUrl,
    description: undefined,
    ...linksDoProjeto(pair.info),
    priceUsd: Number(pair.priceUsd ?? 0),
    change24h: pair.priceChange?.h24 ?? 0,
    priceChanges: pair.priceChange,
    marketCapUsd: pair.marketCap ?? pair.fdv ?? 0,
    liquidityUsd: pair.liquidity?.usd ?? 0,
    volume24hUsd: pair.volume?.h24 ?? 0,
    holders: 0, // Dexscreener não expõe; o painel de segurança traz quando dá.
    createdAt: pair.pairCreatedAt ?? Date.now(),
    bondingProgress: null, // token já listado em DEX, não está em curva
    creator: "",
    pairAddress: pair.pairAddress,
    dexId: pair.dexId,
    quoteAddress: pair.quoteToken?.address,
    quoteSymbol: pair.quoteToken?.symbol,
    /*
     * A fonte dá o preço em dólar e o preço na moeda do par; a razão entre os
     * dois é quanto vale a moeda do par. Sai de graça, sem uma segunda
     * consulta que pudesse discordar da primeira.
     */
    quotePriceUsd:
      Number(pair.priceNative) > 0 ? Number(pair.priceUsd) / Number(pair.priceNative) : undefined,
  };
}

/**
 * Soma volume e liquidez de TODAS as pools do token.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO EXISTE
 * ---------------------------------------------------------------------------
 * Antes o resumo saía inteiro da pool de maior liquidez, e os números dela
 * eram apresentados como se fossem os do token. Comparando a mesma moeda no
 * mesmo instante com um terminal concorrente:
 *
 *     STONK       Chroma        soma real das 5 pools
 *     volume 24h  $11,74M       $42,54M
 *     liquidez    $6,51M        $12,82M
 *
 * Mostrávamos 27% do volume. Numa tela onde a pessoa decide se a moeda tem
 * movimento, isso não é imprecisão — é a resposta errada.
 *
 * ---------------------------------------------------------------------------
 * O QUE SOMA E O QUE NÃO SOMA
 * ---------------------------------------------------------------------------
 * Volume e liquidez SOMAM: são quantidades, e a moeda negocia em todas as
 * pools ao mesmo tempo.
 *
 * Preço, capitalização e variação NÃO somam — somar preço de cinco pools daria
 * cinco vezes o valor da moeda. Esses continuam vindo da pool de maior
 * liquidez, que é a referência mais confiável: a mais funda é a mais difícil
 * de empurrar.
 *
 * Só entram pools da MESMA rede. O mesmo símbolo existe em várias blockchains,
 * e somar o volume de um homônimo em outra rede inventaria movimento que não
 * existe aqui.
 */
function somarPools(base: TokenSummary, pares: DexPair[]): TokenSummary {
  const daRede = pares.filter(
    (p) => DEXSCREENER_TO_CHAIN[p.chainId] === base.chain && Number(p.priceUsd) > 0,
  );
  if (daRede.length <= 1) return base;

  return {
    ...base,
    volume24hUsd: daRede.reduce((soma, p) => soma + (p.volume?.h24 ?? 0), 0),
    liquidityUsd: daRede.reduce((soma, p) => soma + (p.liquidity?.usd ?? 0), 0),
  };
}

/**
 * Recalcula a capitalização com o fornecimento LIDO DA REDE.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A FONTE DE MERCADO NÃO SERVE AQUI
 * ---------------------------------------------------------------------------
 * A Dexscreener manda dois tamanhos e nenhum é o de hoje. Medido na STONK, com
 * o preço a $0,3264:
 *
 *     fdv        supõe 1.000,1M tokens (o que foi cunhado lá atrás)
 *     marketCap  supõe   876,8M tokens (estimativa velha)
 *     a rede diz         827,0M tokens
 *
 * Mostrávamos 50 milhões de tokens que já foram queimados — 6% de
 * capitalização a mais. Contra o terminal de referência, com o MESMO preço na
 * tela: eles $270,7M, nós $286,16M. A diferença era inteira essa.
 *
 * Capitalização é o número que a pessoa usa pra decidir se a moeda é grande ou
 * pequena. Errar 6% pra cima faz a moeda parecer maior do que é.
 *
 * O preço continua vindo da pool: ele é de mercado. O que muda é só por quanto
 * ele é multiplicado.
 */
export async function corrigirCapitalizacao(resumos: TokenSummary[]): Promise<TokenSummary[]> {
  const solanas = resumos.filter((t) => t.chain === "solana").map((t) => t.address);
  if (solanas.length === 0) return resumos;

  const porMint = await fornecimentoDaRede(solanas);
  if (porMint.size === 0) return resumos;

  return resumos.map((t) => {
    const fornecimento = porMint.get(t.address);
    /* Sem resposta da rede fica o número da fonte: impreciso, mas existe. */
    if (!fornecimento || t.priceUsd <= 0) return t;
    return { ...t, marketCapUsd: t.priceUsd * fornecimento };
  });
}

/* ------------------------------------------------------------------ */
/* Token individual                                                    */
/* ------------------------------------------------------------------ */

export async function fetchToken(address: string): Promise<TokenSummary | null> {
  const key = `token:${address}`;
  try {
    return await cached(key, TTL.token, async () => {
      const data = await getJson<{ pairs: DexPair[] | null }>(
        `${DEXSCREENER}/latest/dex/tokens/${address}`,
      );
      const pares = data.pairs ?? [];
      const pair = bestPair(pares);
      if (!pair) throw new Error("token sem par listado");

      const resumo = somarPools(toSummary(pair), pares);
      const [comFornecimento] = await corrigirCapitalizacao([resumo]);
      return comFornecimento;
    });
  } catch (error) {
    console.warn("[market] fetchToken falhou:", error);
    // Se a API caiu mas já vimos esse token antes, devolve o último valor conhecido.
    return stale<TokenSummary>(key);
  }
}

/** Só o preço, com TTL bem curto — é o que alimenta o tick do gráfico. */
export async function fetchPrice(address: string): Promise<number | null> {
  const key = `price:${address}`;
  try {
    return await cached(key, TTL.price, async () => {
      /*
       * Solana: Jupiter primeiro. Nas moedas da curva a DexScreener calcula o
       * preço uns 3% abaixo do real, e o gráfico desenhava velas vermelhas
       * sem ninguém ter negociado (a vela ao vivo "caía" para esse número).
       */
      if (!address.startsWith("0x")) {
        try {
          const r = await fetch(`https://lite-api.jup.ag/price/v3?ids=${address}`, {
            cache: "no-store",
            signal: AbortSignal.timeout(4_000),
          });
          const p = Number(((await r.json()) as Record<string, { usdPrice?: number }>)[address]?.usdPrice);
          if (Number.isFinite(p) && p > 0) return p;
        } catch {
          /* cai na DexScreener */
        }
      }
      const data = await getJson<{ pairs: DexPair[] | null }>(
        `${DEXSCREENER}/latest/dex/tokens/${address}`,
        3,
      );
      const pair = bestPair(data.pairs ?? []);
      if (!pair) throw new Error("sem par");
      return Number(pair.priceUsd);
    });
  } catch {
    return stale<number>(key);
  }
}

/* ------------------------------------------------------------------ */
/* Listagem                                                            */
/* ------------------------------------------------------------------ */

interface TokenProfile {
  chainId: string;
  tokenAddress: string;
  icon?: string;
  description?: string;
}

/**
 * Vitrine da home: os tokens com perfil mais recente na Dexscreener.
 *
 * Não é "os que mais subiram" — é o que existe de graça e sem chave. Um
 * ranking de verdade (novos lançamentos, maiores altas) exige indexador próprio
 * ou API paga. O `sort` abaixo reordena o que veio, não busca no universo todo.
 */
export async function fetchTokenList(limit = 24): Promise<TokenSummary[]> {
  const key = `list:${limit}`;
  try {
    return await cached(key, TTL.list, async () => {
      const profiles = await getJson<TokenProfile[]>(`${DEXSCREENER}/token-profiles/latest/v1`, 60);

      const wanted = profiles.filter((p) => DEXSCREENER_TO_CHAIN[p.chainId]).slice(0, limit);

      // A Dexscreener aceita até 30 endereços por chamada, separados por vírgula.
      const byChain = new Map<string, TokenProfile[]>();
      for (const p of wanted) {
        const bucket = byChain.get(p.chainId) ?? [];
        bucket.push(p);
        byChain.set(p.chainId, bucket);
      }

      const results = await Promise.all(
        [...byChain.entries()].map(async ([chainId, group]) => {
          const addresses = group.map((g) => g.tokenAddress).join(",");
          try {
            const data = await getJson<{ pairs: DexPair[] | null }>(
              `${DEXSCREENER}/latest/dex/tokens/${addresses}`,
              60,
            );
            const pairs = data.pairs ?? [];

            /*
             * Um token pode ter vários pares. O MELHOR define preço e
             * capitalização; TODOS somam volume e liquidez — ver `somarPools`
             * pro porquê. Sem isso a vitrine mostrava uma fração do movimento
             * real de cada moeda.
             */
            const perToken = new Map<string, DexPair>();
            const todosPorToken = new Map<string, DexPair[]>();
            for (const pair of pairs) {
              if (DEXSCREENER_TO_CHAIN[pair.chainId] !== DEXSCREENER_TO_CHAIN[chainId]) continue;
              const addr = pair.baseToken.address;

              const lista = todosPorToken.get(addr) ?? [];
              lista.push(pair);
              todosPorToken.set(addr, lista);

              const current = perToken.get(addr);
              if (!current || (pair.liquidity?.usd ?? 0) > (current.liquidity?.usd ?? 0)) {
                perToken.set(addr, pair);
              }
            }

            return [...perToken.values()].map((pair) => {
              const summary = somarPools(
                toSummary(pair),
                todosPorToken.get(pair.baseToken.address) ?? [pair],
              );
              const profile = group.find(
                (g) => g.tokenAddress.toLowerCase() === summary.address.toLowerCase(),
              );
              return {
                ...summary,
                imageUrl: summary.imageUrl ?? profile?.icon,
                description: profile?.description?.split("\n")[0],
              };
            });
          } catch (error) {
            console.warn(`[market] lista da rede ${chainId} falhou:`, error);
            return [];
          }
        }),
      );

      const flat = results.flat().filter((t) => t.liquidityUsd > 1_000);
      if (!flat.length) throw new Error("nenhum token utilizável na resposta");

      putStale(key, flat, TTL.list);
      return flat;
    });
  } catch (error) {
    console.warn("[market] fetchTokenList falhou:", error);
    return stale<TokenSummary[]>(key) ?? [];
  }
}

/* ------------------------------------------------------------------ */
/* Velas                                                               */
/* ------------------------------------------------------------------ */

/** Timeframes que a GeckoTerminal aceita, traduzidos dos nossos rótulos. */
const GECKO_TIMEFRAME: Record<string, { path: string; aggregate: number; seconds: number }> = {
  "1m": { path: "minute", aggregate: 1, seconds: 60 },
  "5m": { path: "minute", aggregate: 5, seconds: 300 },
  "15m": { path: "minute", aggregate: 15, seconds: 900 },
  "1h": { path: "hour", aggregate: 1, seconds: 3600 },
  "4h": { path: "hour", aggregate: 4, seconds: 14400 },
  "1d": { path: "day", aggregate: 1, seconds: 86400 },
};

export const CANDLE_INTERVALS = Object.keys(GECKO_TIMEFRAME);

export function intervalSeconds(interval: string): number {
  return GECKO_TIMEFRAME[interval]?.seconds ?? 60;
}

export async function fetchCandles(address: string, interval: string, limit = 300): Promise<Candle[]> {
  const tf = GECKO_TIMEFRAME[interval];
  if (!tf) throw new Error(`timeframe inválido: ${interval}`);

  const token = await fetchToken(address);
  if (!token?.pairAddress) throw new Error("token sem par conhecido");

  const network = CHAIN_TO_GECKO[token.chain];
  if (!network) throw new Error(`GeckoTerminal não cobre a rede ${token.chain}`);

  const key = `candles:${network}:${token.pairAddress}:${interval}`;
  /*
   * REDE DE SEGURANÇA CONTRA O 429.
   * -------------------------------------------------------------------------
   * A GeckoTerminal corta em poucas dezenas de requisições por minuto, e o
   * site inteiro bebe da mesma fonte: a vitrine da home, o cabeçalho da moeda,
   * a tabela de negócios e estas velas. Numa rajada ela passa a responder 429
   * para tudo — inclusive para quem só abriu uma página.
   *
   * Sem isto o 429 subia como exceção, a rota devolvia 502, e o gráfico caía
   * num gerador de velas SINTÉTICAS. O que aparecia na tela eram ondas
   * perfeitas de `Math.sin()`, em qualquer moeda, porque nenhuma conseguia
   * dados — e nada além da cor de um ícone dizia que aquilo era inventado.
   *
   * Vela de dois minutos atrás é informação velha; vela inventada é informação
   * falsa. As duas coisas não se comparam, e só uma delas pode ir pra tela.
   *
   * A cópia de resguardo vive meia hora, bem mais que o TTL normal: ela não
   * serve pra poupar requisição, serve pra atravessar o período em que a fonte
   * está recusando.
   */
  const resguardo = `${key}:ultimo`;
  const RESGUARDO_MS = 30 * 60_000;

  try {
    return await cached(key, TTL.candles, async () => {
      /*
       * `token=<endereço>` diz QUAL lado do par queremos precificar.
       *
       * Sem isso a GeckoTerminal escolhe sozinha, e ela escolhe o "base" do
       * pool — que muitas vezes é o OUTRO token. O gráfico do Gamestonk vinha
       * mostrando $22,85 por token, que é o preço do GMEx do outro lado do par,
       * enquanto o preço real era $0,0₅3027. As velas e o cabeçalho discordavam
       * por um fator de milhões e nada acusava.
       */
      const url =
        `${GECKOTERMINAL}/networks/${network}/pools/${token.pairAddress}/ohlcv/${tf.path}` +
        `?aggregate=${tf.aggregate}&limit=${limit}&currency=usd&token=${address}`;

      const data = await getJson<{
        data: { attributes: { ohlcv_list: [number, number, number, number, number, number][] } };
      }>(url, 20);

      const list = data.data?.attributes?.ohlcv_list ?? [];

      // A GeckoTerminal devolve do mais recente pro mais antigo; o gráfico quer o contrário.
      const velas = list
        .map(([time, open, high, low, close, volume]) => ({ time, open, high, low, close, volume }))
        .sort((a, b) => a.time - b.time);

      if (velas.length) putStale(resguardo, velas, RESGUARDO_MS);
      return velas;
    });
  } catch (erro) {
    const ultimas = stale<Candle[]>(resguardo);
    if (ultimas?.length) {
      console.warn("[market] velas da fonte falharam, servindo a última cópia:", erro);
      return ultimas;
    }
    throw erro;
  }
}

/* ------------------------------------------------------------------ */
/* Vitrine ampla: os feeds de pool da GeckoTerminal                    */
/* ------------------------------------------------------------------ */

/**
 * As três listas de pool que a GeckoTerminal serve de graça.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO EXISTE
 * ---------------------------------------------------------------------------
 * A vitrine vinha inteira do `token-profiles/latest/v1` da Dexscreener, que
 * NÃO é uma lista de lançamentos — é a lista de quem foi lá preencher o perfil
 * do projeto. Dava treze moedas, e treze era o teto: não ia crescer com o
 * tráfego do site porque o limite era da fonte, não da nossa audiência.
 *
 * Estes três endpoints são o fluxo de verdade, sem chave e sem assinatura:
 * pool recém-criada, pool em alta e pool grande. Paginando, saem uns 120 pools
 * por rede em vez de treze.
 *
 * ---------------------------------------------------------------------------
 * O QUE ELES NÃO COBREM
 * ---------------------------------------------------------------------------
 * A Robinhood Chain devolve lista VAZIA nos três — ela nem aparece no catálogo
 * de redes da GeckoTerminal, embora responda normalmente quando se pede um
 * pool específico (é assim que o gráfico dela funciona). Então a descoberta na
 * Robinhood continua vindo da Dexscreener, que indexa a rede. As duas fontes
 * se somam em `tokens.ts`.
 */
export type FeedDePool = "new_pools" | "trending_pools" | "pools";

/**
 * Quantas páginas puxar de cada feed.
 *
 * Cada página é UMA requisição, e o limite gratuito é de ~30 por minuto pelo
 * IP do servidor — compartilhado por todos os visitantes ao mesmo tempo. Três
 * feeds × 2 páginas = 6 requisições por atualização, e o cache de 60s faz uma
 * atualização servir todo mundo. Subir isto pra 5 páginas triplicaria o gasto
 * pra trazer a cauda da lista, que é justamente a parte que ninguém olha.
 */
const PAGINAS_POR_FEED = 2;

/**
 * Moedas de cotação: quando uma delas é o token "base" do pool, os lados estão
 * invertidos e quem interessa é o outro.
 *
 * É o mesmo cuidado que a leitura de negócios já toma. Sem ele, um par onde o
 * SOL é o base entraria na vitrine como se o SOL fosse a meme coin — com o
 * preço, a variação e a capitalização do SOL.
 */
/**
 * As moedas contra as quais se cota, e que NÃO são a moeda da pool.
 *
 * ---------------------------------------------------------------------------
 * A LISTA PRECISA COBRIR TODAS AS REDES, E NÃO COBRIA
 * ---------------------------------------------------------------------------
 * Só havia entradas da Solana aqui. Na Robinhood Chain, onde se cota contra
 * USDG e WETH, nenhuma delas era reconhecida — então num par USDG/PONS em que
 * a fonte põe a USDG como "base", o site listava a USDG como se fosse a moeda
 * negociável, carregando o par do PONS junto.
 *
 * O efeito visível era clicar em "Global Dollar USDG" na vitrine e abrir a
 * página do PONS, com a arte e o gráfico da outra moeda. Trocar a moeda que a
 * pessoa achou que ia comprar é dos piores defeitos possíveis num terminal.
 *
 * Endereços conferidos no feed de pools da própria rede.
 */
const COTACOES = new Set(
  [
    /* Solana */
    "So11111111111111111111111111111111111111112", // SOL
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
    "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v", // jupSOL
    "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", // mSOL

    /* Robinhood Chain */
    "0x5fc5360d0400a0fd4f2af552add042d716f1d168", // USDG
    "0x0bd7d308f8e1639fab988df18a8011f41eacad73", // WETH
    "0x0000000000000000000000000000000000000000", // ETH nativo
  ].map((m) => m.toLowerCase()),
);

interface PoolGecko {
  attributes: {
    address: string;
    name: string;
    pool_created_at: string;
    base_token_price_usd: string | null;
    quote_token_price_usd: string | null;
    fdv_usd: string | null;
    market_cap_usd: string | null;
    reserve_in_usd: string | null;
    price_change_percentage: Record<string, string | null>;
    volume_usd: Record<string, string | null>;
  };
  relationships: {
    base_token: { data: { id: string } };
    quote_token: { data: { id: string } };
    dex?: { data: { id: string } };
  };
}

interface TokenGecko {
  id: string;
  attributes: { address: string; name: string; symbol: string; image_url: string | null };
}

export async function fetchPoolFeed(chain: ChainId, feed: FeedDePool): Promise<TokenSummary[]> {
  const network = CHAIN_TO_GECKO[chain];
  if (!network) return [];

  const key = `feed:${network}:${feed}`;

  try {
    return await cached(key, TTL.list, async () => {
      /*
       * PÁGINA QUE FALHOU NÃO VIRA LISTA VAZIA.
       *
       * A GeckoTerminal aceita ~30 consultas por minuto e a home pede 12 de
       * uma vez. Página recusada voltava `[]`, e esse vazio era guardado como
       * se fosse a lista — em 28/09/2026 a vitrine da Robinhood caiu de 86
       * moedas pra 4. Agora cada página lembra a última versão boa e a usa
       * quando a fonte recusa.
       */
      const paginas = await Promise.all(
        Array.from({ length: PAGINAS_POR_FEED }, async (_, i) => {
          const chaveBoa = `${key}:pagina-boa:${i}`;
          try {
            const pagina = await getJson<{ data: PoolGecko[]; included?: TokenGecko[] }>(
              `${GECKOTERMINAL}/networks/${network}/${feed}` +
                `?include=base_token,quote_token&page=${i + 1}`,
              60,
            );
            if (pagina.data?.length) {
              putStale(chaveBoa, pagina, 6 * 60 * 60_000);
              /* No banco também: servidor recém-ligado não tem memória. */
              void gravarNoCacheDoBanco(chaveBoa, pagina).catch(() => {});
            }
            return pagina;
          } catch {
            type Pagina = { data: PoolGecko[]; included?: TokenGecko[] };
            return (
              stale<Pagina>(chaveBoa) ??
              (await lerDoCacheDoBanco<Pagina>(chaveBoa).catch(() => null)) ?? {
                data: [] as PoolGecko[],
                included: [] as TokenGecko[],
              }
            );
          }
        }),
      );

      /* Os tokens vêm num bloco separado do JSON, referenciados por id. */
      const porId = new Map<string, TokenGecko["attributes"]>();
      for (const p of paginas) {
        for (const t of p.included ?? []) porId.set(t.id, t.attributes);
      }

      const saida: TokenSummary[] = [];
      for (const p of paginas) {
        for (const pool of p.data) {
          const resumo = poolParaResumo(pool, porId, chain);
          if (resumo) saida.push(resumo);
        }
      }
      return saida;
    });
  } catch (error) {
    console.warn(`[market] feed ${feed} de ${network} falhou:`, error);
    return [];
  }
}

function poolParaResumo(
  pool: PoolGecko,
  porId: Map<string, TokenGecko["attributes"]>,
  chain: ChainId,
): TokenSummary | null {
  const a = pool.attributes;

  const idBase = pool.relationships?.base_token?.data?.id;
  const idCotacao = pool.relationships?.quote_token?.data?.id;
  if (!idBase || !idCotacao) return null;

  const base = porId.get(idBase);
  const cotacao = porId.get(idCotacao);
  if (!base) return null;

  /* Se o "base" for uma moeda de cotação, os lados estão trocados. */
  const invertido = COTACOES.has(base.address.toLowerCase());
  const moeda = invertido ? cotacao : base;
  const outro = invertido ? base : cotacao;
  if (!moeda) return null;

  /*
   * Par de cotação contra cotação não entra na vitrine.
   *
   * O feed das maiores pools é liderado por SOL/USDC, e ali os DOIS lados são
   * moeda de cotação — a regra de cima trocava os lados e a USDC subia pra
   * vitrine como se fosse um lançamento, com $1,47 bilhão de capitalização, em
   * primeiro lugar na lista de "quentes". Numa launchpad de meme coin isso não
   * é só fora de contexto: é a única linha da tela que um iniciante lê como
   * "olha o que dá pra ganhar aqui".
   */
  if (COTACOES.has(moeda.address.toLowerCase())) return null;

  const preco = Number(invertido ? a.quote_token_price_usd : a.base_token_price_usd);
  if (!Number.isFinite(preco) || preco <= 0) return null;

  const precoDoOutro = Number(invertido ? a.base_token_price_usd : a.quote_token_price_usd);

  /*
   * Capitalização: `market_cap_usd` costuma vir nulo em moeda nova, porque
   * ninguém apurou o fornecimento circulante ainda. O FDV é o substituto
   * honesto — supõe tudo em circulação, que numa meme coin é quase sempre o
   * caso, e é o mesmo número que a Dexscreener entrega no lugar.
   */
  const capitalizacao = Number(a.market_cap_usd) || Number(a.fdv_usd) || 0;

  const pct = (janela: string) => {
    const v = Number(a.price_change_percentage?.[janela]);
    return Number.isFinite(v) ? v : 0;
  };

  return {
    address: moeda.address,
    chain,
    name: moeda.name || moeda.symbol,
    symbol: moeda.symbol,
    /*
     * Sem imagem na fonte, na Robinhood: a arte costuma estar no próprio
     * contrato (`logo()` das moedas da PONS) — ver /api/logo.
     */
    imageUrl:
      moeda.image_url ?? (chain === "robinhood" ? `/api/logo/${moeda.address}` : undefined),
    description: undefined,
    priceUsd: preco,
    change24h: pct("h24"),
    priceChanges: { m5: pct("m5"), h1: pct("h1"), h6: pct("h6"), h24: pct("h24") },
    marketCapUsd: capitalizacao,
    liquidityUsd: Number(a.reserve_in_usd) || 0,
    volume24hUsd: Number(a.volume_usd?.h24) || 0,
    holders: 0,
    createdAt: Date.parse(a.pool_created_at) || Date.now(),
    /* Veio de uma DEX: já está fora de qualquer curva. */
    bondingProgress: null,
    creator: "",
    pairAddress: a.address,
    dexId: pool.relationships?.dex?.data?.id,
    quoteAddress: outro?.address,
    quoteSymbol: outro?.symbol,
    quotePriceUsd: Number.isFinite(precoDoOutro) && precoDoOutro > 0 ? precoDoOutro : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Negócios do pool                                                    */
/* ------------------------------------------------------------------ */

/** Um negócio cru, já normalizado do ponto de vista do NOSSO token. */
export interface NegocioDoPool {
  carteira: string;
  /** do ponto de vista da carteira: ela recebeu ou entregou o token? */
  lado: "compra" | "venda";
  /** quantidade do NOSSO token que trocou de mão */
  tokens: number;
  /** o mesmo negócio em dólar */
  usd: number;
  em: number;
  txHash: string;
}

/**
 * Os últimos negócios do par, do ponto de vista do token pedido.
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO USO O CAMPO `kind` DA API
 * ---------------------------------------------------------------------------
 * A GeckoTerminal manda `kind: "buy" | "sell"`, mas isso é relativo ao token
 * BASE do pool — e em boa parte dos pares de meme coin o base é o outro lado
 * (SOL, USDC). Confiar nesse campo inverteria comprador e vendedor justamente
 * nos pares onde a tabela mais importa, e o erro não apareceria: a tela ficaria
 * plausível, só que com os papéis trocados.
 *
 * Então o lado é decidido pelo ENDEREÇO: se o token saiu da carteira é venda,
 * se entrou é compra. Não tem como interpretar errado.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTA JANELA NÃO É
 * ---------------------------------------------------------------------------
 * São os últimos ~300 negócios do par, e só. Não é o histórico da moeda nem o
 * saldo real das carteiras. Quem lê o resultado disso precisa dizer isso na
 * tela — ver `agregarTraders`.
 */
export async function fetchTrades(address: string): Promise<NegocioDoPool[]> {
  const token = await fetchToken(address);
  if (!token?.pairAddress) return [];

  const network = CHAIN_TO_GECKO[token.chain];
  if (!network) return [];

  const key = `trades:${network}:${token.pairAddress}:${address}`;
  return cached(key, TTL.trades, async () => {
    const url = `${GECKOTERMINAL}/networks/${network}/pools/${token.pairAddress}/trades`;

    const data = await getJson<{
      data: {
        attributes: {
          tx_hash: string;
          tx_from_address: string;
          block_timestamp: string;
          from_token_address: string;
          to_token_address: string;
          from_token_amount: string;
          to_token_amount: string;
          volume_in_usd: string;
        };
      }[];
    }>(url, 30);

    /*
     * Solana é sensível a maiúscula (base58) e EVM não (hex). Comparar tudo em
     * minúscula resolve o EVM sem risco no Solana: duas chaves base58 que só
     * diferem na caixa não existem na prática — seriam bytes diferentes.
     */
    const alvo = address.toLowerCase();

    const negocios: NegocioDoPool[] = [];

    for (const { attributes: a } of data.data ?? []) {
      const entrou = a.to_token_address?.toLowerCase() === alvo;
      const saiu = a.from_token_address?.toLowerCase() === alvo;
      if (!entrou && !saiu) continue;

      const tokens = Number(entrou ? a.to_token_amount : a.from_token_amount);
      const usd = Number(a.volume_in_usd);
      const em = Date.parse(a.block_timestamp);

      if (!Number.isFinite(tokens) || tokens <= 0) continue;
      if (!Number.isFinite(usd) || usd <= 0) continue;
      if (!Number.isFinite(em)) continue;
      if (!a.tx_from_address) continue;

      negocios.push({
        carteira: a.tx_from_address,
        lado: entrou ? "compra" : "venda",
        tokens,
        usd,
        em,
        txHash: a.tx_hash,
      });
    }

    return negocios;
  });
}
