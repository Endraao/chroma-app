import sharp from "sharp";

/**
 * GET /api/miniatura?u=<url>&w=<px>
 *
 * A arte da moeda reduzida ao tamanho do cartão, em WebP. Muita arte chega com
 * 1.000+ px e meio megabyte pra virar um quadrado de 160 px — em internet
 * lenta os cartões ficavam vazios esperando (pedido do dono, 30/09/2026).
 *
 * Guardada no CDN por um ano: a primeira visita gera, as seguintes recebem
 * pronta. Endereço da arte não muda de conteúdo (IPFS, CDN com hash).
 *
 * NÃO É PROXY ABERTO: só https, nunca endereço interno (localhost, IP de rede
 * privada, nome sem ponto), só imagem, até 8 MB, e a resposta é sempre uma
 * imagem gerada aqui — nunca o conteúdo original repassado.
 */
const LARGURAS = new Set([48, 96, 160, 256]);
const LIMITE = 8 * 1024 * 1024;

function destinoPermitido(bruto: string): URL | null {
  let u: URL;
  try {
    u = new URL(bruto);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || host.endsWith(".local") || host.endsWith(".internal") || host === "localhost") return null;
  // IP literal (v4 ou v6): recusa — arte pública vem de nome de domínio.
  if (/^\d+(\.\d+){3}$/.test(host) || host.startsWith("[") || host.includes(":")) return null;
  return u;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const destino = destinoPermitido(searchParams.get("u") ?? "");
  const largura = Number(searchParams.get("w") ?? 160);
  if (!destino || !LARGURAS.has(largura)) return new Response(null, { status: 400 });

  try {
    const r = await fetch(destino, { redirect: "follow", signal: AbortSignal.timeout(10_000) });
    const tipo = r.headers.get("content-type") ?? "";
    if (!r.ok || !tipo.startsWith("image/")) throw new Error(String(r.status));
    // O redirecionamento também não pode levar pra dentro.
    if (!destinoPermitido(r.url)) throw new Error("redirecionou pra fora do permitido");
    const tamanho = Number(r.headers.get("content-length") ?? 0);
    if (tamanho > LIMITE) throw new Error("grande demais");
    const corpo = Buffer.from(await r.arrayBuffer());
    if (corpo.length > LIMITE) throw new Error("grande demais");

    const reduzida = await sharp(corpo, { animated: false })
      .resize(largura * 2, largura * 2, { fit: "cover" }) // 2x pra tela retina
      .webp({ quality: 72 })
      .toBuffer();

    return new Response(new Uint8Array(reduzida), {
      headers: {
        "content-type": "image/webp",
        "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable",
      },
    });
  } catch {
    // Falhou: o cartão cai na arte original (onError) — ver miniatura().
    return new Response(null, { status: 404, headers: { "cache-control": "public, s-maxage=300" } });
  }
}
