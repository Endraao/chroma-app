import { NextResponse } from "next/server";

/**
 * Ponte pro nó da Solana usada pelo SAQUE PRIVADO (Cloak, ver
 * lib/saque-privado.ts).
 *
 * O kit da Cloak faz rajadas de consultas, e o plano do Helius devolve 429
 * ("muitos pedidos") quando passa de ~10 por segundo — o saque morria no meio
 * (04/10/2026). Aqui o servidor repete com espera crescente quando toma 429,
 * e a rajada vira fila em vez de erro.
 *
 * A chave do Helius já é pública no site (NEXT_PUBLIC_), então a ponte não
 * expõe nada novo; o limite por IP só evita que alguém a use de graça em massa.
 */
const DESTINO = process.env.NEXT_PUBLIC_SOLANA_RPC ?? "";
const TENTATIVAS = 6;

const LIMITE = { janelaMs: 10_000, max: 300 };
const acessos = new Map<string, { contagem: number; expiraEm: number }>();

function excedeuLimite(request: Request): boolean {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? request.headers.get("x-real-ip") ?? "local";
  const agora = Date.now();
  const atual = acessos.get(ip);
  if (!atual || atual.expiraEm <= agora) {
    acessos.set(ip, { contagem: 1, expiraEm: agora + LIMITE.janelaMs });
    return false;
  }
  atual.contagem++;
  return atual.contagem > LIMITE.max;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: Request) {
  if (!DESTINO.startsWith("http")) return NextResponse.json({ error: "rpc não configurado" }, { status: 503 });
  if (excedeuLimite(request)) return NextResponse.json({ error: "muitos pedidos" }, { status: 429 });

  const corpo = await request.text();
  if (corpo.length > 200_000) return NextResponse.json({ error: "pedido grande demais" }, { status: 413 });

  for (let tentativa = 1; ; tentativa++) {
    const r = await fetch(DESTINO, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: corpo,
      cache: "no-store",
    }).catch(() => null);
    if (r && r.status !== 429) {
      return new NextResponse(await r.text(), { status: r.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
    }
    if (tentativa >= TENTATIVAS) return NextResponse.json({ error: "nó ocupado, tente de novo" }, { status: 429 });
    await esperar(300 * tentativa + Math.random() * 200);
  }
}
