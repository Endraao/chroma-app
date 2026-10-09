import { NextResponse } from "next/server";

import { gravarNoCacheDoBanco, lerDoCacheDoBanco } from "@/lib/db";

/**
 * POST /api/bnb/lancador { chave, endereco } → guarda o endereço do contrato
 * ChromaBnb depois que a página escondida (/l/[chave]) o publica. Só com a
 * chave da página, e só uma vez: um endereço já guardado não é trocado.
 */
const EVM = /^0x[0-9a-fA-F]{40}$/;

export async function POST(request: Request) {
  const { chave, endereco, tipo, substituir } = (await request.json().catch(() => ({}))) as {
    chave?: string;
    endereco?: string;
    tipo?: string;
    substituir?: boolean;
  };
  // "troca" = o contrato de compra e venda (ChromaBnbTroca); padrão = o lançador.
  const onde = tipo === "troca" ? "troca-bnb" : "lancador-bnb";
  const salva = await lerDoCacheDoBanco<{ chave: string }>("pagina-bnb").catch(() => null);
  if (!salva?.chave || chave !== salva.chave) return NextResponse.json({ ok: false }, { status: 404 });
  if (!endereco || !EVM.test(endereco)) return NextResponse.json({ ok: false, erro: "endereço inválido" }, { status: 400 });
  const atual = await lerDoCacheDoBanco<{ endereco: string }>(onde).catch(() => null);
  // Lançador novo (outra taxa anti-sniper, 09/10/2026): substitui o atual e
  // zera a negociação, que é presa ao lançador antigo. As moedas antigas
  // guardam o lançador e a negociação delas no navegador.
  if (substituir && onde === "lancador-bnb") {
    await gravarNoCacheDoBanco("lancador-bnb", { endereco, em: Date.now(), anterior: atual?.endereco ?? null });
    await gravarNoCacheDoBanco("troca-bnb", { endereco: null, em: Date.now() });
    return NextResponse.json({ ok: true, endereco });
  }
  if (atual?.endereco) return NextResponse.json({ ok: true, endereco: atual.endereco });
  await gravarNoCacheDoBanco(onde, { endereco, em: Date.now() });
  return NextResponse.json({ ok: true, endereco });
}
