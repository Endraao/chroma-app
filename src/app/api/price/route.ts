import { NextResponse } from "next/server";

import { fetchPrice } from "@/lib/market";
import { lerMoedaDaCurvaEvm, precoEmEth } from "@/lib/curva-evm";
import { precosNativos } from "@/lib/precos-nativos";
import { cached } from "@/lib/cache";
import { lerMoedaDaPons, precoInicialNaPons, precoNaPons } from "@/lib/pons";

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
      const [{ Connection, PublicKey }, { precoNaCurvaEmSol }, { estadoNaCurvaDaChroma }] = await Promise.all([
        import("@solana/web3.js"),
        import("@/lib/pumpfun"),
        import("@/lib/meteora-dbc"),
      ]);
      const conexao = new Connection(rpc, "confirmed");
      let emSol = await precoNaCurvaEmSol(conexao, new PublicKey(address));
      // Toda moeda da curva de lançamento clássica nasce em 30 / 1,073 bi SOL.
      let inicial = 30 / 1_073_000_000;
      if (emSol === null) {
        // Curva da Chroma (Meteora DBC): nasce em 30 SOL de valor / 1 bi.
        const chroma = await estadoNaCurvaDaChroma(conexao, address).catch(() => null);
        if (!chroma || chroma.completa) return null;
        emSol = chroma.precoSol;
        inicial = 30 / 1_000_000_000;
      }
      const sol = (await precosNativos().catch(() => null))?.solana ?? 0;
      return sol > 0 ? { usd: emSol * sol, sol: emSol, inicial } : null;
    }).catch((e) => {
      console.warn("[price] curva sol falhou:", e);
      return null;
    });
    // priceSol: o gráfico só mexe a vela quando ELE muda (houve negócio) —
    // o dólar sozinho oscila com o SOL e desenhava velas sem ninguém negociar.
    if (naCurva) {
      return NextResponse.json({
        address,
        priceUsd: naCurva.usd,
        priceSol: naCurva.sol,
        precoInicialNativo: naCurva.inicial,
        at: Date.now(),
      });
    }
  }

  // Moeda na curva da Pons: preço da curva (só muda com negócio), em ETH e dólar.
  if (address.startsWith("0x")) {
    const daPons = await lerMoedaDaPons(address).catch(() => null);
    if (daPons) {
      const eth = (await precosNativos().catch(() => null))?.robinhood ?? 0;
      const priceNativo = precoNaPons(daPons);
      if (eth > 0 && priceNativo > 0) {
        return NextResponse.json({
          address,
          priceUsd: priceNativo * eth,
          priceNativo,
          precoInicialNativo: precoInicialNaPons(daPons),
          at: Date.now(),
        });
      }
    }
  }

  const daCurva = address.startsWith("0x") ? await lerMoedaDaCurvaEvm(address).catch(() => null) : null;
  if (daCurva && !daCurva.curva.migrada) {
    const eth = (await precosNativos().catch(() => null))?.robinhood ?? 0;
    const priceUsd = precoEmEth(daCurva.curva) * eth;
    // priceNativo (ETH): o gráfico só mexe a vela quando ele muda — igual à Solana.
    /*
     * Preço de nascimento desta moeda (a primeira vela do gráfico abre nele):
     * o produto da curva é constante, então voltando os tokens já vendidos
     * chega-se ao ponto inicial. Não é fixo — os parâmetros do contrato
     * mudaram entre moedas.
     */
    const { ethVirtual, tokenVirtual, tokenReal } = daCurva.curva;
    const vendidos = daCurva.tokenAVenda > tokenReal ? daCurva.tokenAVenda - tokenReal : BigInt(0);
    const tv0 = Number(tokenVirtual + vendidos);
    const precoInicialNativo = tv0 > 0 ? (Number(ethVirtual) * Number(tokenVirtual)) / (tv0 * tv0) : undefined;
    if (priceUsd > 0) {
      return NextResponse.json({ address, priceUsd, priceNativo: precoEmEth(daCurva.curva), precoInicialNativo, at: Date.now() });
    }
  }

  const price = await fetchPrice(address);
  if (price === null) {
    return NextResponse.json({ error: "Preço indisponível no momento." }, { status: 502 });
  }

  return NextResponse.json({ address, priceUsd: price, at: Date.now() });
}
