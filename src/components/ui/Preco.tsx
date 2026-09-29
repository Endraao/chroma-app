import { formatPrice } from "@/lib/utils";

/**
 * Preço com zeros resumidos ($0.0₅4387 = $0.000004387), mas com o número
 * pequeno desenhado em HTML (<sub>) em vez do caractere Unicode "₅" — a
 * fonte do site não tem esse caractere e o navegador puxava de outra fonte,
 * que ficava torta.
 */
export function Preco({ valor, casas }: { valor: number; casas?: number }) {
  const texto = formatPrice(valor, casas);
  const m = /^0\.0([₀₁₂₃₄₅₆₇₈₉]+)(\d+)$/.exec(texto);
  if (!m) return <>{texto}</>;
  const zeros = [...m[1]].map((c) => "₀₁₂₃₄₅₆₇₈₉".indexOf(c)).join("");
  return (
    <>
      0.0<sub className="relative -bottom-[0.1em] mx-[0.05em] text-[0.62em] font-bold leading-none">{zeros}</sub>
      {m[2]}
    </>
  );
}
