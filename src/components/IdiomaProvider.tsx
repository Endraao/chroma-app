"use client";

import { createContext, useContext } from "react";

import { IDIOMA_PADRAO, type Idioma } from "@/lib/idiomas";

/**
 * O idioma da página, disponível pra qualquer componente de cliente.
 *
 * Decidido no servidor (cookie ou Accept-Language, ver idioma-servidor.ts) e
 * descido pelo layout — assim a página já nasce no idioma certo, sem piscar.
 */
const Contexto = createContext<Idioma>(IDIOMA_PADRAO);

export function IdiomaProvider({ idioma, children }: { idioma: Idioma; children: React.ReactNode }) {
  return <Contexto.Provider value={idioma}>{children}</Contexto.Provider>;
}

export function useIdioma(): Idioma {
  return useContext(Contexto);
}

/** Os textos de uma tela (declarados com `traducoes`) no idioma atual. */
export function useTextos<T>(dicionario: Record<Idioma, T>): T {
  return dicionario[useIdioma()];
}
