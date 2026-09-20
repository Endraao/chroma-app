import { NextResponse } from "next/server";

import {
  claimNickname,
  findByNickname,
  findByWallet,
  validateNickname,
  walletForChain,
  type WalletKind,
} from "@/lib/accounts";
import { CHAIN_IDS } from "@/lib/web3";
import type { ChainId } from "@/lib/types";

/**
 * GET  /api/account?wallet=…     → conta dessa carteira (ou null)
 * GET  /api/account?nickname=…&chain=… → resolve apelido para a carteira DAQUELA rede
 * GET  /api/account?check=…      → o apelido está livre?
 * POST /api/account              → registra o apelido (sem assinatura, ver src/lib/accounts.ts)
 */

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get("wallet");
  const nickname = searchParams.get("nickname");
  const check = searchParams.get("check");
  const chain = searchParams.get("chain");

  if (check) {
    const validation = validateNickname(check);
    if (!validation.ok) {
      return NextResponse.json({ available: false, reason: validation.error });
    }
    const existing = await findByNickname(validation.nickname);
    return NextResponse.json({
      available: !existing,
      nickname: validation.nickname,
      reason: existing ? "Esse apelido já está em uso." : null,
    });
  }

  if (nickname) {
    const account = await findByNickname(nickname);
    if (!account) return NextResponse.json({ error: "apelido não encontrado" }, { status: 404 });

    /*
     * Com `chain`, devolve o endereço DAQUELA rede — é assim que a indicação
     * é resolvida na hora do swap. Sem o parâmetro, devolve a carteira
     * principal, pra não quebrar quem já chamava esta rota sem ele.
     *
     * Quando a pessoa não tem carteira na rede pedida, `wallet` vem null de
     * propósito: quem chamou precisa saber que não há pra onde mandar, em vez
     * de receber um endereço de outra rede e tentar pagar nele.
     */
    const chainPedida = CHAIN_IDS.includes(chain as ChainId) ? (chain as ChainId) : null;

    return NextResponse.json({
      nickname: account.nickname,
      displayName: account.displayName,
      wallet: chainPedida ? walletForChain(account, chainPedida) : account.wallet,
      kind: account.kind,
      // Endereços de recebimento são públicos por natureza.
      carteiras: account.carteiras ?? {},
    });
  }

  if (wallet) {
    /*
     * Aceita mais de um endereço separado por vírgula.
     *
     * Com as duas carteiras conectadas, o navegador não sabe qual delas tem a
     * conta — e perguntar uma de cada vez daria duas requisições e um piscar
     * de "sem conta" na tela enquanto a segunda não voltasse.
     */
    const enderecos = wallet.split(",").map((w) => w.trim()).filter(Boolean).slice(0, 4);

    for (const endereco of enderecos) {
      const account = await findByWallet(endereco);
      if (account) return NextResponse.json(account);
    }
    return NextResponse.json(null);
  }

  return NextResponse.json({ error: "informe wallet, nickname ou check" }, { status: 400 });
}

/*
 * Limite por IP. Com o registro aberto (sem assinatura), é isto que segura
 * alguém varrendo o dicionário e registrando apelido em massa pra revender.
 */
const LIMITE = { janelaMs: 60_000, max: 10 };
const acessos = new Map<string, { contagem: number; expiraEm: number }>();

function excedeuLimite(request: Request): boolean {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "local";

  const agora = Date.now();
  const atual = acessos.get(ip);

  if (!atual || atual.expiraEm <= agora) {
    acessos.set(ip, { contagem: 1, expiraEm: agora + LIMITE.janelaMs });
    return false;
  }
  atual.contagem++;
  return atual.contagem > LIMITE.max;
}

export async function POST(request: Request) {
  if (excedeuLimite(request)) {
    return NextResponse.json({ error: "muitas tentativas; espere um minuto" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }

  const nickname = String(body.nickname ?? "");
  const wallet = String(body.wallet ?? "");
  const kind: WalletKind = body.kind === "evm" ? "evm" : "solana";

  if (!nickname || !wallet) {
    return NextResponse.json({ error: "nickname e wallet são obrigatórios" }, { status: 400 });
  }

  const result = await claimNickname({ nickname, wallet, kind });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, account: result.account });
}
