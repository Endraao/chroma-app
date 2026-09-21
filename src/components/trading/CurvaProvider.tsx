"use client";

import { createContext, useContext, useMemo } from "react";

import { useCurva, type DadosDaCurva } from "@/hooks/useCurva";

/**
 * Lê a curva UMA vez por página e reparte entre quem precisa.
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO CADA COMPONENTE CHAMAR O HOOK
 * ---------------------------------------------------------------------------
 * Três lugares da página da moeda precisam do mesmo dado: o selo no cabeçalho,
 * o painel de progresso e o painel de swap (que decide por onde negociar).
 *
 * Com cada um chamando `useCurva` por conta própria, a mesma página abria três
 * pares de consultas ao nó e mantinha três assinaturas na mesma conta — e, pior
 * que o desperdício, eles podiam divergir por um instante: o cabeçalho dizendo
 * uma coisa enquanto o swap achava outra. Numa tela onde as pessoas decidem
 * comprar, duas versões do mesmo número é defeito, não detalhe.
 */

interface ValorDaCurva {
  curva: DadosDaCurva | null;
  carregando: boolean;
  /** 0 a 100, ou null quando a moeda não é da curva */
  progresso: number | null;
}

const VAZIO: ValorDaCurva = { curva: null, carregando: false, progresso: null };

const CurvaContext = createContext<ValorDaCurva>(VAZIO);

export function CurvaProvider({
  mint,
  children,
}: {
  mint: string;
  children: React.ReactNode;
}) {
  const { curva, carregando } = useCurva(mint);

  const valor = useMemo<ValorDaCurva>(() => {
    if (!curva) return { curva: null, carregando, progresso: null };

    /*
     * A conta é em TOKENS VENDIDOS, não em SOL arrecadado.
     *
     * A curva fecha quando o último token à venda sai, não quando junta um
     * valor redondo de SOL. Medir em SOL daria um número aproximado que muda de
     * sentido conforme o preço anda; em tokens é exato e é o mesmo critério que
     * o programa usa pra marcar a curva como concluída.
     */
    const aVenda = curva.config.tokenAVendaInicial;
    const vendidos = aVenda > curva.estado.tokenReal ? aVenda - curva.estado.tokenReal : 0n;

    const progresso = aVenda > 0n ? Number((vendidos * 10_000n) / aVenda) / 100 : 0;

    return { curva, carregando, progresso };
  }, [curva, carregando]);

  return <CurvaContext.Provider value={valor}>{children}</CurvaContext.Provider>;
}

/**
 * A curva desta página, se houver.
 *
 * Fora do provedor devolve vazio em vez de quebrar: um componente sem curva
 * simplesmente não desenha nada de curva, que é o comportamento certo pra
 * qualquer moeda de mercado.
 */
export function useCurvaAtual(): ValorDaCurva {
  return useContext(CurvaContext);
}
