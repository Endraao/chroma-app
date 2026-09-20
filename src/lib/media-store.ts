import "server-only";

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { lerImagem } from "./image-probe";
import { lerVideo } from "./video-probe";
import { ESPECS, recusar, type CampoDeFoto } from "./profile-media";
import {
  ESPECS_DA_MOEDA,
  recusar as recusarMidia,
  type CampoDeMidia,
} from "./token-media";

/**
 * Onde as fotos de perfil e capa ficam guardadas.
 *
 * Em `.data/media/`, ao lado dos outros arquivos de dados, e NÃO em `public/`:
 * o que está em `public/` entra no build e é servido sem passar por código
 * nenhum, então um upload ali viraria conteúdo publicado sem checagem — e
 * sumiria no próximo deploy, porque `public/` é versionado e a pasta de
 * uploads não.
 *
 * O nome do arquivo é o SHA-256 do conteúdo. Duas consequências boas: a mesma
 * imagem enviada duas vezes ocupa espaço uma vez só, e a URL nunca muda pro
 * mesmo conteúdo — o que deixa o cache ser eterno sem risco de mostrar foto
 * velha depois da troca (conteúdo novo, hash novo, URL nova).
 *
 * LIMITE CONHECIDO: isto funciona numa máquina só, igual ao resto de `.data/`.
 * Com mais de um servidor, trocar por S3/R2 mexe só neste arquivo.
 */

const MEDIA_DIR = path.join(process.cwd(), ".data", "media");

/** Só estes são servidos de volta. Nada de deduzir o tipo pela extensão do upload. */
const TIPOS: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  json: "application/json",
};

export type ResultadoDeUpload =
  | { ok: true; url: string; width: number; height: number }
  | { ok: false; erro: string };

/**
 * Valida e grava. Toda checagem é refeita aqui, mesmo já tendo passado no
 * navegador — aquilo é conveniência pra pessoa, isto é a regra de verdade.
 */
export async function salvarFoto(
  campo: CampoDeFoto,
  bytes: Uint8Array,
): Promise<ResultadoDeUpload> {
  const espec = ESPECS[campo];

  const imagem = lerImagem(bytes);
  if (!imagem) {
    return { ok: false, erro: "Esse arquivo não é uma imagem PNG, JPG, WEBP ou GIF." };
  }

  const motivo = recusar(espec, {
    mime: imagem.mime,
    bytes: bytes.byteLength,
    width: imagem.width,
    height: imagem.height,
  });
  if (motivo) return { ok: false, erro: motivo };

  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
  const nome = `${hash}.${imagem.extensao}`;

  await mkdir(MEDIA_DIR, { recursive: true });
  await writeFile(path.join(MEDIA_DIR, nome), bytes);

  return { ok: true, url: `/api/media/${nome}`, width: imagem.width, height: imagem.height };
}

export interface FotoGuardada {
  bytes: Buffer;
  tipo: string;
}

/**
 * Lê pra servir.
 *
 * O nome é validado contra um formato fixo antes de virar caminho. Sem isso,
 * um pedido a `/api/media/..%2F..%2F.env` leria arquivo fora da pasta —
 * é o clássico path traversal.
 */
export async function lerFoto(nome: string): Promise<FotoGuardada | null> {
  const partes = /^([a-f0-9]{32})\.(png|jpg|webp|gif|mp4|json)$/.exec(nome);
  if (!partes) return null;

  try {
    const bytes = await readFile(path.join(MEDIA_DIR, nome));
    return { bytes, tipo: TIPOS[partes[2]] };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Mídia da moeda                                                      */
/* ------------------------------------------------------------------ */

/**
 * Guarda a arte de uma moeda.
 *
 * Separado de `salvarFoto` porque as regras são outras: aceita vídeo, os
 * limites são maiores e — o que muda tudo — **isto não pode ser trocado depois
 * do lançamento**. A imagem vai dentro dos metadados que a transação aponta, e
 * aquele endereço é imutável. Errar aqui é errar pra sempre.
 */
export async function salvarMidiaDaMoeda(
  campo: CampoDeMidia,
  bytes: Uint8Array,
): Promise<ResultadoDeUpload> {
  const espec = ESPECS_DA_MOEDA[campo];

  // O tipo sai da assinatura do arquivo, nunca do que o cliente declarou.
  const imagem = lerImagem(bytes);
  const video = imagem ? null : lerVideo(bytes);
  const midia = imagem ?? video;

  if (!midia) {
    return { ok: false, erro: "Esse arquivo não é uma imagem nem um vídeo MP4." };
  }

  const motivo = recusarMidia(espec, {
    mime: midia.mime,
    bytes: bytes.byteLength,
    width: midia.width,
    height: midia.height,
  });
  if (motivo) return { ok: false, erro: motivo };

  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
  const nome = `${hash}.${midia.extensao}`;

  await mkdir(MEDIA_DIR, { recursive: true });
  await writeFile(path.join(MEDIA_DIR, nome), bytes);

  return { ok: true, url: `/api/media/${nome}`, width: midia.width, height: midia.height };
}

/**
 * Guarda o JSON de metadados da moeda e devolve a URL dele.
 *
 * É este endereço que entra na transação de criação — é por ele que carteiras
 * e exploradores descobrem nome, símbolo e imagem do token. O formato segue o
 * padrão que o ecossistema da Solana já lê.
 *
 * O nome do arquivo também é o hash do conteúdo: dois lançamentos idênticos
 * apontam pro mesmo lugar, e um metadado publicado nunca muda de conteúdo sob
 * a mesma URL — que é exatamente o que "imutável" precisa significar aqui.
 */
export async function salvarMetadados(json: unknown): Promise<{ url: string; nome: string }> {
  const corpo = Buffer.from(JSON.stringify(json, null, 2), "utf8");
  const hash = createHash("sha256").update(corpo).digest("hex").slice(0, 32);
  const nome = `${hash}.json`;

  await mkdir(MEDIA_DIR, { recursive: true });
  await writeFile(path.join(MEDIA_DIR, nome), corpo);

  return { url: `/api/media/${nome}`, nome };
}
