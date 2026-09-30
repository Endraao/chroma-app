import { NextResponse } from "next/server";

import { fetchPrice } from "@/lib/market";
import { lerMoedaDaCurvaEvm, precoEmEth } from "@/lib/curva-evm";
import { precosNativos } from "@/lib/precos-nativos";
import { cached } from "@/lib/cache";

/**
 * GET /api/price?address=… → só o preço em USD.
 *
 * É o endpoint mais chamado da aplicação (o gráfico bate a cada poucos
 * segundos), por isso devolve o mínimo possível e conta com o cache de 3s
 * do lado do servidor — mil usuários na mesma página viram uma requisição
 * à Dexscreener a cada 3 segundos, não mil.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "parâmetro 'address' é obrigatório" }, { status: 400 });
  }

  /*
   * Moeda na curva da Chroma: o preço é o da curva. Sem isto a rota devolvia
   * 502, o gráfico pedia de novo a cada 3 s e a vela nunca andava ao vivo.
   */
  /*
   * Moeda da Solana na curva de lançamento: preço lido da própria curva, que
   * só muda com negócio. A cotação da Jupiter oscila sozinha em moeda rasa e
   * o gráfico "andava" sem ninguém negociar (30/09/2026).
   */
  if (!address.startsWith("0x")) {
    const naCurva = await cached(`preco-curva-sol:${address}`, 2_500, async () => {
      const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC;
      if (!rpc?.startsWith("http")) return null;
      const [{ Connection, PublicKey }, { precoNaCurvaEmSol }] = await Promise.all([
        import("@solana/web3.js"),
        import("@/lib/pumpfun"),
      ]);
      const emSol = await precoNaCurvaEmSol(new Connection(rpc, "confirmed"), new PublicKey(address));
      if (emSol === null) return null;
      const sol = (await precosNativos().catch(() => null))?.solana ?? 0;
      return sol > 0 ? { usd: emSol * sol, sol: emSol } : null;
    }).catch((e) => {
      console.warn("[price] curva sol falhou:", e);
      return null;
    });
    // priceSol: o gráfico só mexe a vela quando ELE muda (houve negócio) —
    // o dólar sozinho oscila com o SOL e desenhava velas sem ninguém negociar.
    if (naCurva) return NextResponse.json({ address, priceUsd: naCurva.usd, priceSol: naCurva.sol, at: Date.now() });
  }

  const daCurva = address.startsWith("0x") ? await lerMoedaDaCurvaEvm(address).catch(() => null) : null;
  if (daCurva && !daCurva.curva.migrada) {
    const eth = (await precosNativos().catch(() => null))?.robinhood ?? 0;
    const priceUsd = precoEmEth(daCurva.curva) * eth;
    if (priceUsd > 0) return NextResponse.json({ address, priceUsd, at: Date.now() });
  }

  const price = await fetchPrice(address);
  if (price === null) {
    return NextResponse.json({ error: "Preço indisponível no momento." }, { status: 502 });
  }

  return NextResponse.json({ address, priceUsd: price, at: Date.now() });
}
