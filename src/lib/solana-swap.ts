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
 * A ORDEM DEPENDE DO SENTIDO, e isso importa:
 *
 * - **Compra**: taxa primeiro, swap depois. A taxa sai do SOL que a pessoa já
 *   tem; se não tiver saldo, a transação inteira falha antes de qualquer swap.
 * - **Venda**: swap primeiro, taxa depois. O SOL que a taxa cobra só passa a
 *   existir depois da troca — cobrada antes, ela sairia do saldo que a pessoa
 *   já tinha na carteira, e não do dinheiro da venda.
 *
 * Nos dois casos a taxa é em SOL. O motivo está em `buildFeeInstructions`.
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

interface FeeRecipients {
  platform: PublicKey;
  affiliate: PublicKey | null;
}

/**
 * Instruções que pagam a taxa — sempre em SOL nativo.
 *
 * ---------------------------------------------------------------------------
 * POR QUE SEMPRE EM SOL, E NÃO NA MOEDA QUE ENTRA
 * ---------------------------------------------------------------------------
 * Antes a taxa saía do que ENTRAVA na transação. Na compra entra SOL e estava
 * tudo certo; na venda entra a meme coin, e aí saíam três problemas — o
 * segundo grave:
 *
 *   1. A carteira da plataforma juntava meme coin em vez de SOL, e cada uma
 *      teria que ser vendida na mão depois.
 *   2. O AFILIADO recebia em token, mas o painel de ganhos escreve o número
 *      com o símbolo da rede. Uma comissão de 3.000 unidades de uma moeda de
 *      um centavo aparecia como "3.000 SOL" — uns 355 mil dólares — e era esse
 *      número que liberava o botão de sacar.
 *   3. O gráfico de volume do afiliado somava unidade de token com unidade de
 *      SOL no mesmo total.
 *
 * Agora a venda cobra do que SAI: o swap acontece inteiro e, na mesma
 * transação, uma fatia do SOL recebido vai pra plataforma e pro afiliado. É o
 * mesmo desenho que a curva da Chroma sempre usou.
 *
 * De quebra some a criação de conta de token pro destinatário, que custava
 * ~0,002 SOL de aluguel do bolso de quem vendia.
 */
function buildFeeInstructions(params: {
  payer: PublicKey;
  split: { totalFee: bigint; platformFee: bigint; affiliateFee: bigint };
  recipients: FeeRecipients;
}): TransactionInstruction[] {
  const { payer, split, recipients } = params;

  if (split.totalFee <= 0n) return [];

  const targets: { to: PublicKey; amount: bigint }[] = [
    { to: recipients.platform, amount: split.platformFee },
  ];
  if (recipients.affiliate && split.affiliateFee > 0n) {
    targets.push({ to: recipients.affiliate, amount: split.affiliateFee });
  }

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

export interface SwapExecution {
  signature: string;
  /** SEMPRE em lamports, nos dois sentidos. */
  feePaidRaw: bigint;
  /** SEMPRE em lamports, nos dois sentidos. */
  affiliatePaidRaw: bigint;
  /**
   * O tamanho do negócio em lamports — o que a taxa mediu.
   *
   * Existe pro painel do afiliado, que soma volume de várias operações num
   * total só. Sem ele, quem chama teria que adivinhar a unidade a partir do
   * sentido do swap, e era aí que o painel somava token com SOL.
   */
  volumeLamports: bigint;
}

export interface SwapRequest {
  connection: Connection;
  publicKey: PublicKey;
  signTransaction: <T extends VersionedTransaction>(tx: T) => Promise<T>;
  quote: JupiterQuote;
  /** valor BRUTO que o usuário digitou, em unidades brutas */
  grossRaw: bigint;
  inputMint: string;
  affiliate: string | null;
  onStep?: (step: string) => void;
}

/**
 * Executa o swap ponta a ponta: pede a transação à Jupiter, injeta as
 * instruções de taxa, manda o usuário assinar e envia pra rede.
 */
export async function executeSolanaSwap(req: SwapRequest): Promise<SwapExecution> {
  const { connection, publicKey, signTransaction, quote, grossRaw, inputMint, affiliate, onStep } =
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

  /*
   * -------------------------------------------------------------------
   * SOBRE O QUE A TAXA É COBRADA
   * -------------------------------------------------------------------
   * Compra: sobre o SOL que a pessoa mandou. Número conhecido e exato.
   *
   * Venda: sobre o SOL que ela vai receber — que só é conhecido depois da
   * execução. Usamos o `otherAmountThreshold`, que é o MÍNIMO que a Jupiter
   * garante, e não o valor esperado.
   *
   * A escolha é deliberada e custa dinheiro pra nós: quando a execução sai
   * melhor que o mínimo, cobramos um pouco menos que 0,95%. O contrário —
   * cobrar sobre o esperado — significaria que, numa execução pior que a
   * prevista, a diferença sairia do SOL que a pessoa já tinha na carteira.
   * Cobrar a mais de quem acabou de levar uma execução ruim é o tipo de coisa
   * que ninguém percebe na hora e todo mundo descobre depois.
   */
  const ehVenda = inputMint !== SOL_MINT;
  const baseDaTaxa = ehVenda ? BigInt(quote.otherAmountThreshold) : grossRaw;
  const split = computeFeesRaw(baseDaTaxa, affiliate, "solana");

  const feeInstructions = buildFeeInstructions({
    payer: publicKey,
    split,
    recipients,
  });

  if (ehVenda) {
    /*
     * Na venda a taxa entra DEPOIS do swap, no fim da transação.
     *
     * O SOL que ela cobra só existe depois da troca acontecer. Posta antes, a
     * transferência tiraria do saldo que a pessoa já tinha na carteira — ou
     * falharia, se ela estivesse sem saldo. Depois, sai do dinheiro da própria
     * venda, que é o certo.
     */
    message.instructions.push(...feeInstructions);
  } else {
    /*
     * Na compra entra no começo, logo depois do compute budget da Jupiter.
     *
     * Essas instruções de orçamento precisam continuar em primeiro lugar,
     * senão o runtime ignora os limites que ela calculou — por isso a taxa não
     * vai na posição zero.
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
  }

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

  return {
    signature,
    feePaidRaw: split.totalFee,
    affiliatePaidRaw: split.affiliateFee,
    volumeLamports: baseDaTaxa,
  };
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
