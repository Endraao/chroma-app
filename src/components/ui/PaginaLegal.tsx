import type { ReactNode } from "react";

/**
 * A moldura das páginas de texto corrido: termos, privacidade e afins.
 *
 * ---------------------------------------------------------------------------
 * POR QUE UMA COLUNA ESTREITA NUM SITE DE PAINEL
 * ---------------------------------------------------------------------------
 * O resto da Chroma é denso de propósito — tabela, gráfico, número colado em
 * número, tudo aproveitando a largura. Aqui é o contrário: linha longa demais
 * faz o olho perder a volta e ninguém lê. Texto legal já é o que menos se lê
 * num site; largura de leitura é o mínimo que dá pra fazer por ele.
 *
 * E ler isto importa pra nós também: são estas páginas que separam "o usuário
 * foi avisado" de "o site prometeu".
 */
export function PaginaLegal({
  titulo,
  atualizadoEm,
  resumo,
  children,
}: {
  titulo: string;
  /** Data por extenso. Página legal sem data de versão não vale nada. */
  atualizadoEm: string;
  /** Uma frase em português claro, antes do texto formal. */
  resumo: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto w-full max-w-[760px] pb-24 pt-4">
      <header className="border-b border-ink-700 pb-5">
        <h1 className="text-2xl font-black tracking-tight text-zinc-50">{titulo}</h1>
        <p className="mt-1 text-[11px] uppercase tracking-wider text-zinc-600">
          {atualizadoEm}
        </p>
        <p className="mt-3 rounded-lg border border-marca/20 bg-marca/[0.06] px-3 py-2.5 text-[13px] leading-relaxed text-zinc-300">
          {resumo}
        </p>
      </header>

      {/*
        As classes de tipografia ficam aqui, num lugar só, em vez de repetidas
        em cada `<p>` das páginas. Assim o texto das páginas fica sendo só
        texto, e dá pra reler procurando o que ele DIZ sem tropeçar em
        `className` a cada linha.
      */}
      <div
        className={[
          "mt-7 space-y-5 text-[13.5px] leading-[1.75] text-zinc-400",
          "[&_h2]:mt-9 [&_h2]:text-[15px] [&_h2]:font-bold [&_h2]:text-zinc-100",
          "[&_h3]:mt-6 [&_h3]:text-[13.5px] [&_h3]:font-bold [&_h3]:text-zinc-300",
          "[&_strong]:font-semibold [&_strong]:text-zinc-200",
          "[&_a]:text-marca [&_a]:underline [&_a]:underline-offset-2",
          "[&_ul]:space-y-1.5 [&_ul]:pl-5 [&_li]:list-disc [&_li]:marker:text-zinc-700",
          "[&_code]:rounded [&_code]:bg-ink-800 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px]",
        ].join(" ")}
      >
        {children}
      </div>
    </article>
  );
}

/**
 * O bloco de destaque para o que a pessoa PRECISA ler, mesmo pulando o resto.
 *
 * Aviso de risco perdido no meio de trinta parágrafos cumpre a formalidade e
 * não informa ninguém. Se o aviso importa de verdade, ele tem que resistir a
 * alguém rolando a página rápido.
 */
export function Aviso({ tom = "alerta", children }: { tom?: "alerta" | "neutro"; children: ReactNode }) {
  const cor =
    tom === "alerta"
      ? "border-warn/25 bg-warn/[0.07] text-zinc-300"
      : "border-ink-700 bg-ink-900 text-zinc-400";

  return (
    <div className={`rounded-lg border px-3.5 py-3 text-[13px] leading-relaxed ${cor}`}>
      {children}
    </div>
  );
}
