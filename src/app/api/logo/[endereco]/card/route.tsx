import { ImageResponse } from "next/og";

import { CACHE_DA_CAPA, logoEmDataUri } from "@/lib/capa-do-post";
import { getToken } from "@/lib/tokens";

/**
 * GET /api/logo/[endereco]/card → a CAPA do post do X (PNG 1200×1200).
 *
 * O X usa esta imagem no lugar da janela de compra onde não dá pra abrir a
 * janela na hora (celular, prévia). Igual ao XPeriment, que abre no Android e
 * no iPhone (08/10/2026): imagem grande e QUADRADA, do mesmo formato da janela
 * (480×480). Imagem pequena ou de outro formato faz o X mostrar o cartão
 * pequeno que só abre o site.
 */
export const revalidate = 3600;

export async function GET(_req: Request, { params }: { params: Promise<{ endereco: string }> }) {
  const { endereco } = await params;
  const [{ token }, logo] = await Promise.all([getToken(endereco), logoEmDataUri(endereco)]);
  const simbolo = (token.symbol || "?").slice(0, 12);
  const rede = token.chain === "robinhood" ? "ROBINHOOD CHAIN" : "SOLANA";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 50% 30%, #0e3a44 0%, #07070a 70%)",
          color: "#f4f4f5",
          fontFamily: "sans-serif",
        }}
      >
        {logo ? (
          <img src={logo} width={420} height={420} style={{ borderRadius: 999, objectFit: "cover" }} />
        ) : (
          <div
            style={{
              width: 420,
              height: 420,
              borderRadius: 999,
              background: "#1f2937",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 160,
              fontWeight: 900,
            }}
          >
            {simbolo.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div style={{ fontSize: 110, fontWeight: 900, marginTop: 50 }}>{`$${simbolo}`}</div>
        <div style={{ fontSize: 56, fontWeight: 800, color: "#22d3ee", marginTop: 18 }}>Buy right in this post</div>
        <div style={{ fontSize: 34, color: "#9aa4b2", marginTop: 60, letterSpacing: 4 }}>{`CHROMA · ${rede}`}</div>
      </div>
    ),
    {
      width: 1200,
      height: 1200,
      // O robô do X desiste se a imagem demora: fica guardada no CDN da Vercel.
      headers: CACHE_DA_CAPA,
    },
  );
}
