import { cn } from "@/lib/utils";

export function Stat({
  label,
  value,
  tone,
  className,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "bull" | "bear";
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5", className)}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</div>
      <div
        className={cn(
          "tnum mt-1 text-sm font-semibold text-zinc-100",
          tone === "bull" && "text-bull",
          tone === "bear" && "text-bear",
        )}
      >
        {value}
      </div>
    </div>
  );
}
