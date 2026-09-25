"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";

import {
  ABI_DA_CURVA,
  CHROMA_CURVE_EVM,
  curvaEvmDisponivel,
  ehCurvaDaChroma,
  lerCurvaEvm,
  type EstadoDaCurvaEvm,
} from "@/lib/chroma-evm";

/**
 * Esta moeda está na curva da Chroma, e em que ponto dela?
 *
 * O equivalente EVM de `useCurva`. Responde a mesma pergunta que decide por
 * onde o swap passa: enquanto a moeda está na curva ela não existe em DEX
 * nenhuma, então quem vende os tokens é a curva; depois que ela enche e a
 * liquidez migra, a curva para de negociar e o caminho passa a ser a pool.
 *
 * `curva` nulo significa "não é moeda nossa" — que é o caso da imensa maioria
 * das moedas listadas no site.
 */

interface Resultado {
  curva: EstadoDaCurvaEvm | null;
  /** quantos tokens a curva põe à venda; serve de base para o progresso */
  tokenAVenda: bigint | null;
  carregando: boolean;
  podeComprar: boolean;
  /** A pausa NÃO bloqueia a venda: trava que prende quem já está dentro não é proteção. */
  podeVender: boolean;
}

const VAZIO: Resultado = {
  curva: null,
  tokenAVenda: null,
  carregando: false,
  podeComprar: false,
  podeVender: false,
};

export function useCurvaEvm(moeda: string | null | undefined): Resultado {
  const publicClient = usePublicClient();
  const [dados, setDados] = useState<Resultado>(VAZIO);

  /*
   * "Não há o que ler" é DERIVADO, não guardado em estado.
   *
   * Zerar por `setState` dentro do efeito dispara uma renderização em cascata
   * só para chegar ao mesmo valor que já dá pra calcular aqui — e é o que o
   * lint do compilador do React acusa.
   */
  const semCurva = !moeda || !publicClient || !curvaEvmDisponivel();

  useEffect(() => {
    if (semCurva) return;

    let cancelado = false;

    (async () => {
      setDados((d) => ({ ...d, carregando: true }));
      try {
        const contrato = { address: CHROMA_CURVE_EVM as Address, abi: ABI_DA_CURVA } as const;

        /*
         * As três leituras vão juntas porque a tela precisa das três para
         * decidir qualquer coisa. Em sequência, ela mostraria "é da curva" e
         * só depois saberia se dá pra comprar — e piscaria no meio.
         */
        const [bruto, aVenda, pausado] = await Promise.all([
          publicClient.readContract({ ...contrato, functionName: "curvas", args: [moeda as Address] }),
          publicClient.readContract({ ...contrato, functionName: "tokenAVenda" }),
          publicClient.readContract({ ...contrato, functionName: "pausado" }),
        ]);

        if (cancelado) return;

        const estado = lerCurvaEvm(
          bruto as readonly [Address, bigint, bigint, bigint, bigint, bigint, boolean, boolean],
        );

        if (!ehCurvaDaChroma(estado)) {
          setDados(VAZIO);
          return;
        }

        setDados({
          curva: estado,
          tokenAVenda: aVenda as bigint,
          carregando: false,
          // Curva cheia ou migrada não negocia mais: quem negocia é a pool.
          podeComprar: !pausado && !estado.concluida && !estado.migrada,
          podeVender: !estado.concluida && !estado.migrada,
        });
      } catch {
        // Endereço que não é token, ou rede fora: não é curva nossa.
        if (!cancelado) setDados(VAZIO);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [moeda, publicClient, semCurva]);

  return semCurva ? VAZIO : dados;
}
