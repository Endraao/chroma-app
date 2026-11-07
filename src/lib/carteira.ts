import "server-only";

import { cached, putStale, stale } from "./cache";

/**
 * Quanto a carteira vale, somando SOL e TODOS os tokens.
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO BASTAVA O SALDO EM SOL
 * ---------------------------------------------------------------------------
 * O número do topo do site mostrava só o SOL. Quem comprasse uma moeda via o
 * saldo DIMINUIR — o SOL saiu, e o token que entrou não contava em lugar
 * nenhum. Na prática o site dizia à pessoa que ela tinha perdido dinheiro toda
 * vez que ela comprava.
 *
 * Numa launchpad isso é pior que um número errado: o produto inteiro é
 * converter SOL em moeda nova, e o painel tratava essa conversão como prejuízo.
 *
 * ---------------------------------------------------------------------------
 * O QUE ENTRA NA CONTA
 * ---------------------------------------------------------------------------
 * Toda moeda da carteira aparece na lista. Na soma entra só o que tem preço:
 * somar token sem mercado com valor chutado infla o patrimônio de quem está
 * segurando uma moeda que ninguém compra.
 *
 * Preço vem da Jupiter, que às vezes recusa (429); aí tenta de novo, depois
 * pergunta à DexScreener e, por último, usa o último preço lido. Sem isso, uma
 * recusa fazia as moedas sumirem do saldo por alguns segundos.
 *
 * Contas com saldo zero são ignoradas. Toda carteira que já negociou acumula
 * dezenas delas, e elas só gastariam consulta de preço.
 */

/** Os dois programas de token: pump.fun cunha em Token-2022, o resto no antigo. */
const PROGRAMAS = [
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
];

const SOL_MINT = "So11111111111111111111111111111111111111112";

/** Quantos mints por chamada de preço. */
const POR_LOTE = 50;
/** Limite da DexScreener por chamada. */
const POR_LOTE_DEX = 30;
/** Por quanto tempo o último preço e as últimas contas lidas servem de reserva. */
const RESERVA = 60 * 60_000;

/**
 * Quinze segundos.
 *
 * O saldo aparece em toda página e não precisa ser instantâneo — o que a
 * pessoa quer saber é a ordem de grandeza do que tem. Cache curto demais aqui
 * multiplicaria consulta de RPC por visita.
 */
const TTL = 15_000;

export interface PosicaoDaCarteira {
  mint: string;
  quantidade: number;
  precoUsd: number;
  valorUsd: number;
}

export interface ValorDaCarteira {
  /** Quantidade de SOL — o painel de swap precisa dela, não do valor. */
  sol: number;
  solUsd: number;
  tokensUsd: number;
  totalUsd: number;
  /** Quantas moedas com preço entraram na soma. */
  moedas: number;
  posicoes: PosicaoDaCarteira[];
}

export async function valorDaCarteira(dono: string): Promise<ValorDaCarteira | null> {
  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC;
  if (!rpc) return null;

  return cached(`carteira:${dono}`, TTL, async () => {
    const [lamports, contas] = await Promise.all([saldoEmSol(rpc, dono), contasDeToken(rpc, dono)]);

    /* O SOL entra na mesma lista de preços — uma chamada em vez de duas. */
    const mints = [SOL_MINT, ...contas.map((c) => c.mint)];
    const precos = await precosDe(mints);

    const precoDoSol = precos.get(SOL_MINT) ?? 0;
    const sol = lamports / 1e9;
    const solUsd = sol * precoDoSol;

    const posicoes: PosicaoDaCarteira[] = [];
    for (const c of contas) {
      const preco = precos.get(c.mint) ?? 0;
      // Sem preço e sem casas decimais é NFT, não moeda.
      if (preco <= 0 && c.casas === 0) continue;
      posicoes.push({
        mint: c.mint,
        quantidade: c.quantidade,
        precoUsd: preco,
        valorUsd: c.quantidade * preco,
      });
    }

    posicoes.sort((a, b) => b.valorUsd - a.valorUsd);
    const tokensUsd = posicoes.reduce((soma, p) => soma + p.valorUsd, 0);

    return {
      sol,
      solUsd,
      tokensUsd,
      totalUsd: solUsd + tokensUsd,
      moedas: posicoes.filter((p) => p.valorUsd > 0).length,
      posicoes,
    };
  });
}

/* ------------------------------------------------------------------ */

async function rpcChamar<T>(rpc: string, metodo: string, params: unknown[]): Promise<T> {
  const r = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: metodo, params }),
  });
  if (!r.ok) throw new Error(`RPC respondeu ${r.status}`);
  const j = (await r.json()) as { result?: T; error?: { message: string } };
  if (j.error) throw new Error(j.error.message);
  return j.result as T;
}

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** O nó às vezes recusa por excesso de pedidos: mais duas tentativas antes de desistir. */
async function comRepeticao<T>(ler: () => Promise<T>): Promise<T> {
  for (const espera of [500, 1500]) {
    try {
      return await ler();
    } catch {
      await esperar(espera);
    }
  }
  return ler();
}

async function saldoEmSol(rpc: string, dono: string): Promise<number> {
  const r = await comRepeticao(() => rpcChamar<{ value: number }>(rpc, "getBalance", [dono]));
  return r?.value ?? 0;
}

interface ContaDeToken {
  mint: string;
  quantidade: number;
  casas: number;
}

async function contasDeToken(rpc: string, dono: string): Promise<ContaDeToken[]> {
  const porPrograma = await Promise.all(
    PROGRAMAS.map(async (programa) => {
      const chave = `carteira-contas:${dono}:${programa}`;
      try {
        const resposta = await comRepeticao(() =>
          rpcChamar<{ value: unknown[] }>(rpc, "getTokenAccountsByOwner", [
            dono,
            { programId: programa },
            { encoding: "jsonParsed" },
          ]),
        );
        const contas = lerContas(resposta.value ?? []);
        putStale(chave, contas, RESERVA);
        return contas;
      } catch {
        // Falha de leitura não é carteira vazia: as moedas não podem sumir do saldo.
        return stale<ContaDeToken[]>(chave) ?? [];
      }
    }),
  );
  return porPrograma.flat();
}

function lerContas(contas: unknown[]): ContaDeToken[] {
  const saida: ContaDeToken[] = [];
  for (const conta of contas) {
    const info = (
      conta as {
        account?: {
          data?: {
            parsed?: { info?: { mint?: string; tokenAmount?: { uiAmount?: number | null; decimals?: number } } };
          };
        };
      }
    ).account?.data?.parsed?.info;

    const quantidade = Number(info?.tokenAmount?.uiAmount ?? 0);
    if (!info?.mint || !(quantidade > 0)) continue;
    saida.push({ mint: info.mint, quantidade, casas: info.tokenAmount?.decimals ?? 0 });
  }
  return saida;
}

/**
 * Preço em dólar de vários mints, pela Jupiter.
 *
 * Em lote porque uma carteira ativa carrega dezenas de moedas, e uma chamada
 * por moeda transformaria abrir o site em dezenas de requisições.
 */
async function precosDe(mints: string[]): Promise<Map<string, number>> {
  const saida = new Map<string, number>();
  const unicos = [...new Set(mints)];

  for (let i = 0; i < unicos.length; i += POR_LOTE) {
    await precosDaJupiter(unicos.slice(i, i + POR_LOTE), saida);
  }
  const semPreco = unicos.filter((m) => !saida.has(m));
  for (let i = 0; i < semPreco.length; i += POR_LOTE_DEX) {
    await precosDaDexScreener(semPreco.slice(i, i + POR_LOTE_DEX), saida);
  }

  for (const mint of unicos) {
    const chave = `carteira-preco:${mint}`;
    const preco = saida.get(mint);
    if (preco) {
      putStale(chave, preco, RESERVA);
    } else {
      const ultimo = stale<number>(chave);
      if (ultimo) saida.set(mint, ultimo);
    }
  }
  return saida;
}

async function precosDaJupiter(lote: string[], saida: Map<string, number>) {
  for (const espera of [0, 700, 1800]) {
    if (espera) await esperar(espera);
    try {
      const r = await fetch(`https://lite-api.jup.ag/price/v3?ids=${lote.join(",")}`, {
        headers: { accept: "application/json" },
        next: { revalidate: 15 },
        signal: AbortSignal.timeout(8_000),
      });
      if (!r.ok) continue;

      const dados = (await r.json()) as Record<string, { usdPrice?: number }>;
      for (const [mint, info] of Object.entries(dados ?? {})) {
        const preco = Number(info?.usdPrice);
        if (Number.isFinite(preco) && preco > 0) saida.set(mint, preco);
      }
      return;
    } catch {
      /* tenta de novo; sem resposta, a DexScreener e a reserva cobrem */
    }
  }
}

async function precosDaDexScreener(lote: string[], saida: Map<string, number>) {
  try {
    const r = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${lote.join(",")}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return;
    const pares = (await r.json()) as {
      baseToken?: { address?: string };
      priceUsd?: string;
      liquidity?: { usd?: number };
    }[];
    const liquidez = new Map<string, number>();
    for (const par of pares ?? []) {
      const mint = par.baseToken?.address;
      const preco = Number(par.priceUsd);
      const tamanho = par.liquidity?.usd ?? 0;
      if (!mint || !lote.includes(mint) || !(preco > 0)) continue;
      if (saida.has(mint) && tamanho <= (liquidez.get(mint) ?? 0)) continue;
      liquidez.set(mint, tamanho);
      saida.set(mint, preco);
    }
  } catch {
    /* sem resposta: a reserva cobre */
  }
}
