/**
 * Como a comissão de indicação chega no promotor.
 *
 * ---------------------------------------------------------------------------
 * DUAS FORMAS, E A DIFERENÇA É DE CUSTÓDIA — NÃO DE INTERFACE
 * ---------------------------------------------------------------------------
 *
 * "instant" (o que está ligado hoje)
 *   A fatia do afiliado é transferida DENTRO da transação de swap, direto pra
 *   carteira dele, no mesmo bloco. A Chroma nunca segura o dinheiro. É o que
 *   sustenta a frase "não-custodial" que está na home, e é verificável: cada
 *   pagamento tem um hash de transação que qualquer um confere no explorador.
 *
 * "accrual" (o modelo de "acumular e sacar", como o Cashback do pump.fun)
 *   A comissão se acumula e o promotor clica em "resgatar". Melhor de usar —
 *   dá pra acompanhar o quanto rendeu, sem poeira de centavos chegando na
 *   carteira a cada trade.
 *
 *   Mas o dinheiro precisa ficar em ALGUM lugar até o resgate, e aí estão os
 *   dois caminhos possíveis:
 *
 *     a) numa carteira da plataforma → a Chroma vira CUSTODIANTE do dinheiro
 *        dos promotores. Muda o enquadramento legal (guarda de valores de
 *        terceiros), e o promotor passa a depender da sua boa-fé pra receber.
 *        É exatamente a desconfiança que o modelo atual evita.
 *
 *     b) num cofre on-chain (programa Anchor com PDA por promotor) → continua
 *        não-custodial, porque só o dono consegue sacar o próprio saldo. Mas
 *        exige escrever, auditar e publicar esse programa. É trabalho de
 *        verdade, na mesma fila da curva de bonding.
 *
 * Enquanto a decisão não for tomada, fica em "instant": a interface do perfil
 * mostra o que já foi pago, com os hashes. Trocar pra "accrual" sem o cofre
 * do item (b) significaria escolher o item (a) por omissão — e isso não deve
 * acontecer por descuido.
 */
export type PayoutMode = "instant" | "accrual";

export const PAYOUT_MODE: PayoutMode = "instant";

/** Endereço do programa de cofre. Vazio = o modo "accrual" não pode rodar. */
export const AFFILIATE_VAULT_PROGRAM = process.env.NEXT_PUBLIC_AFFILIATE_VAULT_PROGRAM || "";

/** O modo escolhido está de fato operacional? */
export function payoutReady(): boolean {
  if (PAYOUT_MODE === "instant") return true;
  return Boolean(AFFILIATE_VAULT_PROGRAM);
}
