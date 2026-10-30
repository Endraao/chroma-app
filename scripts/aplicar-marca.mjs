/**
 * Veste o site com a marca de um cliente (white-label): logo, ícones e a capa
 * que aparece quando o link é compartilhado.
 *
 *   node scripts/aplicar-marca.mjs <logo-do-cliente.png>
 *
 * Lê nome, cor e domínio do .env.local (NEXT_PUBLIC_MARCA_*,
 * NEXT_PUBLIC_SITE_URL) — preencha antes. Sobrescreve public/logo.png,
 * src/app/icon.png, src/app/apple-icon.png e public/og-2.png: NÃO rodar na
 * pasta da Chroma (ver docs/white-label.md).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import sharp from "sharp";

const logo = process.argv[2];
if (!logo || !existsSync(logo)) {
  console.error("uso: node scripts/aplicar-marca.mjs <logo-do-cliente.png>");
  process.exit(1);
}

const env = Object.fromEntries(
  (existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "")
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const nome = env.NEXT_PUBLIC_MARCA_NOME;
if (!nome || nome === "Chroma") {
  console.error("Preencha NEXT_PUBLIC_MARCA_NOME no .env.local com o nome do cliente antes.");
  process.exit(1);
}
const cor = env.NEXT_PUBLIC_MARCA_COR || "#22d3ee";
const dominio = (env.NEXT_PUBLIC_SITE_URL || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");

// 1. Logo e ícones: o mesmo recorte do logo da Chroma.
execFileSync(process.execPath, ["scripts/prepare-logo.mjs", logo], { stdio: "inherit" });

// 2. Capa de compartilhamento (1200x630), no layout da antiga da Chroma.
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const tamanhoDoNome = Math.max(56, Math.min(108, Math.floor(1100 / Math.max(nome.length, 1))));
const fundo = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="g" cx="30%" cy="45%" r="75%">
      <stop offset="0%" stop-color="#1b2030"/>
      <stop offset="60%" stop-color="#0c0e13"/>
      <stop offset="100%" stop-color="#07080b"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <text x="556" y="295" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="${tamanhoDoNome}" fill="${cor}">${esc(nome.toUpperCase())}</text>
  <text x="566" y="370" font-family="Arial, sans-serif" font-weight="700" font-size="30" letter-spacing="6" fill="#e4e4e7">LAUNCHPAD · TERMINAL</text>
  <text x="566" y="450" font-family="Arial, sans-serif" font-size="30" fill="#a1a1aa">Launch and trade meme coins</text>
  <text x="566" y="492" font-family="Arial, sans-serif" font-size="30" fill="#a1a1aa">on Solana, with live charts</text>
  <text x="566" y="570" font-family="Arial, sans-serif" font-weight="700" font-size="26" fill="${cor}">${esc(dominio)}</text>
</svg>`);
const marca = await sharp("public/logo.png")
  .resize(400, 400, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
await sharp(fundo).composite([{ input: marca, left: 110, top: 115 }]).png().toFile("public/og-2.png");
console.log("public/og-2.png pronto");
