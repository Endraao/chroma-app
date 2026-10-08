import type { Metadata } from "next";

import { IrParaAMoeda } from "@/components/trading/IrParaAMoeda";
import { getToken } from "@/lib/tokens";

/**
 * O LINK QUE SE POSTA NO X (07/10/2026).
 *
 * Pro X, esta página diz "mostre um player": o post ganha, embutida, a página
 * /p/[address] — comprar e vender ali mesmo. Pra uma pessoa que abre o link
 * fora do X, ela só redireciona pra página da moeda. O ?ref= de quem postou
 * segue junto nos dois casos.
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
  const imagem = token.imageUrl?.startsWith("http")
    ? token.imageUrl
    : token.imageUrl?.startsWith("/")
      ? `${SITE}${token.imageUrl}`
      : `${SITE}/logo.png`;
  return {
    title: titulo,
    description: descricao,
    robots: { index: false },
    openGraph: { title: titulo, description: descricao, images: imagem, url: `${SITE}/e/${address}${sufixo}` },
    twitter: {
      card: "player",
      site: "@ChromaLaunch",
      title: titulo,
      description: descricao,
      images: [imagem],
    },
    // O player vai à mão: o do Next exige "stream" (feito pra vídeo), e com
    // uma página no lugar do vídeo o X pode recusar o card.
    other: {
      "twitter:player": player,
      "twitter:player:width": "480",
      "twitter:player:height": "600",
    },
  };
}

export default async function LinkDoPost({ params, searchParams }: Props) {
  const { address } = await params;
  const { ref } = await searchParams;
  const sufixo = ref && REF.test(ref) ? `?ref=${encodeURIComponent(ref)}` : "";
  return <IrParaAMoeda destino={`/token/${address}${sufixo}`} destinoNoCelular={`/p/${address}${sufixo}`} />;
}
