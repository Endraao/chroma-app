"use client";

import { Suspense, useCallback, useEffect, useState } from "react";

import { ChartPanel } from "@/components/chart/ChartPanel";
import { SwapWidget } from "@/components/trading/SwapWidget";
import { SecurityPanel } from "@/components/security/SecurityPanel";
import { CurvaPanel } from "@/components/trading/CurvaPanel";
import { CurvaProvider } from "@/components/trading/CurvaProvider";
import { TabelaDeTraders } from "@/components/trading/TabelaDeTraders";
import { TokenHeader } from "@/components/trading/TokenHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import type { SecurityReport, TokenSummary } from "@/lib/types";

/**
 * A "tela única": gráfico à esquerda ocupando a altura toda, swap e alertas à
 * direita. O preço nasce no gráfico e sobe pro cabeçalho — uma fonte só, pra
 * cotação, gráfico e números do topo nunca discordarem.
 *
 * Os alertas saíram de baixo do gráfico e subiram pra coluna do swap. São duas
 * razões: eles precisam estar À VISTA na hora de apertar "comprar", e embaixo
 * ocupavam meia tela empurrando o gráfico pra cima — o oposto do que faz um
 * terminal de trade ser usável.
 */

/**
 * De quanto em quanto tempo os números de mercado são repescados.
 *
 * Dez segundos, não um. Volume, liquidez e portadores são recalculados pela
 * fonte de tempos em tempos; pedir de segundo em segundo devolveria o mesmo
 * número e gastaria dez vezes mais requisição. O que precisa andar a cada
 * negócio — preço, capitalização, variação e o volume da sessão — vem dos
 * eventos da própria rede, pelo gráfico.
 */
const INTERVALO_STATS_MS = 10_000;

export interface StatsAoVivo {
  change24h: number;
  liquidityUsd: number;
  volume24hUsd: number;
  holders: number;
}

export function TokenTerminal({ token, isDemo = false }: { token: TokenSummary; isDemo?: boolean }) {
  const [price, setPrice] = useState(token.priceUsd);
  const [volumeDaSessao, setVolumeDaSessao] = useState(0);
  const [stats, setStats] = useState<StatsAoVivo>({
    change24h: token.change24h,
    liquidityUsd: token.liquidityUsd,
    volume24hUsd: token.volume24hUsd,
    holders: token.holders,
  });

  const [report, setReport] = useState<SecurityReport | null>(null);
  const [auditando, setAuditando] = useState(true);

  const handleTick = useCallback(
    ({ price: p, volumeObservadoUsd }: { price: number; volumeObservadoUsd: number }) => {
      setPrice(p);
      setVolumeDaSessao(volumeObservadoUsd);
    },
    [],
  );

  /* --- Números de mercado, de 10 em 10s ---------------------------- */
  useEffect(() => {
    let cancelado = false;

    const ler = async () => {
      try {
        const res = await fetch(`/api/token-stats?address=${token.address}`, { cache: "no-store" });
        if (!res.ok) return;
        const dados = (await res.json()) as StatsAoVivo;
        if (!cancelado) setStats(dados);
      } catch {
        /* rede oscilou: fica o último valor conhecido */
      }
    };

    const timer = window.setInterval(() => void ler(), INTERVALO_STATS_MS);
    return () => {
      cancelado = true;
      window.clearInterval(timer);
    };
  }, [token.address]);

  /* --- Auditoria, buscada UMA vez e compartilhada ------------------- */
  useEffect(() => {
    let cancelado = false;
    setAuditando(true);

    fetch(`/api/security?address=${token.address}&chain=${token.chain}`)
      .then((r) => r.json())
      .then((data: SecurityReport) => {
        if (!cancelado) setReport(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelado) setAuditando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [token.address, token.chain]);

  return (
    /*
     * O provedor abraça a página inteira porque o cabeçalho, o painel de
     * progresso e o de swap precisam do MESMO estado da curva. Três leituras
     * separadas podiam divergir por um instante, e aí a tela mostraria dois
     * números diferentes pra mesma coisa.
     */
    <CurvaProvider mint={token.address}>
    <div className="space-y-4">
      {isDemo && (
        <div className="rounded-xl border border-warn/25 bg-warn/[0.06] px-4 py-2.5 text-[12px] text-warn">
          Ainda não há dados de mercado para este endereço. Preço, liquidez e volume abaixo são
          apenas ilustrativos. A auditoria do contrato continua sendo real.
        </div>
      )}

      <TokenHeader
        token={token}
        price={price}
        stats={stats}
        volumeDaSessao={volumeDaSessao}
        top10Pct={report?.holderConcentration.top10Pct ?? 0}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Coluna esquerda: o gráfico, com a altura toda */}
        <div className="space-y-4">
          <ChartPanel
            address={token.address}
            symbol={token.symbol}
            chain={token.chain}
            pool={token.pairAddress}
            marketCapUsd={token.marketCapUsd}
            priceUsd={token.priceUsd}
            quoteAddress={token.quoteAddress}
            quotePriceUsd={token.quotePriceUsd}
            onTick={handleTick}
          />
        </div>

        {/* Coluna direita: swap grudado no topo ao rolar a página */}
        <div className="space-y-4 lg:sticky lg:top-[72px] lg:self-start">
          {/*
            * Acima do painel de swap, e não abaixo: quanto falta pra curva
            * encher é o que decide se a pessoa compra AGORA. Enterrado no fim
            * da coluna, ela só veria depois de já ter decidido.
            *
            * O componente não desenha nada quando a moeda não é da curva, que
            * é a maioria — então nada muda na tela das moedas de mercado.
            */}
          <CurvaPanel />

          {/*
            A AUDITORIA VEM ANTES DO BOTÃO DE COMPRAR.
            -----------------------------------------------------------------
            Estava depois. Quem abria a página via o campo de valor, o botão
            verde e o preço subindo; o aviso de que a liquidez pode ser
            retirada pelo dono ficava abaixo de tudo isso, fora da tela em
            telas menores.

            Aviso que chega depois da decisão não é aviso, é registro. Como o
            painel se resume a uma linha quando não há nada a dizer, pôr ele
            aqui não atrapalha as moedas limpas — e nas sujas ele aparece onde
            precisa aparecer.
          */}
          <SecurityPanel
            report={report}
            carregando={auditando}
            liquidityUsd={stats.liquidityUsd}
          />

          <Suspense fallback={<Skeleton className="h-[520px] rounded-2xl" />}>
            <SwapWidget
              symbol={token.symbol}
              chain={token.chain}
              tokenAddress={token.address}
              priceUsd={price}
            />
          </Suspense>

          <Card>
            <CardBody className="space-y-2 text-[12px] text-zinc-500">
              <p className="font-semibold text-zinc-300">Sobre</p>
              <p className="leading-relaxed">{token.description}</p>
            </CardBody>
          </Card>
        </div>
      </div>

      {/*
        A tabela de traders fica EMBAIXO e ocupando a largura toda.

        Não cabe na coluna do swap: são cinco colunas de número por linha. E
        não deve ficar em cima — ela é pra depois da decisão, quando a pessoa
        quer saber quem mais está dentro e em que preço. Acima do gráfico, ela
        empurraria pra baixo justamente as duas coisas que a pessoa veio ver.
      */}
      <TabelaDeTraders address={token.address} symbol={token.symbol} chain={token.chain} />
    </div>
    </CurvaProvider>
  );
}
