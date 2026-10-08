import { NextResponse } from "next/server";

import { ehMoedaSeria, listTokens, pontuacaoEmAlta } from "@/lib/tokens";

/**
 * As 5 moedas mais quentes do dia pra divulgar (página /divulgar).
 *
 * É a versão SEGURA do "bot que posta sozinho" (pedido do dono, 08/10/2026):
 * o site escolhe as moedas e escreve os textos; a pessoa posta com as próprias
 * mãos. Conta que publica sozinha conteúdo promocional é spam pro X — e é a
 * conta que mais importa.
 *
 * Fora: moeda grande demais (> $300M, não é "descoberta") e Robinhood (o post
 * com compra embutida está testado na Solana).
 */
export const revalidate = 600;

export async function GET() {
  const { tokens } = await listTokens("hot", "solana");
  const quentes = tokens
    .filter((t) => ehMoedaSeria(t) && t.marketCapUsd < 300_000_000)
    .sort((a, b) => pontuacaoEmAlta(b) - pontuacaoEmAlta(a))
    .slice(0, 5)
    .map((t) => ({
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      imageUrl: t.imageUrl ?? null,
      change24h: t.change24h,
      marketCapUsd: t.marketCapUsd,
    }));
  return NextResponse.json(quentes);
}
