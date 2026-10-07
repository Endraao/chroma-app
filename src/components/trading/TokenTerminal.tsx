"use client";

import { CHAINS } from "@/lib/web3";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";

import { Suspense, useCallback, useEffect, useState } from "react";

import dynamic from "next/dynamic";
import { SwapWidget } from "@/components/trading/SwapWidget";
import { SecurityPanel } from "@/components/security/SecurityPanel";
import { CurvaPanel } from "@/components/trading/CurvaPanel";
import { CurvaProvider } from "@/components/trading/CurvaProvider";
import { useCurvaEvm } from "@/hooks/useCurvaEvm";
import { PainelDeAtividade } from "@/components/trading/PainelDeAtividade";
import { StatusDaCurva } from "@/components/trading/StatusDaCurva";
import { ConviteParaCompartilhar } from "@/components/trading/ConviteParaCompartilhar";
import { PainelSobre } from "@/components/trading/PainelSobre";
import { AvisoRecompensas } from "@/components/trading/AvisoRecompensas";
import { MinhaPosicao } from "@/components/trading/MinhaPosicao";
import { TokenHeader } from "@/components/trading/TokenHeader";
import { BonusDoCriador } from "@/components/trading/BonusDoCriador";
import { GanhosDoCriador } from "@/components/trading/GanhosDoCriador";
import { Skeleton } from "@/components/ui/Skeleton";
import type { SecurityReport, TokenSummary } from "@/lib/types";

/*
 * O GRÁFICO CARREGA DEPOIS DO RESTO.
 *
 * A biblioteca do gráfico são ~300 KB de JavaScript. Importada direto, a
 * página inteira esperava por ela — preço, botão de comprar e tudo — e abria
 * em ~6 s (medido em 28/09/2026). Carregada à parte, a página aparece primeiro
 * e o gráfico entra no lugar do esqueleto logo em seguida.
 */
const ChartPanel = dynamic(
  () => import("@/components/chart/ChartPanel").then((m) => m.ChartPanel),
  { ssr: false, loading: () => <Skeleton className="h-[520px] rounded-xl" /> },
);

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
  /** preço da MESMA leitura que a variação — a base das 24h sai dos dois juntos */
  priceUsd?: number;
}

const TEXTOS = traducoes({
  en: { demo: "There is no market data for this address yet. Price, liquidity and volume below are illustrative only. The contract audit is still real.", sobre: "About" },
  pt: { demo: "Ainda não há dados de mercado para este endereço. Preço, liquidez e volume abaixo são apenas ilustrativos. A auditoria do contrato continua sendo real.", sobre: "Sobre" },
  zh: { demo: "该地址暂无市场数据。下方价格、流动性和交易量仅供示意，合约审计结果是真实的。", sobre: "简介" },
});

export function TokenTerminal({ token, isDemo = false }: { token: TokenSummary; isDemo?: boolean }) {
  const t = useTextos(TEXTOS);
  const [price, setPrice] = useState(token.priceUsd);
  const [volumeDaSessao, setVolumeDaSessao] = useState(0);
  /*
   * Holders pela GeckoTerminal, lido pelo navegador (cada visitante tem o
   * próprio limite). As fontes do servidor quase nunca traziam esse número.
   */
  const [holdersDaGecko, setHoldersDaGecko] = useState(0);
  const [top10DaGecko, setTop10DaGecko] = useState(0);
  useEffect(() => {
    const rede = CHAINS[token.chain]?.gecko;
    if (!rede) return;
    let cancelado = false;
    fetch(`https://api.geckoterminal.com/api/v2/networks/${rede}/tokens/${token.address}/info`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const h = j?.data?.attributes?.holders;
        const n = Number(h?.count ?? 0);
        const top = Number(h?.distribution_percentage?.top_10 ?? 0);
        if (cancelado) return;
        if (n > 0) setHoldersDaGecko(n);
        if (top > 0) setTop10DaGecko(top);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [token.address, token.chain]);

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
          {t.demo}
        </div>
      )}

      <TokenHeader
        token={token}
        price={price}
        stats={{ ...stats, holders: stats.holders || holdersDaGecko }}
        volumeDaSessao={volumeDaSessao}
        /* Na curva, o maior "dono" é a própria curva (os tokens ainda não vendidos):
           o top 10 dava 100% numa moeda recém-nascida e saudável. Some até graduar. */
        top10Pct={token.bondingProgress != null && token.bondingProgress < 100 ? 0 : report?.holderConcentration.top10Pct || top10DaGecko}
      />

      {/*
        Três blocos numa grade: gráfico, coluna da compra e negociações.
        No computador: gráfico em cima e negociações embaixo, à esquerda; a
        compra ocupa a direita. No celular a ordem é a do código — gráfico,
        compra, alertas e Sobre, e só DEPOIS a lista de negociações (antes ela
        aparecia antes da descrição da moeda).
      */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[auto_1fr]">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
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

        {/* Coluna direita: compra, alertas, Sobre e convite */}
        <div className="min-w-0 space-y-3 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          {/*
            * Acima do painel de swap, e não abaixo: quanto falta pra curva
            * encher é o que decide se a pessoa compra AGORA. Enterrado no fim
            * da coluna, ela só veria depois de já ter decidido.
            *
            * O componente não desenha nada quando a moeda não é da curva, que
            * é a maioria — então nada muda na tela das moedas de mercado.
            */}
          <CurvaPanel />
          <StatusDaCurva token={token} />

          {token.recompensasParaDetentores && <AvisoRecompensas />}

          <Suspense fallback={<Skeleton className="h-[520px] rounded-2xl" />}>
            <SwapWidget
              symbol={token.symbol}
              chain={token.chain}
              tokenAddress={token.address}
              pool={token.pairAddress ?? null}
              priceUsd={price}
              naCurvaDaChroma={token.dexId === "chroma-curve"}
            />
          </Suspense>

          {/*
            A POSIÇÃO VEM LOGO ABAIXO DO BOTÃO, e não no fim da página.
            -----------------------------------------------------------------
            Quem já comprou volta à página da moeda por um motivo só: ver se
            está ganhando ou perdendo. Esse número não pode estar embaixo da
            tabela de traders.

            O componente não desenha nada pra quem não tem a moeda, então não
            ocupa espaço de quem está chegando agora.
          */}
          <MinhaPosicao address={token.address} symbol={token.symbol} chain={token.chain} precoUsd={price} />

          {/* Bônus do criador: só aparece em moeda da Curva da Chroma (Solana). */}
          {token.chain === "solana" && <GanhosDoCriador address={token.address} />}
          {token.chain === "solana" && <BonusDoCriador address={token.address} />}


          {/*
            A AUDITORIA FICA DEPOIS DO BOTÃO, e discreta.
            -----------------------------------------------------------------
            Esteve acima por um tempo, na ideia de que aviso tem que vir antes
            da decisão. Na prática virou o elemento mais chamativo da coluna —
            um bloco vermelho no topo, aceso também por coisa que não é grave,
            competindo com o preço e com o botão.

            Alerta que grita em toda moeda ensina a ignorar alerta. O que é de
            fato grave continua marcado em vermelho aqui dentro; o resto ficou
            em amarelo, que informa sem assustar.
          */}
          <SegurancaDaMoeda
            token={token}
            report={report}
            carregando={auditando}
            liquidityUsd={stats.liquidityUsd}
          />

          {/* Ordem da Fomo Family: comprar, alerta, sobre — e o convite por último. */}
          <PainelSobre token={token} />

          <ConviteParaCompartilhar token={token} />
        </div>

        {/* Negociações: embaixo do gráfico no computador; no celular, por último. */}
        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <PainelDeAtividade address={token.address} symbol={token.symbol} chain={token.chain} />
        </div>
      </div>

    </div>
    </CurvaProvider>
  );
}

/**
 * O painel de segurança sabendo se a moeda está numa curva de lançamento.
 * O servidor às vezes ainda não sabe (moeda de 1 minuto na Robinhood: dava
 * "liquidez não travada" e "liquidez baixa" numa moeda da curva da Chroma,
 * 30/09/2026) — o contrato, lido aqui, sabe.
 */
function SegurancaDaMoeda({
  token,
  report,
  carregando,
  liquidityUsd,
}: {
  token: TokenSummary;
  report: SecurityReport | null;
  carregando: boolean;
  liquidityUsd: number;
}) {
  const { curva } = useCurvaEvm(token.chain === "robinhood" ? token.address : null);
  const naCurva =
    token.bondingProgress !== null ||
    (token.chain === "solana" && token.dexId === "pumpfun") ||
    Boolean(curva && !curva.migrada);
  return <SecurityPanel report={report} carregando={carregando} liquidityUsd={liquidityUsd} naCurva={naCurva} />;
}
