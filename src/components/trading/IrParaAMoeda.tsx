"use client";

import { useEffect } from "react";

/**
 * Quem abre o link do post fora do X vai direto pra página da moeda. É no
 * navegador, de propósito: o robô do X não roda script, então ele fica nesta
 * página e lê o "player card" dela.
 *
 * No celular (08/10/2026): o app do X no Android não abre a janela de compra
 * dentro do post — ele só abre o link. Então no celular a pessoa cai na MESMA
 * janela de compra (/p/…), em tela cheia, com "Comprar na Phantom" logo de
 * cara, em vez da página inteira da moeda.
 */
export function IrParaAMoeda({ destino, destinoNoCelular }: { destino: string; destinoNoCelular?: string }) {
  useEffect(() => {
    const celular = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    window.location.replace(celular && destinoNoCelular ? destinoNoCelular : destino);
  }, [destino, destinoNoCelular]);
  return (
    <p className="p-8 text-center text-[14px] text-zinc-400">
      <a href={destino} className="font-bold text-marca">
        chromalaunch.fun →
      </a>
    </p>
  );
}
