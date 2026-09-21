"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CandleType } from "klinecharts";

import {
  TradingChart,
  INDICADORES_PRINCIPAIS,
  INDICADORES_INFERIORES,
  type ComandosDoGrafico,
  type Indicador,
} from "./TradingChart";
import { INTERVALS, useLiveChartData, type Interval } from "@/hooks/useLiveChartData";
import {
  aplicarEscala,
  fornecimentoEmCirculacao,
  rotuloCompacto,
  type EscalaDoGrafico,
} from "@/lib/chart-scale";
import { cn, formatPrice, formatUsd } from "@/lib/utils";
import type { ChainId } from "@/lib/types";

/** O que cada indicador mostra, pra quem não decorou a sopa de letras. */
const DESCRICAO: Record<Indicador, string> = {
  MA: "Média móvel simples",
  EMA: "Média móvel exponencial",
  BOLL: "Bandas de Bollinger",
  SAR: "Parabolic SAR",
  VOL: "Volume",
  MACD: "Convergência de médias",
  RSI: "Índice de força relativa",
  KDJ: "Estocástico KDJ",
};

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
  const {
    candles,
    price,
    change,
    status,
    tempoReal,
    volumeObservadoUsd,
    interval,
    setInterval,
    lastCandle,
  } = useLiveChartData({ address, pool, chain, quoteAddress, quotePriceUsd });

  const [indicadores, setIndicadores] = useState<Indicador[]>(["VOL"]);
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

  return (
    <div
      ref={caixaRef}
      className="overflow-hidden rounded-xl border"
      style={{ borderColor: BORDA, background: FUNDO }}
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
          titulo="Tipo de gráfico"
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
              {t.nome}
            </ItemDeMenu>
          ))}
        </Menu>

        {/* Indicadores */}
        <Menu
          icone={<IconeFx />}
          aberto={menu === "indicadores"}
          onToggle={() => abrir("indicadores")}
          titulo="Indicadores"
          largura={250}
        >
          <Secao titulo="Sobre as velas" />
          {INDICADORES_PRINCIPAIS.map((nome) => (
            <ItemIndicador
              key={nome}
              nome={nome}
              ativo={indicadores.includes(nome)}
              onClick={() => alternar(nome)}
            />
          ))}
          <Secao titulo="Painel separado" />
          {INDICADORES_INFERIORES.map((nome) => (
            <ItemIndicador
              key={nome}
              nome={nome}
              ativo={indicadores.includes(nome)}
              onClick={() => alternar(nome)}
            />
          ))}
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
              Preço
            </BotaoDeTexto>
            <span className="px-0.5 text-[#4a4e5a]">/</span>
            <BotaoDeTexto ativo={escalaEfetiva === "mcap"} onClick={() => setEscala("mcap")}>
              MCap
            </BotaoDeTexto>
          </div>
        )}

        <BotaoDeIcone titulo="Desfazer desenho" onClick={() => grafico.current?.desfazerDesenho()}>
          <IconeDesfazer />
        </BotaoDeIcone>
        <BotaoDeIcone titulo="Apagar todos os desenhos" onClick={() => grafico.current?.limparDesenhos()}>
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
            Restaurar o zoom
          </ItemDeMenu>
          <ItemDeMenu ativo={false} onClick={() => { alternarTelaCheia(); setMenu(null); }}>
            Tela cheia
          </ItemDeMenu>
          <ItemDeMenu
            ativo={false}
            onClick={() => { grafico.current?.baixarImagem(`${symbol}-${interval}`); setMenu(null); }}
          >
            Baixar imagem
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
              status === "demo"
                ? "Sem par indexado: o gráfico está simulado."
                : tempoReal
                  ? "Tempo real: a vela anda a cada negócio, lido da própria rede."
                  : "Ao vivo: o preço é conferido a cada 3 segundos."
            }
            cor={status === "demo" ? "#f0b90b" : tempoReal ? VERDE : "#868993"}
          >
            <IconeRaio />
          </BotaoDeIcone>

          <BotaoDeIcone titulo="Voltar pra vela mais recente" onClick={() => grafico.current?.voltarAoAgora()}>
            <IconeAlvo />
          </BotaoDeIcone>

          <BotaoDeIcone titulo="Tela cheia" onClick={alternarTelaCheia}>
            <IconeTelaCheia />
          </BotaoDeIcone>

          <BotaoDeIcone
            titulo="Baixar imagem do gráfico"
            onClick={() => grafico.current?.baixarImagem(`${symbol}-${interval}`)}
          >
            <IconeCamera />
          </BotaoDeIcone>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* O gráfico                                                         */}
      {/* ---------------------------------------------------------------- */}
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
        serie={`${address}:${interval}:${escalaEfetiva}`}
        indicadores={indicadores}
      />

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
            titulo="Escala em porcentagem"
          >
            %
          </BotaoDeTexto>
          <BotaoDeTexto
            ativo={eixo === "log"}
            onClick={() => trocarEixo(eixo === "log" ? "normal" : "log")}
            titulo="Escala logarítmica"
          >
            log
          </BotaoDeTexto>
          <BotaoDeTexto
            ativo={eixo === "normal"}
            onClick={() => {
              trocarEixo("normal");
              grafico.current?.voltarAoAgora();
            }}
            titulo="Escala automática"
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
        <span className="text-[#868993]">Sobreposições do gráfico</span>

        <Caixa
          marcada={mostrarMeusSwaps}
          onChange={setMostrarMeusSwaps}
          rotulo="Meus swaps"
          titulo="Marca no gráfico as suas compras e vendas desta moeda"
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
const FUNDO = "#131722";
const BORDA = "#2a2e39";
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
          style={{ width: largura, background: "#1e222d", borderColor: BORDA }}
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

function ItemIndicador({
  nome,
  ativo,
  onClick,
}: {
  nome: Indicador;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
        ativo ? "bg-chroma-violet/10" : "hover:bg-white/5",
      )}
    >
      <span
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded border",
          ativo ? "border-chroma-violet bg-chroma-violet text-white" : "border-white/15",
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
        <span
          className={cn(
            "block text-[12px] font-bold",
            ativo ? "text-chroma-violet" : "text-zinc-200",
          )}
        >
          {nome}
        </span>
        <span className="block truncate text-[10px] text-zinc-600">{DESCRICAO[nome]}</span>
      </span>
    </button>
  );
}
