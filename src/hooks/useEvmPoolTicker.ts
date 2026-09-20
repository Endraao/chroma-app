"use client";

import { useEffect, useRef, useState } from "react";



/**
 * Preço ao vivo na Robinhood Chain, lido dos eventos de swap do par.
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO É IGUAL AO DA SOLANA
 * ---------------------------------------------------------------------------
 * Na Solana dá pra assinar as contas da pool e o nó EMPURRA cada mudança. Aqui
 * não: o RPC público da Robinhood Chain não aceita WebSocket — testei
 * `wss://rpc.mainnet.chain.robinhood.com` (400) e `/ws` (404). Então a leitura
 * é por pergunta.
 *
 * Mas perguntar PRA REDE não é a mesma coisa que perguntar pra um agregador. O
 * `eth_getLogs` devolve TODOS os swaps que aconteceram desde o último bloco
 * que já vimos — nenhum negócio se perde, mesmo vários no mesmo intervalo. E a
 * rede é Arbitrum Nitro, com blocos de ~250ms, então em menos de um segundo o
 * preço já reflete o que acabou de ser negociado. É o oposto de repescar um
 * número pronto que só é recalculado de vez em quando.
 *
 * A pergunta passa pela nossa própria ponte (`/api/rpc/robinhood`) em vez de
 * ir direto ao nó. Já vi a resposta dele voltar com o cabeçalho de CORS
 * duplicado, e nessa hora o preço ao vivo morre pra todo mundo ao mesmo tempo
 * sem nada de errado do nosso lado. Pela ponte, a leitura é servidor a
 * servidor e o navegador não depende do CORS de ninguém.
 *
 * ---------------------------------------------------------------------------
 * DE ONDE SAI O PREÇO
 * ---------------------------------------------------------------------------
 * A Uniswap v4 junta todas as pools num contrato só e identifica cada uma por
 * um id de 32 bytes — por isso o "endereço do par" aqui não é um contrato e
 * não dá pra chamar `getReserves()` nele. Em compensação, o evento `Swap`
 * carrega as duas quantidades trocadas. O preço do negócio é a razão entre
 * elas, e isso é o preço EXECUTADO, não uma estimativa.
 */

/** keccak256("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)") */
const TOPICO_SWAP = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";

/** `decimals()` */
const SELETOR_DECIMAIS = "0x313ce567";

/**
 * De quanto em quanto tempo perguntamos por swaps novos.
 *
 * Os blocos da rede saem a cada ~250ms. Menos que isto seria perguntar mais
 * vezes do que a rede tem o que responder; muito mais e o gráfico começaria a
 * andar aos saltos. Nenhum negócio é perdido no meio: cada consulta cobre
 * todos os blocos desde a anterior.
 */
const INTERVALO_MS = 700;

/** Depois de tantos erros seguidos, desiste em vez de martelar o RPC. */
const MAX_ERROS = 5;

export interface TickEvm {
  precoUsd: number;
  /** tamanho do negócio em dólar — alimenta o volume que anda na tela */
  volumeUsd: number;
  em: number;
}

export type EstadoDoTickerEvm = "desligado" | "conectando" | "ao-vivo" | "indisponivel";

export function useEvmPoolTicker({
  poolId,
  tokenAddress,
  quoteAddress,
  quotePriceUsd,
  ligado = true,
}: {
  /** id da pool (32 bytes na v4) */
  poolId: string | null | undefined;
  tokenAddress: string;
  quoteAddress: string | null | undefined;
  /** quanto vale uma unidade da moeda de cotação, em dólar */
  quotePriceUsd: number | undefined;
  ligado?: boolean;
}): { tick: TickEvm | null; estado: EstadoDoTickerEvm } {
  const [tick, setTick] = useState<TickEvm | null>(null);
  const [estado, setEstado] = useState<EstadoDoTickerEvm>("desligado");
  const ultimoBlocoRef = useRef<bigint>(0n);

  useEffect(() => {
    const valido =
      ligado &&
      poolId &&
      /^0x[a-fA-F0-9]{64}$/.test(poolId) &&
      quoteAddress &&
      quotePriceUsd &&
      quotePriceUsd > 0;

    if (!valido) {
      setEstado(poolId && !/^0x[a-fA-F0-9]{64}$/.test(poolId) ? "indisponivel" : "desligado");
      return;
    }

    // Nossa ponte, não o nó direto. Ver o comentário no topo do arquivo.
    const rpc = "/api/rpc/robinhood";
    let cancelado = false;
    let erros = 0;
    let limparTimer: (() => void) | null = null;

    const chamar = async (metodo: string, params: unknown[]) => {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: metodo, params }),
      });
      const json = (await res.json()) as { result?: unknown; error?: { message: string } };
      if (json.error) throw new Error(json.error.message);
      return json.result;
    };

    (async () => {
      try {
        setEstado("conectando");

        /*
         * As casas decimais de cada token, lidas do próprio contrato. Poderiam
         * ser deduzidas comparando com o preço do agregador, mas aí um preço
         * defasado lá viraria um preço errado aqui — e errado em potência de
         * dez, que é o tipo de erro que ninguém percebe olhando.
         */
        const [decBase, decCot] = await Promise.all(
          [tokenAddress, quoteAddress].map(async (endereco) => {
            const r = (await chamar("eth_call", [
              { to: endereco, data: SELETOR_DECIMAIS },
              "latest",
            ])) as string;
            return Number(BigInt(r));
          }),
        );
        if (cancelado) return;

        if (!Number.isFinite(decBase) || !Number.isFinite(decCot)) {
          setEstado("indisponivel");
          return;
        }

        // Na Uniswap as moedas do par são ordenadas pelo endereço.
        const baseEhMoeda0 = tokenAddress.toLowerCase() < quoteAddress.toLowerCase();

        const blocoAtual = BigInt((await chamar("eth_blockNumber", [])) as string);
        if (cancelado) return;
        ultimoBlocoRef.current = blocoAtual;
        setEstado("ao-vivo");

        const ler = async () => {
          if (cancelado) return;

          try {
            const logs = (await chamar("eth_getLogs", [
              {
                fromBlock: "0x" + (ultimoBlocoRef.current + 1n).toString(16),
                toBlock: "latest",
                topics: [TOPICO_SWAP, poolId],
              },
            ])) as { data: string; blockNumber: string }[];

            erros = 0;
            if (cancelado || !logs.length) return;

            const ultimo = logs[logs.length - 1];
            ultimoBlocoRef.current = BigInt(ultimo.blockNumber);

            /*
             * Soma o volume de TODOS os swaps do intervalo, não só do último.
             * Numa moeda movimentada chegam vários por leitura, e contar um só
             * deixaria o volume andando devagar demais.
             */
            let volumeUsd = 0;
            let preco: number | null = null;
            for (const log of logs) {
              const negocio = negocioDoSwap(log.data, {
                baseEhMoeda0,
                decBase,
                decCot,
                quotePriceUsd,
              });
              if (!negocio) continue;
              volumeUsd += negocio.volumeUsd;
              preco = negocio.precoUsd;
            }

            if (preco !== null) setTick({ precoUsd: preco, volumeUsd, em: Date.now() });
          } catch {
            if (++erros >= MAX_ERROS && !cancelado) setEstado("indisponivel");
          }
        };

        const timer = window.setInterval(() => void ler(), INTERVALO_MS);
        limparTimer = () => window.clearInterval(timer);
      } catch {
        if (!cancelado) setEstado("indisponivel");
      }
    })();

    return () => {
      cancelado = true;
      limparTimer?.();
      ultimoBlocoRef.current = 0n;
    };
  }, [poolId, tokenAddress, quoteAddress, quotePriceUsd, ligado]);

  return { tick, estado };
}

/**
 * Preço e tamanho de um negócio, a partir dos dados do evento `Swap`.
 *
 * O corpo do evento são seis palavras de 32 bytes; as duas primeiras são as
 * quantidades trocadas, com sinal (uma entra na pool, a outra sai). O preço do
 * negócio é o módulo da razão entre elas, corrigido pelas casas decimais, e o
 * volume é a perna de cotação convertida em dólar.
 */
function negocioDoSwap(
  data: string,
  opcoes: {
    baseEhMoeda0: boolean;
    decBase: number;
    decCot: number;
    quotePriceUsd: number;
  },
): { precoUsd: number; volumeUsd: number } | null {
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  if (hex.length < 128) return null;

  const palavra = (i: number) => BigInt("0x" + hex.slice(i * 64, (i + 1) * 64));
  // int128 vem preenchido em 32 bytes; o sinal está no bit mais alto dos 256.
  const comSinal = (v: bigint) => (v >> 255n ? v - (1n << 256n) : v);
  const modulo = (v: bigint) => (v < 0n ? -v : v);

  const bruto0 = modulo(comSinal(palavra(0)));
  const bruto1 = modulo(comSinal(palavra(1)));
  if (bruto0 === 0n || bruto1 === 0n) return null;

  const { baseEhMoeda0, decBase, decCot, quotePriceUsd } = opcoes;
  const brutoBase = baseEhMoeda0 ? bruto0 : bruto1;
  const brutoCot = baseEhMoeda0 ? bruto1 : bruto0;

  const base = Number(brutoBase) / 10 ** decBase;
  const cotacao = Number(brutoCot) / 10 ** decCot;
  if (base <= 0) return null;

  const preco = (cotacao / base) * quotePriceUsd;
  if (!Number.isFinite(preco) || preco <= 0) return null;

  return { precoUsd: preco, volumeUsd: cotacao * quotePriceUsd };
}
