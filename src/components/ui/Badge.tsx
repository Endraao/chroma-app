import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/lib/types";

/* Fundo quase ausente e borda de 1px: selo de terminal, não etiqueta colorida. */
const tones: Record<RiskLevel | "neutral" | "chroma", string> = {
  safe: "bg-bull/[0.08] text-bull ring-bull/30",
  warn: "bg-warn/[0.08] text-warn ring-warn/30",
  danger: "bg-bear/[0.08] text-bear ring-bear/30",
  unknown: "bg-ink-800 text-zinc-500 ring-ink-600",
  neutral: "bg-ink-800 text-zinc-300 ring-ink-600",
  chroma: "bg-marca/[0.08] text-marca ring-marca/30",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-rotulo ring-1 ring-inset",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

/** Bolinha de status: verde = ok, vermelho = risco. */
export function StatusDot({ level, pulse = false }: { level: RiskLevel; pulse?: boolean }) {
  const color =
    level === "safe" ? "bg-bull" : level === "warn" ? "bg-warn" : level === "danger" ? "bg-bear" : "bg-zinc-600";
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", color, pulse && "animate-pulse-dot")} />;
}
