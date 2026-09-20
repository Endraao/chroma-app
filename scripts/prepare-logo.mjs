/**
 * Prepara o logo da Chroma: recorta a sobra e gera os tamanhos usados.
 *
 *   node scripts/prepare-logo.mjs <caminho-da-imagem-original>
 *
 * O arquivo original já vem com fundo transparente (o branco que aparece em
 * visualizador é só o fundo da tela). Então aqui não se remove nada: o que o
 * script faz é achar o retângulo onde o cristal realmente está, recortar a
 * área vazia em volta e gerar os três tamanhos que a aplicação usa.
 *
 * Também mede o brilho do objeto, porque um logo escuro num site preto pode
 * sumir — e é melhor saber disso agora do que descobrir na tela.
 */
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const origem = process.argv[2];
if (!origem) {
  console.error("uso: node scripts/prepare-logo.mjs <caminho-da-imagem>");
  process.exit(1);
}

const entrada = sharp(origem).ensureAlpha();
const { width, height } = await entrada.metadata();
const { data } = await entrada.raw().toBuffer({ resolveWithObject: true });

console.log(`original: ${width}x${height}`);

/* --- 1. Onde o objeto está de fato ------------------------------------- */

let minX = width;
let minY = height;
let maxX = -1;
let maxY = -1;

// Brilho médio do que é visível, pra avaliar contraste com o fundo do site.
let somaBrilho = 0;
let visiveis = 0;

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const p = (y * width + x) * 4;
    if (data[p + 3] <= 8) continue; // transparente: não conta

    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;

    somaBrilho += (data[p] + data[p + 1] + data[p + 2]) / 3;
    visiveis++;
  }
}

if (maxX < 0) {
  console.error("a imagem está inteira transparente");
  process.exit(1);
}

const larguraObj = maxX - minX + 1;
const alturaObj = maxY - minY + 1;
const brilhoMedio = Math.round(somaBrilho / visiveis);

console.log(`objeto: ${larguraObj}x${alturaObj} em (${minX},${minY})`);
console.log(`brilho médio: ${brilhoMedio}/255 — o fundo do site é 7/255`);
if (brilhoMedio < 60) {
  console.log("aviso: logo escuro. Precisa de um brilho atrás dele pra não sumir no tema escuro.");
}

/* --- 2. Quadrado com respiro ------------------------------------------- */

const lado = Math.max(larguraObj, alturaObj);
const margem = Math.round(lado * 0.04);
const ladoFinal = lado + margem * 2;

const quadrado = await sharp(Buffer.from(data), { raw: { width, height, channels: 4 } })
  .extract({ left: minX, top: minY, width: larguraObj, height: alturaObj })
  .resize({
    width: ladoFinal,
    height: ladoFinal,
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toBuffer();

/* --- 3. Tamanhos usados na aplicação ----------------------------------- */

mkdirSync("public", { recursive: true });
mkdirSync("src/app", { recursive: true });

const saidas = [
  // Logo da interface (cabeçalho, modal de login). 2x pra tela retina.
  { arquivo: "public/logo.png", tamanho: 256 },
  // Ícone da aba: o App Router serve src/app/icon.png sozinho.
  { arquivo: "src/app/icon.png", tamanho: 64 },
  // Ícone de atalho no iOS.
  { arquivo: "src/app/apple-icon.png", tamanho: 180 },
];

for (const { arquivo, tamanho } of saidas) {
  const info = await sharp(quadrado)
    .resize(tamanho, tamanho)
    .png({ quality: 95, compressionLevel: 9 })
    .toFile(arquivo);
  console.log(`${arquivo.padEnd(24)} ${tamanho}x${tamanho}  ${(info.size / 1024).toFixed(1)} KB`);
}
