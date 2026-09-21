import Link from "next/link";
import type { ReactNode } from "react";

/**
 * O cabeçalho de uma faixa da vitrine.
 *
 * A home deixou de ser uma grade só e virou três zonas com intenção diferente
 * — as maiores, o mercado inteiro e as que acabaram de nascer. Sem um título
 * marcando cada uma, as três viram a mesma parede de cartão e a divisão não
 * comunica nada.
 *
 * O traço vertical colorido à esquerda do título é a mesma ideia do fio do
 * topo: a aresta do cristal, onde a luz se parte. Repetido em escala pequena,
 * é o que amarra a página à marca sem pintar nada de roxo.
 */
export function Secao({
  titulo,
  resumo,
  cor,
  acao,
  children,
}: {
  titulo: string;
  /** uma linha explicando o critério da faixa — quem chega não adivinha */
  resumo?: string;
  /** a cor da aresta desta seção, tirada do espectro da marca */
  cor: string;
  acao?: { rotulo: string; href: string };
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div className="flex min-w-0 items-start gap-2.5">
          {/* A aresta: 2px de luz, na altura do bloco de texto. */}
          <span
            aria-hidden
            className="mt-1 h-7 w-[2px] shrink-0 rounded-full"
            style={{ backgroundColor: cor, boxShadow: `0 0 10px -1px ${cor}` }}
          />
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold uppercase leading-none tracking-rotulo text-zinc-100">
              {titulo}
            </h2>
            {resumo && <p className="mt-1.5 text-[11px] text-zinc-500">{resumo}</p>}
          </div>
        </div>

        {acao && (
          <Link
            href={acao.href}
            className="shrink-0 text-[11px] font-semibold text-zinc-500 transition-colors hover:text-marca"
          >
            {acao.rotulo} →
          </Link>
        )}
      </div>

      {children}
    </section>
  );
}
