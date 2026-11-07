import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { TokenOficial } from "@/components/home/TokenOficial";
import { traducoes, type Idioma } from "@/lib/idiomas";

const TEXTOS = traducoes({
  en: {
    titulo: "Launch your coin on Solana.",
    resumo: "Free to launch, with anti-sniper protection built in.",
    botao: "Launch a coin",
    passos: [
      ["Create", "Name, ticker and image."],
      ["Protect", "Pick a 25% or 50% anti-sniper fee."],
      ["Share", "The fee drops to 1% in 2 minutes."],
    ],
  },
  pt: {
    titulo: "Lance sua moeda na Solana.",
    resumo: "Lançamento grátis, com proteção contra snipers.",
    botao: "Lançar moeda",
    passos: [
      ["Crie", "Nome, símbolo e imagem."],
      ["Proteja", "Escolha a taxa anti-sniper de 25% ou 50%."],
      ["Divulgue", "A taxa cai até 1% em 2 minutos."],
    ],
  },
  zh: {
    titulo: "在 Solana 发行你的代币。",
    resumo: "免费发行，内置防狙击保护。",
    botao: "发行代币",
    passos: [
      ["创建", "名称、代号和图片。"],
      ["保护", "选择 25% 或 50% 防狙击费。"],
      ["分享", "费用在 2 分钟内降至 1%。"],
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
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-zinc-50 sm:text-[34px]">{t.titulo}</h1>
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
        <ol className="hidden shrink-0 gap-2 sm:grid sm:grid-cols-3 lg:w-[560px]">
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
