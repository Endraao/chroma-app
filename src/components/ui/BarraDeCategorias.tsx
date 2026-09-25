"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { chainIcon } from "@/lib/chain-icons";
import { CHAINS, CHAIN_IDS } from "@/lib/web3";

/**
 * A coluna de ícones da esquerda.
 *
 * ---------------------------------------------------------------------------
 * POR QUE EXISTE, SE JÁ TEM O CABEÇALHO
 * ---------------------------------------------------------------------------
 * O cabeçalho leva a PÁGINAS — explorar, criar, afiliados, taxas. Esta barra
 * leva a RECORTES da mesma página: o que está girando, o que subiu, o que
 * acabou de nascer, cada rede.
 *
 * São dois eixos diferentes, e misturar os dois no topo daria uma fileira de
 * oito links onde nada se destaca. Separado, cada um responde uma pergunta:
 * o topo é "onde eu vou", a lateral é "o que eu quero ver".
 *
 * ---------------------------------------------------------------------------
 * FECHADA POR PADRÃO
 * ---------------------------------------------------------------------------
 * Fechada ela custa 56px; aberta, 212px — quase quatro vezes mais, tirados
 * justamente da largura do gráfico. Como a maioria das visitas é pra olhar
 * uma moeda e não pra navegar por categoria, o padrão é fechada, e a escolha
 * de quem abre fica guardada no navegador.
 *
 * Some abaixo de `lg`: em tela de celular, 56px de coluna fixa são 15% da
 * largura gastos em ícone, e o menu do cabeçalho já leva aos mesmos lugares.
 */

const LARGURA_FECHADA = "w-14";
const LARGURA_ABERTA = "w-[212px]";

/** Onde a escolha de aberta/fechada fica guardada. */
const CHAVE = "chroma:barra-de-categorias";

interface Item {
  href: string;
  rotulo: string;
  icone: ReactNode;
  /** marca como ativo quando a URL casa com isto */
  casa: (pathname: string, sort: string | null, chain: string | null) => boolean;
  /** cor do traço de ativo — o espectro da marca, repartido entre as categorias */
  cor: string;
  /**
   * Mantém a cor mesmo desmarcado.
   *
   * Vale pras REDES, e só. As duas usam o mesmo desenho de globo, então
   * fechada a barra ficava com dois ícones idênticos, um embaixo do outro,
   * sem nada distinguindo Solana de Robinhood. Nas categorias a cor
   * permanente seria o oposto: cinco ícones coloridos disputando atenção e
   * nenhum jeito de ver qual está selecionado.
   */
  corFixa?: boolean;
}

const CATEGORIAS: Item[] = [
  {
    href: "/",
    rotulo: "Tudo",
    cor: "#a78bfa",
    icone: <IconeGrade />,
    casa: (p, sort, chain) => p === "/" && !sort && !chain,
  },
  {
    href: "/?sort=volume",
    rotulo: "Quentes",
    cor: "#38bdf8",
    icone: <IconeChama />,
    casa: (p, sort) => p === "/" && sort === "volume",
  },
  {
    href: "/?sort=gainers",
    rotulo: "Maiores altas",
    cor: "#22d3ee",
    icone: <IconeSubindo />,
    casa: (p, sort) => p === "/" && sort === "gainers",
  },
  {
    href: "/?sort=marketCap",
    rotulo: "Maiores",
    cor: "#34d399",
    icone: <IconeTrofeu />,
    casa: (p, sort) => p === "/" && sort === "marketCap",
  },
  {
    href: "/?sort=new",
    rotulo: "Recém-chegadas",
    cor: "#a3e635",
    icone: <IconeBrilho />,
    casa: (p, sort) => p === "/" && sort === "new",
  },
];

/**
 * As redes usam o SÍMBOLO DELAS, não um desenho de globo.
 *
 * Com o mesmo globo nas duas, a barra fechada mostrava dois ícones idênticos
 * um embaixo do outro, e a cor era a única diferença — o que não diz a ninguém
 * qual é qual. A marca da rede é reconhecida de imediato e dispensa legenda,
 * que é exatamente o que a barra fechada não tem.
 *
 * Sai de CHAIN_IDS para seguir a ordem do site: a rede principal vem primeiro.
 */
const REDES: Item[] = CHAIN_IDS.map((id) => ({
  href: `/?chain=${id}`,
  rotulo: CHAINS[id].label,
  cor: id === "robinhood" ? "#34d399" : "#8b5cf6",
  corFixa: true,
  icone: (
    <img
      src={chainIcon(id)}
      alt=""
      width={16}
      height={16}
      className="size-4 shrink-0 rounded-full"
    />
  ),
  casa: (p: string, _s: string | null, chain: string | null) => p === "/" && chain === id,
}));

const RODAPE: Item[] = [
  {
    href: "/affiliate",
    rotulo: "Afiliados",
    cor: "#fbbf24",
    icone: <IconePessoas />,
    casa: (p) => p === "/affiliate",
  },
  {
    href: "/fees",
    rotulo: "Taxas",
    cor: "#94a3b8",
    icone: <IconeEtiqueta />,
    casa: (p) => p === "/fees",
  },
];

export function BarraDeCategorias({
  aberta,
  alternar,
}: {
  aberta: boolean;
  alternar: () => void;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const sort = params.get("sort");
  const chain = params.get("chain");

  const ativo = (item: Item) => item.casa(pathname, sort, chain);

  return (
    <aside
      className={cn(
        "hidden shrink-0 border-r border-ink-700 bg-ink-950 transition-[width] duration-200 lg:block",
        aberta ? LARGURA_ABERTA : LARGURA_FECHADA,
      )}
    >
      {/* Gruda logo abaixo do cabeçalho, que tem 57px e é sticky. */}
      <div className="sticky top-[57px] flex h-[calc(100vh-57px)] flex-col overflow-y-auto overflow-x-hidden py-3">
        {/* -------- o botão de abrir ---------------------------------- */}
        <button
          onClick={alternar}
          aria-label={aberta ? "Recolher categorias" : "Expandir categorias"}
          aria-expanded={aberta}
          className={cn(
            "mx-2 mb-2 flex h-9 items-center rounded-lg text-zinc-600 transition-colors hover:bg-white/[0.04] hover:text-zinc-300",
            aberta ? "justify-between px-2.5" : "justify-center",
          )}
        >
          {aberta && <span className="rotulo">Categorias</span>}
          <IconeSeta virada={aberta} />
        </button>

        <div className="mx-3 mb-2 h-px bg-ink-700" />

        <Grupo itens={CATEGORIAS} aberta={aberta} ativo={ativo} />

        <div className="mx-3 my-2 h-px bg-ink-700" />

        <Grupo itens={REDES} aberta={aberta} ativo={ativo} />

        {/* -------- criar token, a ação verde ------------------------- */}
        <div className="px-2 pt-3">
          <Link
            href="/create"
            title={aberta ? undefined : "Criar token"}
            className={cn(
              "flex h-10 items-center gap-2.5 rounded-lg bg-bull font-bold text-ink-950 transition-colors hover:bg-bull/85",
              aberta ? "px-3" : "justify-center",
            )}
          >
            <IconeMais />
            {aberta && <span className="truncate text-[13px]">Criar token</span>}
          </Link>
        </div>

        {/* -------- o resto encosta no rodapé ------------------------- */}
        <div className="flex-1" />

        <div className="mx-3 my-2 h-px bg-ink-700" />

        <Grupo itens={RODAPE} aberta={aberta} ativo={ativo} />
      </div>
    </aside>
  );
}

function Grupo({
  itens,
  aberta,
  ativo,
}: {
  itens: Item[];
  aberta: boolean;
  ativo: (i: Item) => boolean;
}) {
  return (
    <nav className="space-y-0.5 px-2">
      {itens.map((item) => {
        const marcado = ativo(item);
        return (
          <Link
            key={item.href + item.rotulo}
            href={item.href}
            /*
             * Fechada, o rótulo vira `title`: sem isso a barra fica sendo oito
             * desenhos sem nome, e a pessoa tem que abrir pra descobrir o que
             * cada um faz — o que anula a barra fechada.
             */
            title={aberta ? undefined : item.rotulo}
            className={cn(
              "relative flex h-9 items-center gap-2.5 rounded-lg transition-colors",
              aberta ? "px-2.5" : "justify-center",
              marcado
                ? "bg-white/[0.06] text-zinc-100"
                : "text-zinc-500 hover:bg-white/[0.035] hover:text-zinc-200",
            )}
          >
            {/*
              O traço de ativo é um fio colorido na aresta esquerda — a mesma
              ideia da luz entrando pela quina que o resto do site usa. Cada
              categoria tem a sua cor do espectro, então a barra inteira, de
              cima a baixo, é a luz repartida.
            */}
            {marcado && (
              <span
                aria-hidden
                className="absolute inset-y-1.5 left-0 w-[2px] rounded-full"
                style={{ backgroundColor: item.cor, boxShadow: `0 0 8px -1px ${item.cor}` }}
              />
            )}

            <span
              className="grid size-[18px] shrink-0 place-items-center"
              style={
                marcado
                  ? { color: item.cor }
                  : item.corFixa
                    ? { color: item.cor, opacity: 0.62 }
                    : undefined
              }
            >
              {item.icone}
            </span>

            {aberta && <span className="truncate text-[13px] font-medium">{item.rotulo}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export const CHAVE_DA_BARRA = CHAVE;

/**
 * O lugar da barra, enquanto ela não pode ser desenhada.
 *
 * `useSearchParams` SUSPENDE no servidor — é assim que o Next avisa que aquele
 * pedaço só pode ser resolvido no navegador. Quem suspende precisa de uma
 * fronteira de Suspense, e a fronteira precisa de um fallback que ocupe o
 * mesmo espaço: sem isto, o conteúdo da página nasce colado na esquerda e
 * pula 56px quando a barra aparece.
 */
export function EsqueletoDaBarra({ aberta }: { aberta: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "hidden shrink-0 border-r border-ink-700 bg-ink-950 lg:block",
        aberta ? LARGURA_ABERTA : LARGURA_FECHADA,
      )}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Ícones — traço de 1,7px, o mesmo peso do resto da interface          */
/* ------------------------------------------------------------------ */

function svg(children: ReactNode) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-full">
      <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  );
}

function IconeGrade() {
  return svg(
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>,
  );
}

function IconeChama() {
  return svg(
    <>
      <path d="M12 3s4.5 3.8 4.5 8a4.5 4.5 0 0 1-9 0c0-1.3.5-2.4 1.1-3.3.4 1 1.1 1.7 1.9 1.7 1 0 1.5-1 1.5-2.4 0-1.6-.5-3-.5-4Z" />
      <path d="M12 21a7 7 0 0 0 7-7" opacity=".45" />
      <path d="M12 21a7 7 0 0 1-7-7" opacity=".45" />
    </>,
  );
}

function IconeSubindo() {
  return svg(
    <>
      <path d="M3 16.5 9 10l4 4 7.5-7.5" />
      <path d="M15.5 6.5h5v5" />
    </>,
  );
}

function IconeTrofeu() {
  return svg(
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4.5v1.5A3.5 3.5 0 0 0 8 11" />
      <path d="M17 6h2.5v1.5A3.5 3.5 0 0 1 16 11" />
      <path d="M12 14v3M9 20h6M10 17h4" />
    </>,
  );
}

function IconeBrilho() {
  return svg(
    <>
      <path d="M12 3.5 13.6 9l5.5 1.6-5.5 1.6L12 17.7l-1.6-5.5L4.9 10.6 10.4 9 12 3.5Z" />
      <path d="M18.5 16.5 19.2 19l2.5.7-2.5.7-.7 2.5" opacity=".5" />
    </>,
  );
}

function IconeRede() {
  return svg(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5c2.2 2.3 3.3 5.2 3.3 8.5S14.2 18.2 12 20.5c-2.2-2.3-3.3-5.2-3.3-8.5S9.8 5.8 12 3.5Z" />
      <path d="M3.9 9.5h16.2M3.9 14.5h16.2" />
    </>,
  );
}

function IconePessoas() {
  return svg(
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 14.6a5.5 5.5 0 0 1 3 4.9" />
    </>,
  );
}

function IconeEtiqueta() {
  return svg(
    <>
      <path d="M11.2 3.5H20v8.8l-8.4 8.4a1.5 1.5 0 0 1-2.1 0l-6.7-6.7a1.5 1.5 0 0 1 0-2.1l8.4-8.4Z" />
      <circle cx="16.2" cy="7.8" r="1.4" />
    </>,
  );
}

function IconeMais() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[18px] shrink-0">
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconeSeta({ virada }: { virada: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn("size-[18px] shrink-0 transition-transform duration-200", virada && "rotate-180")}
    >
      <path
        d="m7 5 7 7-7 7M13 5l7 7-7 7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
