import type { Metadata } from "next";
import Link from "next/link";

import { METAS, PARTE_DA_CHROMA } from "@/lib/bonus-criador";
import { idiomaAtual } from "@/lib/idioma-servidor";
import { traducoes } from "@/lib/idiomas";

/**
 * /creator-bonus — as regras do bônus do criador na Curva da Chroma (ver
 * lib/bonus-criador.ts). Tudo que a página promete tem de bater com as METAS.
 */
const TEXTOS = traducoes({
  en: {
    meta: ["Creator bonus — Chroma", "Launch on Chroma Launchpad and earn a cash bonus when your coin hits volume goals."],
    titulo: "Creator bonus",
    intro:
      "Launch your coin on Chroma Launchpad and get paid twice: 40% of the fee on every trade, plus a cash bonus for every volume goal your coin hits. The more your community trades, the more you earn.",
    ganhosTitulo: "What you earn per coin",
    paraVoce: "to you",
    volume: "volume",
    colVolume: "Your coin's volume",
    colTaxas: "Trading fees (40%)",
    colBonus: "Cash bonus",
    colTotal: "Total to you",
    nota: "Trading fees are claimed instantly with the Claim button on your coin's page. The bonus is requested with the same button and paid in SOL within 7 days. Everything goes straight to the wallet that created the coin.",
    destaque: "No other launchpad pays you trading fees and a cash bonus for volume.",
    regras: "Rules",
    itens: [
      "Valid only for coins launched on Chroma Launchpad, on the Solana network.",
      "Every trade counts, wherever it happens: Chroma, Jupiter, Phantom, Fomo or any other app. The fee is charged by the coin itself, not by the app.",
      "Track your progress live on your coin's page — everything is measured on-chain.",
    ],
    maisTitulo: "More ways to earn",
    indicacaoTitulo: "Referral link: 0.30% of every trade",
    indicacaoTexto: "Share your link with your community. Every trade made on Chroma through it pays you 0.30%, on-chain, in the same transaction.",
    indicacaoLink: "Get your referral link →",
    pontosTitulo: "Chroma Rewards points",
    pontosTexto: "Launching coins, trading and referring friends also earns you Chroma Rewards points.",
    pontosLink: "See Rewards →",
    cta: "Launch on Chroma",
  },
  pt: {
    meta: ["Bônus do criador — Chroma", "Lance na Chroma Launchpad e ganhe um bônus em dinheiro quando sua moeda bater metas de volume."],
    titulo: "Bônus do criador",
    intro:
      "Lance sua moeda na Chroma Launchpad e ganhe duas vezes: 40% da taxa de cada negociação e um bônus em dinheiro a cada meta de volume que sua moeda bater. Quanto mais sua comunidade negocia, mais você ganha.",
    ganhosTitulo: "Quanto você ganha por moeda",
    paraVoce: "pra você",
    volume: "de volume",
    colVolume: "Volume da sua moeda",
    colTaxas: "Taxas de negociação (40%)",
    colBonus: "Bônus em dinheiro",
    colTotal: "Total pra você",
    nota: "As taxas você saca na hora, pelo botão Sacar na página da sua moeda. O bônus é pedido no mesmo botão e pago em SOL em até 7 dias. Tudo vai direto pra carteira que criou a moeda.",
    destaque: "Nenhuma outra launchpad paga taxa de negociação e bônus em dinheiro por volume.",
    regras: "Regras",
    itens: [
      "Vale para moedas lançadas dentro da Chroma Launchpad, apenas na rede Solana.",
      "Toda negociação conta, não importa onde aconteça: Chroma, Jupiter, Phantom, Fomo ou qualquer outro app. A taxa é cobrada pela própria moeda, não pelo app.",
      "Acompanhe seu progresso ao vivo na página da sua moeda — tudo é medido direto na rede.",
    ],
    maisTitulo: "Mais formas de ganhar",
    indicacaoTitulo: "Link de indicação: 0,30% de cada negociação",
    indicacaoTexto: "Compartilhe seu link com a sua comunidade. Cada negociação feita na Chroma pelo seu link te paga 0,30%, na rede, na mesma transação.",
    indicacaoLink: "Pegar meu link de indicação →",
    pontosTitulo: "Pontos de Recompensas da Chroma",
    pontosTexto: "Lançar moedas, negociar e indicar amigos também rende pontos de Recompensas da Chroma.",
    pontosLink: "Ver Recompensas →",
    cta: "Lançar na Chroma",
  },
  zh: {
    meta: ["创作者奖金 — Chroma", "在 Chroma Launchpad 发币，代币达到交易量目标即可获得现金奖金。"],
    titulo: "创作者奖金",
    intro:
      "在 Chroma Launchpad 发币，双重收益：每笔交易 40% 的手续费，外加代币每达成一个交易量目标的现金奖金。你的社区交易越多，你赚得越多。",
    ganhosTitulo: "每个代币你能赚多少",
    paraVoce: "归你",
    volume: "交易量",
    colVolume: "你的代币交易量",
    colTaxas: "交易手续费（40%）",
    colBonus: "现金奖金",
    colTotal: "你的总收益",
    nota: "交易手续费可随时通过代币页面的「领取」按钮即时领取。奖金通过同一按钮申请，7 天内以 SOL 支付。全部直接进入创建代币的钱包。",
    destaque: "没有其他发射平台同时为交易量支付交易手续费和现金奖金。",
    regras: "规则",
    itens: [
      "仅适用于在 Chroma Launchpad 上发行的代币，且仅限 Solana 网络。",
      "每笔交易都计入，无论在哪里发生：Chroma、Jupiter、Phantom、Fomo 或任何其他应用。手续费由代币本身收取，而不是由应用收取。",
      "在你的代币页面实时查看进度——一切都在链上计算。",
    ],
    maisTitulo: "更多赚钱方式",
    indicacaoTitulo: "推荐链接：每笔交易 0.30%",
    indicacaoTexto: "把你的链接分享给社区。每一笔通过你的链接在 Chroma 完成的交易都会在同一笔交易中、在链上支付你 0.30%。",
    indicacaoLink: "获取我的推荐链接 →",
    pontosTitulo: "Chroma 奖励积分",
    pontosTexto: "发币、交易和邀请好友还能获得 Chroma 奖励积分。",
    pontosLink: "查看奖励 →",
    cta: "在 Chroma 发币",
  },
});

/** Perguntas frequentes — cada resposta tem de bater com o que o sistema faz. */
const PERGUNTAS = traducoes({
  en: {
    titulo: "Questions",
    itens: [
      ["Do I need to sign up or pay to join?", "No. Every coin launched on Chroma Launchpad on Solana joins automatically. The only cost is the 0.02 SOL launch fee."],
      ["Where do I see how much I've earned?", "On your coin's page, connected with the wallet that created it. The \"Your creator earnings\" card shows your fees to claim, your bonus and the progress to the next goal."],
      ["When can I claim my trading fees?", "Anytime, as many times as you want. You only pay the Solana network fee."],
      ["How do I receive the bonus?", "When your coin hits a goal, click Claim. Your trading fees arrive instantly, and the bonus request is sent at the same moment. Chroma reviews the volume to make sure it's real trading, then pays the bonus in SOL to the creator's wallet within 7 days."],
      ["Do the bonuses add up?", "The table already shows the total. Reaching $100K gives you $200 in bonus in total: the $50 from the first goal plus $150 more."],
      ["What happens after my coin graduates from the curve?", "Nothing changes for you. Trades on the new Meteora pool keep counting toward the goals, you keep earning 40% of the fees, and the same Claim button withdraws everything."],
      ["Can my earnings go to another wallet?", "No. Fees and bonus always go to the wallet that created the coin, so keep that wallet safe."],
      ["Does it work for coins on Robinhood Chain?", "Not yet. The creator bonus is only for coins launched on Solana."],
      ["In which currency is the bonus paid?", "In SOL, converted at the SOL price on the day of the payment."],
    ] as [string, string][],
  },
  pt: {
    titulo: "Perguntas frequentes",
    itens: [
      ["Preciso me inscrever ou pagar pra participar?", "Não. Toda moeda lançada na Chroma Launchpad, na rede Solana, já participa automaticamente. O único custo é a taxa de lançamento de 0,02 SOL."],
      ["Onde vejo quanto já ganhei?", "Na página da sua moeda, conectado com a carteira que criou o token. O card \"Seus ganhos de criador\" mostra as taxas pra sacar, o bônus e o progresso até a próxima meta."],
      ["Quando posso sacar as taxas?", "A qualquer momento, quantas vezes quiser. Você paga só a taxa de rede da Solana."],
      ["Como recebo o bônus?", "Quando sua moeda bate uma meta, clique em Sacar. As taxas de negociação caem na hora, e o pedido do bônus é feito no mesmo clique. A Chroma confere se o volume é de negociação real e paga o bônus em SOL na carteira do criador em até 7 dias."],
      ["Os bônus se somam?", "A tabela já mostra o total. Ao bater $100 mil você recebe $200 de bônus no total: os $50 da primeira meta mais $150."],
      ["E depois que a moeda se forma e sai da curva?", "Nada muda pra você. As negociações na nova pool da Meteora continuam contando para as metas, você continua ganhando 40% das taxas, e o mesmo botão Sacar saca tudo."],
      ["Posso receber em outra carteira?", "Não. Taxas e bônus vão sempre para a carteira que criou a moeda — guarde bem essa carteira."],
      ["Vale para moedas na Robinhood Chain?", "Por enquanto não. O bônus do criador é só para moedas lançadas na rede Solana."],
      ["Em qual moeda o bônus é pago?", "Em SOL, convertido pelo preço do SOL no dia do pagamento."],
    ] as [string, string][],
  },
  zh: {
    titulo: "常见问题",
    itens: [
      ["需要报名或付费才能参加吗？", "不需要。在 Chroma Launchpad（Solana 网络）上发行的每个代币都会自动参加。唯一的费用是 0.02 SOL 的发币费。"],
      ["在哪里查看我赚了多少？", "在你的代币页面，用创建代币的钱包连接后，「你的创作者收益」卡片会显示可领取的手续费、奖金以及距离下一个目标的进度。"],
      ["什么时候可以领取手续费？", "随时都可以，次数不限。你只需支付 Solana 网络费。"],
      ["如何领取奖金？", "代币达成目标后，点击「领取」。交易手续费即时到账，奖金申请也同时提交。Chroma 会核实交易量是否为真实交易，然后在 7 天内以 SOL 将奖金支付到创作者钱包。"],
      ["奖金会累加吗？", "表格显示的就是累计总额。达到 10 万美元时，你的奖金共 200 美元：第一个目标的 50 美元再加 150 美元。"],
      ["代币从曲线毕业后会怎样？", "对你来说没有变化。Meteora 新池中的交易继续计入目标，你继续获得 40% 的手续费，同一个「领取」按钮可以领取全部。"],
      ["收益可以转到其他钱包吗？", "不可以。手续费和奖金始终发送到创建代币的钱包，请妥善保管该钱包。"],
      ["Robinhood Chain 上的代币也适用吗？", "暂时不适用。创作者奖金仅适用于在 Solana 网络上发行的代币。"],
      ["奖金以什么币种支付？", "以 SOL 支付，按支付当天的 SOL 价格换算。"],
    ] as [string, string][],
  },
});

export async function generateMetadata(): Promise<Metadata> {
  const [title, description] = TEXTOS[await idiomaAtual()].meta;
  return { title, description };
}

const SELO = { en: "Creator promo", pt: "Promoção do criador", zh: "创作者活动" } as const;
const BOTAO = "inline-flex items-center gap-1.5 rounded-xl bg-bull/90 px-5 py-2.5 text-[14px] font-black text-[#03130d] transition-colors hover:bg-bull";

const taxa = (volume: number) => volume * PARTE_DA_CHROMA;

/**
 * Mesmo visual do banner da home (BannerPromocao): borda em degradê girando,
 * vidro escuro com luz verde e valores em verde — pedido do dono (04/10/2026):
 * "parece 2 páginas diferentes mostrando a mesma promoção".
 */
export default async function CreatorBonus() {
  const idioma = await idiomaAtual();
  const t = TEXTOS[idioma];
  const f = PERGUNTAS[idioma];
  const usd = (n: number) => `$${n.toLocaleString(idioma === "pt" ? "pt-BR" : "en-US")}`;
  const curto = (n: number) => `$${n / 1000}K`;
  return (
    <div className="mx-auto max-w-3xl space-y-8 pt-6">
      <section className="promo-card promo-banner">
        <div className="promo-card-dentro flex items-stretch">
          <span aria-hidden className="promo-barra" />
          <div className="min-w-0 flex-1 p-6 sm:p-8">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-bull/15 px-2.5 py-0.5 text-[10.5px] font-black uppercase tracking-[0.16em] text-bull">
              <span className="size-1.5 animate-pulse rounded-full bg-bull" />
              {SELO[idioma]}
            </span>
            <h1 className="mt-3 text-[34px] font-black leading-[1.05] tracking-tight text-zinc-50 sm:text-[42px]">{t.titulo}</h1>
            <p className="mt-3 max-w-[560px] text-[15px] leading-relaxed text-zinc-300">{t.intro}</p>
            <Link href="/create" className={`${BOTAO} mt-5`}>
              {t.cta} <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Os números grandes: taxa (40%) + bônus, por meta. A maior com a borda da promoção. */}
      <section>
        <h2 className="text-xl font-bold tracking-tight text-zinc-50">{t.ganhosTitulo}</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {METAS.map((m, i) => {
            const dentro = (
              <div className="flex h-full flex-col items-center px-3 py-4 text-center">
                <p className="whitespace-nowrap text-[12px] font-semibold text-zinc-400">
                  {curto(m.volumeUsd)} {t.volume}
                </p>
                <p className="promo-valor tnum mt-2 text-[30px] font-black leading-none">{usd(taxa(m.volumeUsd) + m.bonusUsd)}</p>
                <p className="mt-2 text-[12.5px] font-bold text-zinc-200">{t.paraVoce}</p>
              </div>
            );
            return i === METAS.length - 1 ? (
              <div key={m.volumeUsd} className="promo-card promo-banner">
                <div className="promo-card-dentro h-full">{dentro}</div>
              </div>
            ) : (
              <div key={m.volumeUsd} className="rounded-2xl border border-bull/30 bg-bull/[0.05]">
                {dentro}
              </div>
            );
          })}
        </div>
      </section>

      {/* Quebra de cada meta: taxa + bônus = total. */}
      <div className="overflow-hidden rounded-2xl border border-bull/30 bg-bull/[0.03]">
        <div className="grid grid-cols-4 gap-2 bg-bull/[0.08] px-4 py-2.5 text-[10.5px] font-bold uppercase tracking-wider text-bull sm:px-5">
          <span>{t.colVolume}</span>
          <span className="text-right">{t.colTaxas}</span>
          <span className="text-right">{t.colBonus}</span>
          <span className="text-right">{t.colTotal}</span>
        </div>
        {METAS.map((m) => (
          <div key={m.volumeUsd} className="tnum grid grid-cols-4 gap-2 border-t border-white/[0.06] px-4 py-3 text-[14px] sm:px-5 sm:text-[15px]">
            <span className="text-zinc-300">{usd(m.volumeUsd)}</span>
            <span className="text-right text-zinc-200">{usd(taxa(m.volumeUsd))}</span>
            <span className="text-right text-zinc-200">+ {usd(m.bonusUsd)}</span>
            <span className="promo-valor text-right font-black">{usd(taxa(m.volumeUsd) + m.bonusUsd)}</span>
          </div>
        ))}
        <p className="border-t border-white/[0.06] px-4 py-2.5 text-[12.5px] text-zinc-400 sm:px-5">{t.nota}</p>
      </div>

      <p className="rounded-2xl border border-bull/30 bg-bull/[0.06] px-4 py-3 text-center text-[14px] font-bold text-zinc-50">
        🏆 {t.destaque}
      </p>

      {/* Indicação (0,30%) e pontos de Recompensas: somam com o bônus. */}
      <section>
        <h2 className="text-xl font-bold tracking-tight text-zinc-50">{t.maisTitulo}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link href="/affiliate" className="group rounded-2xl border border-bull/30 bg-bull/[0.05] p-5 transition-colors hover:bg-bull/[0.09]">
            <p className="text-[15px] font-bold text-zinc-50">🔗 {t.indicacaoTitulo}</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-zinc-400">{t.indicacaoTexto}</p>
            <p className="mt-3 text-[13px] font-bold text-bull">{t.indicacaoLink}</p>
          </Link>
          <Link href="/airdrop" className="group rounded-2xl border border-bull/30 bg-bull/[0.05] p-5 transition-colors hover:bg-bull/[0.09]">
            <p className="text-[15px] font-bold text-zinc-50">⭐ {t.pontosTitulo}</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-zinc-400">{t.pontosTexto}</p>
            <p className="mt-3 text-[13px] font-bold text-bull">{t.pontosLink}</p>
          </Link>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold tracking-tight text-zinc-50">{t.regras}</h2>
        <ul className="mt-3 space-y-2">
          {t.itens.map((i) => (
            <li key={i} className="flex gap-2.5 text-[14px] leading-relaxed text-zinc-400">
              <span aria-hidden className="mt-[9px] size-1.5 shrink-0 rounded-full bg-bull" />
              {i}
            </li>
          ))}
        </ul>
      </section>

      {/* Perguntas frequentes: abre e fecha sem JavaScript (<details>). */}
      <section>
        <h2 className="text-xl font-bold tracking-tight text-zinc-50">{f.titulo}</h2>
        <div className="mt-3 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-bull/20 bg-ink-900">
          {f.itens.map(([pergunta, resposta]) => (
            <details key={pergunta} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5 text-[14.5px] font-semibold text-zinc-100 hover:bg-bull/[0.04] [&::-webkit-details-marker]:hidden">
                {pergunta}
                <span aria-hidden className="shrink-0 text-[20px] leading-none text-bull transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="px-4 pb-4 text-[13.5px] leading-relaxed text-zinc-400">{resposta}</p>
            </details>
          ))}
        </div>
      </section>

      <Link href="/create" className={BOTAO}>
        {t.cta} <span aria-hidden>→</span>
      </Link>
    </div>
  );
}
