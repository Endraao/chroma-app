import { cn } from "@/lib/utils";

/**
 * Mini-gráfico sobreposto à imagem da moeda.
 *
 * DE ONDE VÊM OS PONTOS: a Dexscreener não devolve série histórica no mesmo
 * endpoint da listagem — devolve a variação percentual em quatro janelas
 * (5min, 1h, 6h, 24h). Dá pra reconstruir cinco preços relativos a partir
 * disso: se o preço agora é P e subiu X% em 24h, então há 24h ele era
 * P / (1 + X/100).
 *
 * São poucos pontos e o traço entre eles é reto, mas cada ponto é real. A
 * alternativa seria uma chamada de velas por card — dezenas de requisições
 * só pra desenhar 40 pixels — ou uma curva inventada, que seria mentira
 * visual num lugar onde a pessoa decide onde põe dinheiro.
 */
export function Sparkline({
  changes,
  up,
  className,
}: {
  changes?: { m5?: number; h1?: number; h6?: number; h24?: number };
  up: boolean;
  className?: string;
}) {
  const points = buildPoints(changes);
  if (!points) return null;

  const width = 100;
  const height = 28;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;

  const coords = points.map((value, i) => {
    const x = (i / (points.length - 1)) * width;
    // Margem de 3px em cima e embaixo pra linha não encostar na borda.
    const y = height - 3 - ((value - min) / span) * (height - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const linha = `M ${coords.join(" L ")}`;
  const area = `${linha} L ${width},${height} L 0,${height} Z`;
  const cor = up ? "#22c55e" : "#ef4444";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("pointer-events-none w-full", className)}
      style={{ height }}
      aria-hidden
    >
      <path d={area} fill={cor} opacity={0.14} />
      <path
        d={linha}
        fill="none"
        stroke={cor}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Reconstrói os preços relativos, do mais antigo pro mais recente. */
function buildPoints(changes?: { m5?: number; h1?: number; h6?: number; h24?: number }): number[] | null {
  if (!changes) return null;

  const agora = 1;
  const anterior = (pct?: number) =>
    pct === undefined || pct === null ? null : agora / (1 + pct / 100);

  const serie = [anterior(changes.h24), anterior(changes.h6), anterior(changes.h1), anterior(changes.m5), agora];
  const validos = serie.filter((v): v is number => v !== null && Number.isFinite(v) && v > 0);

  // Com menos de três pontos o traço não diz nada; melhor não desenhar.
  if (validos.length < 3) return null;
  return validos;
}
