import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * O logo da Chroma: o cristal icosaédrico.
 *
 * O cristal é escuro de propósito (brilho médio 47/255) e o fundo do site é
 * quase preto (7/255), então sem ajuda ele some. O que o faz aparecer é o
 * halo cromático atrás — que, além de resolver o contraste, é literalmente o
 * conceito da marca: luz refratada atravessando o cristal.
 *
 * O halo fica em `::before` via elemento separado, com blur, e nunca captura
 * clique (`pointer-events-none`), pra não atrapalhar o link em volta.
 */
export function ChromaMark({
  size = 28,
  className,
  glow = true,
}: {
  size?: number;
  className?: string;
  /** desligue em fundo claro, onde o cristal já tem contraste sozinho */
  glow?: boolean;
}) {
  return (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      {glow && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full bg-chroma-gradient bg-[length:200%_200%] opacity-40 blur-[10px] transition-opacity duration-500 group-hover:opacity-70 group-hover:animate-chroma-pan"
        />
      )}

      <Image
        src="/logo.png"
        alt="Chroma"
        width={size * 2}
        height={size * 2}
        priority
        className="relative"
        style={{ width: size, height: size }}
      />
    </span>
  );
}
