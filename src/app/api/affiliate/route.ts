import { NextResponse } from "next/server";

import { detectChainFromAddress } from "@/lib/utils";
import { recordEvent, summarize, type AffiliateEvent } from "@/lib/affiliate-store";
import { findByNickname, findByWallet } from "@/lib/accounts";

/**
 * Registro de referências (cliques e conversões).
 *
 * O pagamento do afiliado NÃO passa por aqui: acontece on-chain, dentro da
 * própria transação de swap (ver `src/lib/solana-swap.ts`). Este endpoint só
 * alimenta o dashboard do promotor.
 *
 * Consequência prática: se este endpoint cair, ninguém deixa de receber —
 * só o painel fica desatualizado.
 */

/** Limite bobo de requisições por IP, pra um bot não encher o arquivo de lixo. */
const RATE_LIMIT = { windowMs: 60_000, max: 60 };
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(request: Request): boolean {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "local";

  const now = Date.now();
  const entry = hits.get(ip);

  if (!entry || entry.resetAt <= now) {
    hits.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT.max;
}

export async function POST(request: Request) {
  if (rateLimited(request)) {
    return NextResponse.json({ error: "Muitas requisições. Aguarde um instante." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }

  const event: AffiliateEvent = body.event === "trade" ? "trade" : "click";

  /*
   * Dois jeitos de identificar o promotor, e os dois chegam aqui:
   *
   *  - `wallet`: o endereço que de fato recebeu. Vem do swap, e é a verdade
   *    sobre pra onde o dinheiro foi.
   *  - `ref`: o que estava no link (apelido ou endereço). Vem do clique, que
   *    acontece antes de existir rede ou valor.
   *
   * O clique não tem como mandar endereço: com uma carteira por rede, qual
   * deles seria? Por isso o evento é gravado com o APELIDO, e é ele que junta
   * cliques e trades da mesma pessoa no painel.
   */
  const ref = typeof body.ref === "string" ? body.ref.trim().slice(0, 64) : "";
  const walletBruta = String(body.wallet ?? "");
  const walletValida = detectChainFromAddress(walletBruta) !== "unknown" ? walletBruta : "";

  const refEhEndereco = ref !== "" && detectChainFromAddress(ref) !== "unknown";

  const conta = refEhEndereco
    ? await findByWallet(ref)
    : ref
      ? await findByNickname(ref)
      : walletValida
        ? await findByWallet(walletValida)
        : null;

  const wallet = walletValida || (refEhEndereco ? ref : "");

  if (!wallet && !conta) {
    return NextResponse.json({ error: "afiliado não identificado" }, { status: 400 });
  }

  try {
    await recordEvent({
      wallet,
      conta: conta?.nickname,
      event,
      at: Date.now(),
      landedOn: typeof body.landedOn === "string" ? body.landedOn.slice(0, 200) : undefined,
      volumeUsd: Number.isFinite(Number(body.volumeUsd)) ? Number(body.volumeUsd) : undefined,
      volumeNative: Number.isFinite(Number(body.volumeNative)) ? Number(body.volumeNative) : undefined,
      commissionNative: Number.isFinite(Number(body.commissionNative))
        ? Number(body.commissionNative)
        : undefined,
      tokenAddress: typeof body.tokenAddress === "string" ? body.tokenAddress.slice(0, 80) : undefined,
      tokenSymbol: typeof body.tokenSymbol === "string" ? body.tokenSymbol.slice(0, 20) : undefined,
      chain: body.chain === "robinhood" ? "robinhood" : "solana",
      txHash: typeof body.txHash === "string" ? body.txHash.slice(0, 120) : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/affiliate] falha ao gravar:", error);
    return NextResponse.json({ error: "Não foi possível concluir o registro." }, { status: 500 });
  }
}

/** GET /api/affiliate?wallet=… → resumo pro dashboard do promotor. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get("wallet");

  if (!wallet) {
    return NextResponse.json({ error: "parâmetro 'wallet' é obrigatório" }, { status: 400 });
  }

  /*
   * O painel é da PESSOA, não de um endereço. Com uma carteira por rede, somar
   * só o endereço que abriu a tela esconderia os ganhos da outra rede.
   *
   * ---------------------------------------------------------------------------
   * ACEITA VÁRIOS ENDEREÇOS, SEPARADOS POR VÍRGULA
   * ---------------------------------------------------------------------------
   * Antes olhava UM endereço só, e isso produzia um defeito que parecia outra
   * coisa. Com as duas carteiras conectadas, a tela manda a PREFERIDA — a da
   * Solana. Se justamente ela não estiver vinculada à conta, a busca não acha
   * nada, e o painel passa a dizer "você não tem carteira nesta rede" para AS
   * DUAS, inclusive para a rede que ESTÁ vinculada.
   *
   * O sintoma enganava: parecia conta inexistente, quando na verdade a
   * pergunta é que fora feita com a chave errada. `/api/account` já resolvia
   * assim desde sempre; esta rota ficou para trás.
   *
   * Limite de 4 pelo mesmo motivo de lá: é entrada vinda do navegador, e cada
   * item custa uma consulta.
   */
  const enderecos = wallet
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean)
    .slice(0, 4);

  let conta: Awaited<ReturnType<typeof findByWallet>> = null;
  for (const endereco of enderecos) {
    conta = await findByWallet(endereco);
    if (conta) break;
  }

  const carteiras = conta ? Object.values(conta.carteiras ?? {}) : [];

  const summary = await summarize({
    /* O primeiro da lista é o que a pessoa está usando agora. */
    wallet: enderecos[0] ?? wallet,
    nickname: conta?.nickname ?? null,
    wallets: carteiras.length ? carteiras : enderecos,
    carteiras: conta?.carteiras ?? {},
  });

  /*
   * Sem campo "estimado" aqui. O resumo já traz `commissionNative`, que é a
   * soma do que foi de fato transferido em cada swap. Devolver uma estimativa
   * ao lado do valor real só criaria dois números divergentes na tela, e a
   * pessoa não teria como saber qual acreditar.
   */
  return NextResponse.json(summary);
}
