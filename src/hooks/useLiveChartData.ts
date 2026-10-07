"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { usePoolTicker } from "@/hooks/usePoolTicker";
import { useEvmPoolTicker } from "@/hooks/useEvmPoolTicker";
import type { Candle, ChainId } from "@/lib/types";
import { CHAINS } from "@/lib/web3";

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
/*
 * Robinhood: o preço vem de CADA swap, exato (evento da pool) — o problema dos
 * negócios opostos no mesmo slot não existe. Com 3%, numa moeda agitada quase
 * todo tique caía pra âncora do agregador, que atrasa ~30 s, e o gráfico
 * ficava meio minuto atrás da Fomo (30/09/2026). 2x ainda pega erro de modelo
 * (que erra por 3x ou mais) e deixa passar o movimento de verdade.
 */
const FATOR_MAXIMO_EVM = 2;
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
  /** "vazio" = a fonte respondeu, e não há vela nenhuma para este par. */
  status: "connecting" | "live" | "vazio" | "erro";
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
  /**
   * O intervalo a que as velas de AGORA pertencem — atrasa em relação a
   * `interval` enquanto as do novo intervalo não chegam. O gráfico usa este,
   * e não o escolhido, pra decidir quando redesenhar tudo.
   */
  intervaloDasVelas: Interval;
  setInterval: (i: Interval) => void;
}

/* ------------------------------------------------------------------ */
/* NÃO EXISTE MAIS FEED SIMULADO                                       */
/* ------------------------------------------------------------------ */
/*
 * Havia aqui um gerador de velas sintéticas, usado quando a fonte de dados
 * falhava. Ele desenhava o preço com uma senoide mais ruído aleatório, e o
 * resultado na tela eram ondas suaves e regulares — montanhas — em vez de
 * mercado.
 *
 * O problema não era a aparência. Era que aquilo ia para a tela com o mesmo
 * eixo, as mesmas cores e o mesmo cabeçalho de abertura/máxima/mínima das
 * velas verdadeiras. A única diferença visível era a COR DE UM ÍCONE, cuja
 * explicação só aparecia ao passar o mouse.
 *
 * Como a fonte pública passou a responder 429 em rajada, isso deixou de ser
 * caso raro: o gráfico de QUALQUER moeda virava desenho, e as pessoas liam
 * preço inventado num terminal de negociação.
 *
 * Um gráfico vazio informa que não há dados. Um gráfico bonito com números
 * falsos informa errado, e quem olha não tem como saber. Por isso o gerador
 * saiu inteiro, em vez de ganhar um aviso maior.
 *
 * A resiliência foi para onde pertence: `fetchCandles` guarda a última
 * resposta boa por trinta minutos e a serve quando a fonte recusa. Vela velha
 * é dado velho; vela inventada não é dado.
 */

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
 * Token sem par listado (recém-criado) fica com o gráfico vazio e o painel diz
 * isso. Não existe mais feed simulado — ver a nota no topo do arquivo.
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
  const [intervaloDasVelas, setIntervaloDasVelas] = useState<Interval>(initial);
  const [status, setStatus] = useState<LiveChartData["status"]>("connecting");
  const [volumeObservadoUsd, setVolumeObservado] = useState(0);

  const intervalSec = INTERVAL_SECONDS[interval];

  /* --- 1. Velas fechadas ------------------------------------------ */
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    setStatus("connecting");

    /*
     * Moeda recém-lançada: a fonte de velas ainda não a conhece. Em vez de
     * "carregando" ou "sem dados", o gráfico começa com uma vela no preço de
     * agora (lido da curva) e anda com os negócios (30/09/2026).
     */
    /*
     * Preço com que TODA moeda nasce na curva de lançamento da Solana (30 SOL
     * virtuais contra 1,073 bi de tokens), em dólar. Só existe para moeda na
     * curva — o /api/price devolve priceSol só nesse caso.
     */
    const precoInicialDaCurva = async (): Promise<{ inicial: number; agora: number } | null> => {
      try {
        const res = await fetch(`/api/price?address=${address}`, { cache: "no-store" });
        if (!res.ok) return null;
        const { priceUsd, priceSol, priceNativo, precoInicialNativo } = (await res.json()) as {
          priceUsd: number;
          priceSol?: number;
          priceNativo?: number;
          precoInicialNativo?: number;
        };
        if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;
        // Preço de nascimento vem do servidor (cada curva sabe o seu).
        const emNativo = priceSol ?? priceNativo;
        if (!emNativo || emNativo <= 0 || !precoInicialNativo) return { inicial: 0, agora: priceUsd };
        return { inicial: precoInicialNativo * (priceUsd / emNativo), agora: priceUsd };
      } catch {
        return null;
      }
    };

    const semente = async (): Promise<boolean> => {
      try {
        const precos = await precoInicialDaCurva();
        if (cancelled || !precos) return false;
        const priceUsd = precos.agora;
        const abre = precos.inicial > 0 && precos.inicial < priceUsd ? precos.inicial : priceUsd;
        const agora = Math.floor(Date.now() / 1000);
        const vela = { time: agora - (agora % intervalSec), open: abre, high: priceUsd, low: abre, close: priceUsd, volume: 0 };
        setIntervaloDasVelas(interval);
        setCandles((prev) => (prev.length ? prev : [vela]));
        setStatus("live");
        return true;
      } catch {
        return false;
      }
    };

    const load = async (isRefresh = false, tentativa = 1): Promise<void> => {
      try {
        /*
         * Primeiro direto do navegador na GeckoTerminal: cada visitante tem o
         * próprio limite de consultas. Pelo servidor, todo mundo dividia o
         * mesmo IP da Vercel, e o gráfico ficava minutos em "limitando as
         * consultas". Se falhar (ou for moeda da curva), cai no servidor.
         */
        let data = pool ? await velasDiretoDaGecko(chain, pool, address, interval) : null;
        if (!data?.length) {
          const res = await fetch(`/api/candles?address=${address}&interval=${interval}`, {
            cache: "no-store",
          });
          if (!res.ok) throw new Error(`api/candles respondeu ${res.status}`);
          data = (await res.json()) as Candle[];
        }
        if (cancelled) return;

        /*
         * Resposta vazia não é sucesso.
         *
         * Antes isto era um `return` silencioso junto com os outros casos, e o
         * estado ficava em "connecting" para sempre: um esqueleto girando sem
         * nunca dizer que não havia nada a mostrar.
         */
        if (!Array.isArray(data) || !data.length) {
          if (isRefresh) return; // as velas na tela continuam valendo
          if (!(await semente())) setStatus("vazio");
          return;
        }

        /*
         * PRIMEIRA VELA DA MOEDA NA CURVA: abre no preço de nascimento.
         * A fonte registra o primeiro negócio com abertura = fechamento = preço
         * DEPOIS da compra do criador — uma vela achatada, invisível; parecia
         * "moeda sem gráfico" (30/09/2026). Como na pump.fun, ela passa a abrir
         * no preço inicial da curva. Só quando o histórico veio inteiro (poucas
         * velas) e a primeira abre acima do preço inicial.
         */
        if (data.length < 500) {
          const precos = await precoInicialDaCurva();
          const primeira = data[0];
          if (precos && precos.inicial > 0 && primeira.open > precos.inicial * 1.0005) {
            data = [{ ...primeira, open: precos.inicial, low: Math.min(primeira.low, precos.inicial) }, ...data.slice(1)];
          }
          // A última vela fecha no preço da curva AGORA (depois do negócio),
          // não no preço médio que a fonte registrou — igual à pump.fun.
          if (precos && precos.inicial > 0 && data.length) {
            const u = data[data.length - 1];
            data = [...data.slice(0, -1), { ...u, close: precos.agora, high: Math.max(u.high, precos.agora), low: Math.min(u.low, precos.agora) }];
          }
          if (cancelled) return;
        }

        setStatus("live");
        /*
         * As velas chegam JUNTO com o intervalo a que pertencem. Antes, trocar
         * de 1m pra 15m fazia o gráfico redesenhar na hora com as velas de 1m
         * (o intervalo novo chegava antes delas) e depois ignorar as de 15m,
         * achando que já tinha desenhado — "clico em 15m e nada muda"
         * (28/09/2026).
         */
        setIntervaloDasVelas(interval);
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
          // Velas ao vivo mais novas que a última da fonte (minutos sem
          // negócio, que a fonte não devolve) ficam — antes eram apagadas e
          // renasciam de outro preço, desenhando velas que ninguém fez.
          if (tail) merged.push(...prev.filter((c) => c.time > tail.time));
          return merged;
        });
      } catch (error) {
        if (cancelled) return;
        console.warn("[chart] não foi possível carregar as velas:", error);
        /*
         * Numa atualização periódica, um erro NÃO apaga o que já está na tela:
         * as velas que estão lá continuam verdadeiras, só param de avançar.
         * Trocar dado bom por tela de erro por causa de uma falha passageira
         * seria piorar de propósito.
         */
        if (isRefresh) return;
        /*
         * A PRIMEIRA carga tenta de novo antes de desistir. Sem isto, uma
         * oscilação de um segundo deixava a tela em erro até a próxima
         * atualização automática — o "às vezes abre e não carrega o gráfico".
         */
        if (tentativa < 3) {
          await new Promise((r) => setTimeout(r, 1500 * tentativa));
          if (!cancelled) return load(false, tentativa + 1);
          return;
        }
        if (!(await semente())) setStatus("erro");
      }
    };

    void load();
    const timer = window.setInterval(() => void load(true), CANDLE_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [address, interval, intervalSec, pool, chain]);

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
      const limite = chain === "robinhood" ? FATOR_MAXIMO_EVM : FATOR_MAXIMO;
      if (fator > limite || fator < 1 / limite) {
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
  }, [tickDaPool, chain]);

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

  /*
   * Preço a cada 1 s direto da DexScreener, do navegador (pedido do dono,
   * 06/10/2026: "o gráfico não se mexe a cada segundo que nem na fomo"). Grátis
   * e sem passar pelo servidor. Enquanto ela responde, a pesquisa de 3 s abaixo
   * só serve de âncora — duas fontes desenhando juntas fariam a vela tremer.
   */
  const dexOkRef = useRef(false);
  useEffect(() => {
    if (!address || !candles.length || tempoReal) return;
    dexOkRef.current = false;
    const rede = chain === "robinhood" ? "robinhood" : "solana";
    let cancelado = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch(`https://api.dexscreener.com/tokens/v1/${rede}/${address}`, { cache: "no-store" });
        if (!r.ok) return;
        const pares = (await r.json()) as { priceUsd?: string; liquidity?: { usd?: number } }[];
        if (cancelado || !Array.isArray(pares) || !pares.length) return;
        const melhor = pares.reduce((a, b) => ((b.liquidity?.usd ?? 0) > (a.liquidity?.usd ?? 0) ? b : a));
        const preco = Number(melhor.priceUsd);
        if (!(preco > 0)) return;
        // Par esquisito, longe do preço que o servidor confirmou: ignora.
        const ref = referenciaRef.current;
        if (ref > 0 && (preco / ref > 1.5 || preco / ref < 1 / 1.5)) return;
        dexOkRef.current = true;
        aplicarPreco(preco);
      } catch {
        /* rede oscilou: o próximo tick tenta de novo */
      }
    };
    void tick();
    const timer = window.setInterval(tick, 1_000);
    return () => {
      cancelado = true;
      window.clearInterval(timer);
    };
  }, [address, chain, candles.length, tempoReal, aplicarPreco]);

  useEffect(() => {
    // Com o WebSocket de pé, pesquisar seria pedir de novo o que já chega sozinho.
    if (!address || !candles.length || tempoReal) return;

    /*
     * Moeda na curva de lançamento: vem também o preço em SOL. A vela só anda
     * quando ELE muda (alguém negociou). O dólar sozinho oscila com o SOL e o
     * gráfico subia e descia sem negócio nenhum (30/09/2026).
     */
    let ultimoEmSol: number | null = null;
    const tick = async () => {
      try {
        const res = await fetch(`/api/price?address=${address}`, { cache: "no-store" });
        if (!res.ok) return;
        const { priceUsd, priceSol, priceNativo } = (await res.json()) as {
          priceUsd: number;
          priceSol?: number;
          priceNativo?: number;
        };
        // Preço na moeda da rede (SOL ou ETH) — só existe para moeda na curva.
        const emNativo = priceSol ?? priceNativo;
        if (typeof emNativo === "number") {
          if (ultimoEmSol === emNativo) return;
          const primeiro = ultimoEmSol === null;
          ultimoEmSol = emNativo;
          if (primeiro) return; // a vela já está no preço das velas carregadas
        }
        if (!dexOkRef.current) aplicarPreco(priceUsd);
      } catch {
        /* rede oscilou: o próximo tick tenta de novo */
      }
    };

    const timer = window.setInterval(tick, PRICE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [address, candles.length, tempoReal, aplicarPreco]);


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
    intervaloDasVelas,
    setInterval,
  };
}

const GECKO_TF: Record<string, { path: string; aggregate: number }> = {
  "1m": { path: "minute", aggregate: 1 },
  "5m": { path: "minute", aggregate: 5 },
  "15m": { path: "minute", aggregate: 15 },
  "1h": { path: "hour", aggregate: 1 },
  "4h": { path: "hour", aggregate: 4 },
  "1d": { path: "day", aggregate: 1 },
};

async function velasDiretoDaGecko(
  chain: ChainId,
  pool: string,
  address: string,
  interval: string,
): Promise<Candle[] | null> {
  const tf = GECKO_TF[interval];
  const rede = CHAINS[chain]?.gecko;
  if (!tf || !rede) return null;
  try {
    const r = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/${rede}/pools/${pool}/ohlcv/${tf.path}` +
        `?aggregate=${tf.aggregate}&limit=300&currency=usd&token=${address}`,
      { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: { attributes?: { ohlcv_list?: number[][] } } };
    const lista = j.data?.attributes?.ohlcv_list ?? [];
    return lista
      .map(([time, open, high, low, close, volume]) => ({ time, open, high, low, close, volume }))
      .sort((a, b) => a.time - b.time);
  } catch {
    return null;
  }
}
