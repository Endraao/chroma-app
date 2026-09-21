import { cn } from "@/lib/utils";

/**
 * Capa padrão, gerada a partir do endereço da carteira.
 *
 * Mesmo princípio do avatar: determinística, sem upload e sem serviço externo,
 * então toda conta já nasce com uma capa em vez de uma faixa cinza vazia
 * pedindo pra ser preenchida. Quem quiser trocar, troca — `src` tem prioridade.
 *
 * As formas são grandes e desfocadas de propósito: a capa é fundo, e o nome e
 * o avatar que ficam por cima precisam continuar legíveis.
 */

function hash(texto: string): number {
  let h = 0;
  for (let i = 0; i < texto.length; i++) {
    h = (h * 31 + texto.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Mesma paleta do Avatar, pra capa e foto da mesma conta combinarem. */
const PARES: [string, string][] = [
  ["#8b5cf6", "#22d3ee"],
  ["#6366f1", "#34d399"],
  ["#22d3ee", "#34d399"],
  ["#fb7185", "#8b5cf6"],
  ["#fbbf24", "#fb7185"],
  ["#34d399", "#6366f1"],
  ["#8b5cf6", "#fbbf24"],
  ["#22d3ee", "#6366f1"],
];

export function CoverArt({
  seed,
  src,
  className,
}: {
  seed: string;
  src?: string;
  className?: string;
}) {
  if (src) {
    return (
       
      <img
        src={src}
        alt=""
        className={cn("size-full object-cover", className)}
      />
    );
  }

  const h = hash(seed || "chroma");
  const [de, para] = PARES[h % PARES.length];
  const id = `cv${h % 100000}`;
  const p = (n: number, base: number, faixa: number) => base + ((h >> n) % faixa);

  return (
    <svg
      viewBox="0 0 1500 500"
      preserveAspectRatio="xMidYMid slice"
      className={cn("size-full", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={de} stopOpacity="0.55" />
          <stop offset="100%" stopColor={para} stopOpacity="0.35" />
        </linearGradient>
        <filter id={`${id}b`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="90" />
        </filter>
      </defs>

      <rect width="1500" height="500" fill="#0a0a0f" />
      <rect width="1500" height="500" fill={`url(#${id}f)`} />

      <g filter={`url(#${id}b)`} opacity="0.7">
        <circle cx={p(2, 150, 500)} cy={p(5, 80, 300)} r="220" fill={de} />
        <circle cx={p(8, 800, 600)} cy={p(11, 150, 300)} r="260" fill={para} />
        <circle cx={p(14, 400, 900)} cy={p(17, 200, 250)} r="170" fill={de} />
      </g>

      {/* Escurece a base pra o nome e o avatar terem contraste garantido. */}
      <rect width="1500" height="500" fill="url(#chroma-cover-fade)" />
      <defs>
        <linearGradient id="chroma-cover-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="40%" stopColor="#0a0a0f" stopOpacity="0" />
          <stop offset="100%" stopColor="#0a0a0f" stopOpacity="0.75" />
        </linearGradient>
      </defs>
    </svg>
  );
}
