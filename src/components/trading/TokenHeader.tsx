"use client";

import { useState } from "react";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ShareToken } from "@/components/trading/ShareToken";
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
        {token.imageUrl ? (
           
          <img src={token.imageUrl} alt="" className="size-10 shrink-0 rounded-lg bg-ink-800 object-cover" />
        ) : (
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-chroma-gradient bg-[length:200%_200%] text-sm font-black text-white/90">
            {token.symbol.slice(0, 2)}
          </div>
        )}

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
                curva {progressoDaCurva.toFixed(0).replace(".", ",")}%
              </Badge>
            ) : token.bondingProgress !== null ? (
              <Badge tone="chroma">bonding {token.bondingProgress}%</Badge>
            ) : (
              <Badge tone="neutral">{token.dexId ?? "listado em DEX"}</Badge>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-600">
            <button
              onClick={copyAddress}
              className="tnum rounded-md border border-white/[0.06] px-2 py-0.5 transition-colors hover:border-marca/40 hover:text-marca"
            >
              {copied ? "copiado!" : shortenAddress(token.address, 6)}
            </button>
            {meta.explorer !== "#" && (
              <a
                href={`${meta.explorer}${token.address}`}
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-zinc-300"
              >
                ver no explorer ↗
              </a>
            )}
            <span>criado {timeAgo(token.createdAt)} atrás</span>
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
          <ShareToken token={token} />
        </div>
      </div>

      {/*
        Uma faixa fina, não quatro caixas. O gráfico é o que a pessoa veio ver;
        cada pixel gasto aqui sai de lá.
      */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/[0.06] pt-2.5">
        <Numero rotulo="Market cap" valor={formatUsd(marketCapAoVivo)} />
        <Numero
          rotulo="Variação 24h"
          valor={formatPct(variacao)}
          cor={up ? "text-bull" : "text-bear"}
        />
        <Numero rotulo="Volume 24h" valor={formatUsd(volumeTotal)} />
        <Numero rotulo="Liquidez" valor={formatUsd(stats.liquidityUsd)} />
        <Numero
          rotulo="Holders"
          valor={stats.holders > 0 ? stats.holders.toLocaleString("pt-BR") : "—"}
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

function Numero({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-600">{rotulo}</div>
      <div className={cn("tnum text-[13px] font-bold", cor ?? "text-zinc-100")}>{valor}</div>
    </div>
  );
}
