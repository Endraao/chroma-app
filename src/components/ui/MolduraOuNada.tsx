"use client";

import { usePathname } from "next/navigation";

import { Moldura } from "@/components/ui/Moldura";

/** A moldura com a barra de categorias — fora da página que abre dentro do post do X (/p/…). */
export function MolduraOuNada({ children }: { children: React.ReactNode }) {
  if (usePathname()?.startsWith("/p/")) return <>{children}</>;
  return <Moldura>{children}</Moldura>;
}
