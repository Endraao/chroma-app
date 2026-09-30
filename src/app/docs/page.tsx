import type { Metadata } from "next";
import Link from "next/link";

import { idiomaAtual } from "@/lib/idioma-servidor";
import { traducoes } from "@/lib/idiomas";

/**
 * Docs e roadmap: o que a Chroma faz, como usar, contratos e o que vem depois.
 *
 * Link pra mandar em post, diretório de projetos e pedido de parceria — quem
 * avalia um projeto novo procura exatamente esta página (30/09/2026, dia do
 * lançamento do $CHROMA).
 *
 * Roadmap sem data e sem promessa de ganho: "Next" é o que está em obra,
 * "Exploring" é o que ainda pode não sair. Nada de airdrop prometido.
 */

const CONTRATO_LANCAMENTO = "0xC2715457A640E0509Fd38A7ee59b0aB61E15Fc4D";
const TOKEN_CHROMA = "0x475ab8dd5b1a13a5d18b0b70a1599e3501b0941c";
const SOURCIFY = `https://repo.sourcify.dev/4663/${CONTRATO_LANCAMENTO}`;
const EXPLORADOR = "https://robinhoodchain.blockscout.com/address/";

const METADADOS = {
  en: ["Docs & roadmap — Chroma", "How Chroma works, its contracts, fees and what comes next."],
  pt: ["Docs e roadmap — Chroma", "Como a Chroma funciona, contratos, taxas e o que vem depois."],
  zh: ["文档与路线图 — Chroma", "Chroma 的运作方式、合约、费用以及接下来的计划。"],
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const [title, description] = METADADOS[await idiomaAtual()];
  return { title, description };
}

type Secao = { titulo: string; itens: string[] };

const TEXTOS = traducoes({
  en: {
    titulo: "Docs & roadmap",
    intro:
      "Chroma is a launchpad and trading terminal for Solana and Robinhood Chain. Launch a coin in one signature, trade any coin with live charts, and earn from the traders you bring.",
    secoes: [
      {
        titulo: "Launch a coin",
        itens: [
          "Pick a network, then set name, ticker, image and links.",
          "Robinhood Chain: set your creator tax (0–10%). It is fixed at launch.",
          "Add an optional first buy. Creation and your buy happen in the same transaction, so you buy before any sniper.",
          "One signature. Your coin gets its own page and live chart on Chroma. On Robinhood Chain it is also listed on Pons from the first block.",
        ],
      },
      {
        titulo: "Trade",
        itens: [
          "Every coin has live candles, recent trades, holders and contract checks.",
          "Pay in USD or in the native coin. On Robinhood Chain you approve a coin once, then every sell is one click.",
          "The fee of each route is shown before you confirm. Full table on the Fees page.",
        ],
      },
      {
        titulo: "Creators",
        itens: [
          "Robinhood Chain: creators earn 0.70% of every trade of their coin, plus their own creator tax.",
          "Solana: creators keep 100% of the creator fee on every trade.",
        ],
      },
      {
        titulo: "Referrals",
        itens: [
          "Share your referral link. Every trade the people you bring make on Chroma pays you 0.30%, on-chain, in the same transaction.",
          "It comes out of Chroma's cut, never out of the trader's pocket.",
          "A referral is linked when the account is created and cannot be changed later.",
        ],
      },
      {
        titulo: "Rewards",
        itens: ["Using Chroma (launching, trading, referring) earns Rewards points, counted by your address. No sign-up."],
      },
      {
        titulo: "Safety",
        itens: [
          "Chroma never holds your funds: every transaction is signed in your own wallet.",
          "Contract checks are a guide, not a guarantee. Test with a small amount first.",
          "Admins never DM you first. Only trust links on chromalaunch.fun and our pinned posts.",
        ],
      },
    ] as Secao[],
    contratos: "Contracts",
    contratoLancamento: "Launch contract (Robinhood Chain)",
    verificado: "verified source",
    tokenChroma: "$CHROMA token",
    roadmap: "Roadmap",
    agora: "Live",
    proximo: "Next",
    explorando: "Exploring",
    itensAgora: [
      "One-signature launches on Solana and Robinhood Chain",
      "Trading terminal with live charts and contract checks",
      "On-chain referral payouts",
      "Rewards points",
      "$CHROMA, launched on Chroma itself",
    ],
    itensProximo: [
      "Buy alerts for coins launched on Chroma",
      "Daily trending and top coins",
      "Better creator dashboard",
    ],
    itensExplorando: ["Fee sharing with holders on Robinhood Chain", "More pair assets at launch", "More networks"],
    links: "Links",
    taxas: "Fees",
    criar: "Launch a coin",
  },
  pt: {
    titulo: "Docs e roadmap",
    intro:
      "A Chroma é uma launchpad e terminal de negociação para Solana e Robinhood Chain. Lance uma moeda com uma assinatura, negocie qualquer moeda com gráfico ao vivo e ganhe com quem você indicar.",
    secoes: [
      {
        titulo: "Lançar uma moeda",
        itens: [
          "Escolha a rede e preencha nome, símbolo, imagem e links.",
          "Robinhood Chain: defina a taxa do criador (0–10%). Ela fica fixa no lançamento.",
          "Compra inicial opcional. A criação e a sua compra saem na mesma transação: você compra antes de qualquer robô.",
          "Uma assinatura. A moeda ganha página e gráfico ao vivo na Chroma. Na Robinhood Chain ela aparece na Pons desde o primeiro bloco.",
        ],
      },
      {
        titulo: "Negociar",
        itens: [
          "Toda moeda tem velas ao vivo, negociações recentes, holders e checagem do contrato.",
          "Pague em USD ou na moeda nativa. Na Robinhood Chain você aprova a moeda uma vez e depois cada venda é um clique.",
          "A taxa de cada rota aparece antes de confirmar. Tabela completa na página de Taxas.",
        ],
      },
      {
        titulo: "Criadores",
        itens: [
          "Robinhood Chain: o criador ganha 0,70% de cada negociação da moeda, mais a própria taxa do criador.",
          "Solana: o criador fica com 100% da taxa do criador em cada negociação.",
        ],
      },
      {
        titulo: "Indicação",
        itens: [
          "Compartilhe seu link. Cada negociação de quem você trouxe te paga 0,30%, on-chain, na mesma transação.",
          "Sai da parte da Chroma, nunca do bolso de quem negocia.",
          "A indicação fica vinculada na criação da conta e não pode ser trocada depois.",
        ],
      },
      {
        titulo: "Recompensas",
        itens: ["Usar a Chroma (lançar, negociar, indicar) rende pontos de Recompensas, contados pelo seu endereço. Sem cadastro."],
      },
      {
        titulo: "Segurança",
        itens: [
          "A Chroma nunca guarda seu dinheiro: toda transação é assinada na sua carteira.",
          "A checagem de contrato é um guia, não uma garantia. Teste com pouco antes.",
          "Admins nunca chamam no privado primeiro. Confie só em links de chromalaunch.fun e nos posts fixados.",
        ],
      },
    ] as Secao[],
    contratos: "Contratos",
    contratoLancamento: "Contrato de lançamento (Robinhood Chain)",
    verificado: "código verificado",
    tokenChroma: "Token $CHROMA",
    roadmap: "Roadmap",
    agora: "No ar",
    proximo: "Próximo",
    explorando: "Estudando",
    itensAgora: [
      "Lançamento com uma assinatura na Solana e na Robinhood Chain",
      "Terminal de negociação com gráfico ao vivo e checagem de contrato",
      "Pagamento de indicação on-chain",
      "Pontos de Recompensas",
      "$CHROMA, lançado pela própria Chroma",
    ],
    itensProximo: [
      "Alertas de compra para moedas lançadas na Chroma",
      "Moedas em alta e top do dia",
      "Painel do criador melhor",
    ],
    itensExplorando: ["Divisão de taxas com holders na Robinhood Chain", "Mais pares no lançamento", "Mais redes"],
    links: "Links",
    taxas: "Taxas",
    criar: "Lançar moeda",
  },
  zh: {
    titulo: "文档与路线图",
    intro:
      "Chroma 是 Solana 和 Robinhood Chain 上的发射平台和交易终端。一次签名发币，用实时图表交易任何代币，并从你邀请的交易者那里赚取收益。",
    secoes: [
      {
        titulo: "发币",
        itens: [
          "选择网络，填写名称、代号、图片和链接。",
          "Robinhood Chain：设置创作者税（0–10%），发币后固定。",
          "可选首次买入。创建和你的买入在同一笔交易中完成，你会比任何狙击机器人先买入。",
          "一次签名。代币在 Chroma 上拥有自己的页面和实时图表。在 Robinhood Chain 上，它从第一个区块起就会出现在 Pons。",
        ],
      },
      {
        titulo: "交易",
        itens: [
          "每个代币都有实时 K 线、最近交易、持有人和合约检查。",
          "可用美元或原生币支付。在 Robinhood Chain 上每个代币只需授权一次，之后每次卖出一键完成。",
          "确认前会显示每条路线的费用。完整费用表见费用页面。",
        ],
      },
      {
        titulo: "创作者",
        itens: [
          "Robinhood Chain：创作者获得其代币每笔交易的 0.70%，外加自己设置的创作者税。",
          "Solana：创作者保留每笔交易 100% 的创作者费用。",
        ],
      },
      {
        titulo: "邀请",
        itens: [
          "分享你的邀请链接。你邀请的人在 Chroma 上的每笔交易都会在同一笔链上交易中付给你 0.30%。",
          "这部分来自 Chroma 的收入，而不是交易者的口袋。",
          "邀请关系在创建账户时绑定，之后无法更改。",
        ],
      },
      {
        titulo: "奖励",
        itens: ["使用 Chroma（发币、交易、邀请）可获得奖励积分，按地址统计，无需注册。"],
      },
      {
        titulo: "安全",
        itens: [
          "Chroma 从不托管你的资金：每笔交易都在你自己的钱包中签名。",
          "合约检查只是参考，不是保证。请先用小额测试。",
          "管理员从不主动私信你。只信任 chromalaunch.fun 和我们置顶帖子中的链接。",
        ],
      },
    ] as Secao[],
    contratos: "合约",
    contratoLancamento: "发币合约（Robinhood Chain）",
    verificado: "已验证源码",
    tokenChroma: "$CHROMA 代币",
    roadmap: "路线图",
    agora: "已上线",
    proximo: "下一步",
    explorando: "探索中",
    itensAgora: [
      "Solana 和 Robinhood Chain 一次签名发币",
      "带实时图表和合约检查的交易终端",
      "链上邀请分成",
      "奖励积分",
      "$CHROMA，通过 Chroma 自身发行",
    ],
    itensProximo: ["Chroma 发行代币的买入提醒", "每日热门与榜单", "更好的创作者面板"],
    itensExplorando: ["Robinhood Chain 上与持有人分享手续费", "发币时支持更多交易对", "更多网络"],
    links: "链接",
    taxas: "费用",
    criar: "发币",
  },
});

export default async function DocsPage() {
  const t = TEXTOS[await idiomaAtual()];
  return (
    <div className="mx-auto max-w-3xl space-y-10 pt-6">
      <header>
        <h1 className="text-3xl font-black tracking-tight text-zinc-50">{t.titulo}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-zinc-400">{t.intro}</p>
      </header>

      {t.secoes.map((s) => (
        <section key={s.titulo}>
          <h2 className="text-xl font-bold tracking-tight text-zinc-50">{s.titulo}</h2>
          <ul className="mt-3 space-y-2">
            {s.itens.map((i) => (
              <li key={i} className="flex gap-2.5 text-[14px] leading-relaxed text-zinc-400">
                <span aria-hidden className="mt-[9px] size-1 shrink-0 rounded-full bg-marca" />
                {i}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section>
        <h2 className="text-xl font-bold tracking-tight text-zinc-50">{t.roadmap}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Coluna titulo={t.agora} itens={t.itensAgora} cor="text-bull" />
          <Coluna titulo={t.proximo} itens={t.itensProximo} cor="text-marca" />
          <Coluna titulo={t.explorando} itens={t.itensExplorando} cor="text-zinc-400" />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold tracking-tight text-zinc-50">{t.contratos}</h2>
        <div className="mt-4 space-y-3">
          <Endereco
            rotulo={t.contratoLancamento}
            endereco={CONTRATO_LANCAMENTO}
            extra={{ href: SOURCIFY, texto: t.verificado }}
          />
          <Endereco rotulo={t.tokenChroma} endereco={TOKEN_CHROMA} />
        </div>
      </section>

      <section className="pb-4">
        <h2 className="text-xl font-bold tracking-tight text-zinc-50">{t.links}</h2>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[14px]">
          <Link href="/create" className="text-marca hover:underline">{t.criar}</Link>
          <Link href="/fees" className="text-marca hover:underline">{t.taxas}</Link>
          <a href="https://x.com/ChromaLaunch" target="_blank" rel="noopener noreferrer" className="text-marca hover:underline">X @ChromaLaunch</a>
          <a href="https://t.me/ChromaLaunch" target="_blank" rel="noopener noreferrer" className="text-marca hover:underline">Telegram</a>
        </div>
      </section>
    </div>
  );
}

function Coluna({ titulo, itens, cor }: { titulo: string; itens: string[]; cor: string }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900 p-4">
      <p className={`text-[11px] font-bold uppercase tracking-[0.14em] ${cor}`}>{titulo}</p>
      <ul className="mt-3 space-y-2">
        {itens.map((i) => (
          <li key={i} className="text-[13px] leading-snug text-zinc-300">{i}</li>
        ))}
      </ul>
    </div>
  );
}

function Endereco({
  rotulo,
  endereco,
  extra,
}: {
  rotulo: string;
  endereco: string;
  extra?: { href: string; texto: string };
}) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900 p-4">
      <p className="text-[12px] text-zinc-500">{rotulo}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <a
          href={EXPLORADOR + endereco}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all font-mono text-[13px] text-zinc-200 hover:text-marca"
        >
          {endereco}
        </a>
        {extra && (
          <a href={extra.href} target="_blank" rel="noopener noreferrer" className="text-[12px] text-bull hover:underline">
            ✓ {extra.texto}
          </a>
        )}
      </div>
    </div>
  );
}
