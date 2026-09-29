"use client";

import { useEffect, useState } from "react";

import type { TokenSummary } from "@/lib/types";
import { urlsDaImagem } from "@/lib/utils";

/**
 * A foto da moeda no cabeçalho. Tenta cada endereço possível em ordem (IPFS
 * por vários portões, depois o leitor de logo do contrato) e só mostra as
 * iniciais se nada carregar. Clicando, abre grande — como na pump.fun.
 */
export function ImagemDaMoedaGrande({ token }: { token: TokenSummary }) {
  const candidatas = [
    ...urlsDaImagem(token.imageUrl),
    ...(token.chain === "robinhood" && !token.imageUrl?.includes("/api/logo/") ? [`/api/logo/${token.address}`] : []),
  ];
  const [indice, setIndice] = useState(0);
  const [aberta, setAberta] = useState(false);
  const atual = candidatas[indice];

  useEffect(() => {
    if (!aberta) return;
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && setAberta(false);
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aberta]);

  if (!atual) {
    return (
      <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-chroma-gradient bg-[length:200%_200%] text-sm font-black text-white/90">
        {token.symbol.slice(0, 2)}
      </div>
    );
  }

  return (
    <>
      <button onClick={() => setAberta(true)} className="shrink-0 cursor-zoom-in" aria-label={token.name}>
        <img
          src={atual}
          alt=""
          onError={() => setIndice((i) => i + 1)}
          className="size-10 rounded-lg bg-ink-800 object-cover transition-transform hover:scale-105"
        />
      </button>

      {aberta && (
        <div
          onClick={() => setAberta(false)}
          className="fixed inset-0 z-[100] grid cursor-zoom-out place-items-center bg-black/85 p-6 backdrop-blur-sm"
        >
          <img src={atual} alt={token.name} className="max-h-[80vh] max-w-[90vw] rounded-xl object-contain shadow-2xl" />
        </div>
      )}
    </>
  );
}
