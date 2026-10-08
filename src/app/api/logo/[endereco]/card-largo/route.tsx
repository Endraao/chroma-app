import { ImageResponse } from "next/og";

import { CACHE_DA_CAPA, logoEmDataUri } from "@/lib/capa-do-post";
import { getToken } from "@/lib/tokens";

/**
 * GET /api/logo/[endereco]/card-largo → capa 1200×630 do post do X no formato
 * "imagem grande" (summary_large_image). Usada enquanto o X não abre a janela
 * de compra dentro do post (08/10/2026): tocar na imagem abre o link — no
 * celular cai na janela de compra, no PC na página da moeda.
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
          alignItems: "center",
          padding: "0 90px",
          gap: 70,
          background: "radial-gradient(circle at 25% 40%, #0e3a44 0%, #07070a 70%)",
          color: "#f4f4f5",
          fontFamily: "sans-serif",
        }}
      >
        {logo ? (
          <img src={logo} width={380} height={380} style={{ borderRadius: 999, objectFit: "cover" }} />
        ) : (
          <div
            style={{
              width: 380,
              height: 380,
              borderRadius: 999,
              background: "#1f2937",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 140,
            }}
          >
            {simbolo.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 100, lineHeight: 1 }}>{`$${simbolo}`}</div>
          <div style={{ fontSize: 50, color: "#22d3ee", marginTop: 26 }}>Tap to buy on Chroma</div>
          <div style={{ fontSize: 30, color: "#9aa4b2", marginTop: 44, letterSpacing: 4 }}>{`CHROMA · ${rede}`}</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: CACHE_DA_CAPA },
  );
}
