import type { Metadata } from "next";
import Link from "next/link";

import { PainelDeAirdrop } from "@/components/airdrop/PainelDeAirdrop";
import { TEMPORADA_ATUAL } from "@/lib/airdrop-regras";

export const metadata: Metadata = {
  title: "Airdrop — Chroma",
  description:
    "Acumule pontos negociando, lançando moedas e trazendo gente para a Chroma. Sem inscrição, contado pelo seu endereço.",
};

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
 * ganha AGORA é concreto e verificável — pontos contados na blockchain, nível,
 * posição no placar. O que vem depois é possibilidade declarada como
 * possibilidade.
 *
 * Isso também protege o projeto de si mesmo: sem data anunciada, a temporada
 * pode durar meses e continuar atraindo gente — que é exatamente a intenção.
 */
export default function AirdropPage() {
  return (
    <div className="mx-auto w-full max-w-[900px] pb-24">
      {/* ---------------- Abertura ---------------- */}
      <header className="pt-6 text-center sm:pt-10">
        <span className="inline-flex items-center gap-2 rounded-full border border-marca/25 bg-marca/[0.07] px-3 py-1 text-[11px] font-bold uppercase tracking-rotulo text-marca">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-marca opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-marca" />
          </span>
          Temporada {TEMPORADA_ATUAL} em andamento
        </span>

        <h1 className="mt-5 text-4xl font-black leading-[1.08] tracking-tight text-zinc-50 sm:text-5xl">
          Use a Chroma.
          <br />
          <span className="text-chroma">Acumule pontos.</span>
        </h1>

        <p className="mx-auto mt-4 max-w-[520px] text-[14px] leading-relaxed text-zinc-400">
          Cada operação, cada moeda lançada e cada pessoa que você traz conta pontos ligados ao
          seu endereço. Sem inscrição, sem formulário, sem assinar nada.
        </p>

        <div className="aresta mx-auto mt-9 max-w-[420px]" />
      </header>

      {/* ---------------- O painel vivo ---------------- */}
      <div className="mt-9">
        <PainelDeAirdrop />
      </div>

      {/* ---------------- A parte honesta ---------------- */}
      <section className="mt-12 rounded-xl border border-ink-700 bg-ink-900 p-5">
        <h2 className="text-[13px] font-bold text-zinc-200">O que isto é, e o que não é</h2>

        <ul className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-zinc-500">
          <li>
            <span className="text-zinc-300">Os pontos são reais e verificáveis.</span> Cada um
            nasce de um fato conferido na blockchain e fica registrado com a transação que o
            gerou. Você pode auditar o seu saldo.
          </li>
          <li>
            <span className="text-zinc-300">Nenhum token foi criado ou prometido.</span> Não
            existe data, não existe quantidade definida, e nada aqui é oferta, garantia de
            recompensa ou promessa de valor futuro.
          </li>
          <li>
            <span className="text-zinc-300">As regras podem mudar.</span> Se aparecer abuso —
            volume lavado entre carteiras da mesma pessoa, moeda criada em série sem uso real —
            os pontos envolvidos podem ser revistos ou removidos.
          </li>
          <li>
            <span className="text-zinc-300">Não gaste o que você não pode perder.</span> Negociar
            moedas custa taxa de rede e envolve risco de perda total. Acumular pontos não
            compensa prejuízo. Leia os{" "}
            <Link href="/termos" className="text-marca underline underline-offset-2">
              Termos de Uso
            </Link>
            .
          </li>
        </ul>
      </section>

      {/* ---------------- Chamada final ---------------- */}
      <section className="mt-10 text-center">
        <p className="text-[13px] text-zinc-500">
          Encontrou um erro ou uma falha de segurança?{" "}
          <Link href="/contato" className="font-semibold text-marca underline underline-offset-2">
            Avise a nossa equipe
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
