import type { Metadata } from "next";
import { after } from "next/server";

import { IrParaAMoeda } from "@/components/trading/IrParaAMoeda";
import { getToken } from "@/lib/tokens";

/**
 * TESTE DO CELULAR (09/10/2026) — cópia do /e com o cartão igual ao do
 * XPeriment, que abre no app do X no Android: janela QUADRADA 480×480 e capa
 * quadrada 1200×1200. O /e (que funciona no PC) não foi tocado; se este
 * funcionar no PC e no Android, os botões de postar passam a gerar /e2.
 */
export const dynamic = "force-dynamic";

const SITE = "https://chromalaunch.fun";
const REF = /^[A-Za-z0-9_.-]{1,64}$/;

type Props = { params: Promise<{ address: string }>; searchParams: Promise<{ ref?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { address } = await params;
  const { ref } = await searchParams;
  const { token } = await getToken(address);
  const sufixo = ref && REF.test(ref) ? `?ref=${encodeURIComponent(ref)}` : "";
  const player = `${SITE}/p/${address}${sufixo}`;
  const titulo = `$${token.symbol} — buy right in this post on Chroma`;
  const descricao = `Trade ${token.name} without leaving X. Creators keep 40% of every trade fee on Chroma.`;
  const imagem = `${SITE}/api/logo/${address}/card`;
  // Gera a capa enquanto o X ainda lê esta página: quando ele pedir a imagem,
  // ela já está no CDN (a primeira geração leva ~3s e o X desiste em ~4s).
  after(() => fetch(imagem, { signal: AbortSignal.timeout(15_000) }).catch(() => {}));
  return {
    title: titulo,
    description: descricao,
    robots: { index: false },
    openGraph: { title: titulo, description: descricao, images: imagem, url: `${SITE}/e2/${address}${sufixo}` },
    twitter: {
      card: "player",
      site: "@ChromaLaunch",
      title: titulo,
      description: descricao,
      images: [imagem],
    },
    other: {
      "twitter:player": player,
      "twitter:player:width": "480",
      "twitter:player:height": "480",
    },
  };
}

export default async function LinkDoPostTeste({ params, searchParams }: Props) {
  const { address } = await params;
  const { ref } = await searchParams;
  const destino = `/token/${address}${ref && REF.test(ref) ? `?ref=${encodeURIComponent(ref)}` : ""}`;
  return <IrParaAMoeda destino={destino} />;
}
