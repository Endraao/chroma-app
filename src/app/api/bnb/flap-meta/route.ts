import { NextResponse } from "next/server";

import { lerDoCacheDoBanco } from "@/lib/db";

/**
 * POST /api/bnb/flap-meta (multipart: chave, imagem, descricao, site, x,
 * telegram) → { cid } — envia a imagem e os links da moeda pro IPFS pela API
 * da Flap (https://funcs.flap.sh/api/upload), que é onde o indexador e os
 * terminais deles buscam. Só com a chave da página escondida (09/10/2026).
 */
const LINK = /^https?:\/\/\S+$/i;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ erro: "envio inválido" }, { status: 400 });
  }
  const salva = await lerDoCacheDoBanco<{ chave: string }>("pagina-bnb").catch(() => null);
  if (!salva?.chave || form.get("chave") !== salva.chave) return NextResponse.json({ ok: false }, { status: 404 });

  const imagem = form.get("imagem");
  if (!(imagem instanceof File) || imagem.size === 0) return NextResponse.json({ erro: "Escolha a imagem da moeda." }, { status: 400 });
  if (imagem.size > 5 * 1024 * 1024) return NextResponse.json({ erro: "Imagem grande demais (máx. 5 MB)." }, { status: 413 });

  const texto = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const links = { website: texto("site"), twitter: texto("x"), telegram: texto("telegram") };
  for (const [nome, v] of Object.entries(links)) {
    if (v && !LINK.test(v)) return NextResponse.json({ erro: `O link de ${nome} precisa começar com https://` }, { status: 400 });
  }

  const envio = new FormData();
  envio.append(
    "operations",
    JSON.stringify({
      query: "mutation Create($file: Upload!, $meta: MetadataInput!) { create(file: $file, meta: $meta) }",
      variables: {
        file: null,
        meta: { ...links, description: texto("descricao") ?? "", creator: "0x0000000000000000000000000000000000000000" },
      },
    }),
  );
  envio.append("map", JSON.stringify({ "0": ["variables.file"] }));
  envio.append("0", new File([await imagem.arrayBuffer()], imagem.name || "image.png", { type: imagem.type || "image/png" }));

  try {
    const r = await fetch("https://funcs.flap.sh/api/upload", { method: "POST", body: envio, signal: AbortSignal.timeout(30_000) });
    const j = await r.json().catch(() => null);
    const cid = j?.data?.create;
    if (!r.ok || typeof cid !== "string") return NextResponse.json({ erro: "A Flap não aceitou a imagem agora. Tente de novo." }, { status: 502 });
    return NextResponse.json({ cid });
  } catch {
    return NextResponse.json({ erro: "A Flap não respondeu. Tente de novo." }, { status: 502 });
  }
}
