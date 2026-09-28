import { NextResponse } from "next/server";

import { fetchTrades, type NegocioDoPool } from "@/lib/market";
import { lerMoedaDaCurvaEvm, negociosDaCurvaComoPool } from "@/lib/curva-evm";

/**
 * GET /api/negocios?address=… → os últimos negócios da moeda, do mais novo
 * pro mais velho. Alimenta a aba "Transações" da página da moeda.
 *
 * Moeda na curva da Chroma: eventos do próprio contrato. Qualquer outra: a
 * GeckoTerminal (últimos ~300 negócios do par principal).
 */
export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address");
  if (!address) return NextResponse.json({ error: "parâmetro 'address' é obrigatório" }, { status: 400 });

  let negocios: NegocioDoPool[] = [];
  try {
    const daCurva = await lerMoedaDaCurvaEvm(address).catch(() => null);
    negocios =
      daCurva && !daCurva.curva.migrada
        ? await negociosDaCurvaComoPool(address)
        : await fetchTrades(address);
  } catch (erro) {
    console.warn("[negocios]", erro);
    return NextResponse.json({ error: "Não foi possível ler os negócios agora." }, { status: 502 });
  }

  const lista = [...negocios].sort((a, b) => b.em - a.em).slice(0, 100);
  return NextResponse.json({ negocios: lista, total: negocios.length, at: Date.now() });
}
