import { after } from "next/server";

import { getToken } from "@/lib/tokens";

/**
 * TESTE DO CELULAR (09/10/2026) — o link do post copiado linha por linha do
 * XPeriment (xperiment.app/e/house). No app do X no Android o post deles NÃO
 * vira cartão: aparece o link azul, que abre a compra no navegador do X. O
 * nosso vira cartão com play que não responde. A página deles é "pelada"
 * (só as instruções do cartão, sem @site nem título do site) e aceita o X —
 * esta faz igual. Pra quem abre: celular cai na janela de compra (/p), PC na
 * página da moeda. O /e (que funciona no PC) não foi tocado.
 */
export const dynamic = "force-dynamic";

const SITE = "https://chromalaunch.fun";
const REF = /^[A-Za-z0-9_.-]{1,64}$/;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function GET(req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const ref = new URL(req.url).searchParams.get("ref");
  const sufixo = ref && REF.test(ref) ? `?ref=${encodeURIComponent(ref)}` : "";
  const { token } = await getToken(address);

  const titulo = esc(`$${token.symbol} — buy right in this post on Chroma`);
  const descricao = esc(`Trade ${token.name} without leaving X. Creators keep 40% of every trade fee on Chroma.`);
  const imagem = `${SITE}/api/logo/${address}/card`;
  const player = `${SITE}/p/${address}${sufixo}`;
  const moeda = `${SITE}/token/${address}${sufixo}`;
  // A capa leva ~3s na primeira vez e o X desiste em ~4s: já deixa pronta no CDN.
  after(() => fetch(imagem, { signal: AbortSignal.timeout(15_000) }).catch(() => {}));

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Chroma</title>
<meta name="twitter:card" content="player">
<meta name="twitter:title" content="${titulo}">
<meta name="twitter:description" content="${descricao}">
<meta name="twitter:image" content="${esc(imagem)}">
<meta name="twitter:player" content="${esc(player)}">
<meta name="twitter:player:width" content="480">
<meta name="twitter:player:height" content="600">
<meta property="og:title" content="${titulo}">
<meta property="og:description" content="${descricao}">
<meta property="og:image" content="${esc(imagem)}">
<meta property="og:url" content="${esc(`${SITE}/e3/${address}${sufixo}`)}">
<script>location.replace(/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? ${JSON.stringify(player)} : ${JSON.stringify(moeda)});</script>
</head>
<body style="background:#07070a"></body>
</html>`;

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
