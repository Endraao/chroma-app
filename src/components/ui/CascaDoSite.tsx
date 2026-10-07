"use client";

import { usePathname } from "next/navigation";

/**
 * Cabeçalho, molduras e rodapé do site — exceto em /p/…, a página que abre
 * DENTRO do post do X (player card, 07/10/2026): lá só cabe a negociação.
 */
export function CascaDoSite({
  topo,
  rodape,
  children,
}: {
  topo: React.ReactNode;
  rodape: React.ReactNode;
  children: React.ReactNode;
}) {
  const embutida = usePathname()?.startsWith("/p/");
  if (embutida) return <>{children}</>;
  return (
    <>
      {topo}
      {children}
      {rodape}
    </>
  );
}
