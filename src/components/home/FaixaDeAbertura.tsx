import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { TokenOficial } from "@/components/home/TokenOficial";
import { traducoes, type Idioma } from "@/lib/idiomas";

const TEXTOS = traducoes({
  en: {
    titulo: "Launch your coin on Solana.",
    resumo: "Free to launch on pump.fun. You only pay the network cost.",
    botao: "Launch a coin",
    passos: [
      ["Create", "Name, ticker and image."],
      ["Launch", "Live on pump.fun in one transaction."],
      ["Earn", "You get 70% of the creator fee."],
    ],
  },
  pt: {
    titulo: "Lance sua moeda na Solana.",
    resumo: "Lançamento grátis na pump.fun. Você só paga o custo da rede.",
    botao: "Lançar moeda",
    passos: [
      ["Crie", "Nome, símbolo e imagem."],
      ["Lance", "No ar na pump.fun em uma transação."],
      ["Ganhe", "Você recebe 70% da taxa de criador."],
    ],
  },
  zh: {
    titulo: "在 Solana 发行你的代币。",
    resumo: "在 pump.fun 免费发行，只需支付网络费用。",
    botao: "发行代币",
    passos: [
      ["创建", "名称、代号和图片。"],
      ["发行", "一笔交易即可在 pump.fun 上线。"],
      ["赚取", "你获得 70% 的创作者费用。"],
    ],
  },
});

/** A abertura da home: curta, para as moedas aparecerem logo na primeira tela. */
export function FaixaDeAbertura({ idioma }: { idioma: Idioma }) {
  const t = TEXTOS[idioma];

  return (
    <section className="rounded-3xl border border-marca/20 bg-gradient-to-br from-[#0d2138] via-[#0b1626] to-[#0a101c] p-5 sm:p-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
        <div className="min-w-0">
          <h1 className="text-[30px] font-bold leading-tight tracking-tight text-zinc-50 sm:text-[42px]">{t.titulo}</h1>
          <p className="mt-1.5 text-[15px] text-zinc-400">{t.resumo}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link href="/create">
              <Button variant="espectro" className="px-6">
                {t.botao}
              </Button>
            </Link>
            <TokenOficial compacto className="w-fit max-w-full" />
          </div>
        </div>

        {/* No celular os passos saem: as moedas têm que aparecer logo na primeira tela. */}
        <ol className="hidden shrink-0 gap-3 sm:grid sm:grid-cols-3 lg:w-[660px]">
          {t.passos.map(([titulo, texto], i) => (
            <li key={titulo} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3.5">
              <span className="grid size-6 place-items-center rounded-full bg-marca/15 text-[12px] font-bold text-marca">{i + 1}</span>
              <p className="mt-2 text-[14px] font-semibold text-zinc-100">{titulo}</p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-zinc-400">{texto}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
