import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/lib/types";

const tones: Record<RiskLevel | "neutral" | "chroma", string> = {
  safe: "bg-bull/10 text-bull ring-bull/25",
  warn: "bg-warn/10 text-warn ring-warn/25",
  danger: "bg-bear/10 text-bear ring-bear/25",
  unknown: "bg-white/5 text-zinc-500 ring-white/10",
  neutral: "bg-white/5 text-zinc-300 ring-white/10",
  chroma: "bg-chroma-violet/10 text-chroma-violet ring-chroma-violet/25",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
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
