"use client";

import { useEffect, useState } from "react";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";
import { cn } from "@/lib/utils";

const TEXTOS = traducoes({
  en: { claro: "Light mode", escuro: "Dark mode" },
  pt: { claro: "Modo claro", escuro: "Modo escuro" },
  zh: { claro: "浅色模式", escuro: "深色模式" },
});

export const CHAVE_DO_TEMA = "chroma.tema";

/**
 * Escuro (padrão) ou claro. A escolha fica no navegador e é aplicada antes
 * da página desenhar (script em layout.tsx), pra não piscar preto→branco.
 */
export function SeletorDeTema({ aberta }: { aberta: boolean }) {
  const t = useTextos(TEXTOS);
  const [claro, setClaro] = useState(false);

  useEffect(() => {
    setClaro(document.documentElement.dataset.tema === "claro");
  }, []);

  function alternar() {
    const proximo = !claro;
    setClaro(proximo);
    if (proximo) document.documentElement.dataset.tema = "claro";
    else delete document.documentElement.dataset.tema;
    try {
      window.localStorage.setItem(CHAVE_DO_TEMA, proximo ? "claro" : "escuro");
    } catch {
      /* sem storage: vale só nesta aba */
    }
  }

  const rotulo = claro ? t.escuro : t.claro;
  return (
    <button
      onClick={alternar}
      title={rotulo}
      aria-label={rotulo}
      className={cn(
        "mx-2 mt-1 flex items-center gap-2.5 rounded-md py-2 text-[13px] text-zinc-400 transition-colors hover:bg-ink-800 hover:text-zinc-100",
        aberta ? "px-2.5" : "justify-center",
      )}
    >
      {claro ? (
        <svg viewBox="0 0 24 24" className="size-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
        </svg>
      )}
      {aberta && <span>{rotulo}</span>}
    </button>
  );
}
