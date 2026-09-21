"use client";

import { useEffect, useState } from "react";

import { SOL_MINT } from "@/lib/jupiter";

/**
 * Quanto vale 1 SOL em dólar.
 *
 * ---------------------------------------------------------------------------
 * PRA QUE SERVE
 * ---------------------------------------------------------------------------
 * O painel de compra pede o valor em DÓLAR, porque é assim que a pessoa pensa
 * ("vou botar cinquenta") — mas a transação acontece em SOL. Esta é a ponte
 * entre as duas coisas.
 *
 * ---------------------------------------------------------------------------
 * O QUE ACONTECE SE FALHAR
 * ---------------------------------------------------------------------------
 * Devolve `null`, e o painel volta a pedir o valor em SOL, dizendo isso na
 * tela. Nunca chuta uma cotação: um preço de SOL errado vira um tamanho de
 * ordem errado, e quem paga a conta é quem clicou em comprar.
 */

/** O preço do SOL não anda tão rápido a ponto de justificar mais que isso. */
const INTERVALO_MS = 30_000;

export function usePrecoDoSol(): number | null {
  const [preco, setPreco] = useState<number | null>(null);

  useEffect(() => {
    let cancelado = false;

    const ler = async () => {
      try {
        const res = await fetch(`/api/price?address=${SOL_MINT}`, { cache: "no-store" });
        if (!res.ok) return;
        const dados = (await res.json()) as { priceUsd?: number };
        if (!cancelado && typeof dados.priceUsd === "number" && dados.priceUsd > 0) {
          setPreco(dados.priceUsd);
        }
      } catch {
        /* rede oscilou: fica a última cotação conhecida, ou null */
      }
    };

    void ler();
    const timer = window.setInterval(() => void ler(), INTERVALO_MS);

    return () => {
      cancelado = true;
      window.clearInterval(timer);
    };
  }, []);

  return preco;
}
