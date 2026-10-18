"use client";

import type { TokenSummary } from "@/lib/types";

/**
 * CLONAR MOEDA (pedido do dono, 18/10/2026): o botão "Clonar" na página da
 * moeda guarda os dados dela aqui e abre /create?clonar=1, que já vem com
 * nome, símbolo, descrição, links e imagem preenchidos. Passa pelo
 * sessionStorage (e não pela URL) porque descrição e links não cabem bem num
 * link — e somem sozinhos quando a aba fecha.
 */
const CHAVE = "chroma-clonar-v1";

export interface MoedaParaClonar {
  address: string;
  name: string;
  symbol: string;
  description: string;
  website: string;
  twitter: string;
  telegram: string;
}

export function guardarParaClonar(token: TokenSummary) {
  const dados: MoedaParaClonar = {
    address: token.address,
    name: token.name ?? "",
    symbol: token.symbol ?? "",
    description: token.description ?? "",
    website: token.website ?? "",
    twitter: token.twitter ?? "",
    telegram: token.telegram ?? "",
  };
  try {
    window.sessionStorage.setItem(CHAVE, JSON.stringify(dados));
  } catch {
    /* sem armazenamento: a tela de lançar abre vazia, como sempre */
  }
}

export function lerParaClonar(): MoedaParaClonar | null {
  try {
    const bruto = window.sessionStorage.getItem(CHAVE);
    return bruto ? (JSON.parse(bruto) as MoedaParaClonar) : null;
  } catch {
    return null;
  }
}

/**
 * A imagem da moeda como arquivo, pronta pro campo de imagem do lançamento.
 * Vem pelo nosso /api/logo (mesmo domínio, sem bloqueio de CORS); se a moeda
 * não tem imagem de verdade (o leitor devolve o SVG genérico), devolve null.
 */
export async function imagemParaClonar(
  address: string,
  symbol: string,
): Promise<{ file: File; previewUrl: string; kind: "image"; width: number; height: number } | null> {
  try {
    const r = await fetch(`/api/logo/${address}`);
    const tipo = r.headers.get("content-type") ?? "";
    if (!r.ok || !tipo.startsWith("image/") || tipo.includes("svg")) return null;
    const blob = await r.blob();
    const extensao = tipo.split("/")[1]?.split(";")[0] || "png";
    const file = new File([blob], `${symbol || "moeda"}.${extensao}`, { type: blob.type || tipo });
    const bitmap = await createImageBitmap(blob);
    const dimensoes = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return { file, previewUrl: URL.createObjectURL(blob), kind: "image", ...dimensoes };
  } catch {
    return null;
  }
}
