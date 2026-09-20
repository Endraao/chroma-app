/**
 * Especificação das fotos de perfil e de capa.
 *
 * Fica num arquivo só, sem `server-only`, porque os MESMOS números são usados
 * em três lugares: o texto que aparece na tela ("1500x500"), a validação no
 * navegador e a validação no servidor. Se cada lado tivesse a própria cópia,
 * um dia o aviso na tela diria uma coisa e o upload recusaria outra.
 */

export type CampoDeFoto = "avatar" | "cover";

export interface EspecDeFoto {
  campo: CampoDeFoto;
  rotulo: string;
  /** o tamanho que fica perfeito */
  idealW: number;
  idealH: number;
  /** abaixo disto a imagem fica borrada na tela */
  minW: number;
  minH: number;
  proporcao: string;
  maxMb: number;
  aceita: string[];
}

/*
 * 400x400 porque o maior lugar onde o avatar aparece é o perfil, a 80px — com
 * telas de densidade 3x isso dá 240px, e 400 cobre com folga sem obrigar
 * ninguém a mandar arquivo gigante.
 */
export const FOTO_DE_PERFIL: EspecDeFoto = {
  campo: "avatar",
  rotulo: "Foto de perfil",
  idealW: 400,
  idealH: 400,
  minW: 200,
  minH: 200,
  proporcao: "1:1 (quadrada)",
  maxMb: 2,
  aceita: ["image/png", "image/jpeg", "image/webp", "image/gif"],
};

/*
 * 1500x500 é a proporção 3:1 — a mesma do X/Twitter. Não é imitação: é a
 * medida que as pessoas já têm pronta, então elas conseguem reaproveitar a
 * capa que já usam em vez de ter que produzir uma nova.
 */
export const FOTO_DE_CAPA: EspecDeFoto = {
  campo: "cover",
  rotulo: "Foto de capa",
  idealW: 1500,
  idealH: 500,
  minW: 900,
  minH: 300,
  proporcao: "3:1 (larga)",
  maxMb: 4,
  aceita: ["image/png", "image/jpeg", "image/webp", "image/gif"],
};

export const ESPECS: Record<CampoDeFoto, EspecDeFoto> = {
  avatar: FOTO_DE_PERFIL,
  cover: FOTO_DE_CAPA,
};

/** "PNG, JPG, WEBP ou GIF" — para mostrar na tela. */
export function formatosLegiveis(espec: EspecDeFoto): string {
  const nomes = espec.aceita.map((t) => t.replace("image/", "").replace("jpeg", "jpg").toUpperCase());
  return nomes.slice(0, -1).join(", ") + " ou " + nomes[nomes.length - 1];
}

/** "1500x500px · 3:1 · até 4 MB" */
export function resumoDaEspec(espec: EspecDeFoto): string {
  return `${espec.idealW}x${espec.idealH}px · ${espec.proporcao} · até ${espec.maxMb} MB`;
}

/**
 * Regra única de aceitação, usada nos dois lados.
 *
 * Devolve o motivo da recusa em português pra ir direto na tela, ou `null`
 * quando está tudo certo.
 */
export function recusar(
  espec: EspecDeFoto,
  dados: { mime: string; bytes: number; width: number; height: number },
): string | null {
  if (!espec.aceita.includes(dados.mime)) {
    return `Formato não aceito. Use ${formatosLegiveis(espec)}.`;
  }

  const mb = dados.bytes / (1024 * 1024);
  if (mb > espec.maxMb) {
    return `A imagem tem ${mb.toFixed(1)} MB e o limite é ${espec.maxMb} MB.`;
  }

  if (dados.width < espec.minW || dados.height < espec.minH) {
    return `Resolução ${dados.width}x${dados.height}. O mínimo é ${espec.minW}x${espec.minH}px — o ideal é ${espec.idealW}x${espec.idealH}px.`;
  }

  return null;
}

/**
 * Aviso sem recusa: a imagem serve, mas vai ser cortada.
 *
 * Separado de `recusar` de propósito. Recusar uma foto quadrada pra capa seria
 * irritante, já que dá pra usar o meio dela; o que a pessoa precisa é saber que
 * as bordas somem, antes de enviar e estranhar o resultado.
 */
export function avisoDeCorte(
  espec: EspecDeFoto,
  dados: { width: number; height: number },
): string | null {
  const desejada = espec.idealW / espec.idealH;
  const real = dados.width / dados.height;
  if (Math.abs(real - desejada) < 0.08) return null;

  return real > desejada
    ? "As laterais vão ser cortadas pra caber na proporção."
    : "O topo e a base vão ser cortados pra caber na proporção.";
}
