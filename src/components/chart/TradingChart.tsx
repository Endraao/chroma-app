"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LineType,
  OverlayMode,
  TooltipShowRule,
  dispose,
  init,
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

export function TradingChart({
  candles,
  escala,
  serie,
  indicadores,
  altura = 560,
}: {
  candles: Candle[];
  escala: EscalaDoGrafico;
  /** identidade da série: mudou, reaplica tudo. Ex.: "endereço:1m:mcap" */
  serie: string;
  indicadores: Indicador[];
  /** altura em px; o gráfico é a peça principal da página, então é generosa */
  altura?: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const serieAplicadaRef = useRef<string>("");
  const ultimoTsRef = useRef<number>(0);
  const painelPorIndicadorRef = useRef<Map<string, string>>(new Map());

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
      const painel = ehPrincipal(nome)
        ? chart.createIndicator(nome, true, { id: "candle_pane" })
        : chart.createIndicator(nome, false, { height: 80 });
      if (painel) mapa.set(nome, painel);
    }
  }, [indicadores, pronto]);

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
        chart.createOverlay(
          { name: id, mode: ima ? OverlayMode.WeakMagnet : OverlayMode.Normal },
          "candle_pane",
        );
        return id;
      });
    },
    [ima],
  );

  const limpar = useCallback(() => {
    chartRef.current?.removeOverlay();
    setFerramenta(null);
  }, []);

  return (
    <div className="flex" style={{ height: altura }}>
      {/* Barra de ferramentas, à esquerda como nos terminais de análise */}
      <div className="flex w-[38px] shrink-0 flex-col items-center gap-px border-r border-white/[0.06] bg-white/[0.015] py-1.5">
        <BotaoFerramenta
          nome="Cursor"
          ativo={ferramenta === null}
          onClick={() => setFerramenta(null)}
        >
          <IconeCursor />
        </BotaoFerramenta>

        <div className="my-1 h-px w-4 bg-white/[0.08]" />

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

        <div className="my-1 h-px w-4 bg-white/[0.08]" />

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
      </div>

      <div ref={boxRef} className="min-w-0 flex-1" />
    </div>
  );
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
        "grid size-[30px] place-items-center rounded-md transition-colors",
        ativo
          ? "bg-chroma-violet/20 text-chroma-violet"
          : "text-zinc-600 hover:bg-white/5 hover:text-zinc-300",
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
const ESTILO_ESCURO = {
  grid: {
    horizontal: { color: "rgba(255,255,255,0.035)" },
    vertical: { color: "rgba(255,255,255,0.035)" },
  },
  candle: {
    bar: {
      upColor: "#22c55e",
      downColor: "#ef4444",
      noChangeColor: "#71717a",
      upBorderColor: "#22c55e",
      downBorderColor: "#ef4444",
      upWickColor: "rgba(34,197,94,.7)",
      downWickColor: "rgba(239,68,68,.7)",
    },
    priceMark: {
      last: {
        upColor: "#22c55e",
        downColor: "#ef4444",
        line: { style: LineType.Dashed },
        text: { borderRadius: 3 },
      },
      high: { color: "#71717a" },
      low: { color: "#71717a" },
    },
    /*
     * Sem a régua de valores no topo. A biblioteca desenha sempre uma linha
     * com hora/abertura/máxima/mínima/fechamento por cima das velas; ela
     * repete o que já está no cabeçalho do painel e no rodapé, e come espaço
     * do gráfico. Os mesmos números aparecem no eixo e ao passar o mouse.
     */
    tooltip: {
      showRule: TooltipShowRule.None,
      text: { color: "#d4d4d8", size: 11 },
      rect: {
        color: "rgba(10,10,15,.92)",
        borderColor: "rgba(255,255,255,.1)",
        borderRadius: 8,
      },
    },
  },
  indicator: {
    tooltip: { text: { color: "#a1a1aa", size: 11 } },
    bars: [
      {
        upColor: "rgba(34,197,94,.45)",
        downColor: "rgba(239,68,68,.45)",
        noChangeColor: "rgba(113,113,122,.45)",
      },
    ],
  },
  xAxis: {
    axisLine: { color: "rgba(255,255,255,0.06)" },
    tickText: { color: "#71717a", size: 10 },
    tickLine: { color: "rgba(255,255,255,0.06)" },
  },
  yAxis: {
    axisLine: { color: "rgba(255,255,255,0.06)" },
    tickText: { color: "#71717a", size: 10 },
    tickLine: { color: "rgba(255,255,255,0.06)" },
  },
  crosshair: {
    horizontal: {
      line: { color: "rgba(139,92,246,.5)" },
      text: { backgroundColor: "#8b5cf6", borderRadius: 3 },
    },
    vertical: {
      line: { color: "rgba(139,92,246,.5)" },
      text: { backgroundColor: "#8b5cf6", borderRadius: 3 },
    },
  },
  overlay: {
    line: { color: "#8b5cf6" },
    point: { color: "#8b5cf6", borderColor: "rgba(139,92,246,.35)" },
    polygon: { color: "rgba(139,92,246,.15)", borderColor: "#8b5cf6" },
    text: { color: "#e4e4e7" },
  },
  separator: { color: "rgba(255,255,255,0.06)" },
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
