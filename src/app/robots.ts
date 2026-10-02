import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://chromalaunch.fun";

/** Buscadores podem ler tudo que é página; API e admin ficam de fora. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin/"] }],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
