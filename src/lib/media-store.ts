import "server-only";

import { createHash } from "node:crypto";
import { head, put } from "@vercel/blob";

import { lerImagem } from "./image-probe";
import { lerVideo } from "./video-probe";
import { ESPECS, recusar, type CampoDeFoto } from "./profile-media";
import {
  ESPECS_DA_MOEDA,
  recusar as recusarMidia,
  type CampoDeMidia,
} from "./token-media";

/**
 * Onde as fotos de perfil, a arte das moedas e os metadados ficam guardados.
 *
 * ---------------------------------------------------------------------------
 * POR QUE SAIU DO DISCO
 * ---------------------------------------------------------------------------
 * Ficava em `.data/media/`. Isso funciona numa máquina só — e o site vai rodar
 * na Vercel, onde o disco é somente-leitura e é descartado a cada publicação.
 * Na prática: toda arte de token enviada sumiria no deploy seguinte.
 *
 * E some de um jeito especialmente ruim. A arte de uma moeda entra nos
 * METADADOS que a transação de criação aponta, e aquele endereço é imutável na
 * blockchain. Perder o arquivo não é perder uma imagem: é deixar um token
 * lançado apontando pra um endereço vazio, pra sempre, sem como corrigir.
 *
 * Agora vai pro Vercel Blob, que é armazenamento de objeto de verdade.
 *
 * ---------------------------------------------------------------------------
 * O ENDEREÇO PÚBLICO NÃO MUDOU
 * ---------------------------------------------------------------------------
 * Continua sendo `/api/media/<hash>.<ext>`, servido pelo nosso endpoint. Duas
 * razões pra não expor o endereço do Blob direto:
 *
 *   - O armazenamento foi criado como PRIVADO, então o endereço dele só abre
 *     com credencial — que não pode ir pro navegador de ninguém.
 *   - Os metadados de token já publicados apontam pra `/api/media/...`. Mudar
 *     o formato quebraria as moedas que já existem.
 *
 * ---------------------------------------------------------------------------
 * O NOME É O HASH DO CONTEÚDO
 * ---------------------------------------------------------------------------
 * Isto valia antes e continua valendo. A mesma imagem enviada duas vezes ocupa
 * espaço uma vez só, e a URL nunca muda pro mesmo conteúdo — o que deixa o
 * cache ser eterno sem risco de mostrar foto velha depois da troca: conteúdo
 * novo, hash novo, endereço novo.
 */

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
 * Grava no Blob.
 *
 * `addRandomSuffix: false` porque o nome JÁ é o hash do conteúdo: deixar o
 * Blob acrescentar aleatoriedade quebraria a de-duplicação e faria o mesmo
 * arquivo ocupar espaço a cada envio.
 *
 * O `contentType` é gravado junto e vem da ASSINATURA do arquivo, nunca do que
 * o navegador declarou — é o que impede alguém de subir um script chamando de
 * imagem e fazer o navegador executar na hora de servir.
 */
async function guardar(nome: string, bytes: Uint8Array | Buffer, tipo: string): Promise<void> {
  await put(nome, Buffer.from(bytes), {
    access: "private",
    addRandomSuffix: false,
    contentType: tipo,
    /*
     * Reenviar o mesmo hash não é erro, é a de-duplicação funcionando: o
     * conteúdo é idêntico por definição. Sem isto o Blob recusaria o segundo
     * envio e o upload falharia à toa.
     */
    allowOverwrite: true,
  });
}

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

  await guardar(nome, bytes, imagem.mime);

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
 * um pedido a `/api/media/..%2F..%2F.env` alcançaria outro objeto do
 * armazenamento — é o clássico path traversal, e ele não deixou de existir só
 * porque saímos do disco.
 *
 * A leitura é em duas etapas porque o armazenamento é privado: `head` resolve
 * o nome no endereço interno, e o `fetch` com a credencial traz os bytes. Nada
 * disso chega ao navegador — quem responde pra ele é o nosso endpoint.
 */
export async function lerFoto(nome: string): Promise<FotoGuardada | null> {
  const partes = /^([a-f0-9]{32})\.(png|jpg|webp|gif|mp4|json)$/.exec(nome);
  if (!partes) return null;

  const credencial = process.env.BLOB_READ_WRITE_TOKEN;
  if (!credencial) return null;

  /*
   * Tenta mais de uma vez, com uma pausa curta.
   *
   * O armazenamento leva um instante pra enxergar o que acabou de ser gravado.
   * Isso apareceu num teste: o JSON de metadados subiu e a leitura logo em
   * seguida deu 404; meio segundo depois, 200.
   *
   * Parece detalhe e não é. O endereço dos metadados entra na TRANSAÇÃO de
   * criação da moeda, que é imutável — se a carteira de alguém buscar naquele
   * instante e receber "não encontrado", o token pode ficar sem nome e sem
   * imagem pra sempre, e não há como corrigir depois.
   */
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    if (tentativa > 0) await new Promise((r) => setTimeout(r, 200 * tentativa));

    try {
      const meta = await head(nome);
      const resposta = await fetch(meta.url, {
        headers: { authorization: `Bearer ${credencial}` },
        cache: "no-store",
      });
      if (!resposta.ok) continue;

      return {
        bytes: Buffer.from(await resposta.arrayBuffer()),
        /* O tipo sai da nossa tabela, não do que o armazenamento devolveu. */
        tipo: TIPOS[partes[2]],
      };
    } catch {
      /* objeto ainda não visível, ou falha de rede: a próxima volta tenta */
    }
  }

  return null;
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

  await guardar(nome, bytes, midia.mime);

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

  await guardar(nome, corpo, "application/json");

  return { url: `/api/media/${nome}`, nome };
}
