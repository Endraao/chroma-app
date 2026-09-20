"use client";

import { cn } from "@/lib/utils";

type Variant = "chroma" | "buy" | "sell" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  // Único lugar onde o gradiente cromático aparece em área cheia
  /*
   * O gradiente sozinho lia como roxo chapado: com `background-size: 200%` e a
   * posição inicial, só uma faixa da paleta aparecia. A borda interna clara
   * desenha o contorno do botão contra o fundo escuro e o brilho baixo em
   * repouso destaca a ação principal sem animar nada — animação constante na
   * CTA cansa e concorre com o gráfico ao lado.
   */
  chroma:
    "bg-chroma-gradient bg-[length:200%_200%] bg-[position:25%_50%] text-white " +
    "ring-1 ring-inset ring-white/25 shadow-[0_6px_20px_-8px_rgba(139,92,246,.75)] " +
    "hover:animate-chroma-pan hover:ring-white/40 hover:shadow-glow-violet",
  buy: "bg-bull/15 text-bull border border-bull/30 hover:bg-bull/25 hover:shadow-glow-bull",
  sell: "bg-bear/15 text-bear border border-bear/30 hover:bg-bear/25 hover:shadow-glow-bear",
  ghost: "text-zinc-400 hover:bg-white/5 hover:text-zinc-100",
  outline: "border border-white/10 bg-white/[0.02] text-zinc-200 hover:border-chroma-violet/40 hover:bg-white/[0.05]",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-[15px]",
};

export function Button({
  variant = "outline",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chroma-violet/50",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
