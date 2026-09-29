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

function paraHttp(uri: string): string[] {
  if (uri.startsWith("ipfs://")) {
    const caminho = uri.slice("ipfs://".length).replace(/^ipfs\//, "");
    return GATEWAYS.map((g) => g + caminho);
  }
  return uri.startsWith("https://") ? [uri] : [];
}

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

export async function GET(_req: Request, { params }: { params: Promise<{ endereco: string }> }) {
  const { endereco } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(endereco)) return new Response(null, { status: 400 });

  const dados = await cached(`logo:${endereco.toLowerCase()}`, UM_DIA * 1000, async () => {
    const [logo, simbolo] = await Promise.all([
      cliente.readContract({ address: endereco as Address, abi: ABI, functionName: "logo" }).catch(() => ""),
      cliente.readContract({ address: endereco as Address, abi: ABI, functionName: "symbol" }).catch(() => ""),
    ]);
    return { logo, simbolo };
  });

  // Sem logo no contrato: a DexScreener costuma ter a arte que o time enviou.
  const daDex = await cached(`logo-dex:${endereco.toLowerCase()}`, UM_DIA * 1000, async () => {
    try {
      const r = await fetch(`https://api.dexscreener.com/tokens/v1/robinhood/${endereco}`, { signal: AbortSignal.timeout(6_000) });
      const pares = (await r.json()) as { info?: { imageUrl?: string } }[];
      return pares.find((p) => p.info?.imageUrl)?.info?.imageUrl ?? "";
    } catch {
      return "";
    }
  });

  for (const url of [...paraHttp(dados.logo), ...(daDex ? [daDex] : [])]) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(12_000) });
      const tipo = r.headers.get("content-type") ?? "";
      /* SVG de terceiro fica de fora: pode carregar script. */
      if (!r.ok || !tipo.startsWith("image/") || tipo.includes("svg")) continue;
      return new Response(await r.arrayBuffer(), {
        headers: {
          "content-type": tipo,
          /* Conteúdo de IPFS não muda: cache de um ano na CDN e no navegador. */
          "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable",
        },
      });
    } catch {
      /* gateway lento ou recusando: tenta o próximo */
    }
  }

  return avatar(dados.simbolo, endereco.toLowerCase());
}
