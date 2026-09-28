"use client";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";

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
  /**
   * Fica visível sem abrir o painel, mesmo não sendo perigo confirmado.
   *
   * Existe por um caso só: liquidez que não dá pra confirmar. Não é acusação
   * — pode ser moeda séria em pool concentrada — mas é a informação que mais
   * decide se vale arriscar, e escondê-la atrás de um clique seria repetir o
   * erro que este painel já cometeu uma vez.
   */
  destacar?: boolean;
}

/**
 * @param report vem pronto de fora, não é buscado aqui.
 *
 * O cabeçalho da página também precisa do mesmo relatório (pra mostrar a
 * concentração do top 10). Cada um buscando por conta daria duas requisições
 * pro mesmo dado e, pior, duas chances de mostrarem números diferentes.
 */
type Rotulos = Record<string, { label: string; description: string }>;

const TEXTOS = traducoes({
  en: {
    nenhumSinal: "No danger signs found",
    alertas: (n: number) => (n === 1 ? "1 alert on this token" : `${n} alerts on this token`),
    passaram: (n: number) => `${n} contract checks passed`,
    atencao: (n: number) => (n === 1 ? "1 point of attention" : `${n} points of attention`),
    naoEGarantia: "Automated audits are not a guarantee. A contract can pass everything and the owner can still sell it all.",
    lpTitulo: "Liquidity not locked",
    lpDetalhe: "We could not confirm that the liquidity is locked. Trade with caution.",
    rasaTitulo: "Hard to exit this coin",
    rasaDetalhe: (pool: string, venda: string, pct: number) => `The pool holds ${pool}. A ${venda} sale would already drop the price about ${pct}% against you.`,
    semLiquidez: "We found no tradable liquidity for this coin.",
    checks: {
      honeypot: { label: "Honeypot", description: "Can you sell after buying?" },
      mintable: { label: "Mint authority", description: "The owner can create new tokens and dilute you." },
      proxy: { label: "Proxy contract", description: "The code can be swapped after launch." },
      hidden_owner: { label: "Hidden owner", description: "There is a hidden owner in the contract." },
      can_take_back: { label: "Reclaim ownership", description: "The owner can take back control after renouncing." },
      blacklist: { label: "Blacklist", description: "The contract can block your wallet." },
      trading_cooldown: { label: "Trade cooldown", description: "Time limit between trades." },
      open_source: { label: "Verified code", description: "The source code is published on the explorer." },
      buy_tax: { label: "Buy tax", description: "Share kept by the contract on each trade." },
      sell_tax: { label: "Sell tax", description: "Share kept by the contract on each trade." },
      lp_locked: { label: "Liquidity locked", description: "If the owner can remove the liquidity, the price goes to zero." },
      liquidity: { label: "DEX liquidity", description: "Pool found on known DEXs." },
      freezable: { label: "Freeze authority", description: "If present, your token account can be frozen." },
      metadata_mutable: { label: "Mutable metadata", description: "Name, symbol and image can be changed later." },
      transfer_fee: { label: "Transfer fee", description: "Token-2022 can charge a fee on every transfer." },
      transfer_hook: { label: "Transfer hook", description: "External code runs on every transfer." },
      closable: { label: "Closable account", description: "The mint account can be closed by the owner." },
      maior_detentor: { label: "Largest holder", description: "How much of the supply sits in a single wallet." },
      trusted: { label: "Verified token", description: "Listed in known token lists." },
      owner: { label: "Contract owner", description: "Who controls the contract." },
      codigo: { label: "Published code", description: "Whether the contract code is public." },
      supply: { label: "Supply", description: "Total minted, read from the contract itself." },
    } as Rotulos,
    valores: {
      Sim: "Yes", Não: "No", sim: "yes", não: "no", "Vende ok": "Sells OK", "NÃO VENDE": "CAN'T SELL", Nenhuma: "None",
      "sem pool": "no pool", "não confirmada": "not confirmed", "não verificado": "not verified", ativo: "active",
      "sem dono": "no owner", renunciado: "renounced", Ativa: "Active", Revogada: "Revoked", Presente: "Present", Aguardando: "Waiting",
    } as Record<string, string>,
    pools: "pool(s)",
  },
  pt: {
    nenhumSinal: "Nenhum sinal de perigo encontrado",
    alertas: (n: number) => (n === 1 ? "1 alerta neste token" : `${n} alertas neste token`),
    passaram: (n: number) => `${n} verificações no contrato passaram`,
    atencao: (n: number) => (n === 1 ? "1 ponto de atenção" : `${n} pontos de atenção`),
    naoEGarantia: "Auditoria automática não é garantia. Um contrato pode passar em tudo e o dono vender tudo mesmo assim.",
    lpTitulo: "Liquidez não travada",
    lpDetalhe: "Não foi possível confirmar que a liquidez está travada. Opere com cautela.",
    rasaTitulo: "Difícil sair desta moeda",
    rasaDetalhe: (pool: string, venda: string, pct: number) => `A pool tem ${pool}. Uma venda de ${venda} já derrubaria o preço uns ${pct}% contra você.`,
    semLiquidez: "Não encontramos liquidez negociável para esta moeda.",
    checks: {} as Rotulos,
    valores: {} as Record<string, string>,
    pools: "pool(s)",
  },
  zh: {
    nenhumSinal: "未发现危险信号",
    alertas: (n: number) => `该代币有 ${n} 条警报`,
    passaram: (n: number) => `${n} 项合约检查通过`,
    atencao: (n: number) => `${n} 个注意事项`,
    naoEGarantia: "自动审计并不代表保证。合约即使通过所有检查，所有者仍可能全部卖出。",
    lpTitulo: "流动性未锁定",
    lpDetalhe: "无法确认流动性已锁定，请谨慎交易。",
    rasaTitulo: "难以卖出该代币",
    rasaDetalhe: (pool: string, venda: string, pct: number) => `池中只有 ${pool}。一笔 ${venda} 的卖单就会让价格对你不利地下跌约 ${pct}%。`,
    semLiquidez: "没有找到该代币可交易的流动性。",
    checks: {
      honeypot: { label: "貔貅盘", description: "买入后能否卖出？" },
      mintable: { label: "增发权限", description: "所有者可以增发代币稀释你的持仓。" },
      proxy: { label: "代理合约", description: "上线后代码可以被替换。" },
      hidden_owner: { label: "隐藏所有者", description: "合约中存在隐藏的所有者。" },
      can_take_back: { label: "收回所有权", description: "所有者放弃后仍可收回控制权。" },
      blacklist: { label: "黑名单", description: "合约可以封禁你的钱包。" },
      trading_cooldown: { label: "交易冷却", description: "两次交易之间的时间限制。" },
      open_source: { label: "代码已验证", description: "源代码已在浏览器上公开。" },
      buy_tax: { label: "买入税", description: "每笔交易被合约扣留的比例。" },
      sell_tax: { label: "卖出税", description: "每笔交易被合约扣留的比例。" },
      lp_locked: { label: "流动性锁定", description: "如果所有者能撤走流动性，价格会归零。" },
      liquidity: { label: "DEX 流动性", description: "在已知 DEX 上找到的池子。" },
      freezable: { label: "冻结权限", description: "如果存在，你的代币账户可能被冻结。" },
      metadata_mutable: { label: "元数据可修改", description: "名称、符号和图片之后可以更改。" },
      transfer_fee: { label: "转账手续费", description: "Token-2022 可以对每次转账收费。" },
      transfer_hook: { label: "转账钩子", description: "每次转账都会运行外部代码。" },
      closable: { label: "账户可关闭", description: "铸币账户可被所有者关闭。" },
      maior_detentor: { label: "最大持有人", description: "单个钱包持有的供应量占比。" },
      trusted: { label: "认证代币", description: "已收录在知名代币列表中。" },
      owner: { label: "合约所有者", description: "谁控制该合约。" },
      codigo: { label: "代码公开", description: "合约代码是否公开。" },
      supply: { label: "供应量", description: "从合约本身读取的总发行量。" },
    } as Rotulos,
    valores: {
      Sim: "是", Não: "否", sim: "是", não: "否", "Vende ok": "可卖出", "NÃO VENDE": "无法卖出", Nenhuma: "无",
      "sem pool": "无池子", "não confirmada": "未确认", "não verificado": "未验证", ativo: "有效",
      "sem dono": "无所有者", renunciado: "已放弃", Ativa: "有效", Revogada: "已撤销", Presente: "存在", Aguardando: "等待中",
    } as Record<string, string>,
    pools: "个池子",
  },
});

/** Troca rótulo, explicação e valor de cada verificação pelo idioma da página. */
function traduzirRelatorio(report: SecurityReport, t: (typeof TEXTOS)["en"]): SecurityReport {
  return {
    ...report,
    checks: report.checks.map((c) => {
      const r = t.checks[c.id];
      const valor = typeof c.value === "string" ? (t.valores[c.value] ?? c.value.replace("pool(s)", t.pools)) : c.value;
      return { ...c, label: r?.label ?? c.label, description: r?.description ?? c.description, value: valor };
    }),
  };
}

export function SecurityPanel({
  report,
  carregando,
  liquidityUsd,
  naCurva = false,
}: {
  report: SecurityReport | null;
  carregando: boolean;
  liquidityUsd?: number;
  /**
   * Moeda na curva da Chroma. Não tem pool: a curva compra e vende sempre, e
   * ninguém retira o ETH dela. Os alertas de liquidez partem de pool de DEX e
   * não se aplicam — deram "difícil sair" na primeira moeda lançada.
   */
  naCurva?: boolean;
}) {
  const t = useTextos(TEXTOS);
  const [aberto, setAberto] = useState(false);

  if (carregando) return <Skeleton className="h-[86px] rounded-2xl" />;
  if (!report) return null;

  /* A auditoria chega em português do servidor; aqui ela vira o idioma da página. */
  report = traduzirRelatorio(report, t);

  const alertas = montarAlertas(report, { liquidityUsd }, t).filter(
    (a) => !naCurva || !["liquidity", "liquidez_rasa", "lp_sem_prova"].includes(a.id),
  );
  const passaram = report.checks.filter((c) => c.level === "safe");
  const naoVerificados = report.checks.filter((c) => c.level === "unknown");

  /* À vista: o que zera o dinheiro, e a liquidez sem prova de trava. */
  const aVista = alertas.filter((a) => a.nivel === "danger" || a.destacar);
  const leves = alertas.filter((a) => a.nivel !== "danger" && !a.destacar);
  const grave = alertas.some((a) => a.nivel === "danger");
  /*
   * Sem nada errado, o bloco fica neutro em vez de verde. Verde comemorando
   * "tudo certo" passa uma garantia que auditoria automática não dá.
   */
  const tom = grave ? "bear" : alertas.length ? "warn" : "neutro";

  return (
    /*
      O PAINEL SÓ SE PINTA QUANDO É GRAVE.
      ---------------------------------------------------------------------
      Antes o fundo e a borda inteiros mudavam de cor em qualquer alerta, e
      como quase toda meme coin tem alguma pendência, a coluna do swap vivia
      com um bloco aceso competindo com o preço e com o botão.

      Agora o vermelho é reservado a perigo crítico — liquidez removível,
      honeypot, mint aberto. O resto fica com a moldura neutra e diz o que
      tem pra dizer no texto, sem acender a tela.
    */
    <div
      className={cn(
        "overflow-hidden rounded-2xl border",
        tom === "bear" ? "border-bear/25 bg-bear/[0.04]" : "border-white/[0.07] bg-white/[0.02]",
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
              "block text-[12.5px] font-semibold",
              tom === "bear" ? "text-bear" : tom === "warn" ? "text-warn/90" : "text-zinc-300",
            )}
          >
            {alertas.length === 0 ? t.nenhumSinal : t.alertas(alertas.length)}
          </span>
          {/*
            "N fora do nosso alcance" saiu.

            Era contagem de uma ausência: dizia que existem verificações que
            não conseguimos fazer, sem dizer quais nem por quê. Quem lia ficava
            com a impressão de risco escondido justamente nas moedas em que
            nada de errado foi encontrado. O que não foi verificado continua
            visível na lista, marcado item a item, que é onde a informação
            significa alguma coisa.
          */}
          {/*
            Os alertas leves são CONTADOS aqui, não listados lá fora. Assim o
            painel continua dizendo que existem, sem ocupar a coluna com eles.
          */}
          <span className="block text-[11px] text-zinc-600">
            {t.passaram(passaram.length)}
            {leves.length > 0 && ` · ${t.atencao(leves.length)}`}
          </span>
        </span>
        <Seta aberto={aberto} />
      </button>

      {/*
        SÓ O QUE ZERA O DINHEIRO FICA VISÍVEL SEM ABRIR.
        -------------------------------------------------------------------
        Antes todo alerta aparecia aqui fora. Como quase toda meme coin tem
        alguma pendência, o painel ficava com três ou quatro linhas acesas em
        qualquer moeda — e aí a pessoa aprende a pular o bloco inteiro,
        inclusive no dia em que ele estiver certo.

        Alerta grave — liquidez removível, honeypot, emissão aberta — continua
        do lado de fora, porque esconder isso atrás de um clique é o mesmo que
        não ter alerta. O resto passou pra lista de dentro, que abre em um
        toque e está resumida no cabeçalho.
      */}
      {aVista.length > 0 && (
        <div className="space-y-2 border-t border-white/[0.07] px-3.5 py-2.5">
          {aVista.map((a) => (
            <div key={a.id}>
              <div
                className={cn(
                  "text-[12px] font-semibold",
                  a.nivel === "danger" ? "text-bear" : "text-warn/85",
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
        O bloco "Token não verificado" ficava aqui e saiu a pedido do dono.

        Ele valia para TODAS as moedas do site — nenhuma passa por revisão
        humana — e repetir em cada página o que vale para todas é ruído: ocupa
        espaço fixo sem separar moeda limpa de moeda suja, que é o trabalho
        deste painel.

        O aviso não sumiu do site: está no rodapé de todas as páginas
        (`rodapeAviso`) e nos Termos de Uso, que dizem que as moedas são
        criadas por usuários e não são auditadas nem endossadas pela Chroma.
        A linha "auditoria automática não é garantia" continua logo abaixo,
        dentro da lista de verificações.
      */}

      {aberto && (
        <div className="space-y-1 border-t border-white/[0.07] bg-ink-950/40 px-3.5 py-2.5">
          {/* Os pontos de atenção, com a explicação de cada um. */}
          {leves.length > 0 && (
            <div className="mb-2 space-y-1.5">
              {leves.map((a) => (
                <div key={a.id}>
                  <div className="text-[11.5px] font-semibold text-warn/85">{a.titulo}</div>
                  <div className="text-[11px] leading-relaxed text-zinc-500">{a.detalhe}</div>
                </div>
              ))}
            </div>
          )}

          {report.checks.map((c) => (
            <Linha key={c.id} check={c} />
          ))}
          <p className="pt-1.5 text-[10px] leading-relaxed text-zinc-600">
            {t.naoEGarantia}
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
  t: (typeof TEXTOS)["en"],
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
   * LIQUIDEZ QUE NÃO DÁ PRA CONFIRMAR, NUMA MOEDA QUE ESTÁ NEGOCIANDO.
   * -------------------------------------------------------------------------
   * A auditoria não consegue provar a trava em dois casos: quando a pool é
   * concentrada — Meteora, Orca, Raydium CLMM, onde a posição é um NFT e não
   * existe token de LP pra queimar — e quando ela simplesmente não conhece o
   * par, que é o normal em moeda recém-lançada.
   *
   * Nos dois o painel ficava MUDO sobre liquidez, e é justamente aí que mora
   * o golpe mais comum: lançar, esperar entrar gente, puxar a liquidez.
   *
   * O alerta só entra quando a moeda TEM mercado de verdade pelos nossos
   * próprios dados. Sem liquidez nenhuma, o assunto é outro e já tem alerta
   * próprio — não dá pra vender de jeito nenhum.
   */
  const travaConfirmada = report.checks.find((c) => c.id === "lp_locked")?.level === "safe";
  const semProva = report.checks.some(
    (c) => c.id === "lp_locked" && (c.level === "unknown" || c.value === "não confirmada"),
  );

  if (!travaConfirmada && semProva && (mercado.liquidityUsd ?? 0) > 0) {
    alertas.push({
      id: "lp_sem_prova",
      /* Curto por pedido do dono (28/09/2026): o fato e a recomendação, sem aula. */
      titulo: t.lpTitulo,
      detalhe: t.lpDetalhe,
      nivel: "warn",
      destacar: true,
    });
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
      titulo: t.rasaTitulo,
      detalhe:
        liquidityUsd > 0
          ? t.rasaDetalhe(formatUsd(liquidityUsd), formatUsd(VENDA_DE_REFERENCIA), Math.min(99, Math.round(impacto * 100)))
          : t.semLiquidez,
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
