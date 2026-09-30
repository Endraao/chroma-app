/**
 * Contrato Chroma × Pons na Robinhood Chain (publicado em 30/09/2026 pela
 * carteira 0x49a8…4E57, autoridade). Lança na fábrica da Pons e negocia na
 * curva dela com a taxa da Chroma — ver contracts/src/ChromaPons.sol e os
 * testes em contracts/test/ChromaPons.t.sol.
 */
import artefato from "@/lib/chroma-pons-artefato.json";
import type { Abi } from "viem";

export const CHROMA_PONS = "0xC2715457A640E0509Fd38A7ee59b0aB61E15Fc4D" as const;
export const FABRICA_DA_PONS = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e" as const;
export const ABI_CHROMA_PONS = artefato.abi as Abi;
