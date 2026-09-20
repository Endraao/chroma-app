/**
 * Lê tipo e resolução de um MP4 direto dos bytes.
 *
 * Existe pelo mesmo motivo do `image-probe.ts`: a mídia da moeda aceita vídeo,
 * e o servidor não pode acreditar no que o navegador diz. Sem isto, um arquivo
 * qualquer com nome `.mp4` e `Content-Type` forjado entraria como vídeo da
 * moeda — e a moeda não pode ser editada depois de lançada.
 *
 * ---------------------------------------------------------------------------
 * COMO UM MP4 É POR DENTRO
 * ---------------------------------------------------------------------------
 * É uma árvore de "caixas". Cada caixa começa com 4 bytes de tamanho e 4 bytes
 * de tipo, seguidos do conteúdo — que pode ser outras caixas. A resolução mora
 * em `moov > trak > tkhd`, e o caminho até lá é só descer a árvore.
 *
 * Duas pegadinhas do formato, ambas tratadas abaixo:
 *  - tamanho 1 significa "o tamanho de verdade são os próximos 8 bytes";
 *  - tamanho 0 significa "vai até o fim do arquivo".
 *
 * Um arquivo pode ter vários `trak` (vídeo, áudio, legenda). O de áudio tem
 * resolução zero, então vale o primeiro `tkhd` com largura e altura reais.
 */

export interface DadosDoVideo {
  mime: "video/mp4";
  extensao: "mp4";
  width: number;
  height: number;
}

/** Caixas que contêm outras caixas e por isso precisam ser abertas. */
const CAIXAS_CONTAINER = new Set(["moov", "trak", "mdia", "edts"]);

export function lerVideo(bytes: Uint8Array): DadosDoVideo | null {
  if (!ehMp4(bytes)) return null;

  const visao = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tamanho = procurarResolucao(bytes, visao, 0, bytes.byteLength);
  if (!tamanho) return null;

  return { mime: "video/mp4", extensao: "mp4", ...tamanho };
}

/**
 * A assinatura de um MP4 é a caixa `ftyp` logo no começo.
 *
 * O `ftyp` fica no offset 4 porque os 4 primeiros bytes são o tamanho dele.
 */
function ehMp4(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  return (
    bytes[4] === 0x66 && // f
    bytes[5] === 0x74 && // t
    bytes[6] === 0x79 && // y
    bytes[7] === 0x70 //   p
  );
}

function tipoDaCaixa(bytes: Uint8Array, em: number): string {
  return String.fromCharCode(bytes[em], bytes[em + 1], bytes[em + 2], bytes[em + 3]);
}

/** Percorre as caixas deste nível, descendo nas que são container. */
function procurarResolucao(
  bytes: Uint8Array,
  visao: DataView,
  inicio: number,
  fim: number,
): { width: number; height: number } | null {
  let em = inicio;

  while (em + 8 <= fim) {
    let tamanho = visao.getUint32(em);
    let corpo = em + 8;

    if (tamanho === 1) {
      // Tamanho de 64 bits, guardado logo depois do tipo.
      if (em + 16 > fim) return null;
      const grande = visao.getBigUint64(em + 8);
      if (grande > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      tamanho = Number(grande);
      corpo = em + 16;
    } else if (tamanho === 0) {
      // Vai até o fim do arquivo.
      tamanho = fim - em;
    }

    // Tamanho menor que o cabeçalho é arquivo corrompido: sair em vez de girar.
    if (tamanho < corpo - em || em + tamanho > fim) return null;

    const tipo = tipoDaCaixa(bytes, em + 4);

    if (tipo === "tkhd") {
      const medida = lerTkhd(visao, corpo, em + tamanho);
      // Faixa de áudio tem resolução zero: continua procurando a de vídeo.
      if (medida) return medida;
    } else if (CAIXAS_CONTAINER.has(tipo)) {
      const achado = procurarResolucao(bytes, visao, corpo, em + tamanho);
      if (achado) return achado;
    }

    em += tamanho;
  }

  return null;
}

/**
 * Largura e altura de uma caixa `tkhd`.
 *
 * Os campos de tempo mudam de tamanho conforme a versão (4 bytes na 0, 8 na
 * 1), então o deslocamento até a resolução muda junto. Depois deles vêm campos
 * fixos e a matriz de transformação de 36 bytes; a resolução é o último par.
 *
 * Os dois valores são ponto fixo 16.16 — a parte inteira são os 16 bits altos.
 */
function lerTkhd(
  visao: DataView,
  corpo: number,
  fim: number,
): { width: number; height: number } | null {
  if (corpo + 4 > fim) return null;

  const versao = visao.getUint8(corpo);
  // versão + flags(3) + criação + modificação + id + reservado + duração
  const camposDeTempo = versao === 1 ? 8 + 8 + 4 + 4 + 8 : 4 + 4 + 4 + 4 + 4;
  // reservado(8) + layer(2) + grupo(2) + volume(2) + reservado(2) + matriz(36)
  const ateResolucao = corpo + 4 + camposDeTempo + 8 + 2 + 2 + 2 + 2 + 36;

  if (ateResolucao + 8 > fim) return null;

  const width = visao.getUint32(ateResolucao) >>> 16;
  const height = visao.getUint32(ateResolucao + 4) >>> 16;

  if (width <= 0 || height <= 0) return null;
  return { width, height };
}
