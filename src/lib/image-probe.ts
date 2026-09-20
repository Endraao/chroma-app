/**
 * Lê tipo e resolução de uma imagem direto dos bytes do cabeçalho.
 *
 * Existe por um motivo específico: o navegador já mede a imagem antes de
 * enviar, mas essa checagem pode ser burlada — basta chamar a rota na mão. Sem
 * conferir no servidor, qualquer um manda um arquivo de 40 MB, ou um .exe com
 * nome de .png, e a plataforma guarda e serve aquilo.
 *
 * Confiar no `Content-Type` do upload também não resolve: ele vem do cliente.
 * Aqui o tipo sai da assinatura do próprio arquivo (magic bytes), então é o que
 * o conteúdo É, não o que ele diz ser.
 *
 * Sem dependência nenhuma: são quatro formatos e os quatro guardam largura e
 * altura nos primeiros bytes.
 */

export interface DadosDaImagem {
  mime: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  extensao: "png" | "jpg" | "webp" | "gif";
  width: number;
  height: number;
}

export function lerImagem(bytes: Uint8Array): DadosDaImagem | null {
  return png(bytes) ?? jpeg(bytes) ?? webp(bytes) ?? gif(bytes);
}

/* ------------------------------------------------------------------ */

const u32be = (b: Uint8Array, i: number) =>
  ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u32le = (b: Uint8Array, i: number) =>
  (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);

const casa = (b: Uint8Array, i: number, assinatura: number[]) =>
  b.length > i + assinatura.length && assinatura.every((v, k) => b[i + k] === v);

/** PNG: assinatura de 8 bytes, depois o chunk IHDR com largura e altura. */
function png(b: Uint8Array): DadosDaImagem | null {
  if (!casa(b, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return null;
  if (b.length < 24) return null;
  return { mime: "image/png", extensao: "png", width: u32be(b, 16), height: u32be(b, 20) };
}

/**
 * JPEG: é uma sequência de segmentos. A resolução mora num marcador SOF
 * (0xFFC0–0xFFCF, menos os quatro que não são SOF), então percorre os
 * segmentos pulando pelo tamanho declarado de cada um.
 */
function jpeg(b: Uint8Array): DadosDaImagem | null {
  if (!casa(b, 0, [0xff, 0xd8, 0xff])) return null;

  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++; // byte de preenchimento entre segmentos
      continue;
    }
    const marcador = b[i + 1];
    // SOF0..SOF15, exceto DHT (C4), JPGA (C8) e DAC (CC).
    if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
      return {
        mime: "image/jpeg",
        extensao: "jpg",
        height: u16be(b, i + 5),
        width: u16be(b, i + 7),
      };
    }
    if (marcador === 0xd8 || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) {
      i += 2; // marcadores sem corpo
      continue;
    }
    const tamanho = u16be(b, i + 2);
    if (tamanho < 2) return null; // corrompido: sair em vez de girar em falso
    i += 2 + tamanho;
  }
  return null;
}

/** WebP tem três variantes (lossy, lossless e com alfa) e cada uma guarda a resolução num lugar. */
function webp(b: Uint8Array): DadosDaImagem | null {
  if (!casa(b, 0, [0x52, 0x49, 0x46, 0x46])) return null; // "RIFF"
  if (!casa(b, 8, [0x57, 0x45, 0x42, 0x50])) return null; // "WEBP"
  if (b.length < 30) return null;

  const achou = (w: number, h: number): DadosDaImagem => ({
    mime: "image/webp",
    extensao: "webp",
    width: w,
    height: h,
  });

  const tipo = String.fromCharCode(b[12], b[13], b[14], b[15]);

  if (tipo === "VP8 ") {
    // quadro-chave VP8: 14 bytes de cabeçalho, resolução em 14 bits
    return achou(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
  }
  if (tipo === "VP8L") {
    const bits = u32le(b, 21);
    return achou((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
  }
  if (tipo === "VP8X") {
    const dim = (i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)) + 1;
    return achou(dim(24), dim(27));
  }
  return null;
}

/** GIF: resolução em dois inteiros little-endian logo depois da assinatura. */
function gif(b: Uint8Array): DadosDaImagem | null {
  const g89 = casa(b, 0, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  const g87 = casa(b, 0, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);
  if (!g89 && !g87) return null;
  return { mime: "image/gif", extensao: "gif", width: u16le(b, 6), height: u16le(b, 8) };
}
