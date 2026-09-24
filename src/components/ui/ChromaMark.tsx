import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * O logo da Chroma: o cristal icosaédrico.
 *
 * O cristal é escuro de propósito (brilho médio 47/255) e o fundo do site é
 * quase preto (7/255), então sem ajuda ele some. O que o faz aparecer é a luz
 * em volta — que, além de resolver o contraste, é literalmente o conceito da
 * marca: luz refratada atravessando o cristal.
 *
 * ---------------------------------------------------------------------------
 * O BRILHO SAI DO DESENHO, NÃO DE UMA CAIXA ATRÁS
 * ---------------------------------------------------------------------------
 * Antes havia um `<span>` do tamanho da caixa inteira, pintado com o gradiente
 * da marca e desfocado em 10px. Em 38 pixels isso não vira halo — vira uma
 * mancha roxa QUADRADA atrás do cristal, porque um borrão de 10px num quadrado
 * de 38px não tem distância pra suavizar as quinas. O logo parecia estar
 * dentro de um adesivo.
 *
 * Agora o brilho vem de `drop-shadow` aplicado na própria imagem (a classe
 * `.cristal-marca`, em `globals.css`), que respeita o canal alfa e acompanha o
 * contorno facetado. É a mesma técnica do cristal grande da home, então o site
 * passa a ter uma linguagem visual só.
 *
 * O realce no hover também mora lá, como transição de `filter`: assim ele
 * acompanha o `group` do link em volta sem precisar de elemento extra.
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
      <Image
        src="/logo.png"
        alt="Chroma"
        width={size * 2}
        height={size * 2}
        priority
        className={cn("relative", glow && "cristal-marca")}
        style={{ width: size, height: size }}
      />
    </span>
  );
}
