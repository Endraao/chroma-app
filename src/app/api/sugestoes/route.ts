import { NextResponse } from "next/server";

import { getTokenMeta } from "@/lib/jupiter";
import { ehMoedaSeria, listTokens, pontuacaoEmAlta } from "@/lib/tokens";
import type { TokenSummary } from "@/lib/types";

/**
 * As moedas mais quentes do dia pra divulgar (página /divulgar): 12 da Solana
 * e 4 da Robinhood (pedido do dono, 08/10/2026: "bota mais moedas").
 *
 * É a versão SEGURA do "bot que posta sozinho": o site escolhe as moedas e
 * escreve os textos; a pessoa posta com as próprias mãos. Conta que publica
 * sozinha conteúdo promocional é spam pro X.
 *
 * Fora: moeda grande demais (> $300M, não é "descoberta").
 */
export const revalidate = 600;

function melhores(tokens: TokenSummary[], quantas: number) {
  return tokens
    .filter((t) => ehMoedaSeria(t) && t.marketCapUsd < 300_000_000)
    .sort((a, b) => pontuacaoEmAlta(b) - pontuacaoEmAlta(a))
    .slice(0, quantas)
    .map((t) => ({
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      imageUrl: t.imageUrl ?? null,
      change24h: t.change24h,
      marketCapUsd: t.marketCapUsd,
      chain: t.chain,
      // O X da moeda — muitas vezes já é o link da COMUNIDADE (x.com/i/communities/…).
      twitter: t.twitter ?? null,
    }));
}

export async function GET() {
  const [sol, rh] = await Promise.all([listTokens("hot", "solana"), listTokens("hot", "robinhood")]);
  const lista = [...melhores(sol.tokens, 12), ...melhores(rh.tokens, 4)];
  /*
   * O X DA PRÓPRIA MOEDA, pela Jupiter (a vitrine não traz). É o que garante a
   * comunidade CERTA: buscar "$LOBBY" no X levou à comunidade de OUTRA moeda
   * com o mesmo nome (08/10/2026) — postar CA errado ali parece golpe.
   */
  const comX = await Promise.all(
    lista.map(async (m) => {
      if (m.twitter || m.chain !== "solana") return m;
      const meta = await getTokenMeta(m.address).catch(() => null);
      return { ...m, twitter: meta?.twitter ?? null };
    }),
  );
  return NextResponse.json(comX);
}
