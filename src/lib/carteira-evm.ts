import "server-only";

import { createPublicClient, erc20Abi, type Address } from "viem";

import { cached, putStale, stale } from "./cache";
import { moedasDaChroma } from "./moedas-da-chroma";
import { transporteRobinhood } from "./rpc-robinhood";
import { universo } from "./tokens";
import type { TokenSummary } from "./types";
import { robinhoodChain } from "./web3";

/**
 * As moedas de uma carteira na Robinhood Chain.
 *
 * A rede não tem lista de moedas por carteira: o nó limita a busca a 30 mil
 * blocos e o Blockscout bloqueia pedidos automáticos. Então a consulta é ao
 * contrário: pergunta o saldo da carteira em cada moeda que o site conhece
 * (vitrine e lançadas na Chroma), tudo numa chamada só. Moeda fora dessa lista
 * não aparece.
 */

/** Multicall3: o mesmo endereço em toda rede EVM, conferido na Robinhood. */
const MULTICALL = "0xcA11bde05977b3631167028862bE2a173976CA11";
const TTL = 30_000;
const RESERVA = 60 * 60_000;
/** A vitrine pode estar sendo refeita: o saldo não fica esperando por ela. */
const ESPERA_DA_VITRINE = 5_000;

const cliente = createPublicClient({
  chain: robinhoodChain,
  transport: transporteRobinhood(),
});

export interface PosicaoNaRobinhood {
  token: TokenSummary;
  quantidade: number;
  valorUsd: number;
}

export async function posicoesNaRobinhood(dono: string): Promise<PosicaoNaRobinhood[]> {
  const chave = dono.toLowerCase();
  return cached(`carteira-evm:${chave}`, TTL, async () => {
    try {
      const posicoes = await lerPosicoes(dono);
      putStale(`carteira-evm-reserva:${chave}`, posicoes, RESERVA);
      return posicoes;
    } catch (erro) {
      const ultimas = stale<PosicaoNaRobinhood[]>(`carteira-evm-reserva:${chave}`);
      if (ultimas) return ultimas;
      throw erro;
    }
  });
}

async function lerPosicoes(dono: string): Promise<PosicaoNaRobinhood[]> {
  const [vitrine, daChroma] = await Promise.all([
    Promise.race([
      universo().catch(() => [] as TokenSummary[]),
      new Promise<TokenSummary[]>((ok) => setTimeout(() => ok([]), ESPERA_DA_VITRINE)),
    ]),
    moedasDaChroma().catch(() => [] as TokenSummary[]),
  ]);

  const porEndereco = new Map<string, TokenSummary>();
  for (const t of [...vitrine, ...daChroma]) {
    if (t.chain === "robinhood") porEndereco.set(t.address.toLowerCase(), t);
  }
  const tokens = [...porEndereco.values()];
  if (tokens.length === 0) return [];

  const saldos = await cliente.multicall({
    multicallAddress: MULTICALL,
    contracts: tokens.map((t) => ({
      address: t.address as Address,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [dono as Address] as const,
    })),
  });
  const comSaldo = tokens.flatMap((token, i) => {
    const saldo = saldos[i];
    return saldo.status === "success" && saldo.result > 0n ? [{ token, bruto: saldo.result }] : [];
  });
  if (comSaldo.length === 0) return [];

  const casas = await cliente.multicall({
    multicallAddress: MULTICALL,
    contracts: comSaldo.map(({ token }) => ({
      address: token.address as Address,
      abi: erc20Abi,
      functionName: "decimals" as const,
    })),
  });

  return comSaldo
    .map(({ token, bruto }, i) => {
      const lido = casas[i];
      const quantidade = Number(bruto) / 10 ** (lido.status === "success" ? lido.result : 18);
      return { token, quantidade, valorUsd: quantidade * token.priceUsd };
    })
    .sort((a, b) => b.valorUsd - a.valorUsd);
}
