import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://chromalaunch.fun";

/**
 * Buscadores podem ler tudo que é página; API e admin ficam de fora — MENOS
 * as imagens (/api/logo, /api/media): o robô do X respeita o robots.txt e o
 * card do post saía sem a foto da moeda (07/10/2026).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/api/logo/", "/api/media/"], disallow: ["/api/", "/admin/"] }],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
