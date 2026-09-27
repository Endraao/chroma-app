import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

import { formatEther, hexToBigInt, isAddress, type Hex } from "viem";

import { valorDaCarteira } from "@/lib/carteira";
import { precosNativos } from "@/lib/precos-nativos";
import { robinhoodChain } from "@/lib/web3";

/** Saldo nativo na Robinhood Chain, pelo mesmo nó que a ponte `/api/rpc/robinhood` usa. */
async function saldoEth(dono: string): Promise<bigint> {
  const no = process.env.ROBINHOOD_RPC || robinhoodChain.rpcUrls.default.http[0];
  const r = await fetch(no, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [dono, "latest"] }),
    cache: "no-store",
  });
  const j = (await r.json()) as { result?: Hex; error?: { message: string } };
  if (!j.result) throw new Error(j.error?.message ?? `RPC respondeu ${r.status}`);
  return hexToBigInt(j.result);
}

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

  /*
   * Carteira EVM: só o ETH, por enquanto.
   *
   * As moedas lançadas na Robinhood ficam de fora deste número porque não há
   * como listar o que a carteira carrega sem indexador — o Blockscout da rede
   * está atrás da Cloudflare. A tela diz "em ETH", e não "total", por isso.
   */
  if (isAddress(dono)) {
    try {
      const [wei, precos] = await Promise.all([saldoEth(dono), precosNativos()]);
      const eth = Number(formatEther(wei));
      const preco = precos.robinhood;
      return NextResponse.json({
        eth,
        /* Preço indisponível → null: melhor esconder o dólar que inventá-lo. */
        ethUsd: preco > 0 ? eth * preco : null,
        at: Date.now(),
      });
    } catch (erro) {
      console.warn("[carteira] ETH falhou:", erro);
      return NextResponse.json({ error: "Não foi possível ler o saldo em ETH." }, { status: 502 });
    }
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
    return NextResponse.json({ error: "Não foi possível ler os dados da carteira." }, { status: 502 });
  }
}
