import { createHash } from "node:crypto";

/**
 * Backup diário do banco às 6h (UTC), no lugar do cron da Vercel
 * (vercel.json). Só chama a rota /api/cron/backup com a chave interna — a
 * mesma conta de src/lib/chave-interna.ts.
 */
export default async () => {
  const chave =
    process.env.CRON_SECRET ||
    createHash("sha256").update(`backup:${process.env.DATABASE_URL ?? ""}`).digest("hex");
  const base = process.env.URL || "https://chromalaunch.fun";
  const r = await fetch(`${base}/api/cron/backup`, { headers: { authorization: `Bearer ${chave}` } });
  console.log("[backup-diario]", r.status, await r.text());
};

export const config = { schedule: "0 6 * * *" };
