import "server-only";

import { createHash } from "node:crypto";

/**
 * Senha das rotas internas (backup, migração) sem precisar cadastrar mais uma
 * variável na Netlify: sai do DATABASE_URL, que só o servidor conhece. Se
 * CRON_SECRET existir, vale ela.
 */
export function chaveInterna(uso: "backup" | "migrar"): string {
  if (uso === "backup" && process.env.CRON_SECRET) return process.env.CRON_SECRET;
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL não configurada");
  return createHash("sha256").update(`${uso}:${base}`).digest("hex");
}
