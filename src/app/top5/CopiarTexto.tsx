"use client";

import { useState } from "react";

/** Caixa de texto com botão de copiar (usada no /top5). */
export function CopiarTexto({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-4">
      <pre className="whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-zinc-200">{texto}</pre>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(texto);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
          } catch {
            /* sem permissão: dá pra selecionar e copiar à mão */
          }
        }}
        className="mt-3 rounded-lg border border-marca/40 px-3 py-1.5 text-[12px] font-bold text-marca hover:bg-marca/10"
      >
        {copiado ? "Copiado!" : "Copiar"}
      </button>
    </div>
  );
}
