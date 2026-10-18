import "server-only";

import { http } from "viem";

import { robinhoodChain } from "@/lib/web3";

/**
 * TODO PEDIDO DO SERVIDOR AO NÓ DA ROBINHOOD PASSA POR AQUI (18/10/2026).
 *
 * Na madrugada de 18/10 a VPS caiu duas vezes: o servidor abriu ~6 mil
 * conexões TLS com o nó ao mesmo tempo (Promise.all sem limite + retentativas
 * do viem), a CPU de 1 núcleo foi toda pro aperto de mão TLS e o site deu 503.
 * Aqui há uma fila única por processo: no máximo MAX_ATIVOS pedidos de uma
 * vez; com mais de MAX_FILA esperando, o pedido novo falha NA HORA em vez de
 * empilhar — melhor uma leitura da Robinhood falhar do que o site inteiro cair.
 */
const MAX_ATIVOS = 6;
const MAX_FILA = 200;

let ativos = 0;
const fila: (() => void)[] = [];

async function esperarVez(): Promise<void> {
  if (ativos < MAX_ATIVOS) {
    ativos++;
    return;
  }
  if (fila.length >= MAX_FILA) throw new Error("nó da Robinhood ocupado (fila cheia)");
  await new Promise<void>((libera) => fila.push(libera));
}

function liberarVez() {
  const proximo = fila.shift();
  if (proximo) proximo(); // a vaga passa direto pro próximo da fila
  else ativos--;
}

/** O fetch com fila — pra quem fala com o nó sem passar pelo viem. */
export const fetchDaRobinhood: typeof fetch = async (entrada, opcoes) => {
  await esperarVez();
  try {
    return await fetch(entrada, opcoes);
  } finally {
    liberarVez();
  }
};

export const URL_DO_NO_ROBINHOOD = process.env.ROBINHOOD_RPC || robinhoodChain.rpcUrls.default.http[0];

/** Transporte do viem pro nó da Robinhood, já com a fila. */
export function transporteRobinhood(opcoes: Omit<NonNullable<Parameters<typeof http>[1]>, "fetchFn"> = {}) {
  return http(URL_DO_NO_ROBINHOOD, { ...opcoes, fetchFn: fetchDaRobinhood });
}
