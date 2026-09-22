import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

import { valorDaCarteira } from "@/lib/carteira";

/**
 * GET /api/carteira?dono=… → quanto a carteira vale, somando SOL e tokens.
 *
 * Feito no servidor, e não no navegador, por dois motivos:
 *
 *   - **Uma requisição em vez de dezenas.** Uma carteira ativa carrega
 *     dezenas de moedas, e cada uma precisaria de preço. Aqui isso vira uma
 *     chamada de RPC e uma de preço em lote, com cache compartilhado entre
 *     todo mundo que abrir o site.
 *
 *   - **O endereço do RPC não vai junto.** A leitura de contas de token é
 *     pesada; deixá-la no navegador é convite pra alguém repetir em laço.
 *
 * O endereço é público — qualquer pessoa pode consultar o saldo de qualquer
 * carteira num explorador. Não há nada de privado sendo exposto aqui.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dono = searchParams.get("dono");

  if (!dono) {
    return NextResponse.json({ error: "parâmetro 'dono' é obrigatório" }, { status: 400 });
  }

  /* Valida antes de gastar RPC: endereço torto viraria erro lá dentro. */
  try {
    new PublicKey(dono);
  } catch {
    return NextResponse.json({ error: "endereço inválido" }, { status: 400 });
  }

  try {
    const valor = await valorDaCarteira(dono);
    if (!valor) {
      return NextResponse.json({ error: "RPC não configurado" }, { status: 503 });
    }
    return NextResponse.json({ ...valor, at: Date.now() });
  } catch (erro) {
    console.warn("[carteira] falhou:", erro);
    return NextResponse.json({ error: "não deu pra ler a carteira" }, { status: 502 });
  }
}
