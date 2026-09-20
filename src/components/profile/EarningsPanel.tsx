"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { feeLabel } from "@/lib/fees";
import { PAYOUT_MODE, payoutReady } from "@/lib/payout";
import { chainIcon } from "@/lib/chain-icons";
import { CHAINS, CHAIN_IDS } from "@/lib/web3";
import { MOEDA_DA_REDE } from "@/lib/affiliate-types";
import { cn } from "@/lib/utils";
import type { AffiliateSummary, GanhosDaRede } from "@/lib/affiliate-types";
import type { ChainId } from "@/lib/types";

/**
 * Comissões de indicação, UMA SEÇÃO POR REDE.
 *
 * Cada rede paga na própria moeda: indicar na Solana rende SOL, na Robinhood
 * Chain rende ETH. Somar os dois num total só daria um número que não existe
 * em lugar nenhum — e quando houver resgate, ele também será um por rede,
 * porque são ativos e cofres diferentes.
 *
 * As DUAS redes aparecem sempre, mesmo zeradas. A primeira versão escondia
 * tudo enquanto não houvesse conversão e mostrava só cliques — ou seja, a
 * pessoa abria a aba "Indicações" e não encontrava em lugar nenhum quanto
 * tinha ganhado, que é a única coisa que ela foi ali procurar. Zero é uma
 * resposta; ausência de resposta não é.
 *
 * O objetivo do painel é o promotor VER que está ganhando e entender DE ONDE
 * veio. Dinheiro que cai sozinho na carteira passa despercebido: a pessoa não
 * liga o valor à causa e para de divulgar.
 */
export function EarningsPanel({ resumo }: { resumo: AffiliateSummary | null }) {
  /*
   * Uma entrada por rede existente, não só pelas que já renderam. Assim o
   * layout não muda de forma quando a primeira conversão entra — o número
   * simplesmente deixa de ser zero.
   */
  const redes = CHAIN_IDS.map(
    (chain) => resumo?.porRede.find((r) => r.chain === chain) ?? redeZerada(chain),
  );

  const nadaAinda = redes.every((r) => r.trades === 0);

  return (
    <div className="space-y-4">
      {redes.map((rede) => (
        <RedeCard
          key={rede.chain}
          rede={rede}
          carteira={resumo?.carteiras?.[rede.chain] ?? null}
        />
      ))}

      <Card>
        <CardBody className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Mini rotulo="Cliques no seu link" valor={String(resumo?.clicks ?? 0)} />
            <Mini rotulo="Viraram trade" valor={String(resumo?.trades ?? 0)} />
          </div>
          <p className="text-[12px] leading-relaxed text-zinc-500">
            {nadaAinda ? (
              <>
                Ainda não entrou comissão. Abra uma moeda e use o botão{" "}
                <strong className="text-zinc-300">Compartilhar</strong> — é de lá que sai o link com
                a sua indicação. Você recebe {feeLabel.affiliate} de cada operação de quem entrar por
                ele, na moeda da rede em que ela operar.
              </>
            ) : (
              <>
                Cliques contam quem abriu o seu link; trades, quem de fato operou. A distância entre
                os dois é o que dá pra melhorar na divulgação.
              </>
            )}
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

/**
 * Valor curto, sem zeros à toa.
 *
 * Seis casas fixas transbordavam as caixas pequenas no celular e viravam
 * "0.000000…" — o pior resultado possível, porque esconde justamente o número.
 * Aqui zero é "0" e 1,237500 é "1,2375": mesma informação, cabendo na tela.
 *
 * O piso de 0,000001 existe porque abaixo disso o arredondamento imprimiria
 * "0" para uma comissão que de fato entrou, e dizer que a pessoa ganhou zero
 * quando ela ganhou algo é pior do que ser impreciso.
 */
function curto(n: number): string {
  if (n === 0) return "0";
  if (n < 0.000001) return "<0,000001";
  return n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",");
}

/** Rede sem nenhuma conversão ainda: os mesmos campos, todos em zero. */
function redeZerada(chain: ChainId): GanhosDaRede {
  return {
    chain,
    symbol: MOEDA_DA_REDE[chain],
    trades: 0,
    volumeNative: 0,
    commissionNative: 0,
    commissionToday: 0,
    commissionWeek: 0,
    daily: [],
    byToken: [],
    recentTrades: [],
  };
}

/* ------------------------------------------------------------------ */

function RedeCard({ rede, carteira }: { rede: GanhosDaRede; carteira: string | null }) {
  const meta = CHAINS[rede.chain];
  const pronto = payoutReady();
  const temMovimento = rede.trades > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <img
            src={chainIcon(rede.chain)}
            alt=""
            width={18}
            height={18}
            className="size-[18px] rounded-full"
          />
          <CardTitle>{meta.label}</CardTitle>
        </div>
        <Badge tone={temMovimento ? "safe" : "neutral"}>paga em {rede.symbol}</Badge>
      </CardHeader>

      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              Você já ganhou
            </div>
            <div
              className={cn(
                "tnum mt-1 text-3xl font-black tracking-tight",
                temMovimento ? "text-bull" : "text-zinc-600",
              )}
            >
              {curto(rede.commissionNative)}{" "}
              <span className="text-lg font-bold text-zinc-500">{rede.symbol}</span>
            </div>
          </div>

          {/*
            Quando o resgate existir, ele é POR REDE: são ativos diferentes,
            em cofres diferentes. Um botão só não teria o que sacar.
          */}
          {PAYOUT_MODE === "accrual" && (
            <Button variant="chroma" disabled={!pronto || rede.commissionNative <= 0}>
              Resgatar {rede.symbol}
            </Button>
          )}
        </div>

        {/*
          O aviso mais importante da tela. Sem carteira nesta rede a comissão
          simplesmente não tem pra onde ir e fica com a plataforma — e antes
          disso existir, o promotor não tinha como descobrir o motivo.
        */}
        {!carteira && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warn/30 bg-warn/[0.07] px-3 py-2.5">
            <span className="text-[11px] leading-relaxed text-warn">
              Você não tem carteira {meta.label} na conta.{" "}
              <strong>Indicações nessa rede não são pagas</strong> até vincular uma.
            </span>
            <Link
              href="/profile?aba=conta"
              className="shrink-0 rounded-lg border border-warn/40 px-2.5 py-1 text-[11px] font-bold text-warn transition-colors hover:bg-warn/10"
            >
              Vincular
            </Link>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <Mini rotulo="Hoje" valor={curto(rede.commissionToday)} sufixo={rede.symbol} destaque />
          <Mini rotulo="7 dias" valor={curto(rede.commissionWeek)} sufixo={rede.symbol} />
          <Mini rotulo="Trades" valor={String(rede.trades)} />
        </div>

        {!temMovimento ? (
          <p className="text-[11px] leading-relaxed text-zinc-600">
            Nenhuma indicação sua operou na {meta.label} ainda. Quando operar, a comissão entra em{" "}
            <strong className="text-zinc-500">{rede.symbol}</strong> e cada pagamento aparece aqui
            com o comprovante.
          </p>
        ) : (
          <>
            <GraficoDiario dias={rede.daily} simbolo={rede.symbol} />

            {rede.byToken.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                  De quais moedas veio
                </h4>
                <div className="space-y-1">
                  {rede.byToken.map((t) => (
                    <Link
                      key={t.address || t.symbol}
                      href={t.address ? `/token/${t.address}` : "#"}
                      className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12px] transition-colors hover:border-chroma-violet/30"
                    >
                      <span className="font-semibold text-zinc-200">${t.symbol}</span>
                      <span className="tnum flex items-center gap-3">
                        <span className="text-zinc-600">{t.trades} trades</span>
                        <span className="font-bold text-bull">
                          {curto(t.commission)} {rede.symbol}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {rede.recentTrades.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                  Cada pagamento
                </h4>
                <div className="space-y-1">
                  {rede.recentTrades.map((t) => (
                    <div
                      key={t.txHash ?? t.at}
                      className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12px]"
                    >
                      <span className="tnum font-bold text-bull">
                        +{curto(t.commissionNative ?? 0)} {rede.symbol}
                        {t.tokenSymbol && (
                          <span className="pl-2 font-normal text-zinc-500">em ${t.tokenSymbol}</span>
                        )}
                      </span>
                      <span className="flex items-center gap-2 text-[11px] text-zinc-600">
                        {new Date(t.at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {t.txHash && (
                          <a
                            href={meta.explorer.replace("/token/", "/tx/") + t.txHash}
                            target="_blank"
                            rel="noreferrer"
                            className="text-chroma-violet transition-colors hover:text-chroma-cyan"
                          >
                            comprovante ↗
                          </a>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {PAYOUT_MODE === "instant" ? (
              <p className="rounded-xl border border-bull/20 bg-bull/[0.05] p-3 text-[11px] leading-relaxed text-zinc-400">
                <strong className="text-bull">Você não precisa resgatar.</strong> Cada{" "}
                {feeLabel.affiliate} já foi transferido pra sua carteira dentro da própria
                transação, no mesmo bloco — por isso cada linha acima tem comprovante on-chain.
              </p>
            ) : !pronto ? (
              <p className="rounded-xl border border-warn/25 bg-warn/[0.06] p-3 text-[11px] leading-relaxed text-warn">
                O modo de acúmulo está ligado, mas o cofre on-chain desta rede ainda não foi
                publicado. Ver <code>src/lib/payout.ts</code>.
              </p>
            ) : null}
          </>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * Barras de 14 dias, escaladas pelo maior dia do período.
 *
 * Com teto fixo, valores pequenos ficariam rentes ao chão e ninguém veria
 * progresso — que é justamente o que o gráfico existe pra mostrar.
 */
function GraficoDiario({ dias, simbolo }: { dias: GanhosDaRede["daily"]; simbolo: string }) {
  const maior = Math.max(...dias.map((d) => d.commission), 0);

  return (
    <div>
      <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
        Últimos 14 dias
      </h4>
      <div className="flex h-20 items-end gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
        {dias.map((d) => {
          const altura =
            maior > 0 ? Math.max((d.commission / maior) * 100, d.commission > 0 ? 8 : 2) : 2;
          const [, mes, dia] = d.day.split("-");
          return (
            <div
              key={d.day}
              title={dia + "/" + mes + " — " + curto(d.commission) + " " + simbolo}
              className="group flex h-full flex-1 items-end"
            >
              <div
                style={{ height: altura + "%" }}
                className={cn(
                  "w-full rounded-sm transition-colors",
                  d.commission > 0 ? "bg-bull/60 group-hover:bg-bull" : "bg-ink-700",
                )}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Mini({
  rotulo,
  valor,
  sufixo,
  destaque,
}: {
  rotulo: string;
  valor: string;
  sufixo?: string;
  destaque?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5",
        destaque
          ? "border-chroma-violet/30 bg-chroma-violet/[0.06]"
          : "border-white/[0.06] bg-white/[0.02]",
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">{rotulo}</div>
      <div
        className={cn(
          "tnum mt-0.5 truncate text-sm font-bold",
          destaque ? "text-chroma-violet" : "text-zinc-100",
        )}
      >
        {valor}
        {sufixo && <span className="pl-1 text-[11px] font-semibold text-zinc-500">{sufixo}</span>}
      </div>
    </div>
  );
}
