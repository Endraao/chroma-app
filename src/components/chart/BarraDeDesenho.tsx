"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * A barra de desenho, organizada como a do TradingView.
 *
 * ---------------------------------------------------------------------------
 * POR QUE GRUPOS, E NÃO UMA LISTA DE FERRAMENTAS
 * ---------------------------------------------------------------------------
 * A primeira versão punha as dez ferramentas uma embaixo da outra. Parecia a
 * mesma coisa e não era: no TradingView cada botão é um GRUPO, ele abre uma
 * lista ao lado, e passa a mostrar a última ferramenta que você escolheu ali
 * dentro.
 *
 * Isso muda o uso, não só o visual. Quem desenha muito usa três ou quatro
 * ferramentas o tempo todo: com grupos, elas ficam a um clique cada, na mesma
 * posição de sempre. Com uma lista plana, a barra cresce sem parar conforme
 * ferramentas são acrescentadas e nada fica onde a mão espera.
 *
 * ---------------------------------------------------------------------------
 * OS ÍCONES
 * ---------------------------------------------------------------------------
 * Desenhados forma por forma a partir dos de lá, não "inspirados":
 *
 *  - a cruz do cursor tem um VAZIO no meio, e é isso que a distingue de um "+";
 *  - a linha de tendência tem um círculo vazado em cada ponta;
 *  - o grupo de horizontais é um "≡" de comprimentos diferentes, não três
 *    linhas iguais;
 *  - a Fibonacci é uma barra vertical com os níveis saindo dela pra direita;
 *  - a régua é um retângulo inclinado com os tracinhos de medida dentro.
 *
 * Espessura de traço constante em todos. Ícone com peso diferente ao lado de
 * outro é o que faz uma barra parecer um apanhado de origens distintas.
 */

export interface FerramentaDeDesenho {
  /** nome do overlay na biblioteca */
  id: string;
  nome: string;
}

interface Grupo {
  chave: string;
  titulo: string;
  ferramentas: FerramentaDeDesenho[];
  /** o ícone do grupo, quando nenhuma ferramenta dele foi usada ainda */
  icone: React.ReactNode;
  /** ícone de cada ferramenta, pra lista */
  icones?: Record<string, React.ReactNode>;
}

/* ------------------------------------------------------------------ */
/* Traço comum                                                         */
/* ------------------------------------------------------------------ */

const traco = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.3,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const I = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" className="size-[19px]" {...traco}>
    {children}
  </svg>
);

/** Cruz com o vazio no meio — a marca do cursor do TradingView. */
const IconeCruz = () => (
  <I>
    <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
  </I>
);

/** Linha de tendência: diagonal com um círculo vazado em cada ponta. */
const IconeTendencia = () => (
  <I>
    <path d="M7.8 16.2 16.2 7.8" />
    <circle cx="6" cy="18" r="2" />
    <circle cx="18" cy="6" r="2" />
  </I>
);

/** Grupo das horizontais: o "≡" de comprimentos diferentes. */
const IconeHorizontais = () => (
  <I>
    <path d="M3 7h18M3 12h12M3 17h18" />
    <circle cx="19" cy="12" r="1.6" />
  </I>
);

/** Fibonacci: a barra vertical com os níveis saindo dela. */
const IconeFibonacci = () => (
  <I>
    <path d="M5 4v16" />
    <path d="M5 7h14M5 11h10M5 15h14M5 19h7" />
  </I>
);

/** Formas: um retângulo e um círculo se sobrepondo, como no original. */
const IconeFormas = () => (
  <I>
    <rect x="3.5" y="7.5" width="11" height="11" rx="1" />
    <circle cx="16" cy="9" r="5" />
  </I>
);

const IconeTexto = () => (
  <I>
    <path d="M5 6h14M12 6v13" />
  </I>
);

const IconeEmoji = () => (
  <I>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9 15.5c.8.9 1.8 1.4 3 1.4s2.2-.5 3-1.4" />
    <path d="M9 9.5v.8M15 9.5v.8" />
  </I>
);

/** Régua: retângulo inclinado com os tracinhos de medida. */
const IconeRegua = () => (
  <I>
    <rect x="1.5" y="8.5" width="21" height="7" rx="1" transform="rotate(-45 12 12)" />
    <path d="M10.2 6.6l1.6 1.6M7.4 9.4l1.6 1.6M12.9 3.9l1.6 1.6" />
  </I>
);

const IconeZoom = () => (
  <I>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5 21 21" />
    <path d="M10.5 8v5M8 10.5h5" />
  </I>
);

/** Ímã: a ferradura com as duas pontas, igual à de lá. */
const IconeIma = () => (
  <I>
    <path d="M7 4v8a5 5 0 0 0 10 0V4" />
    <path d="M4 4h6M14 4h6" />
    <path d="M4 4v3.5h6V4M14 4v3.5h6V4" />
  </I>
);

const IconeLixeira = () => (
  <I>
    <path d="M4 7h16M10 4h4M9 7v12M15 7v12M6 7l1 14h10l1-14" />
  </I>
);

/* Ícones pequenos da lista, um por ferramenta. */
const IconeRaio = () => (
  <I>
    <path d="M5 19 19 5" />
    <circle cx="5" cy="19" r="2" />
  </I>
);
const IconeEstendida = () => (
  <I>
    <path d="M3 21 21 3" />
    <circle cx="9" cy="15" r="1.8" />
    <circle cx="15" cy="9" r="1.8" />
  </I>
);
const IconeHorizontal = () => (
  <I>
    <path d="M3 12h18" />
    <circle cx="12" cy="12" r="1.8" />
  </I>
);
const IconeVertical = () => (
  <I>
    <path d="M12 3v18" />
    <circle cx="12" cy="12" r="1.8" />
  </I>
);
const IconeCanal = () => (
  <I>
    <path d="M4 16 20 6M4 20 20 10" />
  </I>
);
const IconeRetangulo = () => (
  <I>
    <rect x="4" y="6" width="16" height="12" rx="1" />
  </I>
);
const IconeCirculo = () => (
  <I>
    <circle cx="12" cy="12" r="8" />
  </I>
);

/* ------------------------------------------------------------------ */
/* Os grupos, na ordem da barra de lá                                  */
/* ------------------------------------------------------------------ */

const GRUPOS: Grupo[] = [
  {
    chave: "tendencia",
    titulo: "Linhas de tendência",
    icone: <IconeTendencia />,
    ferramentas: [
      { id: "segment", nome: "Linha de tendência" },
      { id: "rayLine", nome: "Raio" },
      { id: "straightLine", nome: "Linha estendida" },
      { id: "parallelStraightLine", nome: "Canal paralelo" },
      { id: "priceChannelLine", nome: "Canal de preço" },
    ],
    icones: {
      segment: <IconeTendencia />,
      rayLine: <IconeRaio />,
      straightLine: <IconeEstendida />,
      parallelStraightLine: <IconeCanal />,
      priceChannelLine: <IconeCanal />,
    },
  },
  {
    chave: "horizontais",
    titulo: "Linhas horizontais e verticais",
    icone: <IconeHorizontais />,
    ferramentas: [
      { id: "horizontalStraightLine", nome: "Linha horizontal" },
      { id: "horizontalRayLine", nome: "Raio horizontal" },
      { id: "priceLine", nome: "Linha de preço" },
      { id: "verticalStraightLine", nome: "Linha vertical" },
    ],
    icones: {
      horizontalStraightLine: <IconeHorizontal />,
      horizontalRayLine: <IconeHorizontal />,
      priceLine: <IconeHorizontal />,
      verticalStraightLine: <IconeVertical />,
    },
  },
  {
    chave: "fibonacci",
    titulo: "Fibonacci",
    icone: <IconeFibonacci />,
    ferramentas: [{ id: "fibonacciLine", nome: "Retração de Fibonacci" }],
    icones: { fibonacciLine: <IconeFibonacci /> },
  },
  {
    chave: "formas",
    titulo: "Formas geométricas",
    icone: <IconeFormas />,
    ferramentas: [
      { id: "rect", nome: "Retângulo" },
      { id: "circle", nome: "Círculo" },
      { id: "polygon", nome: "Polígono" },
      { id: "arc", nome: "Arco" },
    ],
    icones: {
      rect: <IconeRetangulo />,
      circle: <IconeCirculo />,
      polygon: <IconeFormas />,
      arc: <IconeCirculo />,
    },
  },
  {
    chave: "texto",
    titulo: "Texto e anotações",
    icone: <IconeTexto />,
    ferramentas: [
      { id: "text", nome: "Texto" },
      { id: "simpleAnnotation", nome: "Anotação" },
    ],
    icones: { text: <IconeTexto />, simpleAnnotation: <IconeTexto /> },
  },
  {
    chave: "marcas",
    titulo: "Marcas",
    icone: <IconeEmoji />,
    ferramentas: [{ id: "simpleTag", nome: "Etiqueta no preço" }],
    icones: { simpleTag: <IconeEmoji /> },
  },
  {
    chave: "regua",
    titulo: "Régua: mede a variação entre dois pontos",
    icone: <IconeRegua />,
    ferramentas: [{ id: "chroma-regua", nome: "Régua" }],
    icones: { "chroma-regua": <IconeRegua /> },
  },
];

/* ------------------------------------------------------------------ */

export function BarraDeDesenho({
  ferramenta,
  aoEscolher,
  ima,
  aoTrocarIma,
  aoLimpar,
  aoAproximar,
  cores,
}: {
  ferramenta: string | null;
  aoEscolher: (id: string | null) => void;
  ima: boolean;
  aoTrocarIma: () => void;
  aoLimpar: () => void;
  aoAproximar: () => void;
  cores: { borda: string; fundo: string; texto: string; apagado: string; ativo: string };
}) {
  const [aberta, setAberta] = useState(true);
  const [grupoAberto, setGrupoAberto] = useState<string | null>(null);

  /*
   * A última ferramenta usada de cada grupo. É o que o botão do grupo passa a
   * mostrar — sem isso, quem usa sempre o Raio teria que abrir a lista toda
   * vez, porque o botão continuaria mostrando a Linha de tendência.
   */
  const [ultimaDoGrupo, setUltimaDoGrupo] = useState<Record<string, string>>({});

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!grupoAberto) return;

    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && setGrupoAberto(null);
    const aoClicar = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setGrupoAberto(null);
    };

    window.addEventListener("keydown", aoTeclar);
    window.addEventListener("mousedown", aoClicar);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("mousedown", aoClicar);
    };
  }, [grupoAberto]);

  const escolher = (grupo: Grupo, id: string) => {
    setUltimaDoGrupo((atual) => ({ ...atual, [grupo.chave]: id }));
    setGrupoAberto(null);
    aoEscolher(id);
  };

  return (
    <div
      ref={ref}
      className={cn(
        "relative flex shrink-0 flex-col items-center gap-px border-r py-1.5 transition-[width]",
        aberta ? "w-[40px]" : "w-[22px]",
      )}
      style={{ borderColor: cores.borda, background: cores.fundo }}
    >
      {aberta && (
        <>
          <Botao
            titulo="Cursor"
            ativo={ferramenta === null}
            onClick={() => aoEscolher(null)}
            cores={cores}
          >
            <IconeCruz />
          </Botao>

          <Divisor cor={cores.borda} />

          {GRUPOS.map((grupo) => {
            const atual = ultimaDoGrupo[grupo.chave] ?? grupo.ferramentas[0].id;
            const ativo = grupo.ferramentas.some((f) => f.id === ferramenta);

            return (
              <div key={grupo.chave} className="relative">
                <Botao
                  titulo={grupo.titulo}
                  ativo={ativo}
                  cores={cores}
                  seta={grupo.ferramentas.length > 1}
                  onClick={() => escolher(grupo, atual)}
                  onSeta={() =>
                    setGrupoAberto((a) => (a === grupo.chave ? null : grupo.chave))
                  }
                >
                  {grupo.icones?.[atual] ?? grupo.icone}
                </Botao>

                {grupoAberto === grupo.chave && (
                  <div
                    className="absolute left-full top-0 z-50 ml-1 w-[210px] rounded border p-1 shadow-xl"
                    style={{ background: "#1e222d", borderColor: cores.borda }}
                  >
                    {grupo.ferramentas.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => escolher(grupo, f.id)}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-white/[0.06]"
                        style={{ color: ferramenta === f.id ? cores.ativo : cores.texto }}
                      >
                        <span className="grid size-5 shrink-0 place-items-center">
                          {grupo.icones?.[f.id] ?? grupo.icone}
                        </span>
                        {f.nome}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <Botao titulo="Aproximar" ativo={false} onClick={aoAproximar} cores={cores}>
            <IconeZoom />
          </Botao>

          <Divisor cor={cores.borda} />

          <Botao
            titulo={ima ? "Ímã ligado: os pontos grudam nas velas" : "Ímã desligado"}
            ativo={ima}
            onClick={aoTrocarIma}
            cores={cores}
          >
            <IconeIma />
          </Botao>

          <Botao titulo="Apagar todos os desenhos" ativo={false} onClick={aoLimpar} cores={cores}>
            <IconeLixeira />
          </Botao>
        </>
      )}

      <button
        type="button"
        title={aberta ? "Recolher ferramentas" : "Mostrar ferramentas"}
        onClick={() => setAberta((v) => !v)}
        className="mt-auto grid h-6 w-full place-items-center transition-colors"
        style={{ color: cores.apagado }}
      >
        <svg viewBox="0 0 24 24" className="size-3" {...traco}>
          <path d={aberta ? "M15 5 8 12l7 7" : "M9 5l7 7-7 7"} />
        </svg>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Divisor({ cor }: { cor: string }) {
  return <div className="my-1 h-px w-5" style={{ background: cor }} />;
}

function Botao({
  titulo,
  ativo,
  onClick,
  onSeta,
  seta,
  cores,
  children,
}: {
  titulo: string;
  ativo: boolean;
  onClick: () => void;
  onSeta?: () => void;
  seta?: boolean;
  cores: { texto: string; apagado: string; ativo: string };
  children: React.ReactNode;
}) {
  return (
    <div
      className="group relative grid size-[32px] place-items-center rounded transition-colors hover:bg-white/[0.06]"
      style={{ color: ativo ? cores.ativo : cores.apagado }}
    >
      <button
        type="button"
        title={titulo}
        aria-label={titulo}
        aria-pressed={ativo}
        onClick={onClick}
        className="grid size-full place-items-center"
      >
        {children}
      </button>

      {/*
        A setinha só aparece quando o mouse está em cima, como no original: ela
        é o atalho pra lista do grupo, e mostrada o tempo todo viraria sujeira
        em nove botões seguidos.
      */}
      {seta && (
        <button
          type="button"
          title={`${titulo} — ver todas`}
          onClick={(e) => {
            e.stopPropagation();
            onSeta?.();
          }}
          className="absolute bottom-0 right-0 hidden size-3 place-items-center group-hover:grid"
        >
          <svg viewBox="0 0 10 10" className="size-2.5" fill="currentColor">
            <path d="M10 10H4l6-6z" />
          </svg>
        </button>
      )}
    </div>
  );
}
