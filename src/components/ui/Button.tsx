"use client";

import { cn } from "@/lib/utils";

type Variant = "chroma" | "buy" | "sell" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

/*
 * A ação principal é CHAPADA, não gradiente.
 *
 * O botão com gradiente e brilho embaixo é o elemento mais associado a página
 * gerada — e, pior, ele compete com o gráfico e com os números de preço, que
 * é o que a pessoa veio ver. Cor sólida da marca, borda de 1px, nada de
 * sombra colorida: a ênfase vem do contraste com o fundo quase preto.
 */
const variants: Record<Variant, string> = {
  chroma:
    "bg-marca text-ink-950 font-bold hover:bg-marca-forte " +
    "active:translate-y-px",
  buy: "bg-bull/12 text-bull border border-bull/35 hover:bg-bull/20",
  sell: "bg-bear/12 text-bear border border-bear/35 hover:bg-bear/20",
  ghost: "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
  outline:
    "border border-ink-600 bg-ink-800 text-zinc-200 hover:border-marca/50 hover:text-white",
};

/* Mais baixos que antes: altura de painel, não de folheto. */
const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[12px]",
  md: "h-9 px-3.5 text-[13px]",
  lg: "h-10 px-4 text-[14px]",
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
        "inline-flex select-none items-center justify-center gap-2 rounded font-semibold transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-marca",
        "disabled:cursor-not-allowed disabled:opacity-40",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
