"use client";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";

import { useState } from "react";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DenunciarToken } from "@/components/trading/DenunciarToken";
import { ImagemDaMoedaGrande } from "@/components/trading/ImagemDaMoedaGrande";
import { CHAINS } from "@/lib/web3";
import { cn, formatPct, formatPrice, formatUsd, shortenAddress, timeAgo } from "@/lib/utils";
import type { StatsAoVivo } from "@/components/trading/TokenTerminal";
import { useCurvaAtual } from "@/components/trading/CurvaProvider";
import type { TokenSummary } from "@/lib/types";

/**
 * @param price preço ao vivo, vindo do gráfico (atualiza a cada segundo)
 * @param stats números de mercado repescados de 10 em 10s
 * @param volumeDaSessao volume somado dos negócios vistos desde que a página abriu
 *
 * A separação importa: preço, capitalização e variação andam a cada NEGÓCIO
 * porque saem dos eventos da própria rede. Liquidez e portadores vêm de fonte
 * externa, que só recalcula de tempos em tempos — pedir de segundo em segundo
 * devolveria o mesmo número. O volume é os dois somados: a base de 24h da
 * fonte, mais o que passou na nossa frente desde que a página abriu.
 */
const TEXTOS = traducoes({
  en: { curva: "curve", listado: "listed on DEX", copiado: "copied!", verExplorer: "view on explorer ↗", site: "website", buscarNoX: "search on X", variacao: "24h change", volume: "24h volume", liquidez: "Liquidity", mcap: "Market cap", holders: "Holders", criadoHa: (x: string) => `created ${x} ago` },
  pt: { curva: "curva", listado: "listado em DEX", copiado: "copiado!", verExplorer: "ver no explorer ↗", site: "site", buscarNoX: "buscar no X", variacao: "Variação 24h", volume: "Volume 24h", liquidez: "Liquidez", mcap: "Market cap", holders: "Holders", criadoHa: (x: string) => `criado ${x} atrás` },
  zh: { curva: "曲线", listado: "已上 DEX", copiado: "已复制！", verExplorer: "在浏览器中查看 ↗", site: "官网", buscarNoX: "在 X 上搜索", variacao: "24小时涨跌", volume: "24小时交易量", liquidez: "流动性", mcap: "市值", holders: "持有人", criadoHa: (x: string) => `${x}前创建` },
});

export function TokenHeader({
  token,
  price,
  stats,
  volumeDaSessao,
  top10Pct,
}: {
  token: TokenSummary;
  price: number;
  stats: StatsAoVivo;
  volumeDaSessao: number;
  top10Pct: number;
}) {
  const t = useTextos(TEXTOS);
  const [copied, setCopied] = useState(false);
  const meta = CHAINS[token.chain];

  const { progresso: progressoDaCurva } = useCurvaAtual();

  /*
   * Variação recalculada a partir do preço ao vivo.
   *
   * O ponto de partida é deduzido do que a fonte informou: se ela disse "+50%"
   * com preço X, então 24h atrás valia X / 1,5. Guardado esse ponto, a
   * variação anda junto com o preço, em vez de ficar congelada no valor da
   * última consulta enquanto o gráfico dispara ao lado.
   */
  const precoDe24hAtras =
    token.priceUsd > 0 && stats.change24h > -100
      ? token.priceUsd / (1 + stats.change24h / 100)
      : 0;

  const variacao =
    precoDe24hAtras > 0 && price > 0 ? (price / precoDe24hAtras - 1) * 100 : stats.change24h;

  // Capitalização = preço x fornecimento; o fornecimento sai dos dados da fonte.
  const fornecimento = token.priceUsd > 0 ? token.marketCapUsd / token.priceUsd : 0;
  const marketCapAoVivo = fornecimento > 0 ? price * fornecimento : token.marketCapUsd;

  const volumeTotal = stats.volume24hUsd + volumeDaSessao;
  const up = variacao >= 0;

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(token.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard bloqueado (http, permissão): ignora em silêncio */
    }
  }

  return (
    <Card className="p-3">
      <div className="flex flex-wrap items-center gap-3">
        <ImagemDaMoedaGrande token={token} />

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-base font-bold text-zinc-50">{token.name}</h1>
            <span className="text-sm font-semibold text-zinc-500">${token.symbol}</span>
            <Badge tone="neutral" className={meta.accent}>
              {meta.label}
            </Badge>
            {/*
              * A curva da REDE manda sobre o que a Dexscreener diz.
              *
              * Uma moeda na nossa curva não está listada em DEX nenhuma — não
              * existe pool. O selo dizia "listado em DEX" só porque a
              * Dexscreener não devolve progresso de curva pra uma moeda que
              * ela nem indexa, e o `null` caía no caso contrário.
              */}
            {progressoDaCurva !== null ? (
              <Badge tone="chroma">
                {t.curva} {progressoDaCurva.toFixed(0)}%
              </Badge>
            ) : token.bondingProgress !== null ? (
              <Badge tone="chroma">{t.curva} {token.bondingProgress}%</Badge>
            ) : (
              <Badge tone="neutral">{token.dexId ?? t.listado}</Badge>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-600">
            <button
              onClick={copyAddress}
              className="tnum rounded-md border border-white/[0.06] px-2 py-0.5 transition-colors hover:border-marca/40 hover:text-marca"
            >
              {copied ? t.copiado : shortenAddress(token.address, 6)}
            </button>
            {meta.explorer !== "#" && (
              <a
                href={`${meta.explorer}${token.address}`}
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-zinc-300"
              >
                {t.verExplorer}
              </a>
            )}
            <span>{t.criadoHa(timeAgo(token.createdAt))}</span>

            {/*
              SITE E X DA MOEDA — e, quando não há, uma busca no X.
              ---------------------------------------------------------------
              A maioria das meme coins não declara link nenhum, e era aí que a
              tela ficava muda: quem quer saber se o projeto existe de verdade
              sai do site pra procurar, e às vezes não volta.

              A busca vai pelo ENDEREÇO DO CONTRATO, não pelo nome. Nome de
              meme coin se repete às centenas e o resultado viria cheio de
              moeda homônima; o contrato é único, e quem fala dela cita ele.
            */}
            {/* Site, X e Telegram agora ficam no painel "Sobre", como na Fomo Family. */}

            {/*
              A denúncia mora AQUI, na linha dos metadados, e não junto do
              compartilhar. Canal de denúncia em destaque vira arma: dá pra
              usar pra sujar a fila de um concorrente em massa. Quem precisa
              dele, acha — e o ícone de bandeira é o mesmo que toda plataforma
              do gênero usa, então não precisa de rótulo.
            */}
            <DenunciarToken token={token} />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
            <div className="tnum text-xl font-black text-zinc-50">${formatPrice(price)}</div>
            <div className={cn("tnum text-sm font-semibold", up ? "text-bull" : "text-bear")}>
              {formatPct(variacao)} <span className="text-zinc-600">24h</span>
            </div>
          </div>

          {/*
            O botão de compartilhar mora AQUI, não só no painel de afiliado:
            ninguém divulga "a plataforma", as pessoas divulgam a moeda que
            compraram. Se o link não sair daqui, o programa não roda.
          */}

        </div>
      </div>

      {/*
        Uma faixa fina, não quatro caixas. O gráfico é o que a pessoa veio ver;
        cada pixel gasto aqui sai de lá.
      */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/[0.06] pt-2.5">
        <Numero rotulo={t.mcap} valor={formatUsd(marketCapAoVivo)} />
        <Numero
          rotulo={t.variacao}
          valor={formatPct(variacao)}
          cor={up ? "text-bull" : "text-bear"}
        />
        <Numero rotulo={t.volume} valor={formatUsd(volumeTotal)} />
        <Numero rotulo={t.liquidez} valor={formatUsd(stats.liquidityUsd)} />
        <Numero
          rotulo={t.holders}
          valor={stats.holders > 0 ? stats.holders.toLocaleString() : "—"}
        />
        {/*
          Só aparece quando existe. Na Robinhood Chain nenhum serviço publica a
          lista de portadores e o explorador está atrás de proteção anti-robô —
          mostrar "0%" ali seria inventar um número tranquilizador.
        */}
        {top10Pct > 0 && (
          <Numero
            rotulo="Top 10"
            valor={`${top10Pct.toFixed(1)}%`}
            cor={top10Pct > 50 ? "text-bear" : top10Pct > 25 ? "text-warn" : undefined}
          />
        )}
      </div>
    </Card>
  );
}

/**
 * Link que sai do site.
 *
 * `noreferrer` junto com `noopener` de propósito: sem eles, a página aberta
 * ganha uma referência de volta e pode redirecionar esta aqui — e a pessoa
 * volta achando que ainda está na Chroma.
 */

function Numero({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-600">{rotulo}</div>
      <div className={cn("tnum text-[13px] font-bold", cor ?? "text-zinc-100")}>{valor}</div>
    </div>
  );
}
