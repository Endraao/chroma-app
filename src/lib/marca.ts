/**
 * A MARCA DO SITE (white-label).
 *
 * O mesmo código serve a Chroma e os sites que montamos para clientes: nome,
 * domínio, X, Telegram e cor saem daqui, lidos de variáveis de ambiente
 * `NEXT_PUBLIC_MARCA_*` (e `NEXT_PUBLIC_SITE_URL`). Sem nenhuma delas, tudo
 * fica exatamente como a Chroma — o site no ar não muda.
 *
 * Os ~600 "Chroma" espalhados nos textos não foram trocados um a um: os
 * dicionários passam por `comMarca()` em `traducoes()` (idiomas.ts), que
 * troca o nome na hora. Logo e imagens são arquivos: ver
 * scripts/aplicar-marca.mjs e docs/white-label.md.
 *
 * NEXT_PUBLIC_ é embutido no build: mudou a marca, compila de novo.
 */

import { cloneElement, isValidElement, type ReactNode } from "react";

const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://chromalaunch.fun").replace(/\/+$/, "");

export const MARCA = {
  nome: process.env.NEXT_PUBLIC_MARCA_NOME || "Chroma",
  /** Endereço completo, sem barra no fim: "https://chromalaunch.fun". */
  site,
  /** Só o domínio, pra texto: "chromalaunch.fun". */
  dominio: site.replace(/^https?:\/\//, ""),
  /** Perfil no X, sem @. */
  x: process.env.NEXT_PUBLIC_MARCA_X || "ChromaLaunch",
  /** Canal ou grupo no Telegram, sem t.me/. Vazio esconde o link. */
  telegram: process.env.NEXT_PUBLIC_MARCA_TELEGRAM ?? "ChromaLaunch",
  /** Cor de destaque (botões, selos, links), em hex. */
  cor: process.env.NEXT_PUBLIC_MARCA_COR || "#22d3ee",
  /** A mesma cor um tom mais escuro (hover). */
  corForte: process.env.NEXT_PUBLIC_MARCA_COR_FORTE || process.env.NEXT_PUBLIC_MARCA_COR || "#06b6d4",
  /** Post de exemplo do "trade dentro do X" na home. Vazio esconde o botão. */
  postDeExemplo:
    process.env.NEXT_PUBLIC_MARCA_POST_EXEMPLO ??
    "https://x.com/ChromaLaunch/status/2115664829210050633",
};

/**
 * É a própria Chroma? Coisas que só fazem sentido aqui (Obsi, token oficial,
 * Robinhood Chain) ficam desligadas no site de um cliente.
 */
export const EH_A_CHROMA = MARCA.nome === "Chroma";

const linkDoX = `https://x.com/${MARCA.x}`;
export const LINK_DO_X = linkDoX;
export const LINK_DO_TELEGRAM = MARCA.telegram ? `https://t.me/${MARCA.telegram}` : null;

/** "34 211 238" — o formato que as variáveis de cor do Tailwind usam. */
export function corEmRgb(hex: string): string {
  const h = hex.replace("#", "");
  const cheio = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(cheio, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

const MUDOU_O_TEXTO =
  MARCA.nome !== "Chroma" || MARCA.dominio !== "chromalaunch.fun" || MARCA.x !== "ChromaLaunch";

/**
 * Troca a marca da Chroma pela do site num texto. Na Chroma devolve o mesmo
 * texto. A ordem importa: "ChromaLaunch" antes de "Chroma".
 */
export function comMarca(texto: string): string {
  if (!MUDOU_O_TEXTO) return texto;
  return texto
    .replaceAll("chromalaunch.fun", MARCA.dominio)
    .replaceAll("ChromaLaunch", MARCA.x)
    .replaceAll("CHROMA", MARCA.nome.toUpperCase())
    .replaceAll("Chroma", MARCA.nome);
}

/**
 * `comMarca` em tudo que um dicionário de textos carrega: strings, funções que
 * devolvem string ou JSX, listas, objetos e o texto dentro de elementos do
 * React (`<>na Chroma <strong>…</strong></>`).
 */
export function dicionarioComMarca<T>(valor: T): T {
  if (!MUDOU_O_TEXTO) return valor;
  return trocar(valor) as T;
}

function trocar(v: unknown): unknown {
  if (typeof v === "string") return comMarca(v);
  if (typeof v === "function") {
    const f = v as (...a: unknown[]) => unknown;
    return (...a: unknown[]) => trocar(f(...a));
  }
  if (Array.isArray(v)) return v.map(trocar);
  if (isValidElement(v)) {
    // Texto em propriedade também conta (<Secao titulo="O que é a Chroma">).
    const { children: filhos, ...props } = v.props as Record<string, unknown>;
    const novas = Object.fromEntries(
      Object.entries(props).filter(([, x]) => typeof x === "string" || isValidElement(x)).map(([k, x]) => [k, trocar(x)]),
    );
    return filhos === undefined
      ? cloneElement(v, novas)
      : cloneElement(v, novas, ...([trocar(filhos)].flat() as ReactNode[]));
  }
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trocar(x)]));
  }
  return v;
}
