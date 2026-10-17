"use client";

import { useEffect, useRef, useState } from "react";

import { Preco } from "@/components/ui/Preco";

/**
 * O preço que brilha quando muda (17/10/2026): verde se subiu, vermelho se
 * caiu, e volta à cor normal em menos de um segundo — como nos terminais. A
 * chave muda a cada movimento, então a animação reinicia a cada negócio.
 */
export function PrecoVivo({ valor }: { valor: number }) {
  const anterior = useRef(valor);
  const [movimento, setMovimento] = useState<{ n: number; dir: "sobe" | "desce" | null }>({ n: 0, dir: null });

  useEffect(() => {
    if (valor === anterior.current || !(valor > 0)) return;
    const dir = valor > anterior.current ? "sobe" : "desce";
    anterior.current = valor;
    setMovimento((m) => ({ n: m.n + 1, dir }));
  }, [valor]);

  return (
    <span key={movimento.n} className={movimento.dir === "sobe" ? "fx-sobe" : movimento.dir === "desce" ? "fx-desce" : undefined}>
      $<Preco valor={valor} />
    </span>
  );
}
