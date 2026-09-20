import { cn } from "@/lib/utils";

/**
 * Bichinho desenhado a partir do endereço da carteira.
 *
 * É o avatar padrão de quem entrou, operou e nunca enviou foto — que é a
 * maioria. Antes eram três círculos num degradê: distinguia uma conta da
 * outra, mas ninguém olha pra três círculos e pensa "esse sou eu". Um bicho
 * tem cara, e cara a pessoa reconhece.
 *
 * Determinístico: a mesma carteira sempre vira o mesmo bicho, com a mesma cor
 * e o mesmo fundo. Isso não é detalhe estético — é o que faz o avatar servir
 * como identificação. Se sorteasse de novo a cada visita, seria enfeite.
 *
 * Tudo em SVG inline: nada de serviço externo, nada pra baixar, funciona
 * offline e não vaza o endereço da carteira pra CDN nenhuma.
 *
 * São 8 bichos x 10 pelagens x 10 fundos = 800 combinações. Não é único por
 * pessoa e não precisa ser: o endereço embaixo do nome é que identifica de
 * verdade; o avatar só precisa dar pra distinguir de relance.
 */

/**
 * FNV-1a. Espalha melhor que o `h * 31 + c` da versão anterior, e aqui isso
 * importa: endereços de carteira compartilham muito prefixo e sufixo, então um
 * hash fraco faria carteiras parecidas caírem no mesmo bicho.
 */
function hash(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/*
 * Cada escolha usa um hash com tempero próprio em vez de fatias de bits do
 * mesmo número. Fatias do mesmo hash andam juntas — espécie e cor ficariam
 * correlacionadas e a variedade cairia sem motivo.
 */
const escolher = <T,>(lista: T[], seed: string, tempero: string): T =>
  lista[hash(seed + "#" + tempero) % lista.length];

/* ------------------------------------------------------------------ */
/* Cores                                                               */
/* ------------------------------------------------------------------ */

interface Pelagem {
  base: string;
  claro: string;
  escuro: string;
}

const PELAGENS: Pelagem[] = [
  { base: "#f59e0b", claro: "#fde68a", escuro: "#b45309" }, // laranja
  { base: "#a8a29e", claro: "#e7e5e4", escuro: "#57534e" }, // cinza
  { base: "#a16207", claro: "#fed7aa", escuro: "#713f12" }, // marrom
  { base: "#f472b6", claro: "#fce7f3", escuro: "#be185d" }, // rosa
  { base: "#a78bfa", claro: "#ede9fe", escuro: "#6d28d9" }, // lilás
  { base: "#34d399", claro: "#d1fae5", escuro: "#047857" }, // menta
  { base: "#60a5fa", claro: "#dbeafe", escuro: "#1d4ed8" }, // azul
  { base: "#f1f5f9", claro: "#ffffff", escuro: "#475569" }, // branco
  { base: "#64748b", claro: "#cbd5e1", escuro: "#1e293b" }, // grafite
  { base: "#fbbf24", claro: "#fef3c7", escuro: "#92400e" }, // mel
];

/** Fundos na paleta da marca, apagados o bastante pro bicho aparecer. */
const FUNDOS: [string, string][] = [
  ["#8b5cf6", "#22d3ee"],
  ["#6366f1", "#34d399"],
  ["#22d3ee", "#34d399"],
  ["#fb7185", "#8b5cf6"],
  ["#fbbf24", "#fb7185"],
  ["#34d399", "#6366f1"],
  ["#8b5cf6", "#fbbf24"],
  ["#22d3ee", "#6366f1"],
  ["#f472b6", "#22d3ee"],
  ["#6366f1", "#fb7185"],
];

const OLHO = "#1c1917";
const ROSA = "#fb7185";
const BICO = "#f59e0b";

/* ------------------------------------------------------------------ */
/* Peças reaproveitadas                                                */
/* ------------------------------------------------------------------ */

/** Dois olhos com brilho. O brilho é o que tira a cara de morto. */
function Olhos({ y, dx, r = 5 }: { y: number; dx: number; r?: number }) {
  return (
    <>
      <circle cx={50 - dx} cy={y} r={r} fill={OLHO} />
      <circle cx={50 + dx} cy={y} r={r} fill={OLHO} />
      <circle cx={50 - dx + r * 0.36} cy={y - r * 0.36} r={r * 0.33} fill="#fff" />
      <circle cx={50 + dx + r * 0.36} cy={y - r * 0.36} r={r * 0.33} fill="#fff" />
    </>
  );
}

function Bochechas({ y, dx = 22 }: { y: number; dx?: number }) {
  return (
    <g fill={ROSA} opacity="0.4">
      <ellipse cx={50 - dx} cy={y} rx="6" ry="4" />
      <ellipse cx={50 + dx} cy={y} rx="6" ry="4" />
    </g>
  );
}

/** Boquinha de "w", a mesma em vários bichos. */
function Boca({ y, cor }: { y: number; cor: string }) {
  return (
    <path
      d={`M50 ${y} q-4.5 5 -8.5 1 M50 ${y} q4.5 5 8.5 1`}
      stroke={cor}
      strokeWidth="2.2"
      strokeLinecap="round"
      fill="none"
    />
  );
}

/* ------------------------------------------------------------------ */
/* Os bichos                                                           */
/* ------------------------------------------------------------------ */

type Desenho = (c: Pelagem) => React.ReactNode;

const gato: Desenho = (c) => (
  <>
    <path d="M24 46 L27 13 L50 31 Z" fill={c.base} />
    <path d="M76 46 L73 13 L50 31 Z" fill={c.base} />
    <path d="M31 39 L33 23 L44 33 Z" fill={ROSA} />
    <path d="M69 39 L67 23 L56 33 Z" fill={ROSA} />
    <circle cx="50" cy="57" r="29" fill={c.base} />
    <g stroke={c.escuro} strokeWidth="1.6" strokeLinecap="round" opacity="0.55">
      <path d="M21 57 H33 M21 64 H33 M79 57 H67 M79 64 H67" />
    </g>
    <Olhos y={53} dx={12} />
    <Bochechas y={62} />
    <path d="M45.5 62 L54.5 62 L50 67.5 Z" fill={ROSA} />
    <Boca y={67.5} cor={c.escuro} />
  </>
);

const urso: Desenho = (c) => (
  <>
    <circle cx="26" cy="30" r="12" fill={c.base} />
    <circle cx="74" cy="30" r="12" fill={c.base} />
    <circle cx="26" cy="30" r="6" fill={ROSA} opacity="0.7" />
    <circle cx="74" cy="30" r="6" fill={ROSA} opacity="0.7" />
    <circle cx="50" cy="57" r="29" fill={c.base} />
    <ellipse cx="50" cy="68" rx="17" ry="12" fill={c.claro} />
    <Olhos y={50} dx={12} r={4.5} />
    <Bochechas y={58} dx={23} />
    <ellipse cx="50" cy="62.5" rx="5.5" ry="4" fill={c.escuro} />
    <Boca y={68} cor={c.escuro} />
  </>
);

const raposa: Desenho = (c) => (
  <>
    <path d="M21 48 L25 11 L50 33 Z" fill={c.base} />
    <path d="M79 48 L75 11 L50 33 Z" fill={c.base} />
    <path d="M28 41 L30 20 L43 33 Z" fill={c.escuro} />
    <path d="M72 41 L70 20 L57 33 Z" fill={c.escuro} />
    <circle cx="50" cy="57" r="29" fill={c.base} />
    <ellipse cx="50" cy="66" rx="21" ry="15" fill={c.claro} />
    <Olhos y={52} dx={12} r={4.5} />
    <ellipse cx="50" cy="64" rx="5" ry="3.6" fill={c.escuro} />
    <Boca y={68} cor={c.escuro} />
  </>
);

const sapo: Desenho = (c) => (
  <>
    <circle cx="50" cy="60" r="28" fill={c.base} />
    <circle cx="31" cy="33" r="14" fill={c.base} />
    <circle cx="69" cy="33" r="14" fill={c.base} />
    <circle cx="31" cy="33" r="9" fill="#fff" />
    <circle cx="69" cy="33" r="9" fill="#fff" />
    <circle cx="31" cy="34" r="4.6" fill={OLHO} />
    <circle cx="69" cy="34" r="4.6" fill={OLHO} />
    <circle cx="32.6" cy="32.4" r="1.6" fill="#fff" />
    <circle cx="70.6" cy="32.4" r="1.6" fill="#fff" />
    <circle cx="44" cy="54" r="1.9" fill={c.escuro} />
    <circle cx="56" cy="54" r="1.9" fill={c.escuro} />
    <Bochechas y={64} dx={21} />
    <path
      d="M31 61 Q50 77 69 61"
      stroke={c.escuro}
      strokeWidth="2.6"
      strokeLinecap="round"
      fill="none"
    />
  </>
);

const coelho: Desenho = (c) => (
  <>
    <g transform="rotate(-11 37 24)">
      <ellipse cx="37" cy="24" rx="8" ry="21" fill={c.base} />
      <ellipse cx="37" cy="25" rx="4" ry="14" fill={ROSA} opacity="0.75" />
    </g>
    <g transform="rotate(11 63 24)">
      <ellipse cx="63" cy="24" rx="8" ry="21" fill={c.base} />
      <ellipse cx="63" cy="25" rx="4" ry="14" fill={ROSA} opacity="0.75" />
    </g>
    <circle cx="50" cy="61" r="27" fill={c.base} />
    <Olhos y={57} dx={11} r={4.6} />
    <Bochechas y={66} dx={20} />
    <path d="M46 66 L54 66 L50 71 Z" fill={ROSA} />
    <path d="M50 71 v3.5" stroke={c.escuro} strokeWidth="2" strokeLinecap="round" />
    <rect x="46.2" y="74.5" width="3.2" height="5.5" rx="1.2" fill="#fff" />
    <rect x="50.6" y="74.5" width="3.2" height="5.5" rx="1.2" fill="#fff" />
  </>
);

/*
 * Panda de verdade é preto e branco, o que daria todos os pandas iguais. Aqui
 * as manchas usam o tom escuro da pelagem sorteada, então dá pra ter panda
 * grafite, panda marrom, panda azul — continua panda e continua distinguível.
 */
const panda: Desenho = (c) => (
  <>
    <circle cx="27" cy="31" r="11.5" fill={c.escuro} />
    <circle cx="73" cy="31" r="11.5" fill={c.escuro} />
    <circle cx="50" cy="57" r="29" fill={c.claro} />
    <g fill={c.escuro}>
      <ellipse cx="37" cy="52" rx="9" ry="11.5" transform="rotate(-18 37 52)" />
      <ellipse cx="63" cy="52" rx="9" ry="11.5" transform="rotate(18 63 52)" />
    </g>
    <circle cx="37" cy="52" r="4.2" fill="#fff" />
    <circle cx="63" cy="52" r="4.2" fill="#fff" />
    <circle cx="37.6" cy="51.4" r="2.2" fill={OLHO} />
    <circle cx="63.6" cy="51.4" r="2.2" fill={OLHO} />
    <ellipse cx="50" cy="66" rx="5.5" ry="4" fill={c.escuro} />
    <Boca y={71} cor={c.escuro} />
  </>
);

const cachorro: Desenho = (c) => (
  <>
    <ellipse cx="21" cy="54" rx="10" ry="19" fill={c.escuro} />
    <ellipse cx="79" cy="54" rx="10" ry="19" fill={c.escuro} />
    <circle cx="50" cy="56" r="28" fill={c.base} />
    <ellipse cx="50" cy="67" rx="16" ry="12" fill={c.claro} />
    <Olhos y={49} dx={11} r={4.6} />
    <Bochechas y={57} dx={22} />
    <ellipse cx="50" cy="62" rx="5.5" ry="4" fill={c.escuro} />
    <path d="M50 66 v3" stroke={c.escuro} strokeWidth="2" strokeLinecap="round" />
    <path d="M44 69 q6 3 12 0 q-1 10 -6 10 q-5 0 -6 -10 Z" fill={ROSA} />
  </>
);

const coruja: Desenho = (c) => (
  <>
    <path d="M27 32 L33 11 L45 27 Z" fill={c.base} />
    <path d="M73 32 L67 11 L55 27 Z" fill={c.base} />
    <ellipse cx="50" cy="58" rx="29" ry="28" fill={c.base} />
    <circle cx="37" cy="52" r="12.5" fill={c.claro} />
    <circle cx="63" cy="52" r="12.5" fill={c.claro} />
    <circle cx="37" cy="52" r="6" fill={OLHO} />
    <circle cx="63" cy="52" r="6" fill={OLHO} />
    <circle cx="39.2" cy="49.8" r="2.2" fill="#fff" />
    <circle cx="65.2" cy="49.8" r="2.2" fill="#fff" />
    <path d="M45 64 L55 64 L50 74 Z" fill={BICO} />
    <g stroke={c.escuro} strokeWidth="1.8" strokeLinecap="round" opacity="0.45" fill="none">
      <path d="M26 72 q8 6 14 2 M74 72 q-8 6 -14 2" />
    </g>
  </>
);

const BICHOS: Desenho[] = [gato, urso, raposa, sapo, coelho, panda, cachorro, coruja];

/* ------------------------------------------------------------------ */

export function Critter({
  seed,
  size = 32,
  className,
}: {
  seed: string;
  size?: number;
  className?: string;
}) {
  const chave = seed || "chroma";

  const desenhar = escolher(BICHOS, chave, "bicho");
  const pelagem = escolher(PELAGENS, chave, "pelagem");
  const [de, para] = escolher(FUNDOS, chave, "fundo");

  /*
   * O id do degradê tem que ser único no documento: dois SVGs com o mesmo id
   * fazem o segundo usar o degradê do primeiro, e dois avatares diferentes
   * apareceriam com o mesmo fundo. O hash inteiro em base 36 resolve.
   */
  const id = "cr" + hash(chave).toString(36);

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cn("shrink-0 rounded-full", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={de} stopOpacity="0.85" />
          <stop offset="100%" stopColor={para} stopOpacity="0.85" />
        </linearGradient>
      </defs>

      <rect width="100" height="100" fill={`url(#${id})`} />
      {desenhar(pelagem)}
    </svg>
  );
}
