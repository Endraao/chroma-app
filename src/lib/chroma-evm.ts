import type { Address } from "viem";

/**
 * A ponte entre o site e os contratos da Chroma na Robinhood Chain.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTE ARQUIVO É, E O QUE NÃO É
 * ---------------------------------------------------------------------------
 * É o equivalente EVM de `chroma-program.ts`: endereços, ABI e os tipos do que
 * a rede devolve. Nada mais — quem monta transação são os hooks.
 *
 * Os contratos existiam há tempos, com 55 testes passando, e o site não tinha
 * UMA linha que falasse com eles: nenhum endereço, nenhum ABI. Lançar moeda em
 * `/create` ficava travado em `chain !== "solana"` e o swap mostrava "em
 * breve". Os dois lados estavam prontos e não se conheciam.
 *
 * ---------------------------------------------------------------------------
 * POR QUE O ABI É ESCRITO À MÃO E NÃO IMPORTADO DO BUILD
 * ---------------------------------------------------------------------------
 * `contracts/out/ChromaCurve.sol/ChromaCurve.json` tem o ABI inteiro mais
 * bytecode e metadados — centenas de kilobytes que iriam parar no pacote do
 * navegador para usar oito funções.
 *
 * Escrito aqui, entra no bundle só o que é usado, e o `as const` deixa o viem
 * inferir os tipos de argumento e de retorno. O preço é o mesmo de
 * `chroma-program.ts`: mudou a assinatura no contrato, muda aqui. Por isso as
 * assinaturas abaixo são cópia literal do que `forge build` gerou.
 */

/* ------------------------------------------------------------------ */
/* Endereços                                                           */
/* ------------------------------------------------------------------ */

/**
 * Vazio significa NÃO PUBLICADO, e é o estado de hoje.
 *
 * Quem consome checa `curvaEvmDisponivel()` antes de oferecer qualquer ação.
 * Sem isso, a tela ofereceria um botão que monta uma transação para o endereço
 * zero — que a carteira aceita assinar e a rede recusa, com um erro que não
 * diz nada a quem clicou.
 */
export const CHROMA_CURVE_EVM = (process.env.NEXT_PUBLIC_CHROMA_CURVE_EVM ?? "") as Address | "";
export const CHROMA_ROUTER_EVM = (process.env.NEXT_PUBLIC_CHROMA_ROUTER_EVM ?? "") as Address | "";

const ENDERECO_VALIDO = /^0x[0-9a-fA-F]{40}$/;

/** Há curva publicada nesta rede? */
export function curvaEvmDisponivel(): boolean {
  return ENDERECO_VALIDO.test(CHROMA_CURVE_EVM);
}

/** Há roteador de swap publicado nesta rede? */
export function roteadorEvmDisponivel(): boolean {
  return ENDERECO_VALIDO.test(CHROMA_ROUTER_EVM);
}

/* ------------------------------------------------------------------ */
/* ABI da curva                                                        */
/* ------------------------------------------------------------------ */

export const ABI_DA_CURVA = [
  {
    type: "function",
    name: "lancar",
    stateMutability: "payable",
    inputs: [
      { name: "nome", type: "string" },
      { name: "simbolo", type: "string" },
      { name: "uri", type: "string" },
    ],
    outputs: [{ name: "moeda", type: "address" }],
  },
  {
    type: "function",
    name: "comprar",
    stateMutability: "payable",
    inputs: [
      { name: "moeda", type: "address" },
      { name: "minTokens", type: "uint256" },
      { name: "afiliado", type: "address" },
    ],
    outputs: [{ name: "tokens", type: "uint256" }],
  },
  {
    type: "function",
    name: "vender",
    stateMutability: "nonpayable",
    inputs: [
      { name: "moeda", type: "address" },
      { name: "tokens", type: "uint256" },
      { name: "minEth", type: "uint256" },
      { name: "afiliado", type: "address" },
    ],
    outputs: [{ name: "liquido", type: "uint256" }],
  },
  {
    type: "function",
    name: "migrar",
    stateMutability: "nonpayable",
    inputs: [{ name: "moeda", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "cotarCompra",
    stateMutability: "view",
    inputs: [
      { name: "moeda", type: "address" },
      { name: "ethBruto", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "cotarVenda",
    stateMutability: "view",
    inputs: [
      { name: "moeda", type: "address" },
      { name: "tokens", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    /*
     * O estado da curva de uma moeda.
     *
     * A ordem dos campos é a do struct em `ChromaCurve.sol` e NÃO pode ser
     * reordenada aqui: o viem devolve a tupla por posição, não por nome.
     * Trocar dois campos de lugar não dá erro de compilação — dá número certo
     * no lugar errado, que é o pior tipo de defeito numa tela de preço.
     */
    type: "function",
    name: "curvas",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "criador", type: "address" },
      { name: "ethVirtual", type: "uint256" },
      { name: "tokenVirtual", type: "uint256" },
      { name: "ethReal", type: "uint256" },
      { name: "tokenReal", type: "uint256" },
      { name: "volumeAcumulado", type: "uint256" },
      { name: "concluida", type: "bool" },
      { name: "migrada", type: "bool" },
    ],
  },
] as const;

/* ------------------------------------------------------------------ */
/* Estado da curva                                                     */
/* ------------------------------------------------------------------ */

export interface EstadoDaCurvaEvm {
  criador: Address;
  ethVirtual: bigint;
  tokenVirtual: bigint;
  ethReal: bigint;
  tokenReal: bigint;
  volumeAcumulado: bigint;
  concluida: boolean;
  migrada: boolean;
}

/** Curva que nunca existiu devolve criador zerado — não é curva da Chroma. */
export const ENDERECO_ZERO = "0x0000000000000000000000000000000000000000" as const;

export function ehCurvaDaChroma(estado: EstadoDaCurvaEvm | null): boolean {
  return Boolean(estado) && estado!.criador !== ENDERECO_ZERO;
}

/**
 * Converte a tupla que o viem devolve no objeto nomeado.
 *
 * Existe para que a ordem do struct seja lida em UM lugar só. Espalhar
 * `resultado[3]` pelos componentes faria cada um deles depender da ordem, e
 * uma mudança no contrato quebraria todos em silêncio.
 */
export function lerCurvaEvm(
  bruto: readonly [Address, bigint, bigint, bigint, bigint, bigint, boolean, boolean],
): EstadoDaCurvaEvm {
  const [
    criador,
    ethVirtual,
    tokenVirtual,
    ethReal,
    tokenReal,
    volumeAcumulado,
    concluida,
    migrada,
  ] = bruto;

  return {
    criador,
    ethVirtual,
    tokenVirtual,
    ethReal,
    tokenReal,
    volumeAcumulado,
    concluida,
    migrada,
  };
}

/**
 * Quanto da emissão à venda já saiu, de 0 a 100.
 *
 * Mesma conta da Solana, e pelo mesmo motivo: a curva fecha quando o último
 * token à venda sai, não quando junta um valor redondo de ETH. Medir em ETH
 * daria um número que muda de sentido conforme o preço anda.
 */
export function progressoDaCurvaEvm(estado: EstadoDaCurvaEvm, tokenAVenda: bigint): number {
  if (tokenAVenda <= 0n) return 0;
  const vendidos = tokenAVenda > estado.tokenReal ? tokenAVenda - estado.tokenReal : 0n;
  return Number((vendidos * 10_000n) / tokenAVenda) / 100;
}
