"use client";

import { PublicKey } from "@solana/web3.js";

import { useCurvaAtual } from "@/components/trading/CurvaProvider";
import { useCurvaSwap } from "@/hooks/useCurvaSwap";
import { useSolanaSwap } from "@/hooks/useSolanaSwap";
import type { DadosDaCurva } from "@/hooks/useCurva";
import type { TradeSide } from "@/lib/types";

/**
 * Decide por onde a negociação passa e entrega uma interface só.
 *
 * ---------------------------------------------------------------------------
 * POR QUE OS DOIS CAMINHOS SÃO CHAMADOS SEMPRE
 * ---------------------------------------------------------------------------
 * Hook não pode ser condicional — chamar um `useSolanaSwap` só às vezes quebra
 * a ordem dos hooks e o React derruba a tela. Então os dois são chamados, e o
 * que não vale recebe `enabled: false` e não faz requisição nenhuma.
 *
 * Custa duas chamadas de função e zero rede. A alternativa seria duplicar o
 * painel inteiro em dois componentes, e aí cada ajuste de layout teria que ser
 * feito duas vezes — que é o tipo de coisa que fica dessincronizada.
 *
 * ---------------------------------------------------------------------------
 * A REGRA
 * ---------------------------------------------------------------------------
 * Curva viva → nosso programa. Qualquer outro caso → Jupiter. "Qualquer outro
 * caso" inclui moeda que nunca foi nossa, moeda nossa que já migrou pra DEX, e
 * rede onde o programa não existe. Nos três a Jupiter é o certo, e nenhum
 * deles é erro.
 */

interface Opcoes {
  tokenMint: string;
  tokenSymbol?: string;
  side: TradeSide;
  amount: string;
  slippageBps: number;
  affiliate: string | null;
  affiliateRef: string | null;
}

/**
 * Curva vazia, só pra ocupar o lugar quando não há curva nenhuma.
 *
 * Escrita com os tipos de verdade, e não com um `as unknown as`, porque o
 * molde precisa continuar quebrando a compilação se a forma da curva mudar —
 * um atalho aqui esconderia exatamente o erro que o teste de paridade existe
 * pra pegar. `tokenVirtual` é 1 e não 0 pra nenhuma divisão achar um zero.
 */
const CURVA_VAZIA: DadosDaCurva = {
  estado: {
    mint: PublicKey.default,
    criador: PublicKey.default,
    solVirtual: 0n,
    tokenVirtual: 1n,
    solReal: 0n,
    tokenReal: 0n,
    volumeAcumulado: 0n,
    concluida: true,
    migrada: true,
  },
  config: {
    autoridade: PublicKey.default,
    carteiraDaPlataforma: PublicKey.default,
    taxaTotalBps: 0,
    taxaAfiliadoBps: 0,
    pisoPlataformaBps: 0,
    limitesDasFaixas: [0n, 0n, 0n, 0n],
    faixasDoCriadorBps: [0, 0, 0, 0],
    solVirtualInicial: 0n,
    tokenVirtualInicial: 0n,
    tokenAVendaInicial: 0n,
    emissaoTotal: 0n,
    taxaDeLancamento: 0n,
    pausado: false,
  },
  podeComprar: false,
  podeVender: false,
};

export function useTradeSolana(opcoes: Opcoes) {
  const { curva, carregando } = useCurvaAtual();

  /*
   * Enquanto carrega, nenhum dos dois roda. É meio segundo, e evita o pior
   * desfecho: a Jupiter responder "sem rota" pra uma moeda que está na curva,
   * e a pessoa concluir que a moeda dela está quebrada.
   */
  const naCurva = Boolean(curva) && !carregando;

  const daCurva = useCurvaSwap({
    ...opcoes,
    curva: curva ?? CURVA_VAZIA,
    enabled: naCurva,
  });

  const daJupiter = useSolanaSwap({
    ...opcoes,
    enabled: !naCurva && !carregando,
  });

  const ativo = naCurva ? daCurva : daJupiter;

  return {
    ...ativo,
    /** true quando quem está do outro lado é o nosso programa, não uma DEX. */
    naCurva,
    carregandoRota: carregando,
    curva,
  };
}
