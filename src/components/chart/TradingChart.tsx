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
  registerIndicator,
  type Chart,
  type KLineData,
} from "klinecharts";

import { BarraDeDesenho } from "./BarraDeDesenho";
import { registrarRegua } from "./regua";
import { POR_CHAVE, parametrosPadrao } from "@/lib/indicadores";
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

/**
 * Quem é quem sai do catálogo, em `src/lib/indicadores.ts`.
 *
 * Antes as duas listas eram escritas aqui, à mão, com 8 dos 27 indicadores que
 * a biblioteca já carrega. Manter a lista no mesmo arquivo que desenha o
 * gráfico garantia que ligar um indicador novo exigisse lembrar de dois
 * lugares — o menu e aqui — e um dos dois sempre ficaria pra trás.
 */
export type Indicador = string;

/** Quais parâmetros cada indicador está usando agora, por chave. */
export type ParametrosDeIndicador = Record<string, number[]>;

const ehPrincipal = (nome: string) => POR_CHAVE.get(nome)?.painel === "velas";

/**
 * O padrão de `parametros`, fora do componente.
 *
 * Um `{}` escrito na assinatura viraria objeto novo a cada renderização, e o
 * efeito dos indicadores — que tem `parametros` nas dependências — rodaria
 * sem parar recalculando o gráfico inteiro.
 */
const VAZIO: ParametrosDeIndicador = {};

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

registrarRegua();

/*
 * RÓTULOS QUE NÃO SE REPETEM.
 *
 * Com a faixa estreita, os marcadores caem em 74.812, 74.814, 74.816… e o
 * formato compacto escrevia "$74.8K" em todos — oito rótulos iguais, que é o
 * que fazia o gráfico parecer quebrado (27/09/2026). Se o formato padrão
 * repete, o eixo passa a escrever o número inteiro com as casas que precisar.
 */
registerYAxis({
  name: EIXO_COMPACTO,
  createTicks: ({ defaultTicks }) => {
    const textos = defaultTicks.map((t) => pontePraEixo.formatar(Number(t.value)));
    if (new Set(textos).size === textos.length) {
      return defaultTicks.map((t, i) => ({ ...t, text: textos[i] }));
    }
    const valores = defaultTicks.map((t) => Number(t.value));
    const passo = Math.abs(valores[1] - valores[0]) || Math.abs(valores[0]) * 1e-4 || 1;
    const casas = Math.min(10, Math.max(0, Math.ceil(-Math.log10(passo)) + 1));
    return defaultTicks.map((t, i) => ({
      ...t,
      text: `${valores[i].toLocaleString("en-US", { minimumFractionDigits: casas, maximumFractionDigits: casas })}`,
    }));
  },
});

/**
 * Faixa mínima do eixo vertical, como indicador invisível.
 *
 * Moeda recém-lançada tem um ou dois negócios quase no mesmo preço, e a
 * escala automática dava zoom até 0,01% de variação: uma linha reta ocupando
 * a tela inteira. Esta versão da biblioteca não aceita faixa direto no eixo,
 * mas respeita `minValue`/`maxValue` de indicador — e este não desenha nada
 * nem aparece na legenda. Os limites são ajustados a cada série (ver o efeito
 * das velas): ±5% em volta do preço quando a variação real é menor que isso.
 */
const FAIXA_MINIMA = "CHROMA_FAIXA_MINIMA";
registerIndicator<{ lo?: number; hi?: number }>({
  name: FAIXA_MINIMA,
  shortName: "",
  /*
   * Duas séries num indicador criado INVISÍVEL: a biblioteca não desenha nem
   * põe etiqueta na borda, mas o cálculo da escala não olha visibilidade e
   * leva as duas em conta. É o jeito de dar faixa
   * mínima nesta versão: minValue/maxValue têm bug no 9.8 — ao aplicar, o
   * máximo é gravado no campo do mínimo (conferido no código da biblioteca).
   */
  figures: [
    { key: "lo", title: "", type: "line" },
    { key: "hi", title: "", type: "line" },
  ],
  calc: (lista) => {
    if (!lista.length) return [];
    const minimo = Math.min(...lista.map((d) => d.low));
    const maximo = Math.max(...lista.map((d) => d.high));
    const meio = (minimo + maximo) / 2;
    const estreita = meio > 0 && (maximo - minimo) / meio < 0.1;
    return lista.map(() => (estreita ? { lo: meio * 0.95, hi: meio * 1.05 } : {}));
  },
  createTooltipDataSource: () => ({ name: "", calcParamsText: "", values: [], icons: [] }),
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
  parametros = VAZIO,
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
  /**
   * O que a pessoa configurou, por indicador. Chave ausente = valor de
   * fábrica do catálogo.
   *
   * Precisa ser referência ESTÁVEL entre renderizações — um objeto literal
   * novo a cada render dispararia o efeito sem parar, e cada disparo
   * recalcula todas as séries do gráfico.
   */
  parametros?: ParametrosDeIndicador;
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
    chart.createIndicator({ name: FAIXA_MINIMA, visible: false }, true, { id: "candle_pane" });

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
      let painel = mapa.get(nome);

      if (painel === undefined) {
        /*
         * O VOLUME fica numa FAIXA PRÓPRIA, baixa, colada embaixo do preço.
         *
         * Tentei pô-lo dentro do painel das velas pra imitar o terminal de
         * referência, e isso introduziu um bug feio: os dois passam a dividir o
         * mesmo eixo. Em market cap o preço é ~3.000 contra volume ~12 e não se
         * nota; em preço por token é 0,000003 contra 12 — o volume vira uma
         * parede de barras e as velas somem numa linha no rodapé.
         *
         * Numa faixa própria as escalas são independentes, então nenhuma moeda
         * quebra o gráfico. Visualmente dá no mesmo: a faixa é curta e o selo do
         * último volume continua aparecendo na coluna do eixo.
         */
        const criado = ehPrincipal(nome)
          ? chart.createIndicator(nome, true, { id: "candle_pane" })
          : chart.createIndicator(nome, false, {
              height: nome === "VOL" ? 64 : 80,
              /* A faixa do volume não se arrasta: ela é apoio, não um gráfico. */
              dragEnabled: nome !== "VOL",
            });

        /* Nome que a biblioteca não conhece: ignora em vez de guardar lixo. */
        if (!criado) continue;

        painel = criado;
        mapa.set(nome, criado);
      }

      /*
       * Os parâmetros são aplicados SEMPRE, na criação e a cada mudança.
       *
       * É o que faz o menu de configuração valer: sem esta linha o indicador
       * nasceria com o padrão da biblioteca e ficaria surdo ao que a pessoa
       * escolhesse depois. `overrideIndicator` recalcula a série inteira, o
       * que é exatamente o desejado — período novo, curva nova.
       *
       * Vale também pro VOLUME, cujo padrão no nosso catálogo é lista VAZIA:
       * a biblioteca calcula MA5/MA10/MA20 do volume por conta própria e
       * escreve as três na legenda, e num gráfico de meme coin de minuto isso
       * é ruído sobre ruído. Antes isso era um `if` especial aqui; agora é só
       * o valor padrão dele no catálogo.
       */
      chart.overrideIndicator(
        { name: nome, calcParams: parametros[nome] ?? parametrosPadrao(nome) },
        painel,
      );
    }
  }, [indicadores, parametros, pronto]);

  /* --- A vela que a legenda mostra --------------------------------- */
  /*
   * Sob o cursor, ou a última quando o mouse está fora. É o comportamento do
   * terminal de referência: a legenda nunca fica vazia, e ela responde ao
   * cursor em vez de exigir um tooltip flutuante por cima das velas.
   */
  const [emFoco, setEmFoco] = useState<VelaEmFoco | null>(null);
  const [legendaAberta, setLegendaAberta] = useState(true);
  const [barraAberta, setBarraAberta] = useState(true);

  /* --- As etiquetas de preço, que são nossas ------------------------ */
  /*
   * Ver o comentário em `priceMark`, no estilo: a biblioteca não deixa formatar
   * o texto dessas etiquetas, então o dela fica desligado e nós desenhamos as
   * nossas por cima.
   *
   * As duas guardam posição E valor já resolvidos. A conversão de pixel pra
   * valor precisa do objeto do gráfico, que mora num ref — e ref não se lê
   * durante o render. Resolvendo dentro do efeito, o render só usa números.
   */
  const [etiquetaDoCursor, setEtiquetaDoCursor] = useState<{
    y: number;
    valor: number;
  } | null>(null);
  const [yDoUltimo, setYDoUltimo] = useState<number | null>(null);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !pronto) return;

    const aoMover = (dados: unknown) => {
      const c = dados as { kLineData?: VelaEmFoco; y?: number; paneId?: string };
      setEmFoco(c?.kLineData ?? null);

      /*
       * A etiqueta do cursor só existe no painel das velas.
       *
       * No painel de volume o valor sob o cursor é uma quantidade negociada, e
       * o formatador daqui é o de PREÇO — escreveria "$1,2M" onde estão 1,2
       * milhão de tokens. Melhor não mostrar nada.
       */
      if (typeof c?.y !== "number" || c.paneId !== "candle_pane") {
        setEtiquetaDoCursor(null);
        return;
      }

      try {
        const v = chart.convertFromPixel([{ y: c.y }], {
          paneId: "candle_pane",
          absolute: true,
        }) as Array<{ value?: number }>;
        const valor = v?.[0]?.value;
        setEtiquetaDoCursor(
          typeof valor === "number" && Number.isFinite(valor) ? { y: c.y, valor } : null,
        );
      } catch {
        setEtiquetaDoCursor(null);
      }
    };

    chart.subscribeAction(ActionType.OnCrosshairChange, aoMover);
    return () => chart.unsubscribeAction(ActionType.OnCrosshairChange, aoMover);
  }, [pronto]);

  /*
   * A posição do último preço é lida de tempos em tempos, e não por evento,
   * porque ela muda com tudo: vela nova, zoom, arraste, janela
   * redimensionada, troca de escala. Assinar cada um desses seria cinco
   * assinaturas pra manter em dia; uma leitura a cada 120ms é uma chamada
   * barata e não tem como ficar dessincronizada.
   */
  const ultima = candles.length ? candles[candles.length - 1] : null;
  /* `subindo` sem sufixo já é a da legenda, que é a vela EM FOCO — esta é
     sempre a última, e as duas divergem quando o cursor está sobre o gráfico. */
  const ultimaSubindo = ultima ? ultima.close >= ultima.open : true;

  useEffect(() => {
    if (!pronto || !ultima) return;

    const ler = () => {
      const chart = chartRef.current;
      if (!chart) return;
      try {
        const p = chart.convertToPixel(
          { value: ultima.close },
          { paneId: "candle_pane", absolute: true },
        ) as { y?: number };
        setYDoUltimo(typeof p?.y === "number" && Number.isFinite(p.y) ? p.y : null);
      } catch {
        setYDoUltimo(null);
      }
    };

    ler();
    const timer = window.setInterval(ler, 120);
    return () => window.clearInterval(timer);
  }, [pronto, ultima]);


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

  /**
   * Aproxima um passo, no centro da tela.
   *
   * A lupa do TradingView faz isso: aproxima onde a pessoa está olhando, não
   * na vela mais recente. Aproximar no fim jogaria a vista pra outro lugar.
   */
  const aproximar = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const largura = chart.getSize("candle_pane", DomPosition.Main)?.width ?? 0;
    chart.zoomAtCoordinate(1.3, { x: largura / 2, y: 0 }, 120);
  }, []);

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
      {/*
        A barra de desenho mora em arquivo próprio porque ela é um componente
        de verdade — grupos, listas que abrem ao lado, memória da última
        ferramenta usada. Misturada aqui, escondia tudo isso no meio da lógica
        do gráfico.
      */}
      <BarraDeDesenho
        ferramenta={ferramenta}
        aoEscolher={(id) => (id === null ? setFerramenta(null) : desenhar(id))}
        ima={ima}
        aoTrocarIma={() => setIma((v) => !v)}
        aoLimpar={limpar}
        aoAproximar={aproximar}
        cores={{
          borda: LINHA,
          fundo: FUNDO,
          texto: TEXTO,
          apagado: TEXTO_FRACO,
          ativo: "#2962ff",
        }}
      />
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

        {/*
          As etiquetas do eixo, compactas.

          Encostadas na direita, por cima da faixa do eixo — é onde as da
          biblioteca ficavam. `pointer-events-none` porque ali por baixo está a
          área de arrastar a escala, e uma etiqueta capturando o clique
          quebraria o gesto.
        */}
        {yDoUltimo !== null && ultima && (
          <div
            className="pointer-events-none absolute right-0 z-10 rounded-[2px] px-1.5 py-[2px] text-[11px] font-semibold leading-none text-ink-950"
            style={{
              top: yDoUltimo - 8,
              backgroundColor: ultimaSubindo ? VERDE : VERMELHO,
              fontFamily: FONTE_TV,
            }}
          >
            {formatar(ultima.close)}
          </div>
        )}

        {etiquetaDoCursor && (
          <div
            className="pointer-events-none absolute right-0 z-10 rounded-[2px] bg-[#363a45] px-1.5 py-[2px] text-[11px] leading-none text-white"
            style={{ top: etiquetaDoCursor.y - 8, fontFamily: FONTE_TV }}
          >
            {formatar(etiquetaDoCursor.valor)}
          </div>
        )}
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

/**
 * A pilha de fontes do TradingView, na ordem deles.
 *
 * Não é capricho: no Windows ela cai em Trebuchet MS, que tem desenho de letra
 * bem diferente da Inter que o resto do site usa. Com a fonte do site, os
 * números do eixo e da legenda ficavam parecidos mas não iguais — e era isso
 * que dava a sensação de "quase".
 */
export const FONTE_TV =
  "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";

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
    /*
     * -------------------------------------------------------------------
     * OS RÓTULOS DE PREÇO SÃO NOSSOS
     * -------------------------------------------------------------------
     * A biblioteca escreve o valor por extenso — "43,936,934.65" — e não há
     * como mudar: ela formata internamente com `formatPrecision` e não expõe
     * formatador nenhum pra esses rótulos (só pros marcadores do eixo, que é o
     * que o eixo registrado já aproveita). Em modo capitalização, onde os
     * números são de milhões, isso enche a lateral de dígito.
     *
     * Então a MARCA continua sendo dela — a linha tracejada, na posição certa
     * — e o TEXTO é desligado. O rótulo compacto é desenhado por cima, em
     * HTML, pela `EtiquetaDePreco`, usando o MESMO formatador do eixo; assim
     * os dois nunca discordam.
     *
     * Máxima e mínima saem de vez: o TradingView não mostra essas marcas por
     * padrão, e eram elas as duas etiquetas soltas no meio do gráfico.
     */
    priceMark: {
      last: {
        upColor: VERDE,
        downColor: VERMELHO,
        line: { style: LineType.Dashed, size: 1 },
        text: { show: false },
      },
      high: { show: false },
      low: { show: false },
    },
    /*
     * A régua de valores da biblioteca fica DESLIGADA porque nós desenhamos a
     * nossa por cima (ver `Legenda`). A dela não deixa escolher o formato dos
     * rótulos nem a ordem, e o que a gente precisa é "Abr/Máx/Mín/Fch" com o
     * valor da variação ao lado — exatamente como no terminal de referência.
     */
    tooltip: {
      showRule: TooltipShowRule.None,
      text: { color: TEXTO, size: 11, family: FONTE_TV },
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
    tooltip: {
      showRule: TooltipShowRule.None,
      text: { color: TEXTO_FRACO, size: 11, family: FONTE_TV },
    },
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
      text: { show: true, borderRadius: 2, size: 11, family: FONTE_TV },
    },
  },
  xAxis: {
    axisLine: { color: LINHA },
    tickText: { color: TEXTO_FRACO, size: 11, family: FONTE_TV },
    tickLine: { color: LINHA },
  },
  yAxis: {
    axisLine: { color: LINHA },
    tickText: { color: TEXTO_FRACO, size: 11, family: FONTE_TV },
    tickLine: { color: LINHA },
  },
  crosshair: {
    horizontal: {
      line: { color: "#9598a1", style: LineType.Dashed },
      /* Mesmo motivo da marca de último preço: o texto é nosso. */
      text: { show: false },
    },
    vertical: {
      line: { color: "#9598a1", style: LineType.Dashed },
      text: { backgroundColor: "#363a45", borderRadius: 2, size: 11, family: FONTE_TV },
    },
  },
  overlay: {
    line: { color: "#2962ff" },
    point: { color: "#2962ff", borderColor: "rgba(41,98,255,.35)" },
    polygon: { color: "rgba(41,98,255,.15)", borderColor: "#2962ff" },
    text: { color: TEXTO, family: FONTE_TV },
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
