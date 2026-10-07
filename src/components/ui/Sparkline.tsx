"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * Mini-gráfico dos cards, no mesmo estilo do gráfico de indicações (pedido do
 * dono, 30/09/2026): curva suave, degradê que some embaixo e um ponto no
 * preço de agora.
 *
 * Os pontos vêm das variações de 24h, 6h, 1h e 5min — é o que toda fonte de
 * mercado devolve sem pedir velas, então o card não faz nenhuma requisição.
 */
export function Sparkline({
  changes,
  up,
  className,
  vivos = [],
  altura = 28,
  serie,
  sobreposto = false,
}: {
  changes?: { m5?: number; h1?: number; h6?: number; h24?: number };
  up: boolean;
  className?: string;
  /** preços ao vivo em proporção ao de agora (1 = preço do servidor) */
  vivos?: number[];
  altura?: number;
  /** Preços de verdade (histórico 24 h): desenhados ponto a ponto, sem suavizar — cara de gráfico. */
  serie?: number[];
  /** Por cima da imagem da moeda (estilo pump.fun): só a linha fina com brilho, sem fundo nem ponto. */
  sobreposto?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const real = serie && serie.length >= 8 ? serie.filter((v) => Number.isFinite(v) && v > 0) : null;
  const base = buildPoints(changes) ?? (vivos.length >= 2 ? [1] : null);
  const points = real ?? (base ? [...base, ...vivos.filter((v) => Number.isFinite(v) && v > 0)] : null);
  if (!points) return null;

  const width = 100;
  const height = altura;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const xy = points.map((value, i) => ({
    x: (i / (points.length - 1)) * width,
    // Margem de 4px em cima e embaixo pra linha não encostar na borda.
    // Preço parado: linha no meio, não colada no chão.
    y: max === min ? height / 2 : height - 4 - ((value - min) / span) * (height - 8),
  }));

  // Com histórico real: reta entre cada ponto (o zigue-zague do mercado);
  // só com as variações (5 pontos): curva suave.
  const linha = real ? xy.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ") : curvaSuave(xy);
  const area = `${linha} L ${width},${height} L 0,${height} Z`;
  const cor = up ? "#00d18f" : "#ff4d5e";
  const ultimo = xy[xy.length - 1];

  return (
    <div className={cn("pointer-events-none relative w-full", className)} style={{ height }} aria-hidden>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="size-full overflow-visible">
        <defs>
          <linearGradient id={`spark-${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={cor} stopOpacity="0.32" />
            <stop offset="100%" stopColor={cor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {!sobreposto && <path d={area} fill={`url(#spark-${id})`} />}
        <path
          d={linha}
          fill="none"
          stroke={cor}
          strokeWidth={sobreposto ? 1.5 : 1.75}
          style={sobreposto ? { filter: `drop-shadow(0 0 3px ${cor})` } : undefined}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* Ponto fora do SVG esticado, pra continuar redondo. */}
      {!sobreposto && <span
        className="absolute size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-ink-950"
        style={{ left: `${ultimo.x}%`, top: `${(ultimo.y / height) * 100}%`, backgroundColor: cor }}
      />}
    </div>
  );
}

/** Catmull-Rom em Bézier: passa por todos os pontos, sem quinas. */
function curvaSuave(p: { x: number; y: number }[]): string {
  let d = `M ${p[0].x.toFixed(1)},${p[0].y.toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

function buildPoints(changes?: { m5?: number; h1?: number; h6?: number; h24?: number }): number[] | null {
  if (!changes) return [1, 1];
  const agora = 1;
  const anterior = (pct?: number) =>
    pct === undefined || pct === null ? null : agora / (1 + pct / 100);
  const serie = [anterior(changes.h24), anterior(changes.h6), anterior(changes.h1), anterior(changes.m5), agora];
  const validos = serie.filter((v): v is number => v !== null && Number.isFinite(v) && v > 0);
  // Sem variação conhecida (moeda sem negócio ainda): linha reta — é a
  // verdade, o preço não mexeu. Antes o card ficava sem gráfico nenhum.
  if (validos.length < 2) return [agora, agora];
  return validos;
}
