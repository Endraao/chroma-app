import type { Metadata } from "next";
import Link from "next/link";

import { PainelDeAirdrop } from "@/components/airdrop/PainelDeAirdrop";
import { TEMPORADA_ATUAL } from "@/lib/airdrop-regras";
import { idiomaAtual } from "@/lib/idioma-servidor";
import { traducoes } from "@/lib/idiomas";

const METADADOS = {
  "en": [
    "Airdrop — Chroma",
    "The more you use Chroma, the more points you earn. The rules are secret. No sign-up, counted by your address."
  ],
  "pt": [
    "Airdrop — Chroma",
    "Quanto mais você usa a Chroma, mais pontos acumula. As regras são segredo. Sem inscrição, contado pelo seu endereço."
  ],
  "zh": [
    "空投 — Chroma",
    "你在 Chroma 上用得越多，获得的积分就越多。规则保密。无需注册，按地址统计。"
  ]
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const [title, description] = METADADOS[await idiomaAtual()];
  return { title, description };
}

const TEXTOS = traducoes({
  en: {
    temporada: (n: number) => `Season ${n} in progress`, use: "Use Chroma.", acumule: "Earn points.",
    intro: "Everything you do on Chroma can be worth points, tied to your address. What and how much, we don't tell.",
    oQueE: "What this is, and what it isn't",
    reais: "Points are real and verifiable.", reaisTexto: "Each one comes from a fact checked on the blockchain and is recorded with the transaction that created it.",
    nenhum: "No token has been created or promised.", nenhumTexto: "There is no date, no set amount, and nothing here is an offer, a guarantee of reward or a promise of future value.",
    regras: "Rules may change.", regrasTexto: "If abuse shows up — wash volume between wallets of the same person, coins created in bulk with no real use — the points involved may be reviewed or removed.",
    naoGaste: "Don't spend what you can't afford to lose.", naoGasteTexto: "Trading coins costs network fees and carries the risk of total loss. Earning points does not make up for losses. Read the",
    termos: "Terms of Use", encontrou: "Found a bug or a security issue?", avise: "Let our team know",
  },
  pt: {
    temporada: (n: number) => `Temporada ${n} em andamento`, use: "Use a Chroma.", acumule: "Acumule pontos.",
    intro: "Tudo o que você faz na Chroma pode valer pontos, ligados ao seu endereço. O quê e quanto, a gente não conta.",
    oQueE: "O que isto é, e o que não é",
    reais: "Os pontos são reais e verificáveis.", reaisTexto: "Cada um nasce de um fato conferido na blockchain e fica registrado com a transação que o gerou.",
    nenhum: "Nenhum token foi criado ou prometido.", nenhumTexto: "Não existe data, não existe quantidade definida, e nada aqui é oferta, garantia de recompensa ou promessa de valor futuro.",
    regras: "As regras podem mudar.", regrasTexto: "Se aparecer abuso — volume lavado entre carteiras da mesma pessoa, moeda criada em série sem uso real — os pontos envolvidos podem ser revistos ou removidos.",
    naoGaste: "Não gaste o que você não pode perder.", naoGasteTexto: "Negociar moedas custa taxa de rede e envolve risco de perda total. Acumular pontos não compensa prejuízo. Leia os",
    termos: "Termos de Uso", encontrou: "Encontrou um erro ou uma falha de segurança?", avise: "Avise a nossa equipe",
  },
  zh: {
    temporada: (n: number) => `第 ${n} 赛季进行中`, use: "使用 Chroma。", acumule: "赚取积分。",
    intro: "你在 Chroma 上做的每件事都可能获得积分，并与你的地址绑定。具体是什么、多少，我们不公开。",
    oQueE: "这是什么，不是什么",
    reais: "积分真实且可验证。", reaisTexto: "每一分都来自区块链上核实的事实，并与产生它的交易一起记录。",
    nenhum: "没有创建或承诺任何代币。", nenhumTexto: "没有日期，没有确定数量，这里的任何内容都不是要约、奖励保证或未来价值的承诺。",
    regras: "规则可能变更。", regrasTexto: "如果出现滥用 —— 同一人多个钱包之间刷量、批量创建无实际用途的代币 —— 相关积分可能被复核或移除。",
    naoGaste: "不要投入你亏不起的钱。", naoGasteTexto: "交易代币需支付网络费用，并有全部亏损的风险。积分无法弥补亏损。请阅读",
    termos: "使用条款", encontrou: "发现错误或安全问题？", avise: "告诉我们的团队",
  },
});

/**
 * A página do airdrop.
 *
 * ---------------------------------------------------------------------------
 * O EQUILÍBRIO QUE ESTA PÁGINA PRECISA SEGURAR
 * ---------------------------------------------------------------------------
 * Ela tem que dar vontade de participar — é o ponto dela. E tem que fazer isso
 * sem prometer token, sem prometer valor e sem prometer data, porque nenhuma
 * das três coisas está decidida.
 *
 * Promessa vaga sobre token futuro é o que transforma uma campanha de adoção
 * em problema jurídico. A saída é a que está escrita abaixo: o que a pessoa
 * ganha AGORA é concreto e verificável — pontos contados na blockchain e
 * posição no placar. Quanto vale cada ação é segredo (ver PainelDeAirdrop). O que vem depois é possibilidade declarada como
 * possibilidade.
 *
 * Isso também protege o projeto de si mesmo: sem data anunciada, a temporada
 * pode durar meses e continuar atraindo gente — que é exatamente a intenção.
 */
export default async function AirdropPage() {
  const t = TEXTOS[await idiomaAtual()];
  return (
    <div className="mx-auto w-full max-w-[900px] pb-24">
      {/* ---------------- Abertura ---------------- */}
      <header className="pt-6 text-center sm:pt-10">
        <span className="inline-flex items-center gap-2 rounded-full border border-marca/25 bg-marca/[0.07] px-3 py-1 text-[11px] font-bold uppercase tracking-rotulo text-marca">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-marca opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-marca" />
          </span>
          {t.temporada(TEMPORADA_ATUAL)}
        </span>

        <h1 className="mt-5 text-4xl font-black leading-[1.08] tracking-tight text-zinc-50 sm:text-5xl">
          {t.use}
          <br />
          <span className="text-chroma">{t.acumule}</span>
        </h1>

        <p className="mx-auto mt-4 max-w-[520px] text-[14px] leading-relaxed text-zinc-400">
          {t.intro}
        </p>

        <div className="aresta mx-auto mt-9 max-w-[420px]" />
      </header>

      {/* ---------------- O painel vivo ---------------- */}
      <div className="mt-9">
        <PainelDeAirdrop />
      </div>

      {/* ---------------- A parte honesta ---------------- */}
      <section className="mt-12 rounded-xl border border-ink-700 bg-ink-900 p-5">
        <h2 className="text-[13px] font-bold text-zinc-200">{t.oQueE}</h2>

        <ul className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-zinc-500">
          <li>
            <span className="text-zinc-300">{t.reais}</span> {t.reaisTexto}
          </li>
          <li>
            <span className="text-zinc-300">{t.nenhum}</span> {t.nenhumTexto}
          </li>
          <li>
            <span className="text-zinc-300">{t.regras}</span> {t.regrasTexto}
          </li>
          <li>
            <span className="text-zinc-300">{t.naoGaste}</span> {t.naoGasteTexto}{" "}
            <Link href="/termos" className="text-marca underline underline-offset-2">
              {t.termos}
            </Link>
            .
          </li>
        </ul>
      </section>

      {/* ---------------- Chamada final ---------------- */}
      <section className="mt-10 text-center">
        <p className="text-[13px] text-zinc-500">
          {t.encontrou}{" "}
          <Link href="/contato" className="font-semibold text-marca underline underline-offset-2">
            {t.avise}
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
