import "server-only";

import { cached } from "@/lib/cache";
import { CHAIN_IDS } from "@/lib/web3";
import type { ChainId } from "@/lib/types";

/**
 * Quanto vale, em dólar, a moeda nativa de cada rede.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO PRECISOU EXISTIR
 * ---------------------------------------------------------------------------
 * O painel de indicação mostrava a comissão SEPARADA por rede: tanto em SOL,
 * tanto em ETH. Está correto — são ativos diferentes, em carteiras diferentes
 * — mas não responde a única pergunta que o promotor faz de verdade:
 * **"quanto eu já ganhei?"**.
 *
 * Somar 0,5 SOL com 0,01 ETH não dá número nenhum. O único denominador comum
 * é o dólar, e pra isso é preciso o preço das duas.
 *
 * ---------------------------------------------------------------------------
 * O NÚMERO É O VALOR DE HOJE, NÃO O DO DIA DO TRADE
 * ---------------------------------------------------------------------------
 * A conversão usa o preço de agora, então o total em dólar MUDA sozinho
 * conforme SOL e ETH se movem, mesmo sem nenhuma indicação nova.
 *
 * É o comportamento certo — é quanto o que você tem vale hoje —, mas precisa
 * estar escrito na tela, senão a pessoa vê o total cair e acha que sumiu
 * comissão. A quantidade em SOL e em ETH continua aparecendo ao lado, e essa
 * sim nunca diminui.
 *
 * Guardar o valor em dólar no momento do trade seria o outro caminho, e daria
 * uma pergunta diferente: "quanto isso valia quando eu ganhei". Pode virar uma
 * coluna em `eventos_de_afiliado` um dia; não substitui esta.
 */

/** Como cada rede se chama na CoinGecko. */
const MOEDA_DA_REDE: Record<ChainId, string> = {
  solana: "solana",
  robinhood: "ethereum",
};

/**
 * Cinco minutos.
 *
 * Preço de cripto anda o tempo todo, mas este número é um TOTAL ACUMULADO —
 * ninguém decide nada com a terceira casa decimal dele. Cache curto demais só
 * gastaria a cota da API de graça, e a CoinGecko corta rápido.
 */
const TTL = 5 * 60_000;

export async function precosNativos(): Promise<Record<ChainId, number>> {
  return cached("precos-nativos", TTL, async () => {
    const ids = [...new Set(Object.values(MOEDA_DA_REDE))].join(",");

    const vazio = Object.fromEntries(CHAIN_IDS.map((c) => [c, 0])) as Record<ChainId, number>;

    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
        { headers: { Accept: "application/json" }, next: { revalidate: 300 } },
      );
      if (!res.ok) return vazio;

      const json = (await res.json()) as Record<string, { usd?: number }>;

      return Object.fromEntries(
        CHAIN_IDS.map((chain) => [chain, json[MOEDA_DA_REDE[chain]]?.usd ?? 0]),
      ) as Record<ChainId, number>;
    } catch {
      /*
       * Preço indisponível devolve ZERO, e quem chama trata zero como "não dá
       * pra converter" e esconde o total em dólar. Inventar um preço faria a
       * tela mostrar um valor errado com cara de certo — muito pior do que
       * mostrar só a quantidade em SOL e em ETH, que sempre está correta.
       */
      return vazio;
    }
  });
}
