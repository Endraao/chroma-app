import { NextResponse } from "next/server";

import { buildSwapTransaction, getQuote, type JupiterQuote } from "@/lib/jupiter";

/**
 * Proxy da Jupiter.
 *
 * GET  /api/swap?inputMint=…&outputMint=…&amount=…&slippageBps=… → cotação
 * POST /api/swap  { quote, userPublicKey }                       → transação pronta
 *
 * Passar pelo servidor tem dois motivos: o rate limit da Jupiter é por IP
 * (um IP só em vez de um por usuário) e, quando houver chave paga, ela não
 * pode ficar no bundle do browser.
 *
 * A transação devolvida NÃO inclui a taxa da Chroma — quem anexa as
 * instruções de taxa é o cliente, em `src/lib/solana-swap.ts`, para que o
 * usuário veja exatamente o que está assinando.
 */

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const inputMint = searchParams.get("inputMint");
  const outputMint = searchParams.get("outputMint");
  const amount = searchParams.get("amount");
  const slippageBps = Number(searchParams.get("slippageBps") ?? 300);

  if (!inputMint || !outputMint || !amount) {
    return NextResponse.json(
      { error: "inputMint, outputMint e amount são obrigatórios" },
      { status: 400 },
    );
  }
  if (!/^\d+$/.test(amount) || amount === "0") {
    return NextResponse.json({ error: "amount deve ser um inteiro positivo" }, { status: 400 });
  }

  try {
    const quote = await getQuote({ inputMint, outputMint, amount, slippageBps });
    return NextResponse.json(quote);
  } catch (error) {
    console.warn("[api/swap] cotação falhou:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "falha ao cotar" },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  let body: { quote?: JupiterQuote; userPublicKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }

  if (!body.quote || !body.userPublicKey) {
    return NextResponse.json({ error: "quote e userPublicKey são obrigatórios" }, { status: 400 });
  }

  try {
    const result = await buildSwapTransaction(body.quote, body.userPublicKey);
    return NextResponse.json(result);
  } catch (error) {
    console.warn("[api/swap] montagem falhou:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "falha ao montar transação" },
      { status: 502 },
    );
  }
}
