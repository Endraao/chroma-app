import "server-only";

import { cached } from "@/lib/cache";

/**
 * O "Top 5 do dia" pro X, montado sozinho (pedido do dono, 02/10/2026).
 *
 * Fonte: moedas em alta na GeckoTerminal (24h) + X e arte da DexScreener.
 * Regras, as mesmas do post feito à mão:
 *  - fora: a moeda da plataforma (PONS), ETH/SOL embrulhados e dólares;
 *  - um símbolo só uma vez — quando duas moedas usam o mesmo ticker, uma pode
 *    ser cópia, e marcar golpe queimaria a Chroma: fica a de MAIS volume;
 *  - ordem por volume de 24h (número que não gera discussão, ao contrário da
 *    variação, que cada site calcula de um jeito).
 */

export type RedeDoTop = "robinhood" | "solana";

export interface MoedaDoTop {
  endereco: string;
  simbolo: string;
  nome: string;
  volumeUsd: number;
  mcapUsd: number;
  x: string | null;
  imagem: string | null;
}

const FORA = new Set(["PONS", "WETH", "ETH", "SOL", "WSOL", "USDG", "USDC", "USDT", "PYUSD"]);
const GECKO: Record<RedeDoTop, string> = { robinhood: "robinhood", solana: "solana" };

export async function top5(rede: RedeDoTop): Promise<MoedaDoTop[]> {
  return cached(`top5:${rede}`, 30 * 60_000, async () => {
    const r = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/${GECKO[rede]}/trending_pools?duration=24h&page=1`,
      { headers: { accept: "application/json" }, next: { revalidate: 1800 } },
    );
    if (!r.ok) throw new Error(`gecko ${r.status}`);
    const j = (await r.json()) as {
      data: { attributes: { name: string; volume_usd: { h24: string }; market_cap_usd: string | null; fdv_usd: string | null }; relationships: { base_token: { data: { id: string } } } }[];
    };

    const porSimbolo = new Map<string, MoedaDoTop>();
    for (const p of j.data ?? []) {
      const simbolo = p.attributes.name.split(" /")[0].trim();
      if (!simbolo || FORA.has(simbolo.toUpperCase())) continue;
      const endereco = p.relationships.base_token.data.id.replace(`${GECKO[rede]}_`, "");
      const volumeUsd = Number(p.attributes.volume_usd?.h24 ?? 0);
      const atual = porSimbolo.get(simbolo.toUpperCase());
      if (atual && atual.volumeUsd >= volumeUsd) continue;
      porSimbolo.set(simbolo.toUpperCase(), {
        endereco,
        simbolo,
        nome: simbolo,
        volumeUsd,
        mcapUsd: Number(p.attributes.market_cap_usd ?? p.attributes.fdv_usd ?? 0),
        x: null,
        imagem: null,
      });
    }
    const melhores = [...porSimbolo.values()].sort((a, b) => b.volumeUsd - a.volumeUsd).slice(0, 5);

    // X e arte de cada uma (DexScreener aceita até 30 endereços por pedido).
    const d = await fetch(
      `https://api.dexscreener.com/tokens/v1/${rede}/${melhores.map((m) => m.endereco).join(",")}`,
      { next: { revalidate: 1800 } },
    )
      .then((x) => (x.ok ? x.json() : []))
      .catch(() => []);
    for (const m of melhores) {
      const par = (d as { baseToken: { address: string; name: string }; info?: { imageUrl?: string; socials?: { url: string }[] } }[]).find(
        (p) => p.baseToken.address.toLowerCase() === m.endereco.toLowerCase(),
      );
      const x = par?.info?.socials?.map((s) => s.url).find((u) => /(?:x|twitter)\.com\/[A-Za-z0-9_]+\/?$/.test(u));
      m.x = x ? x.replace(/\/$/, "").split("/").pop() ?? null : null;
      m.imagem = par?.info?.imageUrl ?? null;
      if (par?.baseToken.name) m.nome = par.baseToken.name;
    }
    return melhores;
  });
}

const dinheiro = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${n.toFixed(0)}`;

export function textoDoPost(rede: RedeDoTop, lista: MoedaDoTop[]) {
  const nomeDaRede = rede === "robinhood" ? "Robinhood Chain" : "Solana";
  const linhas = lista.map((m, i) => `${i + 1}. $${m.simbolo}${m.x ? ` @${m.x}` : ""} — ${dinheiro(m.volumeUsd)}`);
  return {
    post: `Top 5 on ${nomeDaRede} today 🔥 (24h volume)\n\n${linhas.join("\n")}\n\nLive charts for all of them on Chroma, link below 👇`,
    resposta: `chromalaunch.fun/?chain=${rede}`,
  };
}

export { dinheiro };
