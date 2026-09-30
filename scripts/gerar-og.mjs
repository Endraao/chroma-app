// Gera public/og.png (1200x630, fundo escuro) — a imagem do link compartilhado.
// Uso: node scripts/gerar-og.mjs
import sharp from "sharp";

const L = 1200, A = 630;
const fundo = Buffer.from(`<svg width="${L}" height="${A}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="g" cx="30%" cy="45%" r="75%">
      <stop offset="0%" stop-color="#1b2030"/>
      <stop offset="60%" stop-color="#0c0e13"/>
      <stop offset="100%" stop-color="#07080b"/>
    </radialGradient>
    <linearGradient id="t" x1="0" x2="1">
      <stop offset="0%" stop-color="#22d3ee"/>
      <stop offset="50%" stop-color="#a78bfa"/>
      <stop offset="100%" stop-color="#f472b6"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <text x="556" y="295" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="108" fill="url(#t)">CHROMA</text>
  <text x="566" y="370" font-family="Arial, sans-serif" font-weight="700" font-size="30" letter-spacing="6" fill="#e4e4e7">LAUNCHPAD · TERMINAL</text>
  <text x="566" y="450" font-family="Arial, sans-serif" font-size="30" fill="#a1a1aa">Launch and trade meme coins</text>
  <text x="566" y="492" font-family="Arial, sans-serif" font-size="30" fill="#a1a1aa">on Solana and Robinhood Chain</text>
  <text x="566" y="570" font-family="Arial, sans-serif" font-weight="700" font-size="26" fill="#22d3ee">chromalaunch.fun</text>
</svg>`);

const cristal = await sharp("public/logo.png").resize(400, 400, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
await sharp(fundo).composite([{ input: cristal, left: 110, top: 115 }]).png().toFile("public/og.png");
console.log("public/og.png pronto");
