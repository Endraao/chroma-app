"use client";

import { useEffect, useState } from "react";

import type { ChainId } from "@/lib/types";

const INTERVALO_MS = 60_000;

/**
 * Preço em dólar da moeda nativa da rede (SOL ou ETH), ou null sem cotação.
 *
 * Existe para a tela mostrar "≈ $2,69" ao lado do que a pessoa digita: 0,001
 * ETH não diz nada pra quem pensa em dólar, e é em dólar que ela decide.
 */
export function usePrecoNativo(chain: ChainId): number | null {
  const [precos, setPrecos] = useState<Record<ChainId, number> | null>(null);

  useEffect(() => {
    let cancelado = false;
    const ler = async () => {
      try {
        const res = await fetch("/api/precos-nativos", { cache: "no-store" });
        if (res.ok && !cancelado) setPrecos(await res.json());
      } catch {
        /* rede oscilou: fica a última cotação */
      }
    };
    void ler();
    const timer = window.setInterval(() => void ler(), INTERVALO_MS);
    return () => {
      cancelado = true;
      window.clearInterval(timer);
    };
  }, []);

  const preco = precos?.[chain] ?? 0;
  return preco > 0 ? preco : null;
}
