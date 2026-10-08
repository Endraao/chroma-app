"use client";

import { useEffect } from "react";

/**
 * Quem abre o link do post fora do X vai direto pra página da moeda. É no
 * navegador, de propósito: o robô do X não roda script, então ele fica nesta
 * página e lê o "player card" dela.
 */
export function IrParaAMoeda({ destino }: { destino: string }) {
  useEffect(() => {
    window.location.replace(destino);
  }, [destino]);
  return (
    <p className="p-8 text-center text-[14px] text-zinc-400">
      <a href={destino} className="font-bold text-marca">
        chromalaunch.fun →
      </a>
    </p>
  );
}
