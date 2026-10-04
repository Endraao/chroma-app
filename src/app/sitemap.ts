import type { MetadataRoute } from "next";

import { listTokens } from "@/lib/tokens";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://chromalaunch.fun";

/**
 * Mapa do site pro Google achar as páginas das moedas.
 *
 * Quem pesquisa "<nome da moeda> chart" ou o contrato cai numa página da
 * Chroma com gráfico ao vivo — tráfego de graça que cresce sozinho (pedido do
 * dono, 02/10/2026, orçamento zero de marketing). Refeito a cada hora: as
 * moedas da vitrine mudam o tempo todo.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const agora = new Date();
  const fixas = ["", "/create", "/docs", "/fees", "/affiliate", "/airdrop", "/creator-bonus"].map((p) => ({
    url: `${SITE}${p}`,
    lastModified: agora,
    changeFrequency: "daily" as const,
    priority: p === "" ? 1 : 0.7,
  }));

  const { tokens, isDemo } = await listTokens("new").catch(() => ({ tokens: [], isDemo: true }));
  const moedas = isDemo
    ? []
    : [...new Map(tokens.map((t) => [t.address.toLowerCase(), t])).values()].map((t) => ({
        url: `${SITE}/token/${t.address}`,
        lastModified: agora,
        changeFrequency: "hourly" as const,
        priority: 0.6,
      }));

  return [...fixas, ...moedas];
}
