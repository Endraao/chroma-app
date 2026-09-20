/**
 * Requisitos da mídia da moeda.
 *
 * Mesma ideia de `profile-media.ts`, com uma diferença que muda tudo: foto de
 * perfil a pessoa troca quando quiser; a mídia da moeda **não pode ser trocada
 * depois do lançamento**. Ela vai dentro dos metadados que a transação aponta,
 * e aquele endereço é imutável.
 *
 * Por isso os limites aqui são mais folgados (a pessoa tem uma chance só de
 * mandar a arte boa) e a validação é mais dura: o que passar fica pra sempre.
 */

export type CampoDeMidia = "coin" | "banner";

export interface EspecDeMidia {
  campo: CampoDeMidia;
  rotulo: string;
  /** limite em megabytes para imagem */
  maxMb: number;
  /** limite separado para vídeo, quando aceito */
  maxVideoMb?: number;
  aceita: string[];
  /** menor lado permitido, em pixels (só imagem) */
  minLado?: number;
  /** proporção esperada (largura/altura), com tolerância */
  proporcao?: { valor: number; tolerancia: number; rotulo: string };
  idealW?: number;
  idealH?: number;
}

/**
 * A arte principal. 1000x1000 é o mínimo porque ela aparece grande na página da
 * moeda e nos cartões da home — abaixo disso fica borrada justamente onde a
 * pessoa decide se clica.
 */
export const MIDIA_DA_MOEDA: EspecDeMidia = {
  campo: "coin",
  rotulo: "Imagem ou vídeo da moeda",
  maxMb: 15,
  maxVideoMb: 30,
  aceita: ["image/jpeg", "image/png", "image/gif", "video/mp4"],
  minLado: 1000,
};

/** Faixa larga do topo da página, na mesma proporção da capa de perfil. */
export const BANNER_DA_MOEDA: EspecDeMidia = {
  campo: "banner",
  rotulo: "Banner",
  maxMb: 4.5,
  aceita: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  proporcao: { valor: 3, tolerancia: 0.35, rotulo: "3:1" },
  idealW: 1500,
  idealH: 500,
};

export const ESPECS_DA_MOEDA: Record<CampoDeMidia, EspecDeMidia> = {
  coin: MIDIA_DA_MOEDA,
  banner: BANNER_DA_MOEDA,
};

export function formatosLegiveis(espec: EspecDeMidia): string {
  const nomes = espec.aceita.map((t) =>
    t.replace("image/", "").replace("video/", "").replace("jpeg", "jpg").toUpperCase(),
  );
  return nomes.slice(0, -1).join(", ") + " ou " + nomes[nomes.length - 1];
}

/**
 * Regra única de aceitação, usada no navegador e no servidor.
 *
 * Devolve o motivo da recusa em português, pronto pra ir na tela, ou `null`
 * quando está tudo certo.
 */
export function recusar(
  espec: EspecDeMidia,
  dados: { mime: string; bytes: number; width: number; height: number },
): string | null {
  if (!espec.aceita.includes(dados.mime)) {
    return `Formato não aceito. Use ${formatosLegiveis(espec)}.`;
  }

  const ehVideo = dados.mime.startsWith("video/");
  const limite = ehVideo ? (espec.maxVideoMb ?? espec.maxMb) : espec.maxMb;
  const mb = dados.bytes / (1024 * 1024);

  if (mb > limite) {
    return `${ehVideo ? "Vídeo" : "Imagem"} de ${mb.toFixed(1)} MB. O limite é ${limite} MB.`;
  }

  /*
   * O mínimo de lado vale só pra imagem. Vídeo vertical de celular tem 1080 de
   * largura e 1920 de altura; exigir 1000 no menor lado passaria, mas exigir a
   * mesma régua de nitidez de uma arte estática não faz sentido — o vídeo é
   * julgado pelo peso.
   */
  if (!ehVideo && espec.minLado && Math.min(dados.width, dados.height) < espec.minLado) {
    return `Resolução ${dados.width}x${dados.height}. O mínimo é ${espec.minLado}x${espec.minLado}px.`;
  }

  if (espec.proporcao) {
    const real = dados.width / dados.height;
    const { valor, tolerancia, rotulo } = espec.proporcao;
    if (Math.abs(real - valor) > tolerancia) {
      return `A proporção precisa ser ${rotulo}. Esta imagem é ${dados.width}x${dados.height}.`;
    }
  }

  return null;
}

/** "até 15 MB · mínimo 1000x1000px" — o que aparece embaixo do seletor. */
export function resumoDaEspec(espec: EspecDeMidia): string {
  const partes: string[] = [`até ${espec.maxMb} MB`];
  if (espec.maxVideoMb) partes.push(`vídeo até ${espec.maxVideoMb} MB`);
  if (espec.minLado) partes.push(`mínimo ${espec.minLado}x${espec.minLado}px`);
  if (espec.idealW && espec.idealH) partes.push(`ideal ${espec.idealW}x${espec.idealH}px`);
  if (espec.proporcao) partes.push(`proporção ${espec.proporcao.rotulo}`);
  return partes.join(" · ");
}
