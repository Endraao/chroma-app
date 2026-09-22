"use client";

import { useState } from "react";

import { Skeleton } from "@/components/ui/Skeleton";
import { cn, formatUsd } from "@/lib/utils";
import type { RiskLevel, SecurityCheck, SecurityReport } from "@/lib/types";

/**
 * Alertas do token, no canto da tela.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ENCOLHEU
 * ---------------------------------------------------------------------------
 * Antes era uma grade de oito caixas ocupando meia tela — e numa rede sem
 * provedor de auditoria, as oito diziam "sem dados". Meia tela pra não
 * informar nada, roubando o espaço do gráfico, que é o que a pessoa veio ver.
 *
 * Agora o que aparece por padrão é só O QUE ESTÁ ERRADO, em duas linhas cada.
 * O que passou fica dobrado atrás de um "ver tudo": quem quer conferir item a
 * item abre; quem só quer saber se tem cilada lê três linhas e decide.
 *
 * Alerta é para ser lido. Uma parede de caixas cinzas treina a pessoa a rolar
 * por cima dela — e aí o alerta que importava passa junto.
 *
 * ---------------------------------------------------------------------------
 * O QUE PODE VIRAR ALERTA
 * ---------------------------------------------------------------------------
 * Só o que responde SIM a uma destas duas perguntas:
 *
 *   1. isto pode me impedir de vender depois de comprar?
 *   2. isto deixa alguém tirar o meu dinheiro?
 *
 * Honeypot, dono ativo no contrato, contrato proxy, taxa alta e liquidez rasa
 * demais pra sair passam nesse teste. Idade da moeda, fornecimento e "ainda
 * não deu pra verificar" NÃO passam — são informação, não perigo.
 *
 * Isto não é firula. A primeira versão marcava "moeda recém-criada" como
 * alerta, e numa plataforma cujo produto é LANÇAR moeda nova isso significa
 * carimbar um aviso de perigo em cima de todo lançamento do site — inclusive
 * nos que a própria Chroma acabou de criar. Alerta que aparece sempre não
 * avisa nada e ainda espanta quem ia lançar.
 */

interface Alerta {
  id: string;
  titulo: string;
  detalhe: string;
  nivel: Exclude<RiskLevel, "safe">;
}

/**
 * @param report vem pronto de fora, não é buscado aqui.
 *
 * O cabeçalho da página também precisa do mesmo relatório (pra mostrar a
 * concentração do top 10). Cada um buscando por conta daria duas requisições
 * pro mesmo dado e, pior, duas chances de mostrarem números diferentes.
 */
export function SecurityPanel({
  report,
  carregando,
  liquidityUsd,
}: {
  report: SecurityReport | null;
  carregando: boolean;
  liquidityUsd?: number;
}) {
  const [aberto, setAberto] = useState(false);

  if (carregando) return <Skeleton className="h-[86px] rounded-2xl" />;
  if (!report) return null;

  const alertas = montarAlertas(report, { liquidityUsd });
  const passaram = report.checks.filter((c) => c.level === "safe");
  const naoVerificados = report.checks.filter((c) => c.level === "unknown");

  const grave = alertas.some((a) => a.nivel === "danger");
  /*
   * Sem nada errado, o bloco fica neutro em vez de verde. Verde comemorando
   * "tudo certo" passa uma garantia que auditoria automática não dá.
   */
  const tom = grave ? "bear" : alertas.length ? "warn" : "neutro";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border",
        tom === "bear" && "border-bear/30 bg-bear/[0.05]",
        tom === "warn" && "border-warn/30 bg-warn/[0.05]",
        tom === "neutro" && "border-white/[0.07] bg-white/[0.02]",
      )}
    >
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
      >
        <Sinal tom={tom} />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block text-[13px] font-bold",
              tom === "bear" && "text-bear",
              tom === "warn" && "text-warn",
              tom === "neutro" && "text-zinc-200",
            )}
          >
            {alertas.length === 0
              ? "Nenhum sinal de perigo encontrado"
              : alertas.length === 1
                ? "1 alerta neste token"
                : `${alertas.length} alertas neste token`}
          </span>
          <span className="block text-[11px] text-zinc-500">
            {passaram.length} verificações no contrato passaram
            {naoVerificados.length > 0 && ` · ${naoVerificados.length} fora do nosso alcance`}
          </span>
        </span>
        <Seta aberto={aberto} />
      </button>

      {/*
        Os alertas ficam visíveis SEM abrir. Esconder o problema atrás de um
        clique é o mesmo que não ter alerta: ninguém clica pra descobrir que
        está prestes a perder dinheiro.
      */}
      {alertas.length > 0 && (
        <div className="space-y-2 border-t border-white/[0.07] px-3.5 py-2.5">
          {alertas.map((a) => (
            <div key={a.id}>
              <div
                className={cn(
                  "text-[12px] font-semibold",
                  a.nivel === "danger" ? "text-bear" : "text-warn",
                )}
              >
                {a.titulo}
              </div>
              <div className="text-[11px] leading-relaxed text-zinc-500">{a.detalhe}</div>
            </div>
          ))}
        </div>
      )}

      {/*
        Informação, não alarme: fica em cinza e fora da lista de alertas. Vale
        pra todo token que não passou por revisão humana — ou seja, todos, por
        enquanto. Justamente por valer pra todos é que NÃO pode ser um alerta
        vermelho: viraria ruído em cima de cada lançamento.
      */}
      <div className="border-t border-white/[0.07] px-3.5 py-2">
        <div className="text-[11px] font-semibold text-zinc-400">Token não verificado</div>
        <div className="text-[11px] leading-relaxed text-zinc-600">
          Ninguém da Chroma revisou este token. Pesquise por conta própria antes de comprar.
        </div>
      </div>

      {aberto && (
        <div className="space-y-1 border-t border-white/[0.07] bg-ink-950/40 px-3.5 py-2.5">
          {report.checks.map((c) => (
            <Linha key={c.id} check={c} />
          ))}
          <p className="pt-1.5 text-[10px] leading-relaxed text-zinc-600">
            Auditoria automática não é garantia. Um contrato pode passar em tudo e o dono vender
            tudo mesmo assim.
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * A venda que serve de régua pro aviso de liquidez.
 *
 * Quinhentos dólares não é número mágico: é mais ou menos o tamanho de uma
 * posição de quem está começando. O aviso precisa responder à pergunta dessa
 * pessoa, não à de quem move cem mil.
 */
const VENDA_DE_REFERENCIA = 500;

/**
 * Abaixo disto o aviso aparece.
 *
 * Dez mil dólares de pool é o ponto em que a venda de referência já custa uns
 * 10% de preço. Acima disso, o impacto vira ruído; abaixo, vira prejuízo.
 */
const PISO_DE_LIQUIDEZ = 10_000;

/**
 * Junta o que veio do contrato com o que dá pra ver do mercado.
 *
 * Passa pelo filtro das duas perguntas lá de cima: só entra o que pode
 * atrapalhar a venda ou tirar dinheiro de quem comprou.
 */
function montarAlertas(
  report: SecurityReport,
  mercado: { liquidityUsd?: number },
): Alerta[] {
  const alertas: Alerta[] = [];

  for (const c of report.checks) {
    /*
     * SÓ "danger" vira alerta. Nem "warn", nem "unknown".
     *
     * Esta é a segunda correção do mesmo problema, e o erro das duas vezes foi
     * o mesmo: deixar entrar o que é só DIGNO DE NOTA. "Metadata mutável" é o
     * caso exemplar — trocar o nome da moeda depois é sacanagem, mas não
     * impede ninguém de vender nem tira dinheiro de carteira nenhuma. Ele
     * estava abrindo um aviso vermelho em quase toda moeda.
     *
     * A régua continua a mesma: só é alerta o que (a) impede de VENDER ou (b)
     * deixa alguém TIRAR O DINHEIRO. Na prática isso são a autoridade de
     * emissão, a de congelar, o gancho de transferência, a conta fechável e a
     * ausência de pool — todos já marcados como "danger".
     *
     * O que é "warn" não some: continua na lista de verificações, logo abaixo,
     * onde quem quer olhar olha. Só para de virar alarme.
     */
    if (c.level !== "danger") continue;

    /*
     * AUSÊNCIA DE DADO NÃO É PROVA DE PERIGO.
     *
     * O serviço de auditoria marca "nenhuma pool" quando não CONHECE o par —
     * e ele não conhece a maioria das moedas novas, que é justamente o que se
     * negocia aqui. O resultado era um alerta vermelho de "não dá pra vender"
     * em moeda que estava negociando na mesma tela, com a liquidez impressa
     * três centímetros acima.
     *
     * Quando os nossos próprios dados de mercado mostram liquidez, quem está
     * errado é a auditoria. O caso de não haver pool DE VERDADE continua
     * coberto: aí a liquidez que lemos é zero e o alerta passa.
     */
    if (c.id === "liquidity" && (mercado.liquidityUsd ?? 0) > 0) continue;

    alertas.push({ id: c.id, titulo: c.label, detalhe: c.description, nivel: c.level });
  }

  /*
   * Liquidez rasa demais pra sair — em DÓLAR, não em proporção.
   *
   * -------------------------------------------------------------------------
   * POR QUE A PROPORÇÃO FOI EMBORA
   * -------------------------------------------------------------------------
   * A regra era `liquidez ÷ capitalização < 2%`. Ela marcava a PUMP, de 3,7
   * bilhões de capitalização, com alerta vermelho de "você não consegue sair"
   * — numa moeda com a auditoria limpa e nota 96.
   *
   * Dois erros somados:
   *
   *   1. **A proporção não quer dizer nada em moeda grande.** Quanto maior a
   *      capitalização, menor essa razão fica naturalmente. Qualquer token de
   *      bilhão fica abaixo de 2%, e isso não diz nada sobre conseguir vender.
   *
   *   2. **A gente enxerga UMA pool.** A liquidez que lemos é a do melhor par
   *      da fonte. A própria auditoria da PUMP respondeu "10 pool(s)" — os
   *      23 milhões que comparamos eram um décimo do que existe.
   *
   * -------------------------------------------------------------------------
   * O QUE SUBSTITUIU
   * -------------------------------------------------------------------------
   * A pergunta real de quem compra é "se eu quiser sair, quanto o preço anda
   * contra mim?". Numa pool de produto constante, uma venda de tamanho V
   * contra liquidez L move o preço em cerca de 2V/L. Com 500 dólares de venda
   * e 10 mil de liquidez, isso é 10% — dinheiro de verdade indo embora.
   *
   * Então o corte é em dólar absoluto, e o texto diz a conta em vez de mostrar
   * uma porcentagem que ninguém sabe interpretar. Moeda de bilhão nunca cai
   * aqui; moeda de 3 mil dólares de pool cai, e cai com razão.
   */
  const { liquidityUsd } = mercado;
  if (liquidityUsd !== undefined && liquidityUsd < PISO_DE_LIQUIDEZ) {
    const impacto = liquidityUsd > 0 ? (2 * VENDA_DE_REFERENCIA) / liquidityUsd : 1;
    alertas.push({
      id: "liquidez_rasa",
      titulo: "Difícil sair desta moeda",
      detalhe:
        liquidityUsd > 0
          ? `A pool tem ${formatUsd(liquidityUsd)}. Uma venda de ${formatUsd(VENDA_DE_REFERENCIA)} já derrubaria o preço uns ${Math.min(99, Math.round(impacto * 100))}% contra você.`
          : "Não encontramos liquidez negociável para esta moeda.",
      nivel: "danger",
    });
  }

  return alertas;
}

function Linha({ check }: { check: SecurityCheck }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <Ponto nivel={check.level} />
      <span className="min-w-0 flex-1 truncate text-zinc-400" title={check.description}>
        {check.label}
      </span>
      <span
        className={cn(
          "tnum shrink-0 font-semibold",
          check.level === "safe" && "text-bull",
          check.level === "warn" && "text-warn",
          check.level === "danger" && "text-bear",
          check.level === "unknown" && "text-zinc-600",
        )}
      >
        {check.value}
      </span>
    </div>
  );
}

function Ponto({ nivel }: { nivel: RiskLevel }) {
  return (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        nivel === "safe" && "bg-bull",
        nivel === "warn" && "bg-warn",
        nivel === "danger" && "bg-bear",
        nivel === "unknown" && "bg-zinc-700",
      )}
    />
  );
}

function Sinal({ tom }: { tom: "neutro" | "warn" | "bear" }) {
  const cor = tom === "bear" ? "text-bear" : tom === "warn" ? "text-warn" : "text-zinc-500";
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-4 shrink-0", cor)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      {tom === "neutro" ? (
        <>
          <path d="M12 3 4.5 6v6c0 4.2 3 7.6 7.5 9 4.5-1.4 7.5-4.8 7.5-9V6z" />
          <path d="m9 12 2 2 4-4" />
        </>
      ) : (
        <>
          <path d="M12 3.5 2.5 20h19z" />
          <path d="M12 10v4.5M12 17.5h.01" />
        </>
      )}
    </svg>
  );
}

function Seta({ aberto }: { aberto: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn(
        "size-3.5 shrink-0 text-zinc-600 transition-transform",
        aberto && "rotate-180",
      )}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
