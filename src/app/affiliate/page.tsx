"use client";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EarningsPanel } from "@/components/profile/EarningsPanel";
import { EditorDeApelido } from "@/components/profile/EditorDeApelido";
import type { AffiliateSummary } from "@/lib/affiliate-types";
import { useChromaAccount } from "@/hooks/useChromaAccount";
import { feeLabel } from "@/lib/fees";
import { CHAINS } from "@/lib/web3";

/**
 * Página do programa de indicação.
 *
 * Explica como funciona e, pra quem está logado, mostra o MESMO painel de
 * ganhos do perfil — o componente é um só.
 *
 * Antes esta página tinha o próprio painel, com os próprios tipos e uma
 * estimativa de ganhos calculada por fora. Resultado: quando o formato da API
 * mudou, ela passou a ler um campo que não existia mais e mostrava zero em
 * silêncio, porque o TypeScript não checa JSON vindo de `fetch`. Duas telas
 * com o mesmo número são duas chances de divergir.
 */
const TEXTOS = traducoes({
  en: {
    titulo: "Referral program", dentro: "inside the same transaction",
    intro: (p: string, b: React.ReactNode) => <>{p} of every swap made by people you bring lands in your wallet {b}. No withdrawal, no approval, no minimum.</>,
    seuLink: "Your referral link", apelidoNota: "Your nickname is your link. Changing it updates the link and your profile name — old links keep working.", ativo: "active", semApelido: "no nickname", copiado: "Copied", copiar: "Copy",
    p1: (p: string) => `${p} of every swap`, p1Texto: "Every buy and every sell from people you bring, forever.",
    p2: "Lands in your wallet by itself", p2Texto: "In the same swap transaction. The money never goes through the platform.",
    p3: "Works on both networks", p3Texto: "Solana and Robinhood Chain, even if the person uses a different wallet on each.",
    compartilhar: "Share",
    abreInicial: (b: React.ReactNode) => <>This link opens the home page. To promote a specific coin, use the {b} button on its page: the link already carries your referral.</>,
    entre: "Sign in to get your link", botaoEntrar: "Sign in", cliqueEm: (b: React.ReactNode) => <>Click {b} at the top of the page.</>,
    comoFunciona: "How it works", refExemplo: "?ref=yournickname",
    s1: "You share the coin", s1Texto: (b: React.ReactNode, c: React.ReactNode) => <>Open the coin and click {b}. You get a link with your nickname. Any Chroma page accepts {c}.</>,
    s2: "The referral is saved on their account", primeira: "The first referral is the one that counts",
    s2Texto: (r: string, b: React.ReactNode) => <>As soon as the person picks a nickname, the referral works on any device — and also on {r}, even if they use another wallet there. {b}: a link that arrives later does not replace yours.</>,
    s3: "You get paid instantly", s3Texto: "Your share is transferred inside the swap transaction itself. The money never goes through the platform, and every payment is recorded on the blockchain.",
    fatia: "Your share comes out of the platform's cut, not the buyer's pocket: the trader pays the same with or without a referral. See", todasTaxas: "all fees",
    duasRedes: (a: string, b: string) => `Works on both networks — ${a} and ${b}.`,
  },
  pt: {
    titulo: "Programa de indicação", dentro: "dentro da própria transação",
    intro: (p: string, b: React.ReactNode) => <>{p} de cada swap feito por quem você trouxe cai na sua carteira {b}. Sem saque, sem aprovação, sem valor mínimo.</>,
    seuLink: "Seu link de indicação", apelidoNota: "O seu apelido é o seu link. Trocar atualiza o link e o nome do perfil — os links antigos continuam valendo.", ativo: "ativo", semApelido: "sem apelido", copiado: "Copiado", copiar: "Copiar",
    p1: (p: string) => `${p} de cada swap`, p1Texto: "Toda compra e toda venda de quem você trouxe, para sempre.",
    p2: "Cai sozinho na carteira", p2Texto: "Na mesma transação do swap. O valor nunca passa pela plataforma.",
    p3: "Vale nas duas redes", p3Texto: "Solana e Robinhood Chain, mesmo que a pessoa use uma carteira em cada.",
    compartilhar: "Compartilhar",
    abreInicial: (b: React.ReactNode) => <>Este link abre a página inicial. Para divulgar uma moeda específica, use o botão {b} na página dela: o link já sai com a sua indicação.</>,
    entre: "Entre para gerar o seu link", botaoEntrar: "Entrar", cliqueEm: (b: React.ReactNode) => <>Clique em {b} no topo da página.</>,
    comoFunciona: "Como funciona", refExemplo: "?ref=seuapelido",
    s1: "Você divulga a moeda", s1Texto: (b: React.ReactNode, c: React.ReactNode) => <>Abra a moeda e clique em {b}. Sai um link com o seu apelido. Qualquer página da Chroma aceita {c}.</>,
    s2: "A indicação fica registrada na conta dela", primeira: "A primeira indicação é a que vale",
    s2Texto: (r: string, b: React.ReactNode) => <>Assim que a pessoa escolhe um apelido, a indicação passa a valer em qualquer aparelho — e também na {r}, mesmo que ela use outra carteira lá. {b}: um link que chegar depois não substitui a sua.</>,
    s3: "Você recebe na hora", s3Texto: "A sua parte é transferida dentro da própria transação de swap. O valor nunca passa pela plataforma, e cada pagamento fica registrado na blockchain.",
    fatia: "A sua fatia sai da parte da plataforma, não do bolso de quem compra: o trader paga o mesmo com ou sem indicação. Ver", todasTaxas: "todas as taxas",
    duasRedes: (a: string, b: string) => `Vale nas duas redes — ${a} e ${b}.`,
  },
  zh: {
    titulo: "推荐计划", dentro: "在同一笔交易中",
    intro: (p: string, b: React.ReactNode) => <>你带来的用户每笔兑换的 {p} 会{b}直接进入你的钱包。无需提现、无需审批、没有最低金额。</>,
    seuLink: "你的推荐链接", apelidoNota: "你的昵称就是你的链接。更改后链接和个人资料名称会同步更新 —— 旧链接仍然有效。", ativo: "已激活", semApelido: "未设置昵称", copiado: "已复制", copiar: "复制",
    p1: (p: string) => `每笔兑换 ${p}`, p1Texto: "你带来的用户的每一笔买入和卖出，永久有效。",
    p2: "自动到账", p2Texto: "在同一笔兑换交易中完成，资金从不经过平台。",
    p3: "两条链都有效", p3Texto: "Solana 和 Robinhood Chain，即使对方在每条链上使用不同的钱包。",
    compartilhar: "分享",
    abreInicial: (b: React.ReactNode) => <>此链接打开首页。要推广某个代币，请在其页面使用 {b} 按钮：链接会自动带上你的推荐。</>,
    entre: "登录以获取你的链接", botaoEntrar: "登录", cliqueEm: (b: React.ReactNode) => <>点击页面顶部的 {b}。</>,
    comoFunciona: "运作方式", refExemplo: "?ref=你的昵称",
    s1: "你分享代币", s1Texto: (b: React.ReactNode, c: React.ReactNode) => <>打开代币并点击 {b}，即可获得带你昵称的链接。Chroma 的任何页面都支持 {c}。</>,
    s2: "推荐记录在对方账户中", primeira: "以第一次推荐为准",
    s2Texto: (r: string, b: React.ReactNode) => <>对方一旦选择昵称，推荐就在任何设备上生效 —— 在 {r} 上也有效，即使对方在那里使用其他钱包。{b}：之后到达的链接不会替换你的推荐。</>,
    s3: "即时到账", s3Texto: "你的分成在兑换交易中直接转账。资金从不经过平台，每笔付款都记录在区块链上。",
    fatia: "你的分成来自平台的份额，而不是买家的口袋：无论是否有推荐，交易者支付的费用相同。查看", todasTaxas: "全部费用",
    duasRedes: (a: string, b: string) => `两条链都有效 —— ${a} 和 ${b}。`,
  },
});

export default function AffiliatePage() {
  const t = useTextos(TEXTOS);
  const account = useChromaAccount();
  const [ganhos, setGanhos] = useState<AffiliateSummary | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [origem, setOrigem] = useState("");

  useEffect(() => setOrigem(window.location.origin), []);

  useEffect(() => {
    if (!account.chaveDeBusca) return;
    /*
     * Manda TODAS as carteiras conectadas, não só a preferida.
     *
     * Com `account.wallet` a busca usava o endereço da Solana (que tem
     * prioridade); se ele não estivesse vinculado à conta, a rota não achava
     * nada e o painel dizia "você não tem carteira nesta rede" para as DUAS.
     */
    fetch(`/api/affiliate?wallet=${account.chaveDeBusca}`)
      .then((r) => r.json())
      .then(setGanhos)
      .catch(() => {});
    // Refaz quando a conta nasce ou ganha carteira: a primeira busca pode
    // ter saído no meio da criação da conta e voltado "sem carteira".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.chaveDeBusca, account.account?.nickname, Object.values(account.carteiras ?? {}).join(",")]);

  const link = account.referralId ? `${origem}/?ref=${account.referralId}` : "";

  async function copiar() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      /* clipboard bloqueado: o link segue visível no campo */
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pt-4">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-zinc-50">{t.titulo}</h1>
        <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-zinc-500">
          {t.intro(feeLabel.affiliate, <strong className="text-zinc-300">{t.dentro}</strong>)}
        </p>
      </div>

      {account.isSignedIn ? (
        <>
          {/*
            O LINK VEM ANTES DOS GANHOS, e a ordem é a mensagem.
            ---------------------------------------------------------------
            Antes o painel de ganhos abria a página. Pra quem ainda não
            indicou ninguém — que é todo mundo no começo — isso significava
            abrir numa tela de zeros, e o link, que é a única coisa acionável
            aqui, ficava embaixo dela.

            Ganhos são consequência; o link é a ação. A ação vem primeiro.
          */}
          <Card>
            <CardHeader>
              <CardTitle>{t.seuLink}</CardTitle>
              <Badge tone={account.account ? "safe" : "warn"}>
                {account.account ? t.ativo : t.semApelido}
              </Badge>
            </CardHeader>
            <CardBody className="space-y-3">
              {/* O apelido É o link: trocar aqui já muda o link abaixo e o nome do perfil. */}
              <EditorDeApelido account={account} />
              <p className="-mt-1 text-[11px] text-zinc-600">{t.apelidoNota}</p>

              <div className="flex gap-2">
                <input
                  readOnly
                  value={link || "—"}
                  onFocus={(e) => e.currentTarget.select()}
                  className="tnum min-w-0 flex-1 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-[12px] text-zinc-300 outline-none"
                />
                <Button variant="chroma" onClick={copiar} disabled={!link}>
                  {copiado ? t.copiado : t.copiar}
                </Button>
              </div>

              {/*
                A promoção explicada AQUI, colada no link.

                Num bloco separado lá embaixo ela não era lida: quem abre esta
                página quer copiar o link e sair. Se o motivo pra divulgar não
                estiver ao lado do botão de copiar, ele não chega em ninguém.
              */}
              <div className="grid gap-2 sm:grid-cols-3">
                <Promessa
                  titulo={t.p1(feeLabel.affiliate)}
                  texto={t.p1Texto}
                />
                <Promessa
                  titulo={t.p2}
                  texto={t.p2Texto}
                />
                <Promessa
                  titulo={t.p3}
                  texto={t.p3Texto}
                />
              </div>

              <p className="text-[11px] leading-relaxed text-zinc-600">
                {t.abreInicial(<strong className="text-zinc-400">{t.compartilhar}</strong>)}
              </p>
            </CardBody>
          </Card>

          <EarningsPanel resumo={ganhos} />
        </>
      ) : (
        <Card>
          <CardBody className="space-y-2 py-8 text-center">
            <p className="text-[14px] font-semibold text-zinc-200">
              {t.entre}
            </p>
            <p className="text-[12px] text-zinc-500">
              {t.cliqueEm(<strong className="text-zinc-300">{t.botaoEntrar}</strong>)}
            </p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t.comoFunciona}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 text-[13px] leading-relaxed text-zinc-400">
          <Passo n={1} titulo={t.s1}>
            {t.s1Texto(<strong className="text-zinc-300">{t.compartilhar}</strong>, <code className="text-marca">{t.refExemplo}</code>)}
          </Passo>
          <Passo n={2} titulo={t.s2}>
            {t.s2Texto(CHAINS.robinhood.label, <strong className="text-zinc-300">{t.primeira}</strong>)}
          </Passo>
          <Passo n={3} titulo={t.s3}>
            {t.s3Texto}
          </Passo>

          <p className="border-t border-white/[0.06] pt-3 text-[12px] text-zinc-600">
            {t.fatia}{" "}
            <Link href="/fees" className="text-marca hover:text-chroma-cyan">
              {t.todasTaxas}
            </Link>
            . {t.duasRedes(CHAINS.solana.label, CHAINS.robinhood.label)}
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function Passo({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-marca/15 text-[11px] font-bold text-marca">
        {n}
      </span>
      <div>
        <div className="text-[13px] font-semibold text-zinc-200">{titulo}</div>
        <div className="text-zinc-500">{children}</div>
      </div>
    </div>
  );
}

/**
 * Um dos três motivos pra divulgar, ao lado do botão de copiar.
 *
 * Cartão curto e sem ícone: a informação é a FRASE. Ícone aqui só somaria
 * ruído visual a um bloco que precisa ser lido em dois segundos, entre copiar
 * o link e sair da página.
 */
function Promessa({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-lg border border-marca/20 bg-marca/[0.05] px-3 py-2.5">
      <div className="text-[12px] font-bold text-marca">{titulo}</div>
      <div className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{texto}</div>
    </div>
  );
}
