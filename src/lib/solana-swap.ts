"use client";

import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
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
 * O saldo mínimo pra uma conta vazia existir na Solana, em lamports.
 *
 * Valor fixo porque é da rede, não nosso: 890.880 lamports por conta sem
 * dados. Consultado ao nó daria o mesmo número e custaria uma ida e volta em
 * todo swap. Se a rede mudar isso um dia, a consequência é só voltarmos a
 * descartar taxa perto do limite — nunca transação recusada, porque o número
 * usado aqui é maior que o real.
 */
const PISO_DE_ALUGUEL = 890_880n;

/** Quais destas contas ainda NÃO existem na rede. */
async function contasInexistentes(
  connection: Connection,
  contas: PublicKey[],
): Promise<Set<string>> {
  if (contas.length === 0) return new Set();

  try {
    const infos = await connection.getMultipleAccountsInfo(contas);
    const faltando = new Set<string>();
    contas.forEach((c, i) => {
      if (!infos[i]) faltando.add(c.toBase58());
    });
    return faltando;
  } catch {
    /*
     * Não deu pra consultar: trata todas como EXISTENTES.
     *
     * É a escolha certa entre os dois erros possíveis. Supor que não existem
     * faria a gente descartar taxa legítima toda vez que o nó oscilasse.
     * Supor que existem, no pior caso, devolve o comportamento antigo — a
     * transação falha e a pessoa tenta de novo.
     */
    return new Set();
  }
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
  /** contas que ainda não existem na rede — ver `PISO_DE_ALUGUEL` */
  inexistentes: Set<string>;
}): TransactionInstruction[] {
  const { payer, split, recipients, inexistentes } = params;

  if (split.totalFee <= 0n) return [];

  const targets: { to: PublicKey; amount: bigint }[] = [
    { to: recipients.platform, amount: split.platformFee },
  ];
  if (recipients.affiliate && split.affiliateFee > 0n) {
    targets.push({ to: recipients.affiliate, amount: split.affiliateFee });
  }

  return targets
    .filter((t) => {
      if (t.amount <= 0n) return false;

      /*
       * -----------------------------------------------------------------
       * CONTA QUE AINDA NÃO EXISTE PRECISA RECEBER O ALUGUEL MÍNIMO
       * -----------------------------------------------------------------
       * Na Solana uma carteira que nunca recebeu nada não existe de fato. Um
       * depósito que a deixe abaixo do mínimo de isenção de aluguel faz a
       * REDE RECUSAR A TRANSAÇÃO INTEIRA, com `InsufficientFundsForRent` —
       * o swap junto.
       *
       * Medido: com o SOL a 116 dólares, isso quebrava toda compra abaixo de
       * 7,98 dólares (taxa da plataforma) e abaixo de 25,26 (fatia do
       * afiliado). O primeiro botão de atalho do painel é 25 dólares — ou
       * seja, um promotor de carteira nova derrubava o atalho mais clicado do
       * site, e pra quem clicou pareceria que a Chroma está quebrada.
       *
       * Aqui a fatia pequena demais é DESCARTADA em vez de derrubar tudo.
       * Perder sete centavos de taxa é infinitamente melhor que perder a
       * transação — e na operação seguinte, com a conta já existindo (ou com
       * valor maior), ela volta a ser cobrada normalmente.
       */
      if (inexistentes.has(t.to.toBase58()) && t.amount < PISO_DE_ALUGUEL) {
        console.warn(
          `[swap] taxa de ${t.amount} lamports não cobrada: ${t.to.toBase58()} ainda não ` +
            `existe na rede e o valor está abaixo do aluguel mínimo (${PISO_DE_ALUGUEL}).`,
        );
        return false;
      }
      return true;
    })
    .map((t) =>
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: t.to,
        lamports: t.amount,
      }),
    );
}

/** De quanto em quanto tempo a transação é reenviada enquanto não confirma. */
const REENVIO_MS = 2_000;
/** De quanto em quanto tempo se pergunta se ela já entrou. */
const CHECAGEM_MS = 1_000;

/**
 * Envia e fica insistindo até confirmar ou o carimbo vencer.
 *
 * ---------------------------------------------------------------------------
 * POR QUE UM ENVIO SÓ NÃO BASTA
 * ---------------------------------------------------------------------------
 * Na Solana, transação enviada não é transação aceita. Em momento de volume os
 * validadores descartam o que não coube, e a sua simplesmente some — sem erro,
 * sem aviso. O que acontecia aqui: mandávamos uma vez, esperávamos, e depois de
 * um minuto a carteira devolvia "Signature has expired: block height exceeded".
 *
 * Isso é especialmente cruel porque a mensagem NÃO diz o que a pessoa precisa
 * saber: se vendeu ou não. Aconteceu de verdade nesta venda, e a resposta só
 * apareceu depois de eu consultar a rede.
 *
 * O jeito certo é insistir. A transação assinada continua válida durante toda a
 * vida do carimbo, então reenviar a MESMA transação não cria risco de vender
 * duas vezes: a rede aceita aquela assinatura uma vez só, e as repetições são
 * descartadas.
 *
 * ---------------------------------------------------------------------------
 * `skipPreflight` NOS REENVIOS
 * ---------------------------------------------------------------------------
 * O primeiro envio passa pela simulação, que é onde erro de verdade aparece
 * cedo (saldo insuficiente, rota inválida). Do segundo em diante ela é pulada:
 * já sabemos que a transação é válida, e simular de novo a cada dois segundos
 * gastaria o nó e ainda poderia falhar por estado momentâneo.
 */
async function enviarInsistindo(
  connection: Connection,
  bruto: Uint8Array,
  carimbo: { blockhash: string; lastValidBlockHeight: number },
  onStep?: (step: string) => void,
): Promise<string> {
  let assinatura: string;

  try {
    assinatura = await connection.sendRawTransaction(bruto, { skipPreflight: false });
  } catch (erro) {
    const texto = erro instanceof Error ? erro.message : String(erro);
    if (/blockhash not found|block height exceeded/i.test(texto)) {
      throw new Error(
        "A ordem expirou enquanto esperava a assinatura. Nada foi cobrado — é só tentar de novo.",
      );
    }
    throw erro;
  }

  onStep?.("Confirmando…");
  let ultimoReenvio = Date.now();

  for (;;) {
    const status = (await connection.getSignatureStatuses([assinatura])).value[0];

    if (status?.err) {
      throw new Error(`transação falhou on-chain: ${JSON.stringify(status.err)}`);
    }
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      return assinatura;
    }

    /*
     * Venceu o carimbo e a transação não entrou? Então ela não vai entrar
     * NUNCA — e isso é uma certeza, não um palpite: sem carimbo válido a rede
     * recusa. Dá pra afirmar com todas as letras que nada foi cobrado.
     */
    const altura = await connection.getBlockHeight("confirmed");
    if (altura > carimbo.lastValidBlockHeight) {
      throw new Error(
        "A rede não incluiu a ordem a tempo e ela expirou. Nada foi cobrado e seus tokens " +
          "continuam com você — é só tentar de novo.",
      );
    }

    if (Date.now() - ultimoReenvio >= REENVIO_MS) {
      ultimoReenvio = Date.now();
      /* Reenviar a MESMA assinatura não duplica: a rede aceita uma vez só. */
      await connection
        .sendRawTransaction(bruto, { skipPreflight: true, maxRetries: 0 })
        .catch(() => {});
    }

    await new Promise((r) => setTimeout(r, CHECAGEM_MS));
  }
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
  /** moeda da Curva da Chroma: taxa do site reduzida (ver fees.ts) */
  naCurvaDaChroma?: boolean;
  onStep?: (step: string) => void;
}

/**
 * Executa o swap ponta a ponta: pede a transação à Jupiter, injeta as
 * instruções de taxa, manda o usuário assinar e envia pra rede.
 */
export async function executeSolanaSwap(req: SwapRequest): Promise<SwapExecution> {
  const { connection, publicKey, signTransaction, quote, grossRaw, inputMint, affiliate, naCurvaDaChroma = false, onStep } =
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

  /*
   * MOEDA NA CURVA DE LANÇAMENTO: direto no programa da curva.
   * A rota da Jupiter para ela, com as duas taxas, passava de 1.232 bytes e a
   * carteira mostrava "reverted during simulation" (29/09/2026, compra de $1
   * com indicação). Direto, a transação é bem menor. Ver `instrucoesNaCurva`.
   */
  const soCurva =
    quote.routePlan.length > 0 && quote.routePlan.every((r) => /^pump\.?fun$/i.test(r.swapInfo.label ?? ""));
  if (soCurva) {
    onStep?.("Montando a ordem…");
    const ehVendaNaCurva = inputMint !== SOL_MINT;
    const { instrucoesNaCurva } = await import("@/lib/pumpfun");
    const tokenMint = new PublicKey(ehVendaNaCurva ? quote.inputMint : quote.outputMint);
    const ixsDaCurva = await instrucoesNaCurva({
      conn: connection,
      usuario: publicKey,
      mint: tokenMint,
      lado: ehVendaNaCurva ? "sell" : "buy",
      lamports: BigInt(ehVendaNaCurva ? quote.outAmount : quote.inAmount),
      tokens: BigInt(ehVendaNaCurva ? quote.inAmount : quote.outAmount),
      slippagePct: Math.max(1, quote.slippageBps / 100),
    });
    const baseNaCurva = ehVendaNaCurva ? BigInt(quote.otherAmountThreshold) : grossRaw;
    const splitNaCurva = computeFeesRaw(baseNaCurva, affiliate, "solana", naCurvaDaChroma);
    const inexistentesNaCurva = await contasInexistentes(
      connection,
      [recipients.platform, recipients.affiliate].filter((c): c is PublicKey => c !== null),
    );
    const taxas = buildFeeInstructions({
      payer: publicKey,
      split: splitNaCurva,
      recipients,
      inexistentes: inexistentesNaCurva,
    });
    const orcamento = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 400_000 }),
    ];
    const carimboCurva = await connection.getLatestBlockhash("confirmed");
    const msgCurva = new TransactionMessage({
      payerKey: publicKey,
      recentBlockhash: carimboCurva.blockhash,
      instructions: ehVendaNaCurva ? [...orcamento, ...ixsDaCurva, ...taxas] : [...orcamento, ...taxas, ...ixsDaCurva],
    });
    const txCurva = new VersionedTransaction(msgCurva.compileToV0Message());

    onStep?.("Aguardando sua assinatura…");
    const assinadaCurva = await signTransaction(txCurva);
    onStep?.("Enviando pra rede…");
    const assinaturaCurva = await enviarInsistindo(connection, assinadaCurva.serialize(), carimboCurva, onStep);
    return {
      signature: assinaturaCurva,
      feePaidRaw: splitNaCurva.totalFee,
      affiliatePaidRaw: splitNaCurva.affiliateFee,
      volumeLamports: baseNaCurva,
    };
  }

  onStep?.("Montando a ordem…");
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
  const split = computeFeesRaw(baseDaTaxa, affiliate, "solana", naCurvaDaChroma);

  const inexistentes = await contasInexistentes(
    connection,
    [recipients.platform, recipients.affiliate].filter((c): c is PublicKey => c !== null),
  );

  const feeInstructions = buildFeeInstructions({
    payer: publicKey,
    split,
    recipients,
    inexistentes,
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

  /*
   * -------------------------------------------------------------------
   * O CARIMBO DE TEMPO É BUSCADO AGORA, NÃO LÁ ATRÁS
   * -------------------------------------------------------------------
   * Toda transação na Solana carrega um `blockhash` recente, e ele vale uns
   * 60 segundos. Antes usávamos o que a Jupiter tinha posto na transação — e
   * esse relógio já estava correndo desde a montagem da rota.
   *
   * Entre montar e assinar tem a pessoa: ela lê o valor, confere o token,
   * pensa. Passando de um minuto, a rede recusava com "Blockhash not found" —
   * uma mensagem que não diz nada a quem só queria comprar, e que culpa quem
   * teve o cuidado de ler antes de assinar.
   *
   * Pegando o carimbo aqui, o minuto começa a contar no instante em que a
   * carteira abre. A janela não fica infinita — não tem como — mas passa a
   * ser inteira da pessoa, em vez de já vir gasta.
   */
  const carimbo = await connection.getLatestBlockhash("confirmed");
  message.recentBlockhash = carimbo.blockhash;

  const rebuilt = new VersionedTransaction(message.compileToV0Message(lookups));

  onStep?.("Aguardando sua assinatura…");
  const signed = await signTransaction(rebuilt);

  onStep?.("Enviando pra rede…");
  const signature = await enviarInsistindo(connection, signed.serialize(), carimbo, onStep);

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
