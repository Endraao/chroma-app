import { NextResponse } from "next/server";

import { criarCampanha, lerMensagemDaCampanha, listarCampanhas, registrarPagamento, resultadosDaCampanha } from "@/lib/campanhas";
import { getToken } from "@/lib/tokens";
import { assinaturaConfere } from "@/lib/wallet-auth";

/** GET: campanhas com os resultados (conferidos na rede). ?id= pra uma só. */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  const todas = await listarCampanhas();
  const lista = id ? todas.filter((c) => c.id === id) : todas.slice(0, 60);
  const saida = await Promise.all(
    lista.map(async (c) => ({ ...c, resultados: await resultadosDaCampanha(c).catch(() => ({ lista: [], devidoTotal: 0, pagoTotal: 0 })) })),
  );
  return NextResponse.json(saida, { headers: { "cache-control": "no-store" } });
}

/**
 * POST { acao: "criar", assinante, mensagem, assinatura }  → cria (assinatura da carteira, sem gastar nada)
 * POST { acao: "pago", id, tx }                             → registra pagamento (conferido na rede)
 */
export async function POST(request: Request) {
  const corpo = (await request.json().catch(() => ({}))) as Record<string, string>;
  if (corpo.acao === "pago") {
    if (!corpo.id || !/^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(corpo.tx ?? "")) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
    const r = await registrarPagamento(corpo.id, corpo.tx);
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  }
  if (corpo.acao === "criar") {
    const pedido = { assinante: corpo.assinante, mensagem: corpo.mensagem, assinatura: corpo.assinatura };
    if (!pedido.assinante || pedido.assinante.startsWith("0x")) return NextResponse.json({ error: "use uma carteira Solana" }, { status: 400 });
    if (!(await assinaturaConfere(pedido))) return NextResponse.json({ error: "assinatura inválida ou vencida" }, { status: 401 });
    const dados = lerMensagemDaCampanha(pedido.mensagem);
    if (!dados || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(dados.moeda)) return NextResponse.json({ error: "campanha inválida" }, { status: 400 });
    const { token, isDemo } = await getToken(dados.moeda);
    if (isDemo) return NextResponse.json({ error: "moeda não encontrada" }, { status: 400 });
    const agora = Date.now();
    const c = await criarCampanha({
      moeda: dados.moeda,
      simbolo: token.symbol,
      nome: token.name,
      imagem: token.imageUrl ?? null,
      patrocinador: pedido.assinante,
      bonusPct: dados.bonusPct,
      orcamentoSol: dados.orcamentoSol,
      inicio: agora,
      fim: agora + dados.dias * 86_400_000,
    });
    return NextResponse.json(c);
  }
  return NextResponse.json({ error: "ação desconhecida" }, { status: 400 });
}
