"use client";

import { useIdioma, useTextos } from "@/components/IdiomaProvider";
import { traducoes, type Idioma } from "@/lib/idiomas";

import { useEffect, useMemo, useRef, useState } from "react";

import { CandleType } from "klinecharts";

import {
  FONTE_TV,
  TradingChart,
  type ComandosDoGrafico,
  type Indicador,
  type ParametrosDeIndicador,
} from "./TradingChart";
import { INTERVALS, useLiveChartData, type Interval } from "@/hooks/useLiveChartData";
import {
  EM_PAINEL_PROPRIO,
  POR_CHAVE,
  SOBRE_AS_VELAS,
  parametrosPadrao,
  prender,
  type Indicador as DoCatalogo,
} from "@/lib/indicadores";
import {
  aplicarEscala,
  fornecimentoEmCirculacao,
  rotuloCompacto,
  type EscalaDoGrafico,
} from "@/lib/chart-scale";
import { cn, formatPrice, formatUsd } from "@/lib/utils";
import type { ChainId } from "@/lib/types";

/*
 * Nomes e notas dos indicadores por idioma. O catálogo (lib/indicadores.ts)
 * guarda o português; aqui ficam inglês e chinês, pela chave do indicador.
 */
const INDICADORES_TRAD: Partial<Record<Idioma, Record<string, [string, string]>>> = {
  en: {
    MA: ["Simple moving average", "The average price over the last N bars"],
    EMA: ["Exponential moving average", "Like the simple one, but weights recent prices more"],
    SMA: ["Smoothed moving average", "An average that reacts more slowly to jolts"],
    BOLL: ["Bollinger Bands", "A corridor around the average; price outside it is extreme"],
    BBI: ["Bull and Bear Index", "Four averages condensed into a single line"],
    SAR: ["Parabolic SAR", "Dots marking where the trend may reverse"],
    AVP: ["Volume-weighted average price", "Average price weighted by traded volume"],
    VOL: ["Volume", "How much was traded in each bar"],
    MACD: ["MACD", "The distance between two averages; measures trend strength"],
    RSI: ["Relative Strength Index", "0 to 100: above 70 is stretched, below 30 is beaten down"],
    KDJ: ["Stochastic KDJ", "Where the price closed within the recent range"],
    WR: ["Williams %R", "Similar to the stochastic, inverted scale"],
    CCI: ["Commodity Channel Index", "How far the price moved away from its own average"],
    BIAS: ["Bias", "In %, how far the price is from the average"],
    MTM: ["Momentum", "The speed of the price change"],
    ROC: ["Rate of change", "How much the price changed, in %, versus N bars ago"],
    TRIX: ["Triple smoothed average", "Filters short-term noise; good for long trends"],
    DMI: ["Directional Movement Index", "Tells whether there is a trend, and in which direction"],
    DMA: ["Difference of moving averages", "The distance between a short and a long average"],
    OBV: ["On-balance volume", "Adds volume on up bars and subtracts on down bars"],
    PVT: ["Price volume trend", "Like OBV, but weighted by the price change"],
    VR: ["Volume ratio", "Ratio between up and down volume"],
    EMV: ["Ease of movement", "How much volume it took to move the price"],
    PSY: ["Psychological line", "In how many of the last N bars the price rose"],
    AO: ["Awesome oscillator", "Two averages of the bar midpoint against each other"],
    BRAR: ["BRAR", "Compares the strength of buyers and sellers"],
    CR: ["CR energy index", "Market energy with four average windows"],
  },
  zh: {
    MA: ["简单移动平均", "最近 N 根K线的平均价格"],
    EMA: ["指数移动平均", "与简单均线类似，但更重视近期价格"],
    SMA: ["平滑移动平均", "对剧烈波动反应更慢的均线"],
    BOLL: ["布林带", "围绕均线的通道；价格超出即为极端"],
    BBI: ["多空指数", "把四条均线浓缩成一条"],
    SAR: ["抛物线转向", "标记趋势可能反转的位置"],
    AVP: ["成交量加权均价", "按成交量加权的平均价格"],
    VOL: ["成交量", "每根K线的成交量"],
    MACD: ["MACD", "两条均线之间的距离，衡量趋势强度"],
    RSI: ["相对强弱指数", "0 到 100：高于 70 为超买，低于 30 为超卖"],
    KDJ: ["随机指标 KDJ", "收盘价在近期区间中的位置"],
    WR: ["威廉指标", "类似随机指标，刻度相反"],
    CCI: ["顺势指标", "价格偏离自身均线的程度"],
    BIAS: ["乖离率", "价格偏离均线的百分比"],
    MTM: ["动量指标", "价格变化的速度"],
    ROC: ["变动率", "与 N 根K线前相比价格变化的百分比"],
    TRIX: ["三重指数平滑", "过滤短期噪音，适合长期趋势"],
    DMI: ["趋向指标", "判断是否存在趋势以及方向"],
    DMA: ["平均差", "短期与长期均线之间的差距"],
    OBV: ["能量潮", "上涨累加成交量，下跌扣减成交量"],
    PVT: ["价量趋势", "类似能量潮，但按价格变化加权"],
    VR: ["成交量比率", "上涨与下跌成交量之比"],
    EMV: ["简易波动指标", "推动价格所需的成交量"],
    PSY: ["心理线", "最近 N 根K线中上涨的比例"],
    AO: ["动量震荡指标", "两条K线中点均线的对比"],
    BRAR: ["人气意愿指标", "比较买方与卖方的力量"],
    CR: ["能量指标 CR", "用四个均线窗口衡量市场能量"],
  },
};

const PARAMETROS_TRAD: Partial<Record<Idioma, Record<string, string>>> = {
  en: {
    Período: "Period", "Período 1": "Period 1", "Período 2": "Period 2", "Período 3": "Period 3", "Período 4": "Period 4",
    Média: "Average", "Média 1": "Average 1", "Média 2": "Average 2", "Média 3": "Average 3", "Média 4": "Average 4",
    Curta: "Short", Longa: "Long", Lenta: "Slow", Rápida: "Fast", Sinal: "Signal", Suavização: "Smoothing",
    "Suavização K": "K smoothing", "Suavização D": "D smoothing", Desvios: "Deviations", Peso: "Weight",
    Início: "Start", Passo: "Step", Máximo: "Maximum",
  },
  zh: {
    Período: "周期", "Período 1": "周期 1", "Período 2": "周期 2", "Período 3": "周期 3", "Período 4": "周期 4",
    Média: "均线", "Média 1": "均线 1", "Média 2": "均线 2", "Média 3": "均线 3", "Média 4": "均线 4",
    Curta: "短期", Longa: "长期", Lenta: "慢线", Rápida: "快线", Sinal: "信号", Suavização: "平滑",
    "Suavização K": "K 平滑", "Suavização D": "D 平滑", Desvios: "标准差", Peso: "权重",
    Início: "起始", Passo: "步长", Máximo: "最大值",
  },
};

const TEXTOS = traducoes({
  en: {
    tipoDeGrafico: "Chart type", sobreposicoes: "Chart overlays", sobreVelas: "On the candles", painelSeparado: "Separate pane", preco: "Price",
    desfazer: "Undo drawing", apagar: "Delete all drawings", restaurarZoom: "Reset zoom", telaCheia: "Full screen",
    baixarImagem: "Download image", baixarGrafico: "Download chart image", voltar: "Back to latest candle",
    erroVelas: "Could not load candles right now.", semHistorico: "This coin has no trading history yet.",
    tempoReal: "Real time: the candle moves with every trade, read from the chain.", aoVivo: "Live: the price is checked every 3 seconds.",
    carregando: "Loading chart…", velasAparecem: "As soon as trades are recorded on the pair, candles appear here.",
    limitando: "The market data source is rate-limiting us. Retrying automatically.",
    escalaPct: "Percentage scale", escalaLog: "Logarithmic scale", escalaAuto: "Auto scale",
    meusSwaps: "My swaps", meusSwapsDica: "Marks your buys and sells of this coin on the chart", ajustar: "Adjust", restaurarPadrao: "restore default",
    velas: { candle_solid: "Candles", candle_stroke: "Hollow candles", ohlc: "Bars", area: "Line" } as Record<string, string>,
  },
  pt: {
    tipoDeGrafico: "Tipo de gráfico", sobreposicoes: "Sobreposições do gráfico", sobreVelas: "Sobre as velas", painelSeparado: "Painel separado", preco: "Preço",
    desfazer: "Desfazer desenho", apagar: "Apagar todos os desenhos", restaurarZoom: "Restaurar o zoom", telaCheia: "Tela cheia",
    baixarImagem: "Baixar imagem", baixarGrafico: "Baixar imagem do gráfico", voltar: "Voltar pra vela mais recente",
    erroVelas: "Não foi possível carregar as velas agora.", semHistorico: "Esta moeda ainda não tem histórico de negociação.",
    tempoReal: "Tempo real: a vela anda a cada negócio, lido da própria rede.", aoVivo: "Ao vivo: o preço é conferido a cada 3 segundos.",
    carregando: "Carregando o gráfico…", velasAparecem: "Assim que houver negócios registrados no par, as velas aparecem aqui.",
    limitando: "A fonte de mercado está limitando as consultas. Estamos tentando de novo sozinhos.",
    escalaPct: "Escala em porcentagem", escalaLog: "Escala logarítmica", escalaAuto: "Escala automática",
    meusSwaps: "Meus swaps", meusSwapsDica: "Marca no gráfico as suas compras e vendas desta moeda", ajustar: "Ajustar", restaurarPadrao: "restaurar padrão",
    velas: {} as Record<string, string>,
  },
  zh: {
    tipoDeGrafico: "图表类型", sobreposicoes: "图表叠加", sobreVelas: "主图指标", painelSeparado: "副图指标", preco: "价格",
    desfazer: "撤销绘图", apagar: "删除所有绘图", restaurarZoom: "重置缩放", telaCheia: "全屏",
    baixarImagem: "下载图片", baixarGrafico: "下载图表图片", voltar: "回到最新K线",
    erroVelas: "暂时无法加载K线。", semHistorico: "该代币还没有交易记录。",
    tempoReal: "实时：K线随每笔链上交易更新。", aoVivo: "实时：每 3 秒核对一次价格。",
    carregando: "图表加载中…", velasAparecem: "一旦该交易对有交易记录，K线就会显示在这里。",
    limitando: "行情数据源正在限流，系统会自动重试。",
    escalaPct: "百分比坐标", escalaLog: "对数坐标", escalaAuto: "自动缩放",
    meusSwaps: "我的交易", meusSwapsDica: "在图表上标记你对该代币的买入和卖出", ajustar: "调整", restaurarPadrao: "恢复默认",
    velas: { candle_solid: "K线", candle_stroke: "空心K线", ohlc: "美国线", area: "折线" } as Record<string, string>,
  },
});

export function ChartPanel({
  address,
  symbol,
  chain,
  pool,
  marketCapUsd,
  priceUsd,
  quoteAddress,
  quotePriceUsd,
  onTick,
}: {
  address: string;
  symbol: string;
  chain: ChainId;
  /** endereço do par — habilita o preço em tempo real, negócio a negócio */
  pool?: string | null;
  marketCapUsd: number;
  priceUsd: number;
  quoteAddress?: string | null;
  quotePriceUsd?: number;
  /** preço ao vivo e volume somado na sessão, pro cabeçalho acompanhar */
  onTick?: (dados: { price: number; volumeObservadoUsd: number }) => void;
}) {
  const tx = useTextos(TEXTOS);
  const {
    candles,
    price,
    change,
    status,
    tempoReal,
    volumeObservadoUsd,
    interval,
    intervaloDasVelas,
    setInterval,
    lastCandle,
  } = useLiveChartData({ address, pool, chain, quoteAddress, quotePriceUsd });

  const [indicadores, setIndicadores] = useState<Indicador[]>(["VOL"]);

  /**
   * O que a pessoa configurou, por indicador.
   *
   * Só entra aqui o que foi MEXIDO — o que está no padrão fica de fora, e o
   * gráfico cai no valor de fábrica do catálogo. Guardar tudo faria o objeto
   * carregar 27 listas pra descrever "nada foi alterado", e a mudança de um
   * padrão no catálogo deixaria de valer pra quem já abriu a página.
   */
  const [parametros, setParametros] = useState<ParametrosDeIndicador>({});
  /** Qual indicador está com a gaveta de ajustes aberta; um de cada vez. */
  const [ajustando, setAjustando] = useState<string | null>(null);
  /** Qual menu da barra está aberto; um de cada vez. */
  const [menu, setMenu] = useState<
    "intervalo" | "vela" | "indicadores" | "chart" | null
  >(null);
  const abrir = (qual: typeof menu) => setMenu((atual) => (atual === qual ? null : qual));

  const [tipoDeVela, setTipoDeVela] = useState<CandleType>(CandleType.CandleSolid);
  const [eixo, setEixo] = useState<"normal" | "percentage" | "log">("normal");
  const [mostrarMeusSwaps, setMostrarMeusSwaps] = useState(true);

  /** Os comandos que o gráfico expõe pra esta barra. */
  const grafico = useRef<ComandosDoGrafico>(null);
  const caixaRef = useRef<HTMLDivElement>(null);

  const trocarEixo = (tipo: "normal" | "percentage" | "log") => {
    setEixo(tipo);
    grafico.current?.escalaDoEixo(tipo);
  };

  const alternarTelaCheia = () => {
    const caixa = caixaRef.current;
    if (!caixa) return;

    if (document.fullscreenElement) void document.exitFullscreen();
    else void caixa.requestFullscreen?.();
  };

  /*
   * Relógio da barra de baixo, com o fuso de quem está olhando.
   *
   * De segundo em segundo, e só quando a aba está visível: um relógio rodando
   * numa aba escondida acorda o processador sem ninguém pra ler.
   */
  const [relogio, setRelogio] = useState("");
  useEffect(() => {
    const tique = () => {
      if (document.hidden) return;
      const agora = new Date();
      const hora = agora.toLocaleTimeString("pt-BR", { hour12: false });
      const fuso = -agora.getTimezoneOffset() / 60;
      const sinal = fuso >= 0 ? "+" : "−";
      setRelogio(`${hora} UTC${sinal}${Math.abs(fuso)}`);
    };

    tique();
    const id = window.setInterval(tique, 1000);
    return () => window.clearInterval(id);
  }, []);


  // Constante: preço x fornecimento. Ver src/lib/chart-scale.ts.
  const fornecimento = useMemo(
    () => fornecimentoEmCirculacao({ marketCapUsd, priceUsd }),
    [marketCapUsd, priceUsd],
  );

  /*
   * O gráfico é SEMPRE de market cap. "$0,000284" não diz nada a quase
   * ninguém e enche o eixo de zeros; "$283,7K" a pessoa compara na hora com
   * outra moeda — é o que os terminais de meme coin mostram.
   *
   * Cai pra preço por token só quando não dá pra deduzir o fornecimento, que é
   * a única situação em que um eixo de market cap seria número inventado.
   */
  const temMcap = fornecimento > 0;

  /*
   * O padrão é market cap, mas agora dá pra trocar.
   *
   * "$0,000284" não diz nada a quase ninguém e enche o eixo de zeros; market
   * cap a pessoa compara na hora com outra moeda. Mas quem quer o preço por
   * token não deveria ter que fazer conta — daí o par Preço/MCap na barra.
   */
  const [escalaEscolhida, setEscala] = useState<EscalaDoGrafico | null>(null);

  const escalaEfetiva: EscalaDoGrafico = !temMcap
    ? "preco"
    : (escalaEscolhida ?? "mcap");

  const candlesNaEscala = useMemo(
    () => aplicarEscala(candles, escalaEfetiva, fornecimento),
    [candles, escalaEfetiva, fornecimento],
  );

  /**
   * Não há o que desenhar.
   *
   * Enquanto está carregando, o gráfico fica: ele mesmo mostra o esqueleto. A
   * tela de aviso só entra quando a busca TERMINOU sem vela nenhuma — seja
   * porque o par não tem histórico, seja porque a fonte recusou.
   */
  const semVelas = candlesNaEscala.length === 0 && (status === "vazio" || status === "erro");

  /** Formata um PREÇO POR TOKEN na escala escolhida. */
  const emEscala = (v: number) =>
    escalaEfetiva === "mcap" ? `$${rotuloCompacto(v * fornecimento)}` : `$${formatPrice(v)}`;

  /*
   * Formata um valor que JÁ ESTÁ na escala do gráfico.
   *
   * A diferença com `emEscala` é sutil e custou um bug: as velas passam por
   * `aplicarEscala` antes de entrar no gráfico, então os valores da legenda já
   * são market cap. Usar o outro formatador ali multiplicava pelo fornecimento
   * de novo e a abertura aparecia como "$22849402433,33B".
   */
  const jaNaEscala = (v: number) =>
    escalaEfetiva === "mcap" ? `$${rotuloCompacto(v)}` : `$${formatPrice(v)}`;

  /*
   * Repassa o preço pro widget de swap. Em efeito, não no render: chamar o
   * setState do pai durante o render quebra o React.
   *
   * E no máximo uma vez por segundo. Em tempo real o preço muda muitas vezes
   * por segundo, e cada aviso ao pai redesenha a página INTEIRA do token —
   * incluindo o painel de swap, que não tem nada a ganhar com isso. O gráfico
   * continua andando na velocidade cheia; só a conversa com o resto da tela é
   * que fica no ritmo de quem lê.
   */
  const ultimoAvisoRef = useRef(0);
  useEffect(() => {
    if (!price) return;
    const agora = Date.now();
    if (agora - ultimoAvisoRef.current < 1000) return;
    ultimoAvisoRef.current = agora;
    onTick?.({ price, volumeObservadoUsd });
  }, [price, volumeObservadoUsd, onTick]);

  const alternar = (nome: Indicador) =>
    setIndicadores((atual) =>
      atual.includes(nome) ? atual.filter((i) => i !== nome) : [...atual, nome],
    );

  /**
   * Troca um parâmetro de um indicador.
   *
   * Guarda a lista INTEIRA, não só o valor mexido: é o formato que
   * `overrideIndicator` espera, e montar a lista na hora de enviar faria a
   * ordem dos números depender de duas partes do código concordarem.
   */
  const trocarParametro = (chave: string, posicao: number, bruto: number) => {
    const definicao = POR_CHAVE.get(chave);
    if (!definicao) return;

    setParametros((atual) => {
      const lista = [...(atual[chave] ?? parametrosPadrao(chave))];
      lista[posicao] = prender(bruto, definicao.parametros[posicao]!);
      return { ...atual, [chave]: lista };
    });
  };

  /** Volta o indicador pro valor de fábrica, tirando a chave do objeto. */
  const restaurarParametros = (chave: string) =>
    setParametros((atual) => {
      const copia = { ...atual };
      delete copia[chave];
      return copia;
    });

  return (
    <div
      ref={caixaRef}
      className="overflow-hidden rounded-xl border"
      /*
       * A fonte desce daqui pra tudo que está dentro — barra, legenda, rodapé.
       * O canvas do gráfico recebe a mesma por configuração; as duas partes
       * precisam combinar, senão a emenda entre o HTML e o desenho aparece.
       */
      style={{ borderColor: BORDA, background: FUNDO, fontFamily: FONTE_TV }}
    >
      {/* ---------------------------------------------------------------- */}
      {/* Barra de cima                                                     */}
      {/* ---------------------------------------------------------------- */}
      <div
        className="flex flex-wrap items-center gap-0.5 border-b px-2 py-1"
        style={{ borderColor: BORDA }}
      >
        {/* Tempo gráfico */}
        <Menu
          rotulo={interval}
          aberto={menu === "intervalo"}
          onToggle={() => abrir("intervalo")}
        >
          {INTERVALS.map((i: Interval) => (
            <ItemDeMenu
              key={i}
              ativo={interval === i}
              onClick={() => {
                setInterval(i);
                setMenu(null);
              }}
            >
              {i}
            </ItemDeMenu>
          ))}
        </Menu>

        <Risco />

        {/* Tipo de vela */}
        <Menu
          icone={<IconeVela />}
          aberto={menu === "vela"}
          onToggle={() => abrir("vela")}
          titulo={tx.tipoDeGrafico}
        >
          {TIPOS_DE_VELA.map((t) => (
            <ItemDeMenu
              key={t.id}
              ativo={tipoDeVela === t.id}
              onClick={() => {
                setTipoDeVela(t.id);
                grafico.current?.tipoDeVela(t.id);
                setMenu(null);
              }}
            >
              {tx.velas[t.id] ?? t.nome}
            </ItemDeMenu>
          ))}
        </Menu>

        {/* Indicadores */}
        <Menu
          icone={<IconeFx />}
          aberto={menu === "indicadores"}
          onToggle={() => abrir("indicadores")}
          titulo="Indicadores"
          largura={288}
        >
          {/*
            Rola de propósito: são 27 indicadores, e a lista é mais alta que o
            gráfico. Sem o teto, o menu passaria da borda de baixo e os últimos
            ficariam fora do alcance em tela de notebook.
          */}
          <div className="max-h-[min(58vh,420px)] overflow-y-auto pr-0.5">
            <Secao titulo={tx.sobreVelas} />
            {SOBRE_AS_VELAS.map((ind) => (
              <ItemIndicador
                key={ind.chave}
                indicador={ind}
                ativo={indicadores.includes(ind.chave)}
                ajustando={ajustando === ind.chave}
                valores={parametros[ind.chave] ?? parametrosPadrao(ind.chave)}
                alterado={parametros[ind.chave] !== undefined}
                onAlternar={() => alternar(ind.chave)}
                onAjustar={() =>
                  setAjustando((atual) => (atual === ind.chave ? null : ind.chave))
                }
                onTrocar={(pos, v) => trocarParametro(ind.chave, pos, v)}
                onRestaurar={() => restaurarParametros(ind.chave)}
              />
            ))}

            <Secao titulo={tx.painelSeparado} />
            {EM_PAINEL_PROPRIO.map((ind) => (
              <ItemIndicador
                key={ind.chave}
                indicador={ind}
                ativo={indicadores.includes(ind.chave)}
                ajustando={ajustando === ind.chave}
                valores={parametros[ind.chave] ?? parametrosPadrao(ind.chave)}
                alterado={parametros[ind.chave] !== undefined}
                onAlternar={() => alternar(ind.chave)}
                onAjustar={() =>
                  setAjustando((atual) => (atual === ind.chave ? null : ind.chave))
                }
                onTrocar={(pos, v) => trocarParametro(ind.chave, pos, v)}
                onRestaurar={() => restaurarParametros(ind.chave)}
              />
            ))}
          </div>
        </Menu>

        <Risco />

        {/*
          Preço / MCap como um par, não como dois botões soltos: é uma escolha
          entre duas leituras do MESMO gráfico, e escrever as duas lado a lado
          deixa isso óbvio sem precisar de rótulo explicando.
        */}
        {temMcap && (
          <div className="flex items-center px-1 text-[12px]">
            <BotaoDeTexto ativo={escalaEfetiva === "preco"} onClick={() => setEscala("preco")}>
              {tx.preco}
            </BotaoDeTexto>
            <span className="px-0.5 text-[#4a4e5a]">/</span>
            <BotaoDeTexto ativo={escalaEfetiva === "mcap"} onClick={() => setEscala("mcap")}>
              MCap
            </BotaoDeTexto>
          </div>
        )}

        <BotaoDeIcone titulo={tx.desfazer} onClick={() => grafico.current?.desfazerDesenho()}>
          <IconeDesfazer />
        </BotaoDeIcone>
        <BotaoDeIcone titulo={tx.apagar} onClick={() => grafico.current?.limparDesenhos()}>
          <IconeRefazer />
        </BotaoDeIcone>

        <Menu
          rotulo="Chart"
          seta
          aberto={menu === "chart"}
          onToggle={() => abrir("chart")}
          largura={180}
        >
          <ItemDeMenu ativo={false} onClick={() => { grafico.current?.voltarAoAgora(); setMenu(null); }}>
            {tx.restaurarZoom}
          </ItemDeMenu>
          <ItemDeMenu ativo={false} onClick={() => { alternarTelaCheia(); setMenu(null); }}>
            {tx.telaCheia}
          </ItemDeMenu>
          <ItemDeMenu
            ativo={false}
            onClick={() => { grafico.current?.baixarImagem(`${symbol}-${interval}`); setMenu(null); }}
          >
            {tx.baixarImagem}
          </ItemDeMenu>
        </Menu>

        <Risco />

        <div className="ml-auto flex items-center gap-0.5">
          {/*
            O estado do feed vira um ícone, não uma frase.

            A frase ocupava metade da barra pra dizer algo que só importa
            quando está ERRADO. Como ícone com cor, some quando está tudo bem e
            salta quando não está — e o texto continua lá, no título.
          */}
          <BotaoDeIcone
            titulo={
              status === "erro"
                ? tx.erroVelas
                : status === "vazio"
                  ? tx.semHistorico
                  : tempoReal
                    ? tx.tempoReal
                    : tx.aoVivo
            }
            cor={
              status === "erro" || status === "vazio"
                ? "#f0b90b"
                : tempoReal
                  ? VERDE
                  : "#868993"
            }
          >
            <IconeRaio />
          </BotaoDeIcone>

          <BotaoDeIcone titulo={tx.voltar} onClick={() => grafico.current?.voltarAoAgora()}>
            <IconeAlvo />
          </BotaoDeIcone>

          <BotaoDeIcone titulo={tx.telaCheia} onClick={alternarTelaCheia}>
            <IconeTelaCheia />
          </BotaoDeIcone>

          <BotaoDeIcone
            titulo={tx.baixarGrafico}
            onClick={() => grafico.current?.baixarImagem(`${symbol}-${interval}`)}
          >
            <IconeCamera />
          </BotaoDeIcone>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* O gráfico                                                         */}
      {/* ---------------------------------------------------------------- */}
      {/*
        SEM VELAS, A TELA DIZ ISSO — com todas as letras.

        Antes, quando a fonte falhava, o lugar era preenchido por velas
        inventadas: o gráfico parecia normal e a única pista era a cor de um
        ícone, explicada só ao passar o mouse. Num terminal de negociação, a
        pessoa lia preço falso sem ter como perceber.

        A tela vazia é feia de propósito. Ela informa; o desenho bonito
        informava errado.

        A tela vazia SUBSTITUI o gráfico, não convive com ele. Na primeira
        versão os dois eram renderizados: o aviso aparecia em cima e as réguas
        vazias logo abaixo, o que parecia defeito de layout em vez de ausência
        de dados.
      */}
      {semVelas ? (
        <div className="grid h-[420px] place-items-center px-6 text-center">
          <div>
            <p className="text-[13px] font-semibold text-zinc-300">
              {status === "vazio" ? tx.semHistorico : tx.carregando}
            </p>
            <p className="mx-auto mt-1.5 max-w-[340px] text-[12px] leading-relaxed text-zinc-600">
              {status === "vazio" ? tx.velasAparecem : tx.limitando}
            </p>
          </div>
        </div>
      ) : (
      <TradingChart
        comandos={grafico}
        candles={candlesNaEscala}
        escala={escalaEfetiva}
        rotulo={{ simbolo: symbol, intervalo: interval }}
        formatar={jaNaEscala}
        /*
         * A série só é reaplicada quando a IDENTIDADE muda. Incluir os dados
         * aqui faria o gráfico saltar de volta a cada atualização — que era
         * exatamente o defeito da versão anterior.
         */
        serie={`${address}:${intervaloDasVelas}:${escalaEfetiva}`}
        indicadores={indicadores}
        parametros={parametros}
      />
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Barra de baixo                                                    */}
      {/* ---------------------------------------------------------------- */}
      <div
        className="flex flex-wrap items-center gap-0.5 border-t px-2 py-1"
        style={{ borderColor: BORDA }}
      >
        {/*
          Períodos: mudam o ZOOM, não o tempo gráfico. É a diferença entre "ver
          o último mês" e "velas de um mês" — duas coisas que os terminais põem
          em barras diferentes justamente por isso.
        */}
        {PERIODOS.map((p) => (
          <BotaoDeTexto
            key={p.rotulo}
            ativo={false}
            onClick={() => grafico.current?.mostrarUltimas(p.velas(interval))}
          >
            {p.rotulo}
          </BotaoDeTexto>
        ))}

        <div className="ml-auto flex items-center gap-1">
          <span className="tnum px-1.5 text-[11px] text-[#868993]">{relogio}</span>

          <BotaoDeTexto
            ativo={eixo === "percentage"}
            onClick={() => trocarEixo(eixo === "percentage" ? "normal" : "percentage")}
            titulo={tx.escalaPct}
          >
            %
          </BotaoDeTexto>
          <BotaoDeTexto
            ativo={eixo === "log"}
            onClick={() => trocarEixo(eixo === "log" ? "normal" : "log")}
            titulo={tx.escalaLog}
          >
            log
          </BotaoDeTexto>
          <BotaoDeTexto
            ativo={eixo === "normal"}
            onClick={() => {
              trocarEixo("normal");
              grafico.current?.voltarAoAgora();
            }}
            titulo={tx.escalaAuto}
          >
            auto
          </BotaoDeTexto>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Sobreposições                                                     */}
      {/* ---------------------------------------------------------------- */}
      <div
        className="flex flex-wrap items-center gap-4 border-t px-3 py-2 text-[11px]"
        style={{ borderColor: BORDA }}
      >
        <span className="text-[#868993]">{tx.sobreposicoes}</span>

        <Caixa
          marcada={mostrarMeusSwaps}
          onChange={setMostrarMeusSwaps}
          rotulo={tx.meusSwaps}
          titulo={tx.meusSwapsDica}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Peças da barra                                                      */
/* ------------------------------------------------------------------ */

/*
 * As cores são as do tema escuro PADRÃO do TradingView, as mesmas que o
 * gráfico usa por dentro. A barra e a tela do gráfico precisam parecer uma
 * peça só: com a paleta do resto do site aqui, a emenda aparece.
 */
const FUNDO = "#0e0f11";
const BORDA = "#232429";
const TEXTO = "#d1d4dc";
const APAGADO = "#868993";
const AZUL = "#2962ff";
const VERDE = "#089981";

/** Os tipos de desenho que a biblioteca sabe fazer. */
const TIPOS_DE_VELA: { id: CandleType; nome: string }[] = [
  { id: CandleType.CandleSolid, nome: "Velas" },
  { id: CandleType.CandleStroke, nome: "Velas vazadas" },
  { id: CandleType.Ohlc, nome: "Barras" },
  { id: CandleType.Area, nome: "Linha" },
];

/**
 * Os períodos da barra de baixo.
 *
 * Eles mudam o ZOOM, não o tempo gráfico — "ver o último mês" é outra coisa
 * que "velas de um mês". Quantas velas cabem depende do tempo gráfico atual,
 * por isso cada um é uma função dele.
 */
const MINUTOS_POR_VELA: Record<string, number> = {
  "1m": 1,
  "5m": 5,
  "15m": 15,
  "1h": 60,
  "4h": 240,
  "1d": 1440,
};

const PERIODOS: { rotulo: string; velas: (intervalo: string) => number }[] = [
  { rotulo: "1D", velas: (i) => 1440 / (MINUTOS_POR_VELA[i] ?? 1) },
  { rotulo: "1W", velas: (i) => (1440 * 7) / (MINUTOS_POR_VELA[i] ?? 1) },
  { rotulo: "1M", velas: (i) => (1440 * 30) / (MINUTOS_POR_VELA[i] ?? 1) },
  { rotulo: "3M", velas: (i) => (1440 * 90) / (MINUTOS_POR_VELA[i] ?? 1) },
  { rotulo: "1Y", velas: (i) => (1440 * 365) / (MINUTOS_POR_VELA[i] ?? 1) },
];

/** Divisória vertical entre grupos da barra. */
function Risco() {
  return <div className="mx-1 h-4 w-px" style={{ background: BORDA }} />;
}

function BotaoDeTexto({
  ativo,
  onClick,
  titulo,
  children,
}: {
  ativo: boolean;
  onClick?: () => void;
  titulo?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={titulo}
      onClick={onClick}
      className="rounded px-1.5 py-0.5 text-[12px] transition-colors hover:bg-white/[0.06]"
      style={{ color: ativo ? TEXTO : APAGADO }}
    >
      {children}
    </button>
  );
}

function BotaoDeIcone({
  titulo,
  onClick,
  cor,
  children,
}: {
  titulo: string;
  onClick?: () => void;
  cor?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      onClick={onClick}
      className="grid size-7 place-items-center rounded transition-colors hover:bg-white/[0.06]"
      style={{ color: cor ?? APAGADO }}
    >
      {children}
    </button>
  );
}

/** Botão que abre uma lista logo abaixo dele. */
function Menu({
  rotulo,
  icone,
  seta,
  titulo,
  aberto,
  onToggle,
  largura = 150,
  children,
}: {
  rotulo?: string;
  icone?: React.ReactNode;
  /** mostra a setinha de "abre uma lista", como no terminal de referência */
  seta?: boolean;
  titulo?: string;
  aberto: boolean;
  onToggle: () => void;
  largura?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  /* Fecha ao clicar fora ou apertar Esc — o que se espera de qualquer menu. */
  useEffect(() => {
    if (!aberto) return;

    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && onToggle();
    const aoClicar = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggle();
    };

    window.addEventListener("keydown", aoTeclar);
    window.addEventListener("mousedown", aoClicar);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("mousedown", aoClicar);
    };
  }, [aberto, onToggle]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        title={titulo}
        onClick={onToggle}
        className="flex h-7 items-center gap-1 rounded px-1.5 text-[12px] transition-colors hover:bg-white/[0.06]"
        style={{ color: aberto ? TEXTO : APAGADO }}
      >
        {icone}
        {rotulo}
        {seta && (
          <svg viewBox="0 0 24 24" className="size-3" {...tracoBarra}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>

      {aberto && (
        <div
          className="absolute left-0 z-40 mt-1 rounded border p-1 shadow-xl"
          style={{ width: largura, background: "#1a1b1f", borderColor: BORDA }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function ItemDeMenu({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center rounded px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-white/[0.06]"
      style={{ color: ativo ? AZUL : TEXTO }}
    >
      {children}
    </button>
  );
}

/** Caixa de marcar das sobreposições. */
function Caixa({
  marcada,
  onChange,
  rotulo,
  titulo,
}: {
  marcada: boolean;
  onChange: (v: boolean) => void;
  rotulo: string;
  titulo?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5" title={titulo}>
      <span
        className="grid size-3.5 place-items-center rounded-[3px] border transition-colors"
        style={{
          borderColor: marcada ? AZUL : BORDA,
          background: marcada ? AZUL : "transparent",
        }}
      >
        {marcada && (
          <svg viewBox="0 0 24 24" className="size-2.5" fill="none" stroke="#fff" strokeWidth={3}>
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <input
        type="checkbox"
        checked={marcada}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span style={{ color: TEXTO }}>{rotulo}</span>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Ícones da barra                                                     */
/* ------------------------------------------------------------------ */

/*
 * Mesmo traço da barra lateral do gráfico: 1,2 de espessura, sem preenchimento
 * e sem ponta arredondada exagerada. Ícone de peso diferente ao lado de outro
 * faz a barra parecer um apanhado de origens distintas — foi o que aconteceu
 * na primeira tentativa desta tela.
 */
const tracoBarra = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const IconeBarra = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" className="size-[17px]" {...tracoBarra}>
    {children}
  </svg>
);

/** Uma vela com pavio: o símbolo universal de "tipo de gráfico". */
const IconeVela = () => (
  <IconeBarra>
    <path d="M8 4v4M8 16v4" />
    <rect x="5.5" y="8" width="5" height="8" rx="1" />
    <path d="M16 3v5M16 17v4" />
    <rect x="13.5" y="8" width="5" height="9" rx="1" />
  </IconeBarra>
);

/** "fx", como nos terminais: função aplicada sobre o preço. */
const IconeFx = () => (
  <svg viewBox="0 0 24 24" className="size-[17px]" fill="currentColor">
    <text x="12" y="16" textAnchor="middle" fontSize="12" fontStyle="italic" fontFamily="serif">
      fx
    </text>
  </svg>
);

const IconeDesfazer = () => (
  <IconeBarra>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </IconeBarra>
);

const IconeRefazer = () => (
  <IconeBarra>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H10a6 6 0 0 0 0 12h3" />
  </IconeBarra>
);

/** Raio: o estado do feed ao vivo. */
const IconeRaio = () => (
  <IconeBarra>
    <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
  </IconeBarra>
);

/** Alvo: voltar pro agora. */
const IconeAlvo = () => (
  <IconeBarra>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </IconeBarra>
);

const IconeTelaCheia = () => (
  <IconeBarra>
    <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" />
  </IconeBarra>
);

const IconeCamera = () => (
  <IconeBarra>
    <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13" r="3.5" />
  </IconeBarra>
);


/* ------------------------------------------------------------------ */

function Secao({ titulo }: { titulo: string }) {
  return (
    <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
      {titulo}
    </div>
  );
}

/**
 * Uma linha do menu de indicadores: liga/desliga e, quando há o que ajustar,
 * abre uma gaveta com os períodos.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A ENGRENAGEM É UM BOTÃO SEPARADO
 * ---------------------------------------------------------------------------
 * Porque ligar e configurar são intenções diferentes, e a maioria absoluta das
 * vezes a pessoa quer só ligar. Se o clique na linha abrisse os ajustes, todo
 * mundo pagaria o preço de um menu extra pra fazer o que faz sempre.
 *
 * A engrenagem também só aparece no que TEM o que ajustar: volume, AVP e PVT
 * não têm parâmetro, e uma engrenagem que abre uma gaveta vazia é pior do que
 * engrenagem nenhuma.
 */
function ItemIndicador({
  indicador,
  ativo,
  ajustando,
  valores,
  alterado,
  onAlternar,
  onAjustar,
  onTrocar,
  onRestaurar,
}: {
  indicador: DoCatalogo;
  ativo: boolean;
  ajustando: boolean;
  valores: number[];
  /** Saiu do padrão de fábrica? Muda o rótulo e libera o "restaurar". */
  alterado: boolean;
  onAlternar: () => void;
  onAjustar: () => void;
  onTrocar: (posicao: number, valor: number) => void;
  onRestaurar: () => void;
}) {
  const tx = useTextos(TEXTOS);
  const idioma = useIdioma();
  const temAjuste = indicador.parametros.length > 0;

  return (
    <div className={cn("rounded-lg transition-colors", ativo && "bg-marca/10")}>
      <div className="flex items-center">
        <button
          onClick={onAlternar}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/5"
        >
          <span
            className={cn(
              "grid size-4 shrink-0 place-items-center rounded border",
              ativo ? "border-marca bg-marca text-white" : "border-white/15",
            )}
          >
            {ativo && (
              <svg
                viewBox="0 0 24 24"
                className="size-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.5"
              >
                <path d="m5 13 5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-1.5">
              <span
                className={cn(
                  "text-[12px] font-bold",
                  ativo ? "text-marca" : "text-zinc-200",
                )}
              >
                {indicador.chave}
              </span>
              {/*
                Os números aparecem NA LINHA, como num terminal de verdade:
                "MA 5 10 30 60". É o que deixa a configuração visível sem abrir
                nada — e o que faz alguém perceber que dá pra mexer.
              */}
              {temAjuste && (
                <span
                  className={cn(
                    "tnum truncate text-[10px]",
                    alterado ? "text-marca/70" : "text-zinc-600",
                  )}
                >
                  {valores.join(" ")}
                </span>
              )}
            </span>
            <span className="block truncate text-[10px] text-zinc-600">{INDICADORES_TRAD[idioma]?.[indicador.chave]?.[0] ?? indicador.rotulo}</span>
          </span>
        </button>

        {temAjuste && (
          <button
            onClick={onAjustar}
            title={`${tx.ajustar} ${indicador.chave}`}
            aria-label={`${tx.ajustar} ${indicador.chave}`}
            className={cn(
              "mr-1 grid size-6 shrink-0 place-items-center rounded-md transition-colors",
              ajustando ? "bg-white/10 text-marca" : "text-zinc-600 hover:bg-white/5 hover:text-zinc-300",
            )}
          >
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}
      </div>

      {ajustando && temAjuste && (
        <div className="border-t border-white/[0.06] px-2 pb-2 pt-2">
          <p className="mb-1.5 text-[10px] leading-relaxed text-zinc-600">{INDICADORES_TRAD[idioma]?.[indicador.chave]?.[1] ?? indicador.nota}</p>

          <div className="grid grid-cols-2 gap-1.5">
            {indicador.parametros.map((p, i) => (
              <label key={p.rotulo} className="block">
                <span className="mb-0.5 block truncate text-[9.5px] uppercase tracking-wider text-zinc-600">
                  {PARAMETROS_TRAD[idioma]?.[p.rotulo] ?? p.rotulo}
                </span>
                <input
                  type="number"
                  min={p.min}
                  max={p.max}
                  value={valores[i] ?? p.padrao}
                  onChange={(e) => onTrocar(i, Number(e.target.value))}
                  className="tnum w-full rounded border border-ink-600 bg-ink-800 px-1.5 py-1 text-[11px] font-semibold text-zinc-100 focus:border-marca/50 focus:outline-none"
                />
              </label>
            ))}
          </div>

          {alterado && (
            <button
              onClick={onRestaurar}
              className="mt-1.5 text-[10px] text-zinc-500 underline underline-offset-2 transition-colors hover:text-marca"
            >
              {tx.restaurarPadrao}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
