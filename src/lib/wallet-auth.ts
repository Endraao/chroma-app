import "server-only";

import { createPublicKey, verify as verifyEd25519 } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { verifyMessage } from "viem";

import type { ChainId } from "./types";

/**
 * Prova de que alguém controla uma carteira, para UMA operação específica:
 * vincular uma segunda rede à conta.
 *
 * ---------------------------------------------------------------------------
 * POR QUE AQUI PEDE ASSINATURA, SE O APELIDO NÃO PEDE
 * ---------------------------------------------------------------------------
 * Não é contradição, é a diferença entre vandalismo e roubo.
 *
 * Trocar o apelido alheio sem assinatura é chato e reversível: o dinheiro
 * continua indo pro endereço certo, porque o endereço não mudou. Por isso o
 * cadastro fica sem fricção — ver `src/lib/accounts.ts`.
 *
 * Vincular uma carteira MUDA PRA ONDE O DINHEIRO VAI. Sem prova, qualquer um
 * plugaria a própria MetaMask no apelido de um divulgador conhecido e passaria
 * a receber as comissões da Robinhood dele. Isso é roubo, e não tem como
 * desfazer depois que a transação saiu.
 *
 * O custo é aceitável porque a assinatura não aparece na porta de entrada:
 * quem só usa uma rede nunca vê essa tela. Ela só existe pra quem já está
 * dentro e escolheu conectar a segunda carteira — exatamente a "assinatura só
 * na troca" que o próprio `accounts.ts` já apontava como caminho.
 *
 * Assinar mensagem NÃO autoriza gastar nada: não é transação, não vai pra rede
 * nenhuma e não dá permissão sobre fundo nenhum.
 */

/** Uma assinatura velha não vale: limita o estrago se a mensagem vazar. */
const VALIDADE_MS = 5 * 60 * 1000;

export interface PedidoAssinado {
  /** endereço que assinou — precisa já pertencer à conta */
  assinante: string;
  /** a mensagem exata que foi assinada */
  mensagem: string;
  /** assinatura em hexadecimal, com ou sem 0x */
  assinatura: string;
}

/**
 * Texto que a pessoa vê na carteira antes de assinar.
 *
 * Gerado pelos dois lados a partir dos mesmos campos, e o servidor confere que
 * a mensagem recebida bate exatamente com a que ele mesmo montaria. Assim não
 * dá pra fazer a pessoa assinar uma coisa e usar a assinatura pra outra.
 */
export function mensagemDeVinculo(params: {
  nickname: string;
  chain: ChainId;
  endereco: string;
  momento: number;
}): string {
  return [
    "Chroma — link wallet",
    "",
    `Account: @${params.nickname}`,
    `Network: ${params.chain}`,
    `Wallet: ${params.endereco}`,
    `Time: ${new Date(params.momento).toISOString()}`,
    "",
    "Signing only proves this wallet is yours.",
    "It does not move funds or grant any permission over them.",
  ].join("\n");
}

/** O texto que a carteira da conta assina pra DESVINCULAR a carteira de uma rede. */
export function mensagemDeDesvinculo(params: { nickname: string; chain: ChainId; momento: number }): string {
  return [
    "Chroma — unlink wallet",
    "",
    `Account: @${params.nickname}`,
    `Network: ${params.chain}`,
    `Time: ${new Date(params.momento).toISOString()}`,
    "",
    "Signing only proves this account is yours.",
    "It does not move funds or grant any permission over them.",
  ].join("\n");
}

/** Extrai o `Momento:` da mensagem pra checar se ainda está no prazo. */
export function momentoDaMensagem(mensagem: string): number | null {
  const linha = /^Time: (.+)$/m.exec(mensagem);
  if (!linha) return null;
  const quando = Date.parse(linha[1]);
  return Number.isFinite(quando) ? quando : null;
}

export function dentroDoPrazo(mensagem: string): boolean {
  const quando = momentoDaMensagem(mensagem);
  if (quando === null) return false;
  const agora = Date.now();
  // Aceita um minuto "no futuro": relógio de máquina cliente adianta.
  return quando <= agora + 60_000 && agora - quando <= VALIDADE_MS;
}

/* ------------------------------------------------------------------ */

function hexParaBytes(hex: string): Uint8Array | null {
  const limpo = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (limpo.length === 0 || limpo.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(limpo)) return null;
  const bytes = new Uint8Array(limpo.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(limpo.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Verifica ed25519 sem dependência nova.
 *
 * O `node:crypto` verifica ed25519 nativamente, mas só aceita a chave em
 * formato SPKI — e a carteira Solana é a chave crua de 32 bytes. Esses 12
 * bytes de prefixo são o cabeçalho DER que diz "isto é uma chave ed25519";
 * colando na frente, a chave crua vira SPKI válido.
 */
const PREFIXO_SPKI = Buffer.from("302a300506032b6570032100", "hex");

function verificarSolana(pedido: PedidoAssinado): boolean {
  let bytesDaChave: Uint8Array;
  try {
    bytesDaChave = new PublicKey(pedido.assinante).toBytes();
  } catch {
    return false; // endereço que nem é chave válida
  }

  const assinatura = hexParaBytes(pedido.assinatura);
  if (!assinatura || assinatura.length !== 64) return false;

  try {
    const chave = createPublicKey({
      key: Buffer.concat([PREFIXO_SPKI, Buffer.from(bytesDaChave)]),
      format: "der",
      type: "spki",
    });
    return verifyEd25519(
      null,
      Buffer.from(pedido.mensagem, "utf8"),
      chave,
      Buffer.from(assinatura),
    );
  } catch {
    return false;
  }
}

async function verificarEvm(pedido: PedidoAssinado): Promise<boolean> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(pedido.assinante)) return false;
  const assinatura = pedido.assinatura.startsWith("0x")
    ? pedido.assinatura
    : `0x${pedido.assinatura}`;
  if (!/^0x[a-fA-F0-9]+$/.test(assinatura)) return false;

  try {
    return await verifyMessage({
      address: pedido.assinante as `0x${string}`,
      message: pedido.mensagem,
      signature: assinatura as `0x${string}`,
    });
  } catch {
    return false;
  }
}

/**
 * Confere a assinatura de acordo com o tipo do endereço que assinou.
 *
 * Solana assina os bytes crus da mensagem; EVM assina com o prefixo do
 * `personal_sign`, que o `verifyMessage` da viem já aplica. São esquemas
 * diferentes, por isso cada um tem o seu caminho.
 */
export async function assinaturaConfere(pedido: PedidoAssinado): Promise<boolean> {
  if (!pedido.assinante || !pedido.mensagem || !pedido.assinatura) return false;
  if (!dentroDoPrazo(pedido.mensagem)) return false;

  return pedido.assinante.startsWith("0x")
    ? verificarEvm(pedido)
    : verificarSolana(pedido);
}
