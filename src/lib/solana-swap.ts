"use client";

import {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import { computeFeesRaw } from "./fees";
import { SOL_MINT, type JupiterQuote } from "./jupiter";
import { PLATFORM_FEE_WALLET_SOL } from "./web3";

/**
 * Montagem da transação de swap na Solana, com a taxa da Chroma embutida.
 *
 * ---------------------------------------------------------------------------
 * COMO O AFILIADO RECEBE "NO MESMO BLOCO"
 * ---------------------------------------------------------------------------
 * Uma transação Solana é atômica: ou todas as instruções confirmam juntas, ou
 * nenhuma confirma. Então basta colocar as transferências de taxa DENTRO da
 * mesma transação que a Jupiter montou. Não existe custódia, não existe saque,
 * não existe "a plataforma te paga depois" — o dinheiro sai da carteira do
 * comprador e chega na do afiliado no mesmo slot em que o swap acontece.
 *
 * A ordem é: taxa primeiro, swap depois. Se o usuário não tiver saldo pra
 * taxa, a transação inteira falha antes de qualquer swap acontecer.
 *
 * O valor cotado na Jupiter já é o LÍQUIDO (bruto menos 1%), então o usuário
 * recebe exatamente o que a tela mostrou.
 */

/** Descompacta uma transação versionada resolvendo as Address Lookup Tables. */
async function decompile(connection: Connection, tx: VersionedTransaction) {
  const lookups: AddressLookupTableAccount[] = [];

  for (const lookup of tx.message.addressTableLookups) {
    const account = await connection.getAddressLookupTable(lookup.accountKey);
    if (!account.value) {
      throw new Error(`Address lookup table ${lookup.accountKey.toBase58()} não encontrada`);
    }
    lookups.push(account.value);
  }

  const message = TransactionMessage.decompile(tx.message, {
    addressLookupTableAccounts: lookups,
  });

  return { message, lookups };
}

/**
 * SPL clássico ou Token-2022? O program id muda as instruções de transferência.
 * Vem dos metadados da Jupiter (`/api/token-meta`) pra não gastar uma chamada
 * de RPC — e porque o RPC público bloqueia o browser de qualquer jeito.
 */
function tokenProgramFrom(tokenProgram: string | null): PublicKey {
  if (tokenProgram === TOKEN_2022_PROGRAM_ID.toBase58()) return TOKEN_2022_PROGRAM_ID;
  return TOKEN_PROGRAM_ID;
}

interface FeeRecipients {
  platform: PublicKey;
  affiliate: PublicKey | null;
}

/**
 * Instruções que pagam a taxa.
 *
 * - Entrada em SOL (compra): transferência nativa, simples e barata.
 * - Entrada em token (venda): transferência SPL. Se a carteira de destino
 *   ainda não tiver conta desse token, a instrução idempotente cria — e o
 *   custo de aluguel (~0,002 SOL) sai do usuário. É o preço de cobrar a taxa
 *   na moeda de entrada; a alternativa seria cobrar na saída, que só é
 *   conhecida depois da execução.
 */
function buildFeeInstructions(params: {
  payer: PublicKey;
  inputMint: string;
  tokenProgram: string | null;
  grossRaw: bigint;
  affiliate: string | null;
  recipients: FeeRecipients;
}): TransactionInstruction[] {
  const { payer, inputMint, tokenProgram, grossRaw, affiliate, recipients } = params;
  const split = computeFeesRaw(grossRaw, affiliate, "solana");

  if (split.totalFee <= 0n) return [];

  const targets: { to: PublicKey; amount: bigint }[] = [
    { to: recipients.platform, amount: split.platformFee },
  ];
  if (recipients.affiliate && split.affiliateFee > 0n) {
    targets.push({ to: recipients.affiliate, amount: split.affiliateFee });
  }

  // Compra: a taxa é em SOL nativo.
  if (inputMint === SOL_MINT) {
    return targets
      .filter((t) => t.amount > 0n)
      .map((t) =>
        SystemProgram.transfer({
          fromPubkey: payer,
          toPubkey: t.to,
          lamports: t.amount,
        }),
      );
  }

  // Venda: a taxa é no próprio token.
  const mint = new PublicKey(inputMint);
  const programId = tokenProgramFrom(tokenProgram);
  const source = getAssociatedTokenAddressSync(mint, payer, true, programId);

  const instructions: TransactionInstruction[] = [];
  for (const target of targets) {
    if (target.amount <= 0n) continue;
    const destination = getAssociatedTokenAddressSync(mint, target.to, true, programId);
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(payer, destination, target.to, mint, programId),
      createTransferInstruction(source, destination, payer, target.amount, [], programId),
    );
  }
  return instructions;
}

export interface SwapExecution {
  signature: string;
  feePaidRaw: bigint;
  affiliatePaidRaw: bigint;
}

export interface SwapRequest {
  connection: Connection;
  publicKey: PublicKey;
  signTransaction: <T extends VersionedTransaction>(tx: T) => Promise<T>;
  quote: JupiterQuote;
  /** valor BRUTO que o usuário digitou, em unidades brutas */
  grossRaw: bigint;
  inputMint: string;
  /** program id do mint de entrada, vindo de /api/token-meta */
  tokenProgram: string | null;
  affiliate: string | null;
  onStep?: (step: string) => void;
}

/**
 * Executa o swap ponta a ponta: pede a transação à Jupiter, injeta as
 * instruções de taxa, manda o usuário assinar e envia pra rede.
 */
export async function executeSolanaSwap(req: SwapRequest): Promise<SwapExecution> {
  const { connection, publicKey, signTransaction, quote, grossRaw, inputMint, tokenProgram, affiliate, onStep } =
    req;

  if (!PLATFORM_FEE_WALLET_SOL) {
    throw new Error(
      "Carteira de taxa da plataforma não configurada. Defina NEXT_PUBLIC_PLATFORM_FEE_WALLET_SOL no .env.local.",
    );
  }

  const recipients: FeeRecipients = {
    platform: new PublicKey(PLATFORM_FEE_WALLET_SOL),
    affiliate: affiliate ? safePublicKey(affiliate) : null,
  };

  onStep?.("Montando a rota na Jupiter…");
  const buildRes = await fetch("/api/swap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ quote, userPublicKey: publicKey.toBase58() }),
  });
  const build = await buildRes.json();
  if (!buildRes.ok) throw new Error(build?.error ?? "falha ao montar a transação");

  const raw = Buffer.from(build.swapTransaction as string, "base64");
  const swapTx = VersionedTransaction.deserialize(raw);

  onStep?.("Anexando a taxa à mesma transação…");
  const { message, lookups } = await decompile(connection, swapTx);

  const feeInstructions = buildFeeInstructions({
    payer: publicKey,
    inputMint,
    tokenProgram,
    grossRaw,
    affiliate: recipients.affiliate ? affiliate : null,
    recipients,
  });

  /*
   * As instruções de compute budget da Jupiter precisam continuar no começo,
   * senão o runtime ignora os limites que ela calculou. Por isso a taxa entra
   * logo DEPOIS delas, e não na posição zero.
   */
  const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";
  let insertAt = 0;
  while (
    insertAt < message.instructions.length &&
    message.instructions[insertAt].programId.toBase58() === COMPUTE_BUDGET
  ) {
    insertAt++;
  }
  message.instructions.splice(insertAt, 0, ...feeInstructions);

  const rebuilt = new VersionedTransaction(message.compileToV0Message(lookups));

  onStep?.("Aguardando sua assinatura…");
  const signed = await signTransaction(rebuilt);

  onStep?.("Enviando pra rede…");
  const signature = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  onStep?.("Confirmando…");
  const latest = await connection.getLatestBlockhash();
  const confirmation = await connection.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: build.lastValidBlockHeight ?? latest.lastValidBlockHeight,
    },
    "confirmed",
  );

  if (confirmation.value.err) {
    throw new Error(`transação falhou on-chain: ${JSON.stringify(confirmation.value.err)}`);
  }

  const split = computeFeesRaw(grossRaw, affiliate, "solana");
  return { signature, feePaidRaw: split.totalFee, affiliatePaidRaw: split.affiliateFee };
}

/** Link de afiliado pode vir com lixo na URL: não deixa isso derrubar o swap. */
function safePublicKey(value: string): PublicKey | null {
  try {
    return new PublicKey(value);
  } catch {
    console.warn("[swap] endereço de afiliado inválido, taxa vai inteira pra plataforma:", value);
    return null;
  }
}
