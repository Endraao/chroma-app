import { NextResponse } from "next/server";

import { saldosNaCarteiraEvm } from "@/lib/curva-evm";
import { moedasDaChroma } from "@/lib/moedas-da-chroma";
import type { TokenSummary } from "@/lib/types";
import { valorDaCarteira } from "@/lib/carteira";
import { precosNativos } from "@/lib/precos-nativos";
import { robinhoodChain } from "@/lib/web3";

async function saldoEth(dono: string): Promise<bigint> {
  const r = await fetch(process.env.ROBINHOOD_RPC || robinhoodChain.rpcUrls.default.http[0], {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [dono, "latest"] }),
    cache: "no-store",
  });
  const j = (await r.json()) as { result?: string };
  return j.result ? BigInt(j.result) : 0n;
}

async function infoDaJupiter(mints: string[]): Promise<Map<string, { name: string; symbol: string; icon?: string }>> {
  const mapa = new Map<string, { name: string; symbol: string; icon?: string }>();
  for (let i = 0; i < mints.length; i += 50) {
    try {
      const r = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${mints.slice(i, i + 50).join(",")}`, {
        next: { revalidate: 300 },
      });
      for (const t of (await r.json()) as { id: string; name: string; symbol: string; icon?: string }[]) mapa.set(t.id, t);
    } catch {
      /* sem nome: mostra o começo do endereço */
    }
  }
  return mapa;
}

/**
 * GET /api/moedas/minhas?carteiras=0xabc,So1…
 *
 * As moedas da Chroma que dizem respeito a estas carteiras:
 *   - `criadas`: lançadas por qualquer uma delas (criador lido da rede);
 *   - `naCarteira`: moedas da Chroma que elas carregam, com quantidade.
 *
 * Endereço é público — qualquer explorador mostra o mesmo. Nada privado sai
 * daqui; é o perfil juntando num lugar o que já está na rede.
 *
 * "Na carteira" cobre só as moedas da CHROMA, e só na Robinhood: listar tudo
 * o que uma carteira carrega exige indexador, e a curva da Solana ainda não
 * está publicada.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const carteiras = (searchParams.get("carteiras") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.length >= 32 && c.length <= 64)
    // Endereço EVM vem às vezes em minúsculas e às vezes "checksum" (maiúsculas
    // misturadas): sem normalizar, a mesma carteira entrava duas vezes e a
    // moeda aparecia repetida.
    .map((c) => (c.startsWith("0x") ? c.toLowerCase() : c))
    .filter((c, i, todas) => todas.indexOf(c) === i)
    .slice(0, 4);

  if (carteiras.length === 0) {
    return NextResponse.json({ criadas: [], naCarteira: [] });
  }

  const minhas = new Set(carteiras.map((c) => c.toLowerCase()));
  const todas = await moedasDaChroma().catch(() => [] as TokenSummary[]);

  const criadas = todas.filter((t) => minhas.has(t.creator.toLowerCase()));

  const evm = carteiras.filter((c) => c.startsWith("0x"));
  const daRobinhood = todas.filter((t) => t.chain === "robinhood");

  const naCarteira: { token: TokenSummary; quantidade: number; valorUsd: number }[] = [];
  for (const carteira of evm) {
    const saldos = await saldosNaCarteiraEvm(
      carteira,
      daRobinhood.map((t) => t.address),
    );
    for (const token of daRobinhood) {
      const quantidade = saldos.get(token.address.toLowerCase());
      if (quantidade) naCarteira.push({ token, quantidade, valorUsd: quantidade * token.priceUsd });
    }
  }
  /*
   * Solana: TODAS as moedas da carteira (as mesmas que o menu da conta soma
   * em "Em moedas"), não só as lançadas na Chroma. Nome e ícone pela Jupiter.
   */
  // SOL e ETH da própria carteira também aparecem (antes a lista dizia
  // "nenhuma moeda" com a carteira cheia de SOL e ETH).
  const nativos: { simbolo: string; nome: string; rede: "solana" | "robinhood"; quantidade: number; valorUsd: number }[] = [];
  const precos = await precosNativos().catch(() => ({ solana: 0, robinhood: 0 }) as Record<string, number>);
  for (const carteira of evm) {
    const wei = await saldoEth(carteira).catch(() => 0n);
    const eth = Number(wei) / 1e18;
    if (eth > 0) nativos.push({ simbolo: "ETH", nome: "Ethereum", rede: "robinhood", quantidade: eth, valorUsd: eth * (precos.robinhood ?? 0) });
  }

  for (const carteira of carteiras.filter((c) => !c.startsWith("0x"))) {
    const valor = await valorDaCarteira(carteira).catch(() => null);
    if (valor && valor.sol > 0) {
      nativos.push({ simbolo: "SOL", nome: "Solana", rede: "solana", quantidade: valor.sol, valorUsd: valor.solUsd });
    }
    if (!valor?.posicoes.length) continue;
    const info = await infoDaJupiter(valor.posicoes.map((p) => p.mint));
    for (const p of valor.posicoes) {
      const i = info.get(p.mint);
      naCarteira.push({
        token: {
          address: p.mint,
          chain: "solana",
          name: i?.name ?? p.mint.slice(0, 6),
          symbol: i?.symbol ?? "?",
          imageUrl: i?.icon ?? `/api/logo/${p.mint}`,
          priceUsd: p.precoUsd,
          change24h: 0,
          marketCapUsd: 0,
          liquidityUsd: 0,
          volume24hUsd: 0,
          holders: 0,
          createdAt: 0,
          bondingProgress: null,
          creator: "",
        },
        quantidade: p.quantidade,
        valorUsd: p.valorUsd,
      });
    }
  }

  naCarteira.sort((a, b) => b.valorUsd - a.valorUsd);

  return NextResponse.json({ criadas, naCarteira, nativos });
}
