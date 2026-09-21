"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import {
  ActionType,
  CandleType,
  DomPosition,
  LineType,
  OverlayMode,
  TooltipShowRule,
  YAxisType,
  dispose,
  init,
  registerYAxis,
  type Chart,
  type KLineData,
} from "klinecharts";

import { cn } from "@/lib/utils";
import type { EscalaDoGrafico } from "@/lib/chart-scale";
import type { Candle } from "@/lib/types";

/**
 * Gráfico de velas com barra de ferramentas e indicadores.
 *
 * ---------------------------------------------------------------------------
 * POR QUE TROCAMOS DE BIBLIOTECA
 * ---------------------------------------------------------------------------
 * Antes era `lightweight-charts`. Ela desenha velas muito bem e nada mais: não
 * tem indicador, não tem ferramenta de desenho e não tem barra lateral. Isso
 * não é limitação de configuração, é o escopo dela — quem quer análise gráfica
 * simplesmente não tinha o que usar, e o gráfico ficava "só de olhar".
 *
 * `klinecharts` traz tudo isso pronto: 20 e poucos indicadores (MA, EMA, BOLL,
 * MACD, RSI, KDJ, SAR, VOL…) e as ferramentas de desenho (tendência,
 * horizontal, raio, Fibonacci, canal, retângulo), com painéis separados por
 * indicador. É a mesma ideia do gráfico grande que os terminais usam, sem
 * depender de licença de terceiros.
 *
 * ---------------------------------------------------------------------------
 * ZOOM QUE NÃO SE PERDE
 * ---------------------------------------------------------------------------
 * A série completa só é reaplicada quando ela realmente MUDA de identidade —
 * outra moeda, outro tempo gráfico, outra escala. Tudo o mais entra por
 * `updateData`, que mexe só na última vela.
 *
 * Isso corrige um incômodo concreto da versão anterior: as velas fechadas eram
 * recarregadas de minuto em minuto e a janela recebida é deslizante, então a
 * primeira vela mudava, a série era reaplicada inteira e o gráfico SALTAVA DE
 * VOLTA sozinho — quem tivesse dado zoom ou arrastado perdia a posição a cada
 * minuto. Era isso que fazia o gráfico parecer duro.
 */

/** Ferramentas de desenho, na ordem da barra lateral. */
const FERRAMENTAS: { id: string; nome: string; icone: React.ReactNode }[] = [
  { id: "segment", nome: "Linha de tendência", icone: <IconeTendencia /> },
  { id: "horizontalStraightLine", nome: "Linha horizontal", icone: <IconeHorizontal /> },
  { id: "verticalStraightLine", nome: "Linha vertical", icone: <IconeVertical /> },
  { id: "rayLine", nome: "Raio", icone: <IconeRaio /> },
  { id: "priceLine", nome: "Linha de preço", icone: <IconePreco /> },
  { id: "fibonacciLine", nome: "Retração de Fibonacci", icone: <IconeFibonacci /> },
  { id: "parallelStraightLine", nome: "Canal paralelo", icone: <IconeCanal /> },
  { id: "priceChannelLine", nome: "Canal de preço", icone: <IconeCanalPreco /> },
  { id: "rect", nome: "Retângulo", icone: <IconeRetangulo /> },
  { id: "simpleAnnotation", nome: "Anotação", icone: <IconeNota /> },
];

/** Indicadores desenhados POR CIMA das velas. */
export const INDICADORES_PRINCIPAIS = ["MA", "EMA", "BOLL", "SAR"] as const;
/** Indicadores que ganham um painel próprio embaixo. */
export const INDICADORES_INFERIORES = ["VOL", "MACD", "RSI", "KDJ"] as const;

export type Indicador =
  | (typeof INDICADORES_PRINCIPAIS)[number]
  | (typeof INDICADORES_INFERIORES)[number];

const ehPrincipal = (nome: string) =>
  (INDICADORES_PRINCIPAIS as readonly string[]).includes(nome);

/* ------------------------------------------------------------------ */

/**
 * Eixo de preço que escreve "$1.2M" em vez de "1,200,000.00".
 *
 * ---------------------------------------------------------------------------
 * POR QUE PRECISOU DE UM EIXO PRÓPRIO
 * ---------------------------------------------------------------------------
 * A biblioteca não expõe formatador pro texto do eixo: ela escreve o número
 * cru, com separador de milhar e duas casas. Num gráfico de market cap isso
 * vira "1,200,000.00" repetido oito vezes na lateral — ilegível e ocupando o
 * dobro da largura.
 *
 * O que existe é o registro de um eixo próprio, e ele RECEBE os marcadores que
 * a biblioteca já calculou. Então nada de recalcular posição: só o texto é
 * reescrito, e toda a matemática de escala continua sendo dela.
 */
const EIXO_COMPACTO = "chroma-compacto";

/**
 * A ponte entre o componente e o eixo registrado.
 *
 * Precisa ser de módulo porque a biblioteca chama o eixo sem passar nada do
 * React. É um OBJETO, não uma variável solta: reatribuir variável de módulo
 * durante o render é efeito colateral, e o compilador do React recusa — com
 * razão. Trocar um campo dentro de um efeito é outra história.
 */
const pontePraEixo = { formatar: (v: number) => String(v) };

registerYAxis({
  name: EIXO_COMPACTO,
  createTicks: ({ defaultTicks }) =>
    defaultTicks.map((t) => ({ ...t, text: pontePraEixo.formatar(Number(t.value)) })),
});
/* ------------------------------------------------------------------ */

/**
 * O que a barra de ferramentas consegue pedir ao gráfico.
 *
 * Existe porque os botões moram no painel, um nível acima, e o gráfico é quem
 * tem o objeto da biblioteca. Sem isto, ou os botões desciam pra cá — e a barra
 * deixava de ser uma peça só — ou o objeto subia pro painel, e aí duas partes
 * mexeriam no mesmo gráfico.
 */
export interface ComandosDoGrafico {
  /** Escala do eixo: normal, porcentagem ou logarítmica. */
  escalaDoEixo: (tipo: "normal" | "percentage" | "log") => void;
  /** Volta pra vela mais recente, com animação. */
  voltarAoAgora: () => void;
  /** Quantas velas cabem na tela — é o que os botões 1D/1W/1M fazem. */
  mostrarUltimas: (quantas: number) => void;
  /** Tipo de desenho das velas. */
  tipoDeVela: (tipo: CandleType) => void;
  /** Baixa o gráfico como imagem. */
  baixarImagem: (nome: string) => void;
  /** Apaga o último desenho / apaga todos. */
  desfazerDesenho: () => void;
  limparDesenhos: () => void;
}

/** O que a legenda mostra: a vela sob o cursor, ou a última. */
export interface VelaEmFoco {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/* ------------------------------------------------------------------ */

export function TradingChart({
  candles,
  escala,
  serie,
  indicadores,
  altura = 560,
  comandos,
  rotulo,
  formatar = (v) => String(v),
}: {
  candles: Candle[];
  escala: EscalaDoGrafico;
  /** identidade da série: mudou, reaplica tudo. Ex.: "endereço:1m:mcap" */
  serie: string;
  indicadores: Indicador[];
  /** altura em px; o gráfico é a peça principal da página, então é generosa */
  altura?: number;
  /** por onde a barra de ferramentas manda no gráfico */
  comandos?: Ref<ComandosDoGrafico>;
  /** nome e tempo gráfico que aparecem na legenda, dentro do gráfico */
  rotulo?: { simbolo: string; intervalo: string };
  /** formata um valor do jeito que o eixo formata */
  formatar?: (v: number) => string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const serieAplicadaRef = useRef<string>("");
  const ultimoTsRef = useRef<number>(0);
  const painelPorIndicadorRef = useRef<Map<string, string>>(new Map());
  /** ids dos desenhos, na ordem em que nasceram — é a pilha do desfazer */
  const desenhosRef = useRef<string[]>([]);

  const [ferramenta, setFerramenta] = useState<string | null>(null);
  /*
   * Ímã, igual ao do TradingView: o ponto do desenho gruda na vela mais
   * próxima em vez de cair onde o mouse soltou. Sem ele, marcar um topo ou um
   * fundo com precisão é briga com o pixel.
   */
  const [ima, setIma] = useState(false);
  const [pronto, setPronto] = useState(false);

  /* --- Criação, uma vez ------------------------------------------- */
  useEffect(() => {
    // Presos em variáveis: na limpeza, os refs já podem apontar pra outra coisa.
    const caixa = boxRef.current;
    const paineis = painelPorIndicadorRef.current;
    if (!caixa) return;

    const chart = init(caixa, {
      locale: "pt-BR",
      // Dobra decimais longas: 0.00001338 vira 0.0₄1338, como nos terminais.
      decimalFoldThreshold: 4,
      styles: ESTILO_ESCURO,
    });
    if (!chart) return;

    chart.setPaneOptions({ id: "candle_pane", axisOptions: { name: EIXO_COMPACTO } });

    chartRef.current = chart;
    setPronto(true);

    return () => {
      dispose(caixa);
      chartRef.current = null;
      serieAplicadaRef.current = "";
      ultimoTsRef.current = 0;
      paineis.clear();
      setPronto(false);
    };
  }, []);

  /*
   * O formatador do eixo acompanha a escala.
   *
   * Em efeito, não no render: a atribuição é efeito colateral. O gráfico
   * redesenha a cada vela, então o eixo pega o formatador novo sozinho, sem
   * precisar forçar nada.
   */
  useEffect(() => {
    pontePraEixo.formatar = formatar;
  }, [formatar]);

  /* --- Dados ------------------------------------------------------- */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !candles.length) return;

    const dados: KLineData[] = candles.map((c) => ({
      // klinecharts trabalha em milissegundos; nossas velas, em segundos.
      timestamp: c.time * 1000,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));

    /*
     * Casas decimais conforme a escala. Market cap com 10 casas seria ilegível;
     * preço de meme coin com 2 casas viraria "0,00" pra tudo.
     */
    chart.setPriceVolumePrecision(escala === "mcap" ? 2 : 10, 0);

    if (serieAplicadaRef.current !== serie) {
      chart.applyNewData(dados);
      serieAplicadaRef.current = serie;
      ultimoTsRef.current = dados[dados.length - 1].timestamp;
      return;
    }

    /*
     * Mesma série: só o que é novo. `updateData` mexe na última vela, ou abre
     * uma nova quando o tempo avança — e não toca no zoom nem na rolagem.
     */
    for (const barra of dados) {
      if (barra.timestamp >= ultimoTsRef.current) {
        chart.updateData(barra);
        ultimoTsRef.current = barra.timestamp;
      }
    }
  }, [candles, serie, escala]);

  /* --- Indicadores -------------------------------------------------- */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !pronto) return;

    const mapa = painelPorIndicadorRef.current;
    const desejados = new Set<string>(indicadores);

    for (const [nome, painel] of [...mapa.entries()]) {
      if (!desejados.has(nome)) {
        chart.removeIndicator(painel, nome);
        mapa.delete(nome);
      }
    }

    for (const nome of desejados) {
      if (mapa.has(nome)) continue;
      /*
       * O VOLUME é caso à parte: ele fica DENTRO do painel das velas, como
       * barrinhas no rodapé, e não num painel próprio.
       *
       * Num painel separado ele rouba altura das velas e vem acompanhado de
       * uma legenda com três médias móveis que ninguém pediu. No terminal de
       * referência o volume é só o histograma, dividindo espaço com o preço —
       * é informação de apoio, não um gráfico à parte.
       */
      const dentroDasVelas = ehPrincipal(nome) || nome === "VOL";

      const painel = dentroDasVelas
        ? chart.createIndicator(nome, true, { id: "candle_pane" })
        : chart.createIndicator(nome, false, { height: 80 });

      if (painel) {
        mapa.set(nome, painel);

        /*
         * Sem as médias móveis do volume. A biblioteca calcula MA5/MA10/MA20
         * por padrão e escreve as três na legenda; num gráfico de meme coin de
         * minuto isso é ruído sobre ruído.
         */
        if (nome === "VOL") chart.overrideIndicator({ name: "VOL", calcParams: [] }, painel);
      }
    }
  }, [indicadores, pronto]);

  /* --- A vela que a legenda mostra --------------------------------- */
  /*
   * Sob o cursor, ou a última quando o mouse está fora. É o comportamento do
   * terminal de referência: a legenda nunca fica vazia, e ela responde ao
   * cursor em vez de exigir um tooltip flutuante por cima das velas.
   */
  const [emFoco, setEmFoco] = useState<VelaEmFoco | null>(null);
  const [legendaAberta, setLegendaAberta] = useState(true);
  const [barraAberta, setBarraAberta] = useState(true);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !pronto) return;

    const aoMover = (dados: unknown) => {
      const k = (dados as { kLineData?: VelaEmFoco })?.kLineData;
      setEmFoco(k ?? null);
    };

    chart.subscribeAction(ActionType.OnCrosshairChange, aoMover);
    return () => chart.unsubscribeAction(ActionType.OnCrosshairChange, aoMover);
  }, [pronto]);

  /* --- Os comandos que a barra de ferramentas usa ------------------- */
  useImperativeHandle(
    comandos,
    () => ({
      escalaDoEixo: (tipo) => {
        chartRef.current?.setStyles({
          yAxis: {
            type:
              tipo === "log"
                ? YAxisType.Log
                : tipo === "percentage"
                  ? YAxisType.Percentage
                  : YAxisType.Normal,
          },
        });
      },
      voltarAoAgora: () => chartRef.current?.scrollToRealTime(240),
      mostrarUltimas: (quantas) => {
        const chart = chartRef.current;
        if (!chart) return;

        /*
         * O espaço por vela é o que define o zoom. A largura é lida na hora
         * porque o painel muda de tamanho com a janela — usar um valor fixo
         * deixaria "1 dia" mostrando mais ou menos conforme a tela.
         */
        const largura = chart.getSize("candle_pane", DomPosition.Main)?.width ?? 800;
        chart.setBarSpace(Math.max(0.6, largura / quantas));
        chart.scrollToRealTime(0);
      },
      tipoDeVela: (tipo) => {
        chartRef.current?.setStyles({ candle: { type: tipo } });
      },
      baixarImagem: (nome) => {
        const chart = chartRef.current;
        if (!chart) return;

        const url = chart.getConvertPictureUrl(true, "png", FUNDO);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${nome}.png`;
        link.click();
      },
      desfazerDesenho: () => {
        /*
         * A biblioteca não guarda pilha de desfazer; o que existe é remover
         * por id. Guardamos a ordem em que os desenhos nasceram e tiramos o
         * último — que é o que "desfazer" significa pra quem desenhou.
         */
        const ultimo = desenhosRef.current.pop();
        if (ultimo) chartRef.current?.removeOverlay(ultimo);
      },
      limparDesenhos: () => {
        chartRef.current?.removeOverlay();
        desenhosRef.current = [];
        setFerramenta(null);
      },
    }),
    [comandos],
  );

  /* --- Ferramenta de desenho --------------------------------------- */
  const desenhar = useCallback(
    (id: string) => {
      const chart = chartRef.current;
      if (!chart) return;

      setFerramenta((atual) => {
        if (atual === id) return null;
        /*
         * Preso ao painel das velas. Sem o painel explícito, o desenho nasce
         * em qualquer painel em que a pessoa clicar — traçar uma linha de
         * tendência e vê-la aparecer dentro do MACD não é o que ninguém
         * espera.
         */
        const criado = chart.createOverlay(
          { name: id, mode: ima ? OverlayMode.WeakMagnet : OverlayMode.Normal },
          "candle_pane",
        );
        if (typeof criado === "string") desenhosRef.current.push(criado);
        return id;
      });
    },
    [ima],
  );

  const limpar = useCallback(() => {
    chartRef.current?.removeOverlay();
    desenhosRef.current = [];
    setFerramenta(null);
  }, []);

  const vela = emFoco ?? ultimaVela(candles);
  const variacao = vela ? vela.close - vela.open : 0;
  const variacaoPct = vela && vela.open > 0 ? (variacao / vela.open) * 100 : 0;
  const subindo = variacao >= 0;

  return (
    <div className="flex" style={{ height: altura, background: FUNDO }}>
      {/* Ferramentas de desenho, à esquerda como nos terminais de análise */}
      <div
        className={cn(
          "flex shrink-0 flex-col items-center gap-px border-r py-1.5 transition-[width]",
          barraAberta ? "w-[42px]" : "w-[24px]",
        )}
        style={{ borderColor: LINHA, background: FUNDO }}
      >
        {barraAberta && (
          <>
            <BotaoFerramenta
              nome="Cursor"
              ativo={ferramenta === null}
              onClick={() => setFerramenta(null)}
            >
              <IconeCursor />
            </BotaoFerramenta>

            <Divisor />

            {FERRAMENTAS.map((f) => (
              <BotaoFerramenta
                key={f.id}
                nome={f.nome}
                ativo={ferramenta === f.id}
                onClick={() => desenhar(f.id)}
              >
                {f.icone}
              </BotaoFerramenta>
            ))}

            <Divisor />

            <BotaoFerramenta
              nome={ima ? "Ímã ligado: pontos grudam nas velas" : "Ímã desligado"}
              ativo={ima}
              onClick={() => setIma((v) => !v)}
            >
              <IconeIma />
            </BotaoFerramenta>

            <BotaoFerramenta nome="Apagar desenhos" ativo={false} onClick={limpar}>
              <IconeLixeira />
            </BotaoFerramenta>
          </>
        )}

        {/*
          Recolher a barra, como no terminal de referência: quem não está
          desenhando ganha a largura de volta pro gráfico, que é o que
          interessa na tela.
        */}
        <button
          type="button"
          title={barraAberta ? "Recolher ferramentas" : "Mostrar ferramentas"}
          onClick={() => setBarraAberta((v) => !v)}
          className="mt-auto grid h-6 w-full place-items-center text-[#868993] transition-colors hover:text-[#d1d4dc]"
        >
          <svg viewBox="0 0 24 24" className="size-3" {...traco}>
            <path d={barraAberta ? "M15 5 8 12l7 7" : "M9 5l7 7-7 7"} />
          </svg>
        </button>
      </div>

      <div className="relative min-w-0 flex-1">
        {/*
          A legenda fica DENTRO do gráfico, no canto, e não numa faixa acima.
          É onde quem negocia procura: o olho já está no gráfico, e uma faixa
          separada custaria altura de vela — que é o que a tela tem de mais
          valioso.
        */}
        <div className="pointer-events-none absolute left-2.5 top-2 z-10 select-none">
          <div className="pointer-events-auto flex items-center gap-1.5 text-[12px] font-medium text-[#d1d4dc]">
            <span>{rotulo?.simbolo ?? ""}</span>
            <span className="text-[#868993]">·</span>
            <span>{rotulo?.intervalo ?? ""}</span>
            <span className="text-[#868993]">·</span>
            <span className="text-[#868993]">chroma</span>
          </div>

          {legendaAberta && vela && (
            <>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px]">
                <Valor rotulo="Abr" valor={formatar(vela.open)} subindo={subindo} />
                <Valor rotulo="Máx" valor={formatar(vela.high)} subindo={subindo} />
                <Valor rotulo="Mín" valor={formatar(vela.low)} subindo={subindo} />
                <Valor rotulo="Fch" valor={formatar(vela.close)} subindo={subindo} />
                {/*
                  * O sinal vai DENTRO do número ("$-19K"), não antes do
                  * cifrão. É como o terminal de referência escreve, e evita a
                  * leitura estranha de "−$19K" com dois símbolos seguidos.
                  */}
                <span className="tnum" style={{ color: subindo ? VERDE : VERMELHO }}>
                  {formatar(variacao)} ({variacaoPct.toFixed(2).replace(".", ",")}%)
                </span>
              </div>

              <div className="mt-0.5 flex items-center gap-1.5 text-[11px]">
                <span className="text-[#868993]">Volume</span>
                <span className="tnum" style={{ color: subindo ? VERDE : VERMELHO }}>
                  {compacto(vela.volume)}
                </span>
              </div>
            </>
          )}

          <button
            type="button"
            title={legendaAberta ? "Recolher valores" : "Mostrar valores"}
            onClick={() => setLegendaAberta((v) => !v)}
            className="pointer-events-auto mt-1 grid size-4 place-items-center rounded border border-[#2a2e39] bg-[#1e222d] text-[#868993] transition-colors hover:text-[#d1d4dc]"
          >
            <svg viewBox="0 0 24 24" className="size-2.5" {...traco}>
              <path d={legendaAberta ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
            </svg>
          </button>
        </div>

        <div ref={boxRef} className="size-full" />
      </div>
    </div>
  );
}

/** Um par rótulo/valor da legenda, no formato do terminal de referência. */
function Valor({
  rotulo,
  valor,
  subindo,
}: {
  rotulo: string;
  valor: string;
  subindo: boolean;
}) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-[#868993]">{rotulo}</span>
      <span className="tnum" style={{ color: subindo ? VERDE : VERMELHO }}>
        {valor}
      </span>
    </span>
  );
}

function Divisor() {
  return <div className="my-1 h-px w-5" style={{ background: LINHA }} />;
}

/** A última vela com dados — é o que a legenda mostra fora do cursor. */
function ultimaVela(candles: Candle[]): VelaEmFoco | null {
  const c = candles[candles.length - 1];
  return c
    ? { open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }
    : null;
}

/** 7940 vira "7,94 K". Volume inteiro não cabe e não informa. */
function compacto(n: number): string {
  const abs = Math.abs(n);
  const fmt = (v: number, s: string) =>
    `${v.toFixed(2).replace(".", ",")} ${s}`.replace(",00 ", " ");

  if (abs >= 1e9) return fmt(n / 1e9, "B");
  if (abs >= 1e6) return fmt(n / 1e6, "M");
  if (abs >= 1e3) return fmt(n / 1e3, "K");
  return n.toFixed(2).replace(".", ",");
}

/* ------------------------------------------------------------------ */

function BotaoFerramenta({
  nome,
  ativo,
  onClick,
  children,
}: {
  nome: string;
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={nome}
      aria-label={nome}
      aria-pressed={ativo}
      onClick={onClick}
      className={cn(
        "grid size-[32px] place-items-center rounded transition-colors",
        ativo
          ? "bg-[#2962ff]/20 text-[#2962ff]"
          : "text-[#868993] hover:bg-white/5 hover:text-[#d1d4dc]",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Tema escuro do gráfico.
 *
 * Fora do componente: o objeto é constante, e recriá-lo a cada render faria a
 * biblioteca recalcular estilo à toa no caminho mais quente da tela.
 */
/*
 * As cores do tema ESCURO PADRÃO do TradingView, não uma aproximação.
 *
 * O verde e o vermelho são os mesmos que eles usam hoje (#089981 e #F23645),
 * o fundo é o #131722 clássico e as linhas de grade o #1e222d. Foi pedido
 * assim de propósito: quem negocia reconhece esse conjunto de olho fechado, e
 * uma paleta "parecida" só faz o gráfico parecer imitação.
 */
const VERDE = "#089981";
const VERMELHO = "#F23645";
const FUNDO = "#131722";
const LINHA = "#2a2e39";
const TEXTO = "#d1d4dc";
const TEXTO_FRACO = "#868993";

const ESTILO_ESCURO = {
  grid: {
    horizontal: { color: "#1e222d" },
    vertical: { color: "#1e222d" },
  },
  candle: {
    bar: {
      upColor: VERDE,
      downColor: VERMELHO,
      noChangeColor: "#787b86",
      upBorderColor: VERDE,
      downBorderColor: VERMELHO,
      upWickColor: VERDE,
      downWickColor: VERMELHO,
    },
    priceMark: {
      last: {
        upColor: VERDE,
        downColor: VERMELHO,
        line: { style: LineType.Dashed, size: 1 },
        text: { borderRadius: 2, paddingLeft: 4, paddingRight: 4, size: 11 },
      },
      high: { color: "#787b86" },
      low: { color: "#787b86" },
    },
    /*
     * A régua de valores da biblioteca fica DESLIGADA porque nós desenhamos a
     * nossa por cima (ver `Legenda`). A dela não deixa escolher o formato dos
     * rótulos nem a ordem, e o que a gente precisa é "Abr/Máx/Mín/Fch" com o
     * valor da variação ao lado — exatamente como no terminal de referência.
     */
    tooltip: {
      showRule: TooltipShowRule.None,
      text: { color: TEXTO, size: 11 },
      rect: {
        color: "rgba(30,34,45,.95)",
        borderColor: "#363a45",
        borderRadius: 4,
      },
    },
  },
  indicator: {
    /*
     * A régua de indicador fica desligada porque a nossa legenda já mostra o
     * volume, e o texto dela ficava POR CIMA das velas no canto de cima.
     */
    tooltip: { showRule: TooltipShowRule.None, text: { color: TEXTO_FRACO, size: 11 } },
    bars: [
      {
        upColor: "rgba(8,153,129,.5)",
        downColor: "rgba(242,54,69,.5)",
        noChangeColor: "rgba(120,123,134,.5)",
      },
    ],
    /*
     * O selo do último volume FICA. No terminal de referência ele aparece no
     * rodapé do eixo, e é por ele que se lê o volume da vela atual sem tirar o
     * olho do preço.
     */
    lastValueMark: {
      show: true,
      text: { show: true, borderRadius: 2, size: 11 },
    },
  },
  xAxis: {
    axisLine: { color: LINHA },
    tickText: { color: TEXTO_FRACO, size: 11 },
    tickLine: { color: LINHA },
  },
  yAxis: {
    axisLine: { color: LINHA },
    tickText: { color: TEXTO_FRACO, size: 11 },
    tickLine: { color: LINHA },
  },
  crosshair: {
    horizontal: {
      line: { color: "#9598a1", style: LineType.Dashed },
      text: { backgroundColor: "#363a45", borderRadius: 2, size: 11 },
    },
    vertical: {
      line: { color: "#9598a1", style: LineType.Dashed },
      text: { backgroundColor: "#363a45", borderRadius: 2, size: 11 },
    },
  },
  overlay: {
    line: { color: "#2962ff" },
    point: { color: "#2962ff", borderColor: "rgba(41,98,255,.35)" },
    polygon: { color: "rgba(41,98,255,.15)", borderColor: "#2962ff" },
    text: { color: TEXTO },
  },
  separator: { color: LINHA },
};

/* ------------------------------------------------------------------ */
/* Ícones                                                              */
/* ------------------------------------------------------------------ */

/*
 * Copiados da linguagem visual da barra do TradingView, forma por forma:
 *
 *  - traço fino e constante, sem preenchimento e sem bolinha nas pontas;
 *  - a cruz do cursor é feita de quatro segmentos com um vazio no meio;
 *  - as linhas horizontais são um "≡" de comprimentos diferentes;
 *  - a Fibonacci é uma barra vertical à esquerda com os níveis saindo dela;
 *  - o texto é um "T" simples, e o ímã é a ferradura com as duas pontas.
 *
 * As duas primeiras tentativas erraram justamente nisso: eram formas
 * genéricas, cada uma com um peso de traço, e a barra parecia um apanhado de
 * ícones de origens diferentes em vez de um conjunto.
 */
const traco = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" className="size-[18px]" {...traco}>
    {children}
  </svg>
);

/** Cruz do cursor: quatro segmentos com o centro vazado. */
function IconeCursor() {
  return (
    <Svg>
      <path d="M12 3v6.5M12 14.5V21M3 12h6.5M14.5 12H21" />
    </Svg>
  );
}

/** Linha de tendência: uma diagonal limpa, sem pontas. */
function IconeTendencia() {
  return (
    <Svg>
      <path d="M4 19 20 5" />
    </Svg>
  );
}

/** Grupo das horizontais: o "≡" de comprimentos alternados. */
function IconeHorizontal() {
  return (
    <Svg>
      <path d="M3 7h18M3 12h12M3 17h18" />
    </Svg>
  );
}

function IconeVertical() {
  return (
    <Svg>
      <path d="M7 3v18M12 3v12M17 3v18" />
    </Svg>
  );
}

/** Raio: diagonal que começa num ponto e segue sem fim. */
function IconeRaio() {
  return (
    <Svg>
      <path d="M5 19 20 4" />
      <path d="M5 19v-2.5M5 19h2.5" />
    </Svg>
  );
}

/** Linha de preço: horizontal com a etiqueta no eixo. */
function IconePreco() {
  return (
    <Svg>
      <path d="M3 12h11" />
      <path d="M15.5 8.8h5.5v6.4h-5.5l-2-3.2z" />
    </Svg>
  );
}

/** Retração de Fibonacci: barra vertical e os níveis saindo dela. */
function IconeFibonacci() {
  return (
    <Svg>
      <path d="M4 4v16" />
      <path d="M4 5h17M4 9.7h13M4 14.3h13M4 19h17" />
    </Svg>
  );
}

/** Canal paralelo: duas diagonais iguais. */
function IconeCanal() {
  return (
    <Svg>
      <path d="M3 16 13 5M11 19 21 8" />
    </Svg>
  );
}

/** Canal de preço: as duas bordas e a mediana pontilhada. */
function IconeCanalPreco() {
  return (
    <Svg>
      <path d="M3 16 13 5M11 19 21 8" />
      <path d="M7 17.5 17 6.5" strokeDasharray="1.8 2.2" />
    </Svg>
  );
}

function IconeRetangulo() {
  return (
    <Svg>
      <rect x="3.5" y="6" width="17" height="12" rx="0.8" />
    </Svg>
  );
}

/** Texto: o "T" da barra do TradingView. */
function IconeNota() {
  return (
    <Svg>
      <path d="M5 5.5h14M12 5.5v13" />
    </Svg>
  );
}

/** Ímã: a ferradura com as duas pontas marcadas. */
function IconeIma() {
  return (
    <Svg>
      <path d="M6 20V11a6 6 0 0 1 12 0v9" />
      <path d="M6 15.5h4.5M13.5 15.5H18" />
      <path d="M6 20h4.5M13.5 20H18" />
    </Svg>
  );
}

function IconeLixeira() {
  return (
    <Svg>
      <path d="M4 6.5h16" />
      <path d="M9.5 6.5V4.2h5v2.3" />
      <path d="M6.5 6.5 7.5 20h9l1-13.5" />
    </Svg>
  );
}
