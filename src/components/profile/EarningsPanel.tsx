"use client";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";

import Link from "next/link";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { feeLabel } from "@/lib/fees";
import { PAYOUT_MODE, payoutReady } from "@/lib/payout";
import { chainIcon } from "@/lib/chain-icons";
import { formatUsd } from "@/lib/utils";
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
const TEXTOS = traducoes({
  en: {
    total: "Total received", convertido: "— converted at today's price, so the dollar value goes up and down with the market. The amount in each coin never decreases.",
    cliques: "Clicks on your link", viraram: "Became trades", compartilhar: "Share",
    aindaNao: (b: React.ReactNode, p: string) => <>You have not received any commission yet. Open a coin and click {b} to generate your referral link. You get {p} of every trade from whoever comes through it, in the coin of the network where they trade.</>,
    cliquesExplica: "Clicks are how many people opened your link. Trades are how many of them actually traded.",
    pagaEm: (s: string) => `paid in ${s}`, jaGanhou: "You have earned", resgatar: (s: string) => `Withdraw ${s}`,
    semCarteira: (r: string, b: React.ReactNode) => <>You have no {r} wallet on your account. {b} until you link one.</>,
    naoSaoPagas: "Referrals on this network are not paid", vincular: "Link", hoje: "Today", seteDias: "7 days",
    nenhumaOperou: (r: string, s: React.ReactNode) => <>None of your referrals traded on {r} yet. When they do, the commission arrives in {s} and each payment shows up here with its receipt.</>,
    deQuais: "Which coins it came from", cadaPagamento: "Each payment", comprovante: "receipt ↗",
    naoPrecisaForte: "You do not need to withdraw.",
    naoPrecisa: (b: React.ReactNode, p: string) => <>{b} Each {p} was already sent to your wallet inside the same transaction, instantly — and every amount above is recorded on the blockchain.</>,
    resgateIndisponivel: "Withdrawal on this network is not available yet. Your commissions keep adding up normally.",
    ultimos14: "Last 14 days",
  },
  pt: {
    total: "Total já recebido", convertido: "— convertido ao preço de hoje, então o valor em dólar sobe e desce com o mercado. A quantidade em cada moeda nunca diminui.",
    cliques: "Cliques no seu link", viraram: "Viraram trade", compartilhar: "Compartilhar",
    aindaNao: (b: React.ReactNode, p: string) => <>Você ainda não recebeu comissão. Abra uma moeda e clique em {b} para gerar o seu link de indicação. Você recebe {p} de cada operação de quem entrar por ele, na moeda da rede em que a pessoa operar.</>,
    cliquesExplica: "Cliques são quantas pessoas abriram o seu link. Trades são quantas delas realmente operaram.",
    pagaEm: (s: string) => `paga em ${s}`, jaGanhou: "Você já ganhou", resgatar: (s: string) => `Resgatar ${s}`,
    semCarteira: (r: string, b: React.ReactNode) => <>Você não tem carteira {r} na conta. {b} até vincular uma.</>,
    naoSaoPagas: "Indicações nessa rede não são pagas", vincular: "Vincular", hoje: "Hoje", seteDias: "7 dias",
    nenhumaOperou: (r: string, s: React.ReactNode) => <>Nenhuma indicação sua operou na {r} ainda. Quando operar, a comissão entra em {s} e cada pagamento aparece aqui com o comprovante.</>,
    deQuais: "De quais moedas veio", cadaPagamento: "Cada pagamento", comprovante: "comprovante ↗",
    naoPrecisaForte: "Você não precisa resgatar.",
    naoPrecisa: (b: React.ReactNode, p: string) => <>{b} Cada {p} já foi transferido para a sua carteira dentro da própria transação, na hora — e cada valor acima fica registrado na blockchain.</>,
    resgateIndisponivel: "O resgate nesta rede ainda não está disponível. As suas comissões continuam sendo somadas normalmente.",
    ultimos14: "Últimos 14 dias",
  },
  zh: {
    total: "累计收益", convertido: "—— 按今日价格换算，美元价值随市场涨跌，但每种币的数量永远不会减少。",
    cliques: "链接点击次数", viraram: "转化为交易", compartilhar: "分享",
    aindaNao: (b: React.ReactNode, p: string) => <>你还没有获得佣金。打开一个代币并点击 {b} 生成你的推荐链接。通过它进入的人每笔交易你都能获得 {p}，以对方交易所在网络的币种支付。</>,
    cliquesExplica: "点击次数是打开你链接的人数，交易次数是其中真正交易的人数。",
    pagaEm: (s: string) => `以 ${s} 支付`, jaGanhou: "你已获得", resgatar: (s: string) => `提取 ${s}`,
    semCarteira: (r: string, b: React.ReactNode) => <>你的账户没有 {r} 钱包。在关联之前，{b}。</>,
    naoSaoPagas: "该网络上的推荐不会获得报酬", vincular: "关联", hoje: "今日", seteDias: "7 天",
    nenhumaOperou: (r: string, s: React.ReactNode) => <>你推荐的人还没有在 {r} 上交易。交易后佣金将以 {s} 到账，每笔付款都会在这里显示凭证。</>,
    deQuais: "来自哪些代币", cadaPagamento: "每笔付款", comprovante: "凭证 ↗",
    naoPrecisaForte: "你无需提取。",
    naoPrecisa: (b: React.ReactNode, p: string) => <>{b} 每笔 {p} 都已在同一笔交易中即时转入你的钱包 —— 上方每个金额都记录在区块链上。</>,
    resgateIndisponivel: "该网络暂不支持提取，你的佣金会继续正常累计。",
    ultimos14: "最近 14 天",
  },
});

export function EarningsPanel({ resumo }: { resumo: AffiliateSummary | null }) {
  const t = useTextos(TEXTOS);
  /*
   * Uma entrada por rede existente, não só pelas que já renderam. Assim o
   * layout não muda de forma quando a primeira conversão entra — o número
   * simplesmente deixa de ser zero.
   */
  const redes = CHAIN_IDS.map(
    (chain) => resumo?.porRede.find((r) => r.chain === chain) ?? redeZerada(chain),
  );

  const nadaAinda = redes.every((r) => r.trades === 0);

  /* As redes que de fato renderam algo — é o que o total detalha embaixo. */
  const comGanho = redes.filter((r) => r.commissionNative > 0);
  const detalhe = comGanho.map((r) => `${curto(r.commissionNative)} ${r.symbol}`).join("  +  ");

  return (
    <div className="space-y-4">
      {/*
        O TOTAL vem primeiro, e é o maior número da tela.
        -------------------------------------------------------------------
        Antes esta área abria direto nos cartões por rede: tanto em SOL, tanto
        em ETH. Está correto — são ativos diferentes, em carteiras diferentes
        — mas obriga a pessoa a fazer a conta de cabeça pra responder a única
        pergunta que ela veio fazer: quanto eu já ganhei.

        Some quando nada entrou ainda: um "US$ 0,00" gigante na abertura
        desanima justamente quem ainda nem começou a divulgar.
      */}
      {!nadaAinda && (
        <Card>
          <CardBody className="space-y-1 py-5 text-center">
            <p className="rotulo">{t.total}</p>

            {resumo?.totalUsd != null ? (
              <p className="tnum text-4xl font-black text-zinc-50">
                {formatUsd(resumo.totalUsd)}
              </p>
            ) : (
              /* Sem preço, mostra as quantidades — que nunca estão erradas. */
              <p className="tnum text-2xl font-black text-zinc-50">{detalhe || "—"}</p>
            )}

            <p className="mx-auto max-w-[430px] text-[11px] leading-relaxed text-zinc-600">
              {detalhe}
              {resumo?.totalUsd != null && (
                <>
                  {" "}
                  {t.convertido}
                </>
              )}
            </p>
          </CardBody>
        </Card>
      )}

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
            <Mini rotulo={t.cliques} valor={String(resumo?.clicks ?? 0)} />
            <Mini rotulo={t.viraram} valor={String(resumo?.trades ?? 0)} />
          </div>
          <p className="text-[12px] leading-relaxed text-zinc-500">
            {nadaAinda ? (
              t.aindaNao(<strong className="text-zinc-300">{t.compartilhar}</strong>, feeLabel.affiliate)
            ) : (
              t.cliquesExplica
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
  const t = useTextos(TEXTOS);
  const tx = t;
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
        <Badge tone={temMovimento ? "safe" : "neutral"}>{t.pagaEm(rede.symbol)}</Badge>
      </CardHeader>

      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              {t.jaGanhou}
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
              {t.resgatar(rede.symbol)}
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
              {t.semCarteira(meta.label, <strong>{t.naoSaoPagas}</strong>)}
            </span>
            <Link
              href="/profile?aba=conta"
              className="shrink-0 rounded-lg border border-warn/40 px-2.5 py-1 text-[11px] font-bold text-warn transition-colors hover:bg-warn/10"
            >
              {t.vincular}
            </Link>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <Mini rotulo={t.hoje} valor={curto(rede.commissionToday)} sufixo={rede.symbol} destaque />
          <Mini rotulo={t.seteDias} valor={curto(rede.commissionWeek)} sufixo={rede.symbol} />
          <Mini rotulo="Trades" valor={String(rede.trades)} />
        </div>

        {!temMovimento ? (
          <p className="text-[11px] leading-relaxed text-zinc-600">
            {t.nenhumaOperou(meta.label, <strong className="text-zinc-500">{rede.symbol}</strong>)}
          </p>
        ) : (
          <>
            <GraficoDiario dias={rede.daily} simbolo={rede.symbol} />

            {rede.byToken.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                  {t.deQuais}
                </h4>
                <div className="space-y-1">
                  {rede.byToken.map((t) => (
                    <Link
                      key={t.address || t.symbol}
                      href={t.address ? `/token/${t.address}` : "#"}
                      className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12px] transition-colors hover:border-marca/30"
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
                  {t.cadaPagamento}
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
                        {new Date(t.at).toLocaleString(undefined, {
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
                            className="text-marca transition-colors hover:text-chroma-cyan"
                          >
                            {tx.comprovante}
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
                {t.naoPrecisa(<strong className="text-bull">{t.naoPrecisaForte}</strong>, feeLabel.affiliate)}
              </p>
            ) : !pronto ? (
              <p className="rounded-xl border border-warn/25 bg-warn/[0.06] p-3 text-[11px] leading-relaxed text-warn">
                {t.resgateIndisponivel}
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
  const t = useTextos(TEXTOS);
  const maior = Math.max(...dias.map((d) => d.commission), 0);

  return (
    <div>
      <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
        {t.ultimos14}
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
          ? "border-marca/30 bg-marca/[0.06]"
          : "border-white/[0.06] bg-white/[0.02]",
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">{rotulo}</div>
      <div
        className={cn(
          "tnum mt-0.5 truncate text-sm font-bold",
          destaque ? "text-marca" : "text-zinc-100",
        )}
      >
        {valor}
        {sufixo && <span className="pl-1 text-[11px] font-semibold text-zinc-500">{sufixo}</span>}
      </div>
    </div>
  );
}
