"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { usePoolTicker } from "@/hooks/usePoolTicker";
import { useEvmPoolTicker } from "@/hooks/useEvmPoolTicker";
import type { Candle, ChainId } from "@/lib/types";

export type Interval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export const INTERVALS: Interval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

const INTERVAL_SECONDS: Record<Interval, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
};

/** De quanto em quanto tempo o preço é repescado. O cache do servidor é de 3s. */
const PRICE_POLL_MS = 3_000;

/**
 * De quanto em quanto tempo o preço do servidor é relido como âncora.
 *
 * Não é pra desenhar — é pra ter com o que comparar o preço que chega da rede.
 * No mesmo ritmo do modo lento: assim a âncora anda junto com o mercado e a
 * faixa de aceitação acompanha até uma disparada de verdade.
 */
const REFERENCIA_MS = PRICE_POLL_MS;

/**
 * Quanto o preço ao vivo pode se afastar da âncora antes de ser descartado.
 *
 * Começou em 3×, e passou um preço de metade do valor real. Depois 1,5×, e
 * ainda passou um de 1,59× — por pouco.
 *
 * Depois 1,5×, e ainda passou um de 1,59×. Depois 1,12×, e a vela de um minuto
 * ficou com máxima em $10,70M e mínima em $8,65M numa moeda que, pela fonte,
 * andou de $9,61M a $9,67M naquele minuto.
 *
 * Agora 1,03×. A faixa pode ser apertada assim porque sair dela não trava mais
 * nada: o preço do servidor entra no lugar. O pior caso deixou de ser "vela
 * errada" e virou "vela até 3 segundos atrasada" — e 3% de corte é invisível
 * na escala do gráfico, ao contrário de um pavio de 100%.
 *
 * O efeito prático é uma troca automática: em pool comportada a maioria dos
 * tiques passa e o gráfico corre por negócio; em pool barulhenta quase tudo
 * cai pra âncora e o gráfico corre por relógio. Rápido quando dá pra confiar,
 * certo sempre.
 *
 * Por que ainda escapa preço ruim: dois negócios em SENTIDOS OPOSTOS no mesmo
 * slot se anulam em parte, e a razão entre o que sobra não é o preço de nenhum
 * dos dois. Sem os dados por transação — que a assinatura de conta não entrega
 * — não dá pra separar um do outro. Daí a faixa.
 */
const FATOR_MAXIMO = 1.03;
/** De quanto em quanto tempo as velas fechadas são recarregadas. */
const CANDLE_REFRESH_MS = 60_000;

interface Options {
  address: string;
  /** endereço (ou id) do par; com ele o preço é lido direto da rede */
  pool?: string | null;
  chain?: ChainId;
  /** a outra ponta do par — necessária pra ler o preço na Robinhood Chain */
  quoteAddress?: string | null;
  quotePriceUsd?: number;
  interval?: Interval;
}

interface LiveChartData {
  candles: Candle[];
  lastCandle: Candle | null;
  price: number;
  change: number;
  status: "connecting" | "live" | "demo" | "error";
  /** true quando o preço chega direto da rede, não por pesquisa */
  tempoReal: boolean;
  /**
   * Volume em dólar somado desde que a página abriu, negócio a negócio.
   *
   * Serve pra fazer o "Volume 24h" andar na tela: a fonte de mercado só
   * recalcula de tempos em tempos, então o número dela fica parado entre uma
   * atualização e outra. Somando o que a própria rede entrega, o contador
   * acompanha cada negócio.
   */
  volumeObservadoUsd: number;
  interval: Interval;
  setInterval: (i: Interval) => void;
}

/* ------------------------------------------------------------------ */
/* Feed simulado (usado só quando o token não tem par indexado)        */
/* ------------------------------------------------------------------ */

function seedFrom(address: string): number {
  let hash = 0;
  for (let i = 0; i < address.length; i++) hash = (hash * 31 + address.charCodeAt(i)) | 0;
  return Math.abs(hash % 100000) / 100000 || 0.42;
}

function buildDemoHistory(address: string, intervalSec: number, count = 240): Candle[] {
  const seed = seedFrom(address);
  let price = 0.0000012 + seed * 0.0000085;
  const now = Math.floor(Date.now() / 1000);
  const start = now - (now % intervalSec) - intervalSec * count;
  const candles: Candle[] = [];

  for (let i = 0; i < count; i++) {
    const open = price;
    const drift = (Math.sin(i / 14 + seed * 10) + Math.random() - 0.45) * 0.035;
    const close = Math.max(open * (1 + drift), 1e-12);
    candles.push({
      time: start + i * intervalSec,
      open,
      high: Math.max(open, close) * (1 + Math.random() * 0.02),
      low: Math.min(open, close) * (1 - Math.random() * 0.02),
      close,
      volume: Math.random() * 40000 + 2000,
    });
    price = close;
  }
  return candles;
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

/**
 * Velas reais + preço ao vivo.
 *
 * O desenho é em duas camadas, que é como terminais de trading funcionam:
 *  1. as velas FECHADAS vêm da GeckoTerminal (menor granularidade: 1 minuto);
 *  2. a vela ATUAL é movida ao vivo.
 *
 * A camada 2 tem dois caminhos, e a diferença entre eles é o que separa um
 * gráfico que treme de um que só atualiza:
 *
 *  - PREFERIDO: `usePoolTicker` assina as contas-cofre da pool por WebSocket.
 *    Cada swap muda uma reserva, o nó empurra o novo saldo e a vela anda NA
 *    HORA. É por isso que o gráfico se mexe para os dois lados numa moeda com
 *    volume — ele é movido por negócio, não por relógio.
 *  - RESERVA: pesquisa `/api/price` de 3 em 3 segundos. Usado quando a pool
 *    não é assinável (ver o limite conhecido em `usePoolTicker`).
 *
 * Diminuir o intervalo da pesquisa NÃO substitui o primeiro caminho: a fonte
 * de preço só recalcula de tempos em tempos, então pedir mais vezes devolve o
 * mesmo número. Já foi tentado.
 *
 * Token sem par listado (recém-criado) cai num feed simulado e o painel avisa.
 */
export function useLiveChartData({
  address,
  pool,
  chain = "solana",
  quoteAddress,
  quotePriceUsd,
  interval: initial = "1m",
}: Options): LiveChartData {
  const [interval, setIntervalState] = useState<Interval>(initial);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [status, setStatus] = useState<LiveChartData["status"]>("connecting");
  const [volumeObservadoUsd, setVolumeObservado] = useState(0);
  const demoRef = useRef(false);

  const intervalSec = INTERVAL_SECONDS[interval];

  /* --- 1. Velas fechadas ------------------------------------------ */
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    setStatus("connecting");

    const load = async (isRefresh = false) => {
      try {
        const res = await fetch(`/api/candles?address=${address}&interval=${interval}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`api/candles respondeu ${res.status}`);
        const data = (await res.json()) as Candle[];
        if (cancelled || !Array.isArray(data) || !data.length) return;

        demoRef.current = false;
        setStatus("live");
        setCandles((prev) => {
          // Num refresh, preserva o preço ao vivo já aplicado na última vela.
          if (!isRefresh || !prev.length) return data;
          const liveLast = prev[prev.length - 1];
          const merged = [...data];
          const tail = merged[merged.length - 1];
          if (tail && liveLast.time === tail.time) {
            merged[merged.length - 1] = {
              ...tail,
              close: liveLast.close,
              high: Math.max(tail.high, liveLast.close),
              low: Math.min(tail.low, liveLast.close),
            };
          }
          return merged;
        });
      } catch (error) {
        if (cancelled || isRefresh) return;
        console.warn("[chart] sem velas reais, usando feed demo:", error);
        demoRef.current = true;
        setCandles(buildDemoHistory(address, intervalSec));
        setStatus("demo");
      }
    };

    void load();
    const timer = window.setInterval(() => {
      if (!demoRef.current) void load(true);
    }, CANDLE_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [address, interval, intervalSec]);

  /* --- 2. Preço ao vivo, movendo a vela atual ---------------------- */

  /*
   * Move a vela em formação. Compartilhado porque os dois caminhos — WebSocket
   * da pool e pesquisa — fazem exatamente a mesma coisa com o número; só muda
   * de onde ele veio e com que frequência chega.
   */
  const aplicarPreco = useCallback(
    (nextPrice: number) => {
      setCandles((prev) => {
        if (!prev.length || !Number.isFinite(nextPrice) || nextPrice <= 0) return prev;
        const last = prev[prev.length - 1];
        const nowSec = Math.floor(Date.now() / 1000);
        const bucket = nowSec - (nowSec % intervalSec);

        // Virou o período: abre vela nova a partir do fechamento da anterior.
        if (bucket > last.time) {
          return [
            ...prev.slice(-600),
            {
              time: bucket,
              open: last.close,
              high: Math.max(last.close, nextPrice),
              low: Math.min(last.close, nextPrice),
              close: nextPrice,
              volume: 0,
            },
          ];
        }

        if (last.close === nextPrice) return prev;
        return [
          ...prev.slice(0, -1),
          {
            ...last,
            close: nextPrice,
            high: Math.max(last.high, nextPrice),
            low: Math.min(last.low, nextPrice),
          },
        ];
      });
    },
    [intervalSec],
  );

  /* --- 2a. Tempo real: preço vindo do próprio par ------------------- */
  /*
   * Cada rede tem o seu caminho porque a infraestrutura é diferente: na Solana
   * o nó empurra as mudanças por WebSocket; na Robinhood Chain o RPC público
   * não tem WebSocket, então os swaps são lidos por evento. Os dois leem a
   * REDE, não um agregador — é isso que os separa da pesquisa de reserva.
   */
  const ligado = status === "live";

  const { tick: tickSolana, estado: estadoSolana } = usePoolTicker({
    pool: chain === "solana" ? pool : null,
    tokenMint: address,
    ligado,
  });

  const { tick: tickEvm, estado: estadoEvm } = useEvmPoolTicker({
    poolId: chain === "robinhood" ? pool : null,
    tokenAddress: address,
    quoteAddress,
    quotePriceUsd,
    ligado,
  });

  const tickDaPool = chain === "solana" ? tickSolana : tickEvm;
  const tempoReal = (chain === "solana" ? estadoSolana : estadoEvm) === "ao-vivo";

  /*
   * Numa moeda movimentada chegam dezenas de notificações por segundo. Aplicar
   * cada uma num setState seria trabalho jogado fora: o olho não vê mais que
   * uns 15 quadros por segundo de diferença, e o que importa é que o ÚLTIMO
   * preço esteja sempre correto — por isso o último vence, a cada 60ms.
   */
  const precoPendenteRef = useRef<number | null>(null);

  /** Volume ainda não somado à tela, no mesmo ritmo do preço. */
  const volumePendenteRef = useRef(0);

  /**
   * O último preço que o servidor confirmou, como âncora de sanidade.
   *
   * Existe por causa de um bug que chegou até a tela: o preço ao vivo vinha da
   * razão entre as reservas da pool, o que é errado em pool de liquidez
   * concentrada, e o gráfico desenhou uma vela de $13M pra $44M de
   * capitalização. O cálculo foi consertado no ticker — mas erro de MODELO não
   * levanta exceção e não parece defeito: entrega um número plausível. Por
   * isso nenhum preço vindo da rede entra na tela sem passar por aqui.
   */
  const referenciaRef = useRef(0);

  useEffect(() => {
    if (!address) return;
    let cancelado = false;

    const ler = async () => {
      try {
        const res = await fetch(`/api/price?address=${address}`, { cache: "no-store" });
        if (!res.ok) return;
        const { priceUsd } = (await res.json()) as { priceUsd: number };
        if (!cancelado && Number.isFinite(priceUsd) && priceUsd > 0) {
          referenciaRef.current = priceUsd;
        }
      } catch {
        /* sem âncora nova: continua valendo a anterior */
      }
    };

    void ler();
    const timer = window.setInterval(() => void ler(), REFERENCIA_MS);
    return () => {
      cancelado = true;
      window.clearInterval(timer);
    };
  }, [address]);

  useEffect(() => {
    if (!tickDaPool) return;

    /*
     * A faixa é larga de propósito.
     *
     * Meme coin dobra de preço em um minuto, e isso é normal — faixa apertada
     * estaria brigando com o produto, barrando movimento de verdade. O que ela
     * precisa pegar é a outra ordem de grandeza: erro de modelo não erra por
     * 30%, erra por 3 vezes, que foi exatamente o caso. Fora da faixa o preço
     * é descartado e a âncora do servidor continua valendo.
     */
    const referencia = referenciaRef.current;
    let preco = tickDaPool.precoUsd;

    if (referencia > 0) {
      const fator = preco / referencia;
      if (fator > FATOR_MAXIMO || fator < 1 / FATOR_MAXIMO) {
        /*
         * Fora da faixa: vale o preço do servidor, não o descarte puro.
         *
         * Descartar e sair era o primeiro desenho, e deixava um buraco: no modo
         * ao vivo a busca por pesquisa fica DESLIGADA, então a vela parava de
         * andar até chegar um tique bom. Numa moeda em movimento isso é um
         * gráfico travado mostrando um preço velho — e travado é pior que
         * lento, porque não se anuncia.
         *
         * Usando a âncora, a vela continua andando com o número que o servidor
         * confirmou. No pior caso o gráfico fica 3 segundos atrás do mercado;
         * nunca fica errado.
         */
        console.warn(
          `[grafico] preço ao vivo fora da faixa: ${preco} contra ` +
            `${referencia} confirmados pelo servidor (${fator.toFixed(2)}x) — usando o do servidor`,
        );
        preco = referencia;
      }
    }

    precoPendenteRef.current = preco;
    volumePendenteRef.current += tickDaPool.volumeUsd;
  }, [tickDaPool]);

  // Trocar de moeda zera o contador: ele é da sessão nesta página.
  useEffect(() => {
    setVolumeObservado(0);
    volumePendenteRef.current = 0;
  }, [address]);

  useEffect(() => {
    if (!tempoReal || !candles.length) return;

    const timer = window.setInterval(() => {
      const pendente = precoPendenteRef.current;
      if (pendente === null) return;
      precoPendenteRef.current = null;
      aplicarPreco(pendente);

      if (volumePendenteRef.current > 0) {
        const soma = volumePendenteRef.current;
        volumePendenteRef.current = 0;
        setVolumeObservado((v) => v + soma);
      }
    }, 60);

    return () => window.clearInterval(timer);
  }, [tempoReal, candles.length, aplicarPreco]);

  /* --- 2b. Reserva: pesquisa, quando a pool não é assinável --------- */
  useEffect(() => {
    // Com o WebSocket de pé, pesquisar seria pedir de novo o que já chega sozinho.
    if (!address || !candles.length || tempoReal) return;

    const tick = async () => {
      // No modo demo não há preço real pra buscar — quem move a vela é o efeito 3.
      if (demoRef.current) return;

      try {
        const res = await fetch(`/api/price?address=${address}`, { cache: "no-store" });
        if (!res.ok) return;
        const { priceUsd } = (await res.json()) as { priceUsd: number };
        aplicarPreco(priceUsd);
      } catch {
        /* rede oscilou: o próximo tick tenta de novo */
      }
    };

    const timer = window.setInterval(tick, PRICE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [address, candles.length, tempoReal, aplicarPreco]);

  /* --- 3. Tick do feed simulado ------------------------------------ */
  useEffect(() => {
    if (status !== "demo" || !candles.length) return;

    const timer = window.setInterval(() => {
      setCandles((prev) => {
        if (!prev.length) return prev;
        const last = prev[prev.length - 1];
        const nowSec = Math.floor(Date.now() / 1000);
        const bucket = nowSec - (nowSec % intervalSec);
        const nextPrice = Math.max(last.close * (1 + (Math.random() - 0.49) * 0.018), 1e-12);

        if (bucket > last.time) {
          return [
            ...prev.slice(-600),
            {
              time: bucket,
              open: last.close,
              high: Math.max(last.close, nextPrice),
              low: Math.min(last.close, nextPrice),
              close: nextPrice,
              volume: Math.random() * 5000,
            },
          ];
        }
        return [
          ...prev.slice(0, -1),
          {
            ...last,
            close: nextPrice,
            high: Math.max(last.high, nextPrice),
            low: Math.min(last.low, nextPrice),
            volume: last.volume + Math.random() * 300,
          },
        ];
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [status, candles.length, intervalSec]);

  const setInterval = useCallback((i: Interval) => setIntervalState(i), []);

  const lastCandle = candles.at(-1) ?? null;
  const first = candles[0];
  const price = lastCandle?.close ?? 0;
  const change = first && price ? ((price - first.open) / first.open) * 100 : 0;

  return {
    candles,
    lastCandle,
    price,
    change,
    status,
    tempoReal,
    volumeObservadoUsd,
    interval,
    setInterval,
  };
}
