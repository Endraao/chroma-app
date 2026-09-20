import { detectChainFromAddress } from "./utils";
import type { ChainId } from "./types";

/**
 * Descobre a rede pelo FORMATO do endereço.
 *
 * `detectChainFromAddress` responde "solana" ou "evm" — que é família de
 * rede, não rede. Como a Chroma só tem uma rede EVM, "evm" só pode ser a
 * Robinhood Chain. Se um dia entrar outra EVM, esta função para de conseguir
 * decidir sozinha e vai precisar de contexto — e é bom que o problema apareça
 * num lugar só.
 *
 * Mora fora de `utils.ts` porque `chain-icons` e `web3` já importam tipos
 * daqui e não podem depender do lado do servidor.
 */
export function REDE_DO_ENDERECO(endereco: string): ChainId | null {
  const familia = detectChainFromAddress(endereco);
  if (familia === "solana") return "solana";
  if (familia === "evm") return "robinhood";
  return null;
}
