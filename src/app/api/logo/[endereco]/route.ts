import { createPublicClient, http, parseAbi, type Address } from "viem";

import { cached } from "@/lib/cache";
import { robinhoodChain } from "@/lib/web3";

/**
 * GET /api/logo/0x… → a arte da moeda, lida do PRÓPRIO contrato.
 *
 * ---------------------------------------------------------------------------
 * POR QUE EXISTE
 * ---------------------------------------------------------------------------
 * Quase metade das moedas novas da Robinhood chega sem imagem nas fontes de
 * mercado (GeckoTerminal e Dexscreener) — medido em 28/09/2026: 9 de 20. As
 * da PONS guardam a arte no contrato, em \`logo()\`, apontando pro IPFS.
 * Os gateways públicos de IPFS recusam boa parte das consultas e servem o
 * arquivo original (centenas de KB), então a rota busca UMA vez e devolve
 * com cache longo: a CDN da Vercel serve as próximas.
 *
 * Sem \`logo()\` ou com o IPFS fora, devolve um avatar com as iniciais —
 * nunca imagem quebrada.
 */

const cliente = createPublicClient({
  chain: robinhoodChain,
  transport: http(process.env.ROBINHOOD_RPC || robinhoodChain.rpcUrls.default.http[0]),
});

const ABI = parseAbi(["function logo() view returns (string)", "function symbol() view returns (string)"]);

/* Em ordem: o primeiro que responder com imagem ganha. */
const GATEWAYS = ["https://gateway.pinata.cloud/ipfs/", "https://ipfs.io/ipfs/", "https://dweb.link/ipfs/"];

const UM_DIA = 86_400;


function avatar(simbolo: string, endereco = ""): Response {
  let h = 0;
  for (let i = 0; i < endereco.length; i++) h = (h * 31 + endereco.charCodeAt(i)) >>> 0;
  const cor = `hsl(${h % 360} 70% 55%)`;
  const letras = (simbolo || "?").replace(/[^A-Za-z0-9$]/g, "").slice(0, 2).toUpperCase() || "?";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${cor}"/><stop offset="1" stop-color="#15171c"/></linearGradient></defs><rect width="128" height="128" fill="url(#g)"/><text x="64" y="64" dy=".35em" text-anchor="middle" font-family="system-ui,sans-serif" font-size="44" font-weight="700" fill="#ffffffcc">${letras}</text></svg>`;
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml",
      /* Curto: a arte pode aparecer depois (IPFS voltar). */
      // curto: a arte pode aparecer depois (DexScreener, IPFS lento)
      "cache-control": `public, max-age=300, s-maxage=300`,
    },
  });
}

/** Converte link de IPFS (qualquer formato) em endereços de portões que servem a imagem. */
function comPortoes(url: string): string[] {
  const cid =
    /^ipfs:\/\/(?:ipfs\/)?(.+)$/i.exec(url)?.[1] ??
    /^https?:\/\/([a-z0-9]{46,})\.ipfs\.[^/]+(\/.*)?$/i.exec(url)?.slice(1, 3).join("") ??
    /^https?:\/\/[^/]+\/ipfs\/(.+)$/i.exec(url)?.[1];
  if (!cid) return url.startsWith("https://") ? [url] : [];
  return [...GATEWAYS, "https://4everland.io/ipfs/"].map((g) => g + cid);
}

/** Todas as fontes de arte conhecidas pra moeda, das duas redes. */
async function fontes(endereco: string, ehEvm: boolean): Promise<{ urls: string[]; simbolo: string }> {
  if (ehEvm) {
    const dados = await cached(`logo:${endereco.toLowerCase()}`, UM_DIA * 1000, async () => {
      const [logo, simbolo] = await Promise.all([
        cliente.readContract({ address: endereco as Address, abi: ABI, functionName: "logo" }).catch(() => ""),
        cliente.readContract({ address: endereco as Address, abi: ABI, functionName: "symbol" }).catch(() => ""),
      ]);
      return { logo, simbolo };
    });
    const daDex = await daDexScreener("robinhood", endereco);
    return { urls: [dados.logo, daDex].filter(Boolean), simbolo: dados.simbolo };
  }
  // Solana: a Jupiter tem o ícone de quase toda moeda (inclusive as da pump.fun).
  const [jup, daDex] = await Promise.all([
    cached(`logo-jup:${endereco}`, 10 * 60 * 1000, async () => {
      try {
        const r = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${endereco}`, { signal: AbortSignal.timeout(6_000) });
        const lista = (await r.json()) as { id: string; icon?: string; symbol?: string }[];
        const m = lista.find((t) => t.id === endereco);
        return { icon: m?.icon ?? "", simbolo: m?.symbol ?? "" };
      } catch {
        return { icon: "", simbolo: "" };
      }
    }),
    daDexScreener("solana", endereco),
  ]);
  // Moeda nova demais pra Jupiter/DexScreener: os metadados on-chain (via
  // Helius) já têm a imagem desde o primeiro bloco — e a CDN da Helius serve rápido.
  const daRede = await daHelius(endereco);
  return { urls: [daRede.cdn, jup.icon, daRede.imagem, daDex].filter(Boolean), simbolo: jup.simbolo || daRede.simbolo };
}

function daHelius(mint: string): Promise<{ cdn: string; imagem: string; simbolo: string }> {
  return cached(`logo-helius:${mint}`, 60 * 60 * 1000, async () => {
    const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC;
    const vazio = { cdn: "", imagem: "", simbolo: "" };
    if (!rpc?.startsWith("https")) return vazio;
    try {
      const r = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint } }),
        signal: AbortSignal.timeout(6_000),
      });
      const a = (await r.json()).result;
      const arquivo = a?.content?.files?.[0];
      return {
        cdn: arquivo?.cdn_uri ?? "",
        imagem: a?.content?.links?.image ?? arquivo?.uri ?? "",
        simbolo: a?.content?.metadata?.symbol ?? "",
      };
    } catch {
      return vazio;
    }
  });
}

function daDexScreener(rede: string, endereco: string): Promise<string> {
  return cached(`logo-dex3:${rede}:${endereco.toLowerCase()}`, 10 * 60 * 1000, async () => {
    try {
      const r = await fetch(`https://api.dexscreener.com/tokens/v1/${rede}/${endereco}`, { signal: AbortSignal.timeout(6_000) });
      const pares = (await r.json()) as { info?: { imageUrl?: string } }[];
      return pares.find((p) => p.info?.imageUrl)?.info?.imageUrl ?? "";
    } catch {
      return "";
    }
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ endereco: string }> }) {
  const { endereco } = await params;
  const ehEvm = /^0x[0-9a-fA-F]{40}$/.test(endereco);
  if (!ehEvm && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(endereco)) return new Response(null, { status: 400 });

  const { urls, simbolo } = await fontes(endereco, ehEvm);
  const tentativas = urls.flatMap(comPortoes);

  // Todas ao mesmo tempo: a primeira que responder com imagem ganha.
  if (tentativas.length) {
    const controle = new AbortController();
    try {
      const achada = await Promise.any(
        tentativas.map(async (url) => {
          const r = await fetch(url, { signal: AbortSignal.any([controle.signal, AbortSignal.timeout(12_000)]) });
          const tipo = r.headers.get("content-type") ?? "";
          /* SVG de terceiro fica de fora: pode carregar script. */
          if (!r.ok || !tipo.startsWith("image/") || tipo.includes("svg")) throw new Error(String(r.status));
          return { corpo: await r.arrayBuffer(), tipo };
        }),
      );
      controle.abort();
      return new Response(achada.corpo, {
        headers: {
          "content-type": achada.tipo,
          "cache-control": "public, max-age=86400, s-maxage=86400",
        },
      });
    } catch {
      /* nenhuma fonte respondeu ao servidor */
    }
  }

  // Alguns sites de imagem (ex.: gmgn.ai) bloqueiam servidor mas deixam o
  // navegador abrir: manda o navegador buscar direto. Se falhar lá também,
  // o card cai nas iniciais sozinho.
  const diretas = urls.filter((u) => /^https:\/\//.test(u) && !/ipfs/i.test(u));
  // O endereço original primeiro: a CDN da Helius também recusa alguns.
  const direta = diretas.find((u) => !u.includes("cdn.helius-rpc.com")) ?? diretas[0];
  if (direta) {
    return new Response(null, {
      status: 302,
      headers: { location: direta, "cache-control": "public, max-age=600, s-maxage=600" },
    });
  }

  return avatar(simbolo, endereco.toLowerCase());
}
