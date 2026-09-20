/**
 * Teste das fotos de perfil e capa.
 *
 * Roda direto no Node (24+ executa TypeScript nativamente). Com o servidor de
 * pé, testa também o upload de verdade:
 *
 *   node scripts/test-profile-photo.mjs
 *
 * O que ele garante:
 *  - o tipo da imagem sai dos BYTES, não do que o cliente diz;
 *  - a resolução é lida certa nos quatro formatos aceitos;
 *  - imagem pequena, pesada ou de formato errado é recusada com motivo;
 *  - o aviso de corte aparece quando a proporção não bate, sem recusar;
 *  - a rota de mídia não deixa escapar caminho pra fora da pasta.
 *
 * Isso importa porque a validação do navegador pode ser burlada: basta chamar
 * a rota na mão. Se o servidor aceitasse qualquer coisa, a plataforma passaria
 * a guardar e servir arquivo arbitrário.
 */
import { deflateSync, crc32 } from "node:zlib";

import { lerImagem } from "../src/lib/image-probe.ts";
import {
  FOTO_DE_CAPA,
  FOTO_DE_PERFIL,
  avisoDeCorte,
  recusar,
  resumoDaEspec,
} from "../src/lib/profile-media.ts";

let falhas = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "  ok  " : " FALHA"}  ${msg}`);
  if (!cond) falhas++;
};

/* ------------------------------------------------------------------ */
/* Imagens de mentira, construídas byte a byte                         */
/* ------------------------------------------------------------------ */

/** PNG cinza válido de verdade: assinatura + IHDR + IDAT + IEND. */
function png(largura, altura) {
  const chunk = (tipo, dados) => {
    const tamanho = Buffer.alloc(4);
    tamanho.writeUInt32BE(dados.length);
    const corpo = Buffer.concat([Buffer.from(tipo, "ascii"), dados]);
    const checagem = Buffer.alloc(4);
    checagem.writeUInt32BE(crc32(corpo));
    return Buffer.concat([tamanho, corpo, checagem]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 0; // escala de cinza

  // Uma linha por altura, cada uma começando com o byte de filtro.
  const cru = Buffer.concat(
    Array.from({ length: altura }, () =>
      Buffer.concat([Buffer.from([0]), Buffer.alloc(largura, 128)]),
    ),
  );

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(cru)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Só o cabeçalho: é tudo que o probe olha. */
function jpeg(largura, altura) {
  const b = Buffer.alloc(20);
  b.set([0xff, 0xd8], 0); // início da imagem
  b.set([0xff, 0xe0], 2); // APP0, vazio: só o campo de tamanho
  b.writeUInt16BE(2, 4);
  b.set([0xff, 0xc0], 6); // SOF0, logo depois do APP0
  b.writeUInt16BE(11, 8);
  b[10] = 8; // bits por amostra
  b.writeUInt16BE(altura, 11);
  b.writeUInt16BE(largura, 13);
  return b;
}

function gif(largura, altura) {
  const b = Buffer.alloc(13);
  b.write("GIF89a", 0, "ascii");
  b.writeUInt16LE(largura, 6);
  b.writeUInt16LE(altura, 8);
  return b;
}

function webpVP8X(largura, altura) {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(22, 4);
  b.write("WEBPVP8X", 8, "ascii");
  b.writeUInt32LE(10, 16);
  const escreve3 = (valor, i) => {
    b[i] = valor & 0xff;
    b[i + 1] = (valor >> 8) & 0xff;
    b[i + 2] = (valor >> 16) & 0xff;
  };
  escreve3(largura - 1, 24);
  escreve3(altura - 1, 27);
  return b;
}

/* ------------------------------------------------------------------ */

console.log("\n--- o tipo vem dos bytes, não do que o cliente diz ---");
const casos = [
  ["PNG", png(400, 400), "image/png", 400, 400],
  ["JPEG", jpeg(1500, 500), "image/jpeg", 1500, 500],
  ["GIF", gif(320, 240), "image/gif", 320, 240],
  ["WebP", webpVP8X(900, 300), "image/webp", 900, 300],
];

for (const [nome, bytes, mime, w, h] of casos) {
  const lido = lerImagem(new Uint8Array(bytes));
  ok(
    lido?.mime === mime && lido?.width === w && lido?.height === h,
    `${nome}: ${lido?.mime} ${lido?.width}x${lido?.height} (esperado ${mime} ${w}x${h})`,
  );
}

const texto = Buffer.from("MZ isto aqui é um executável, não uma imagem");
ok(lerImagem(new Uint8Array(texto)) === null, "arquivo que não é imagem é rejeitado na leitura");

console.log("\n--- regras da foto de perfil ---");
ok(
  recusar(FOTO_DE_PERFIL, { mime: "image/png", bytes: 50_000, width: 400, height: 400 }) === null,
  `400x400 PNG passa (${resumoDaEspec(FOTO_DE_PERFIL)})`,
);
ok(
  Boolean(recusar(FOTO_DE_PERFIL, { mime: "image/png", bytes: 5_000, width: 100, height: 100 })),
  "100x100 é recusada por resolução",
);
ok(
  Boolean(
    recusar(FOTO_DE_PERFIL, { mime: "image/png", bytes: 9 * 1024 * 1024, width: 400, height: 400 }),
  ),
  "9 MB é recusada por tamanho",
);
ok(
  Boolean(recusar(FOTO_DE_PERFIL, { mime: "image/svg+xml", bytes: 2_000, width: 400, height: 400 })),
  "SVG é recusado por formato",
);

console.log("\n--- regras da foto de capa ---");
ok(
  recusar(FOTO_DE_CAPA, { mime: "image/jpeg", bytes: 300_000, width: 1500, height: 500 }) === null,
  `1500x500 JPG passa (${resumoDaEspec(FOTO_DE_CAPA)})`,
);
ok(
  avisoDeCorte(FOTO_DE_CAPA, { width: 1500, height: 500 }) === null,
  "na proporção certa, nenhum aviso",
);
ok(
  Boolean(avisoDeCorte(FOTO_DE_CAPA, { width: 1200, height: 1200 })),
  "capa quadrada avisa que vai cortar",
);
ok(
  recusar(FOTO_DE_CAPA, { mime: "image/jpeg", bytes: 300_000, width: 1200, height: 1200 }) === null,
  "e o aviso de corte NÃO recusa a imagem",
);

/* ------------------------------------------------------------------ */
/* Ponta a ponta, se o servidor estiver de pé                          */
/* ------------------------------------------------------------------ */

const BASE = "http://localhost:3000";
const servidorDePe = await fetch(`${BASE}/api/account?check=teste`)
  .then((r) => r.ok)
  .catch(() => false);

if (!servidorDePe) {
  console.log("\n(servidor fora do ar: pulei o teste de upload)");
} else {
  console.log("\n--- upload de verdade ---");

  /*
   * Carteira e apelido novos a cada execução. Com valores fixos o teste
   * trocaria a foto de uma conta de verdade do `.data` — e os arquivos de
   * dados são append-only, nada desfaz isso depois.
   */
  const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const CARTEIRA = Array.from(
    { length: 44 },
    () => BASE58[Math.floor(Math.random() * BASE58.length)],
  ).join("");
  const APELIDO = "teste_foto_" + Math.random().toString(36).slice(2, 8);

  const registro = await fetch(`${BASE}/api/account`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nickname: APELIDO, wallet: CARTEIRA, kind: "solana" }),
  });
  ok(registro.ok, `conta de teste criada: @${APELIDO}`);

  const enviar = async (campo, arquivo, nome, tipo) => {
    const form = new FormData();
    form.append("wallet", CARTEIRA);
    form.append("campo", campo);
    form.append("file", new Blob([arquivo], { type: tipo }), nome);
    const res = await fetch(`${BASE}/api/account/photo`, { method: "POST", body: form });
    return { status: res.status, corpo: await res.json() };
  };

  const pequena = await enviar("avatar", png(64, 64), "pequena.png", "image/png");
  ok(pequena.status === 400, `64x64 recusada pelo servidor: ${pequena.corpo.error}`);

  /*
   * O ponto principal: o arquivo se declara PNG no Content-Type e no nome, mas
   * o conteúdo não é imagem. Se o servidor olhasse só o que foi declarado,
   * isto entraria.
   */
  const disfarcado = await enviar("avatar", texto, "foto.png", "image/png");
  ok(disfarcado.status === 400, `arquivo disfarçado de PNG recusado: ${disfarcado.corpo.error}`);

  const valida = await enviar("avatar", png(400, 400), "ok.png", "image/png");
  ok(
    valida.status === 200,
    valida.status === 200
      ? `400x400 aceita: ${valida.corpo.url}`
      : `400x400 deveria passar, veio ${valida.status}: ${valida.corpo.error}`,
  );

  const semConta = await (async () => {
    const form = new FormData();
    form.append("wallet", "1".repeat(44));
    form.append("campo", "avatar");
    form.append("file", new Blob([png(400, 400)], { type: "image/png" }), "ok.png");
    const res = await fetch(`${BASE}/api/account/photo`, { method: "POST", body: form });
    return { status: res.status, corpo: await res.json() };
  })();
  ok(semConta.status === 404, `carteira sem apelido é barrada: ${semConta.corpo.error}`);

  if (valida.status === 200) {
    const servida = await fetch(`${BASE}${valida.corpo.url}`);
    ok(servida.ok, "a foto é servida de volta");
    ok(
      servida.headers.get("content-type") === "image/png",
      `com o tipo certo (${servida.headers.get("content-type")})`,
    );
    ok(
      servida.headers.get("x-content-type-options") === "nosniff",
      "e com nosniff, pra o navegador não reinterpretar o conteúdo",
    );

    const repetida = await enviar("avatar", png(400, 400), "ok.png", "image/png");
    ok(
      repetida.corpo.url === valida.corpo.url,
      "a mesma imagem enviada de novo reaproveita o arquivo (nome = hash do conteúdo)",
    );

    /*
     * Trocar a capa não pode apagar a foto de perfil. É o erro clássico de
     * gravar só o campo enviado por cima do registro anterior.
     */
    const capa = await enviar("cover", png(1500, 500), "capa.png", "image/png");
    ok(capa.status === 200, `capa 1500x500 aceita: ${capa.corpo.url}`);
    ok(
      capa.corpo.account?.avatar === valida.corpo.url,
      "e a foto de perfil continua lá depois de trocar a capa",
    );
    ok(
      capa.corpo.account?.nickname === APELIDO,
      "e o apelido também continua o mesmo",
    );
  }

  console.log("\n--- caminho pra fora da pasta ---");
  for (const tentativa of ["..%2F..%2F.env", "....//....//package.json", "nao_existe.png"]) {
    const res = await fetch(`${BASE}/api/media/${tentativa}`);
    ok(!res.ok, `${tentativa} não é servido (${res.status})`);
  }
}

console.log(falhas === 0 ? "\nTUDO PASSOU\n" : `\n${falhas} FALHA(S)\n`);
process.exitCode = falhas === 0 ? 0 : 1;
