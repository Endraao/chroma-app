import type { Metadata } from "next";
import { after } from "next/server";

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

/**
 * INTERRUPTOR (08/10/2026): o X parou de abrir a janela de compra dentro do
 * post — no PC abre o site em tela cheia (até o XPeriment), e no app do
 * Android o play não responde e o link fica escondido. Com `false`, o post usa
 * o cartão de imagem grande comum: tocar abre o link (celular → janela de
 * compra /p, PC → página da moeda), em todo lugar. Quando o X voltar a abrir
 * a janela dentro do post (teste: um link do xperiment.app no PC), trocar pra
 * `true`. Só vale pra posts novos: o X guarda o cartão de cada link.
 */
const COMPRA_DENTRO_DO_POST = false;

type Props = { params: Promise<{ address: string }>; searchParams: Promise<{ ref?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { address } = await params;
  const { ref } = await searchParams;
  const { token } = await getToken(address);
  const sufixo = ref && REF.test(ref) ? `?ref=${encodeURIComponent(ref)}` : "";
  const player = `${SITE}/p/${address}${sufixo}`;
  const titulo = `$${token.symbol} — buy right in this post on Chroma`;
  const descricao = `Trade ${token.name} without leaving X. Creators keep 40% of every trade fee on Chroma.`;
  // Com player: capa quadrada do formato da janela (480×480). Sem player: capa
  // larga 1200×630 do cartão de imagem grande.
  const imagem = `${SITE}/api/logo/${address}/${COMPRA_DENTRO_DO_POST ? "card" : "card-largo"}`;
  // Gera a capa JÁ, enquanto o X ainda lê esta página: quando ele pedir a
  // imagem (logo em seguida), ela está pronta no CDN em vez de levar ~4s.
  after(() => fetch(imagem, { signal: AbortSignal.timeout(15_000) }).catch(() => {}));
  const base = {
    title: titulo,
    description: descricao,
    robots: { index: false },
    openGraph: { title: titulo, description: descricao, images: imagem, url: `${SITE}/e/${address}${sufixo}` },
  };
  if (!COMPRA_DENTRO_DO_POST) {
    return {
      ...base,
      twitter: { card: "summary_large_image", site: "@ChromaLaunch", title: titulo, description: descricao, images: [imagem] },
    };
  }
  return {
    ...base,
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
      "twitter:player:height": "480",
    },
  };
}

export default async function LinkDoPost({ params, searchParams }: Props) {
  const { address } = await params;
  const { ref } = await searchParams;
  const sufixo = ref && REF.test(ref) ? `?ref=${encodeURIComponent(ref)}` : "";
  return <IrParaAMoeda destino={`/token/${address}${sufixo}`} destinoNoCelular={`/p/${address}${sufixo}`} />;
}
