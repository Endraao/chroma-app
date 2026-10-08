import { ImageResponse } from "next/og";

import { ganhosDoDivulgador } from "@/lib/ranking-divulgadores";

/**
 * GET /ganhos/[id]/imagem → o card "quanto eu ganhei postando" (PNG 1200×630),
 * pro X mostrar grande no post. Números conferidos na Solana (ver
 * lib/ranking-divulgadores).
 */
export const revalidate = 300;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await ganhosDoDivulgador(decodeURIComponent(id)).catch(() => null);
  const semana = g?.semana;
  const total = g?.total;
  const sol = semana?.ganhoSol ?? total?.ganhoSol ?? 0;
  const usd = semana?.ganhoUsd ?? total?.ganhoUsd ?? 0;
  const periodo = semana ? "this week" : "so far";
  const negocios = semana?.negocios ?? total?.negocios ?? 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 72px",
          background: "radial-gradient(circle at 80% 10%, #0e3a44 0%, #07070a 62%)",
          color: "#f4f4f5",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: 2 }}>CHROMA</div>
          <div style={{ display: "flex", fontSize: 24, color: "#22d3ee", fontWeight: 700 }}>VERIFIED ON SOLANA</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 34, color: "#9aa4b2" }}>{`${g?.nome ?? ""} earned`}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 24, marginTop: 6 }}>
            <div style={{ fontSize: 132, fontWeight: 900, color: "#22d3ee", lineHeight: 1 }}>{`+${sol.toFixed(sol >= 1 ? 2 : 4)} SOL`}</div>
            <div style={{ fontSize: 44, color: "#d4d4d8" }}>{`≈ $${usd.toFixed(2)}`}</div>
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, marginTop: 18 }}>{`${periodo}, just by posting coins on X`}</div>
          <div style={{ fontSize: 28, color: "#9aa4b2", marginTop: 10 }}>
            {`${negocios} trade${negocios === 1 ? "" : "s"} brought by their posts${g?.posicao ? ` · #${g.posicao} on the weekly leaderboard` : ""}`}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 30, color: "#d4d4d8" }}>No upfront payments. Earn per trade.</div>
          <div style={{ fontSize: 34, fontWeight: 900, color: "#22d3ee" }}>chromalaunch.fun/divulgar</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
