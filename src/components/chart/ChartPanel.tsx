"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  TradingChart,
  INDICADORES_PRINCIPAIS,
  INDICADORES_INFERIORES,
  type Indicador,
} from "./TradingChart";
import { Card } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/Badge";
import { INTERVALS, useLiveChartData, type Interval } from "@/hooks/useLiveChartData";
import {
  aplicarEscala,
  fornecimentoEmCirculacao,
  rotuloCompacto,
  type EscalaDoGrafico,
} from "@/lib/chart-scale";
import { cn, formatPct, formatPrice, formatUsd } from "@/lib/utils";
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
  const [menuAberto, setMenuAberto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
  const escalaEfetiva: EscalaDoGrafico = temMcap ? "mcap" : "preco";

  const candlesNaEscala = useMemo(
    () => aplicarEscala(candles, escalaEfetiva, fornecimento),
    [candles, escalaEfetiva, fornecimento],
  );

  const emEscala = (v: number) =>
    escalaEfetiva === "mcap" ? `$${rotuloCompacto(v * fornecimento)}` : `$${formatPrice(v)}`;

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

  // Fecha o menu de indicadores ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!menuAberto) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && setMenuAberto(false);
    const aoClicar = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAberto(false);
    };
    window.addEventListener("keydown", aoTeclar);
    window.addEventListener("mousedown", aoClicar);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("mousedown", aoClicar);
    };
  }, [menuAberto]);

  const alternar = (nome: Indicador) =>
    setIndicadores((atual) =>
      atual.includes(nome) ? atual.filter((i) => i !== nome) : [...atual, nome],
    );

  const up = change >= 0;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm font-semibold text-zinc-300">{symbol}/USD</span>
          <span className={cn("tnum text-xl font-bold", up ? "text-bull" : "text-bear")}>
            {emEscala(price)}
          </span>
          <span className={cn("tnum text-sm font-semibold", up ? "text-bull" : "text-bear")}>
            {formatPct(change)}
          </span>
          {/*
            O outro número fica visível ao lado, pequeno: quem quer o preço por
            token não deveria ter que trocar a escala pra ler uma vez.
          */}
          {temMcap && (
            <span className="tnum text-[11px] text-zinc-600">
              {escalaEfetiva === "mcap"
                ? `preço $${formatPrice(price)}`
                : `mcap $${rotuloCompacto(price * fornecimento)}`}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500"
            title={
              status === "demo"
                ? "Sem par indexado: o gráfico está simulado."
                : tempoReal
                  ? "Preço lido direto das reservas do par, na própria rede: a vela anda a cada negócio."
                  : "Este par não é lido direto da rede; o preço vem por pesquisa a cada 3s."
            }
          >
            <StatusDot
              level={status === "live" ? "safe" : status === "demo" ? "warn" : "unknown"}
              pulse
            />
            {status !== "live"
              ? status === "demo"
                ? "Feed demo"
                : "Conectando…"
              : tempoReal
                ? "Tempo real"
                : "Ao vivo · 3s"}
          </div>

          {/* Indicadores */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuAberto((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                menuAberto
                  ? "border-chroma-violet/40 bg-chroma-violet/10 text-chroma-violet"
                  : "border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:text-zinc-200",
              )}
            >
              Indicadores
              {indicadores.length > 0 && (
                <span className="tnum rounded bg-white/10 px-1 text-[10px]">
                  {indicadores.length}
                </span>
              )}
            </button>

            {menuAberto && (
              <div className="panel absolute right-0 z-40 mt-1.5 w-[250px] p-1.5">
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
              </div>
            )}
          </div>

          <div className="flex rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5">
            {INTERVALS.map((i: Interval) => (
              <button
                key={i}
                onClick={() => setInterval(i)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  interval === i
                    ? "bg-chroma-violet/20 text-chroma-violet"
                    : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                {i}
              </button>
            ))}
          </div>
        </div>
      </div>

      <TradingChart
        candles={candlesNaEscala}
        escala={escalaEfetiva}
        /*
         * A série só é reaplicada quando a IDENTIDADE muda. Incluir os dados
         * aqui faria o gráfico saltar de volta a cada atualização — que era
         * exatamente o defeito da versão anterior.
         */
        serie={`${address}:${interval}:${escalaEfetiva}`}
        indicadores={indicadores}
      />

      <div className="grid grid-cols-4 divide-x divide-white/[0.06] border-t border-white/[0.06] text-center">
        {[
          { label: "Abertura", value: emEscala(lastCandle?.open ?? 0) },
          { label: "Máxima", value: emEscala(lastCandle?.high ?? 0) },
          { label: "Mínima", value: emEscala(lastCandle?.low ?? 0) },
          { label: "Volume", value: formatUsd(lastCandle?.volume ?? 0) },
        ].map((item) => (
          <div key={item.label} className="px-2 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-zinc-600">{item.label}</div>
            <div className="tnum text-xs font-semibold text-zinc-300">{item.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

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
