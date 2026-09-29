// Cópia do banco neste computador. Uso: npx tsx --env-file=.env.local scripts/backup-local.mts
import { mkdirSync, writeFileSync } from "node:fs";
import { exportarBanco } from "../src/lib/backup.ts";

const dados = await exportarBanco();
mkdirSync("backups", { recursive: true });
const arquivo = `backups/chroma-${dados.em.replace(/[:.]/g, "-")}.json`;
writeFileSync(arquivo, JSON.stringify(dados, null, 1));
console.log(arquivo, Object.fromEntries(Object.entries(dados.tabelas).map(([t, l]) => [t, l.length])));
