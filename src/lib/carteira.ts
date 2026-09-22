import "server-only";

import { cached } from "./cache";

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
 * Tudo que tem preço conhecido. O que a fonte não precifica fica de fora — e
 * fora é o certo: somar token sem mercado com valor chutado infla o patrimônio
 * de quem está segurando uma moeda que ninguém compra.
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
  /** Quantas moedas diferentes entraram na conta. */
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
      const preco = precos.get(c.mint);
      if (!preco || preco <= 0) continue;
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
      moedas: posicoes.length,
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

async function saldoEmSol(rpc: string, dono: string): Promise<number> {
  const r = await rpcChamar<{ value: number }>(rpc, "getBalance", [dono]);
  return r?.value ?? 0;
}

async function contasDeToken(
  rpc: string,
  dono: string,
): Promise<{ mint: string; quantidade: number }[]> {
  const respostas = await Promise.all(
    PROGRAMAS.map((programa) =>
      rpcChamar<{
        value: { account: { data: { parsed: { info: Record<string, never> } } } }[];
      }>(rpc, "getTokenAccountsByOwner", [
        dono,
        { programId: programa },
        { encoding: "jsonParsed" },
      ]).catch(() => ({ value: [] })),
    ),
  );

  const saida: { mint: string; quantidade: number }[] = [];

  for (const resposta of respostas) {
    for (const conta of resposta.value ?? []) {
      const info = (
        conta as unknown as {
          account: {
            data: {
              parsed: { info: { mint: string; tokenAmount: { uiAmount: number | null } } };
            };
          };
        }
      ).account?.data?.parsed?.info;

      const quantidade = Number(info?.tokenAmount?.uiAmount ?? 0);
      if (!info?.mint || !(quantidade > 0)) continue;
      saida.push({ mint: info.mint, quantidade });
    }
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
    const lote = unicos.slice(i, i + POR_LOTE);
    try {
      const r = await fetch(`https://lite-api.jup.ag/price/v3?ids=${lote.join(",")}`, {
        headers: { accept: "application/json" },
        next: { revalidate: 15 },
      });
      if (!r.ok) continue;

      const dados = (await r.json()) as Record<string, { usdPrice?: number }>;
      for (const [mint, info] of Object.entries(dados ?? {})) {
        const preco = Number(info?.usdPrice);
        if (Number.isFinite(preco) && preco > 0) saida.set(mint, preco);
      }
    } catch {
      /* Lote sem preço: as moedas dele ficam de fora da soma, e é melhor
         faltar do que inventar valor. */
    }
  }

  return saida;
}
