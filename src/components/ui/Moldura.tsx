"use client";

import type { ReactNode } from "react";

/** A área do conteúdo. A coluna de ícones saiu: a navegação fica só no cabeçalho. */
export function Moldura({ children }: { children: ReactNode }) {
  return (
    <main className="min-w-0 px-4 pb-16 pt-6 lg:px-6">
      <div className="mx-auto w-full max-w-[1600px]">{children}</div>
    </main>
  );
}
