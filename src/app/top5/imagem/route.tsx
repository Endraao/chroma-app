import { ImageResponse } from "next/og";
import sharp from "sharp";

import { dinheiro, top5, type RedeDoTop } from "@/lib/top5";

/**
 * GET /top5/imagem?rede=robinhood|solana → a imagem do "Top 5 do dia" (PNG
 * 1600×900), pronta pra postar no X. Ver /top5.
 */
export const revalidate = 1800;

/** Arte da moeda em PNG embutido: o gerador de imagem não lê WebP. */
async function arte(url: string | null): Promise<string | null> {
  if (!url?.startsWith("https://")) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const png = await sharp(Buffer.from(await r.arrayBuffer())).resize(96, 96, { fit: "cover" }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const rede = (new URL(request.url).searchParams.get("rede") === "solana" ? "solana" : "robinhood") as RedeDoTop;
  const lista = await top5(rede).catch(() => []);
  const artes = await Promise.all(lista.map((m) => arte(m.imagem)));
  const nomeDaRede = rede === "robinhood" ? "Robinhood Chain" : "Solana";
  const hoje = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "70px 90px",
          background: "radial-gradient(circle at 75% 15%, #1b1b24 0%, #07070a 70%)",
          color: "#f4f4f5",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 26, letterSpacing: 6, fontWeight: 800, color: "#a78bfa" }}>{`TOP 5 · ${nomeDaRede.toUpperCase()}`}</div>
            <div style={{ fontSize: 64, fontWeight: 900, marginTop: 6 }}>Trending today</div>
          </div>
          <div style={{ fontSize: 24, color: "#8b8b96" }}>{`${hoje} · 24h volume`}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 40, gap: 18 }}>
          {lista.map((m, i) => (
            <div
              key={m.endereco}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "16px 26px",
                borderRadius: 18,
                background: i === 0 ? "rgba(34,211,238,0.10)" : "rgba(255,255,255,0.04)",
                border: i === 0 ? "2px solid rgba(34,211,238,0.5)" : "2px solid rgba(255,255,255,0.06)",
              }}
            >
              <div style={{ width: 60, fontSize: 40, fontWeight: 900, color: i === 0 ? "#22d3ee" : "#71717a" }}>{`${i + 1}`}</div>
              {artes[i] ? (
                <img src={artes[i]!} width={64} height={64} style={{ borderRadius: 14, marginRight: 24 }} />
              ) : (
                <div style={{ width: 64, height: 64, borderRadius: 14, marginRight: 24, background: "#27272a" }} />
              )}
              <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
                <div style={{ fontSize: 38, fontWeight: 800 }}>{`$${m.simbolo}`}</div>
                <div style={{ fontSize: 22, color: "#8b8b96" }}>{m.x ? `@${m.x}` : m.nome}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <div style={{ fontSize: 38, fontWeight: 800 }}>{dinheiro(m.volumeUsd)}</div>
                <div style={{ fontSize: 20, color: "#71717a" }}>{m.mcapUsd > 0 ? `mcap ${dinheiro(m.mcapUsd)}` : "volume 24h"}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto", fontSize: 26 }}>
          <div style={{ fontWeight: 900, color: "#a78bfa" }}>CHROMA</div>
          <div style={{ color: "#22d3ee", fontWeight: 700 }}>Live charts for every coin · chromalaunch.fun</div>
        </div>
      </div>
    ),
    { width: 1600, height: 900 },
  );
}
