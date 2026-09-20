/**
 * Teste da mídia e dos metadados da moeda.
 *
 * Roda direto no Node (24+ executa TypeScript nativamente). Com o servidor de
 * pé, testa o envio de verdade:
 *
 *   node scripts/test-token-media.mjs
 *
 * Por que este caminho merece teste mais do que os outros: a URL dos metadados
 * entra na transação de criação de forma IMUTÁVEL. Se o arquivo subir errado,
 * não existe editar depois — o token fica errado pra sempre, e quem pagou a
 * taxa perdeu. Aqui é o único lugar onde ainda dá pra pegar.
 *
 * O que ele garante:
 *  - a resolução do MP4 é lida dos bytes, não do que o cliente diz;
 *  - imagem pequena, arquivo pesado e formato errado são recusados;
 *  - nome ou símbolo fora do limite ON-CHAIN são barrados ANTES de gravar nada;
 *  - os metadados saem no formato que as carteiras leem, com URL absoluta;
 *  - a URL cabe no campo on-chain e é acessível de outra origem.
 */
import { deflateSync, crc32 } from "node:zlib";

import { lerVideo } from "../src/lib/video-probe.ts";
import { lerImagem } from "../src/lib/image-probe.ts";
import { MIDIA_DA_MOEDA, BANNER_DA_MOEDA, recusar } from "../src/lib/token-media.ts";
import { LIMITES, montarMetadados, recusarMetadados } from "../src/lib/token-metadata.ts";

const BASE = "http://localhost:3000";

let falhas = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "  ok  " : " FALHA"}  ${msg}`);
  if (!cond) falhas++;
};

/* ------------------------------------------------------------------ */
/* Arquivos de mentira, montados byte a byte                           */
/* ------------------------------------------------------------------ */

/** PNG cinza válido de verdade. */
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
  ihdr[8] = 8;
  ihdr[9] = 0;

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

/**
 * MP4 mínimo: a caixa `ftyp` e a árvore `moov > trak > tkhd`.
 *
 * Não toca — é só o cabeçalho, que é tudo que o leitor olha.
 */
function mp4(largura, altura) {
  const caixa = (tipo, conteudo) => {
    const cabecalho = Buffer.alloc(8);
    cabecalho.writeUInt32BE(8 + conteudo.length, 0);
    cabecalho.write(tipo, 4, "ascii");
    return Buffer.concat([cabecalho, conteudo]);
  };

  const ftyp = caixa("ftyp", Buffer.concat([Buffer.from("isomisom", "ascii")]));

  const tkhd = Buffer.alloc(84);
  tkhd.writeUInt32BE(0, 0); // versão 0 + flags
  tkhd.writeUInt32BE(1, 12); // track_ID
  // A resolução fica no fim, em ponto fixo 16.16.
  tkhd.writeUInt32BE(largura << 16, 76);
  tkhd.writeUInt32BE(altura << 16, 80);

  return Buffer.concat([ftyp, caixa("moov", caixa("trak", caixa("tkhd", tkhd)))]);
}

/* ------------------------------------------------------------------ */

console.log("\n--- resolução lida dos bytes ---");
for (const [nome, bytes, w, h] of [
  ["MP4 paisagem", mp4(1920, 1080), 1920, 1080],
  ["MP4 retrato", mp4(1080, 1920), 1080, 1920],
  ["MP4 quadrado", mp4(1000, 1000), 1000, 1000],
]) {
  const lido = lerVideo(new Uint8Array(bytes));
  ok(
    lido?.width === w && lido?.height === h,
    `${nome}: ${lido?.width}x${lido?.height} (esperado ${w}x${h})`,
  );
}

const naoEhVideo = Buffer.from("isto aqui nao e um mp4 de jeito nenhum");
ok(lerVideo(new Uint8Array(naoEhVideo)) === null, "arquivo que não é MP4 é rejeitado");
ok(lerImagem(new Uint8Array(mp4(100, 100))) === null, "MP4 não passa por imagem");

console.log("\n--- regras da arte da moeda ---");
ok(
  recusar(MIDIA_DA_MOEDA, { mime: "image/png", bytes: 500_000, width: 1000, height: 1000 }) === null,
  "1000x1000 PNG passa",
);
ok(
  Boolean(recusar(MIDIA_DA_MOEDA, { mime: "image/png", bytes: 500_000, width: 800, height: 800 })),
  "800x800 é recusada: fica borrada no cartão da home",
);
/*
 * Vídeo vertical de celular tem 1080 de largura. A régua de nitidez de arte
 * estática não se aplica a ele — o vídeo é julgado pelo peso.
 */
ok(
  recusar(MIDIA_DA_MOEDA, { mime: "video/mp4", bytes: 9_000_000, width: 720, height: 1280 }) === null,
  "vídeo vertical 720x1280 passa (o mínimo de lado é só pra imagem)",
);
ok(
  Boolean(
    recusar(MIDIA_DA_MOEDA, { mime: "video/mp4", bytes: 40 * 1024 * 1024, width: 1920, height: 1080 }),
  ),
  "vídeo de 40 MB é recusado (limite 30)",
);
ok(
  Boolean(
    recusar(MIDIA_DA_MOEDA, { mime: "image/png", bytes: 20 * 1024 * 1024, width: 1000, height: 1000 }),
  ),
  "imagem de 20 MB é recusada (limite 15)",
);

console.log("\n--- regras do banner ---");
ok(
  recusar(BANNER_DA_MOEDA, { mime: "image/png", bytes: 300_000, width: 1500, height: 500 }) === null,
  "1500x500 passa",
);
ok(
  Boolean(recusar(BANNER_DA_MOEDA, { mime: "image/png", bytes: 300_000, width: 800, height: 800 })),
  "banner quadrado é recusado: a proporção é 3:1",
);

console.log("\n--- limites que vêm da rede, não de nós ---");
ok(
  Boolean(recusarMetadados({ name: "a".repeat(33), symbol: "AAA", image: "x" })),
  `nome com 33 caracteres é barrado (o limite on-chain é ${LIMITES.name})`,
);
ok(
  Boolean(recusarMetadados({ name: "Gato", symbol: "A".repeat(11), image: "x" })),
  `símbolo com 11 caracteres é barrado (o limite on-chain é ${LIMITES.symbol})`,
);
ok(
  Boolean(recusarMetadados({ name: "Gato", symbol: "GATO", image: "x", website: "gato.com" })),
  "link sem http:// é barrado",
);
ok(
  recusarMetadados({ name: "Gato", symbol: "GATO", image: "x", website: "https://gato.com" }) === null,
  "nome, símbolo e link dentro das regras passam",
);

console.log("\n--- formato dos metadados ---");
const meta = montarMetadados(
  {
    name: "Gato Turbo",
    symbol: "TURBO",
    description: "um gato rápido",
    image: "/api/media/abc.mp4",
    animationUrl: "/api/media/abc.mp4",
    banner: "/api/media/def.png",
    twitter: "https://x.com/gato",
    creator: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
  },
  "https://chroma.app",
);

ok(meta.image.startsWith("https://"), `a imagem vira URL absoluta: ${meta.image}`);
ok(meta.animation_url === meta.image, "vídeo entra como imagem E como animação");
ok(meta.properties.category === "video", "categoria marcada como vídeo");
ok(meta.properties.files.length === 3, `${meta.properties.files.length} arquivos listados (arte, vídeo, banner)`);
ok(meta.extensions?.twitter === "https://x.com/gato", "rede social vai em extensions, onde as carteiras procuram");
ok(meta.properties.creators?.[0]?.share === 100, "100% ao criador: a Chroma não retém participação");

/* ------------------------------------------------------------------ */

const online = await fetch(`${BASE}/api/account?check=teste`)
  .then((r) => r.ok)
  .catch(() => false);

if (!online) {
  console.log("\n(servidor fora do ar: pulei o envio de verdade)");
} else {
  console.log("\n--- envio de verdade ---");

  const enviar = async (campos, arte, banner) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(campos)) form.append(k, v);
    if (arte) form.append("coin", new Blob([arte.bytes], { type: arte.tipo }), arte.nome);
    if (banner) form.append("banner", new Blob([banner.bytes], { type: banner.tipo }), banner.nome);
    const res = await fetch(`${BASE}/api/token-media`, { method: "POST", body: form });
    return { status: res.status, corpo: await res.json() };
  };

  const base = { name: "Gato Turbo", symbol: "TURBO", description: "um gato rápido" };
  const arteBoa = { bytes: png(1000, 1000), tipo: "image/png", nome: "gato.png" };

  const pequena = await enviar(base, { bytes: png(400, 400), tipo: "image/png", nome: "p.png" });
  ok(pequena.status === 400, `arte 400x400 recusada: ${pequena.corpo.error}`);

  const disfarcada = await enviar(base, {
    bytes: naoEhVideo,
    tipo: "video/mp4",
    nome: "gato.mp4",
  });
  ok(disfarcada.status === 400, `arquivo disfarçado de vídeo recusado: ${disfarcada.corpo.error}`);

  const nomeLongo = await enviar({ ...base, name: "a".repeat(40) }, arteBoa);
  ok(nomeLongo.status === 400, `nome longo barrado antes de gravar: ${nomeLongo.corpo.error}`);

  const valida = await enviar(base, arteBoa, {
    bytes: png(1500, 500),
    tipo: "image/png",
    nome: "banner.png",
  });
  ok(valida.status === 200, `envio aceito: ${valida.corpo.error ?? valida.corpo.metadataUrl}`);

  if (valida.status === 200) {
    const url = valida.corpo.metadataUrl;

    ok(
      url.length <= LIMITES.uri,
      `a URL cabe no campo on-chain: ${url.length} de ${LIMITES.uri} caracteres`,
    );

    const res = await fetch(url);
    ok(res.ok, "os metadados são servidos de volta");
    ok(
      res.headers.get("access-control-allow-origin") === "*",
      "e podem ser lidos de outra origem (senão a carteira mostra o token sem nome)",
    );

    const json = await res.json();
    ok(json.name === base.name && json.symbol === base.symbol, `nome e símbolo certos: ${json.name} / ${json.symbol}`);
    ok(String(json.image).startsWith("http"), `imagem em URL absoluta: ${json.image}`);

    const imagem = await fetch(json.image);
    ok(imagem.ok && imagem.headers.get("content-type") === "image/png", "a imagem dos metadados abre");

    const repetido = await enviar(base, arteBoa, {
      bytes: png(1500, 500),
      tipo: "image/png",
      nome: "banner.png",
    });
    ok(
      repetido.corpo.metadataUrl === url,
      "o mesmo lançamento reaproveita o arquivo (nome = hash do conteúdo)",
    );
  }
}

console.log(falhas === 0 ? "\nTUDO PASSOU\n" : `\n${falhas} FALHA(S)\n`);
process.exitCode = falhas === 0 ? 0 : 1;
