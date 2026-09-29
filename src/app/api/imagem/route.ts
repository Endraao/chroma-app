/**
 * Imagem de IPFS servida pela Chroma.
 *
 * Portões públicos de IPFS são lentos (5-10 s) e recusam rajadas (429); alguns
 * (inbrowser.link) nem servem imagem pra tag <img>. Aqui o servidor pede a
 * VÁRIOS portões ao mesmo tempo, usa o primeiro que responder e a CDN guarda
 * o resultado pra sempre — conteúdo de IPFS nunca muda para o mesmo CID.
 */
const PORTOES = [
  "https://gateway.pinata.cloud/ipfs/",
  "https://4everland.io/ipfs/",
  "https://ipfs.io/ipfs/",
  "https://dweb.link/ipfs/",
  "https://w3s.link/ipfs/",
];

export async function GET(request: Request) {
  const cid = new URL(request.url).searchParams.get("cid") ?? "";
  if (!/^[a-zA-Z0-9]{46,}(\/[\w.\-/%]*)?$/.test(cid)) return new Response(null, { status: 400 });

  const controle = new AbortController();
  try {
    const resposta = await Promise.any(
      PORTOES.map(async (p) => {
        const r = await fetch(p + cid, { signal: controle.signal, redirect: "follow" });
        const tipo = r.headers.get("content-type") ?? "";
        if (!r.ok || !(tipo.startsWith("image/") || tipo.startsWith("video/"))) throw new Error(String(r.status));
        return { corpo: await r.arrayBuffer(), tipo };
      }),
    );
    controle.abort();
    return new Response(resposta.corpo, {
      headers: {
        "content-type": resposta.tipo,
        "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable",
      },
    });
  } catch {
    return new Response(null, { status: 404, headers: { "cache-control": "public, s-maxage=300" } });
  }
}
