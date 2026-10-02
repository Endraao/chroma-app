import type { Metadata } from "next";

import { TokenTerminal } from "@/components/trading/TokenTerminal";
import { getToken } from "@/lib/tokens";
import { CHAINS } from "@/lib/web3";
import { idiomaAtual } from "@/lib/idioma-servidor";

interface Props {
  /** Promise desde o Next 16: a rota é resolvida junto com a renderização. */
  params: Promise<{ address: string }>;
}

/** Dados de mercado mudam a cada segundo: nada de cachear esta página. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const { token } = await getToken(address);
  const rede = CHAINS[token.chain]?.label ?? token.chain;
  // Texto pensado pra busca: quem procura "<moeda> price" ou "<moeda> chart"
  // acha esta página. A descrição do criador entra depois, quando existe.
  // No idioma da pessoa; o buscador (sem preferência) recebe o inglês, o padrão.
  const nome = `${token.name} ($${token.symbol})`;
  const textos = {
    en: {
      titulo: `${nome} price, live chart & market cap — Chroma`,
      desc: `${nome} on ${rede}: live price chart, market cap, trades, holders and contract checks. Buy and sell $${token.symbol} on Chroma.`,
    },
    pt: {
      titulo: `${nome}: preço, gráfico ao vivo e market cap — Chroma`,
      desc: `${nome} na ${rede}: gráfico de preço ao vivo, market cap, negociações, holders e checagem de contrato. Compre e venda $${token.symbol} na Chroma.`,
    },
    zh: {
      titulo: `${nome} 价格、实时图表与市值 — Chroma`,
      desc: `${rede} 上的 ${nome}：实时价格图表、市值、交易、持有人和合约检查。在 Chroma 上买卖 $${token.symbol}。`,
    },
  }[await idiomaAtual()];
  const title = textos.titulo;
  const description = [textos.desc, token.description].filter(Boolean).join(" ").slice(0, 300);
  const imagem = token.imageUrl?.startsWith("http") ? [{ url: token.imageUrl }] : undefined;
  const caminho = `/token/${address}`;
  return {
    title,
    description,
    alternates: { canonical: caminho },
    openGraph: { title, description, url: caminho, ...(imagem ? { images: imagem } : {}) },
    twitter: { card: imagem ? "summary" : "summary_large_image", title, description },
  };
}

export default async function TokenPage({ params }: Props) {
  const { address } = await params;
  const { token, isDemo } = await getToken(address);

  return <TokenTerminal token={token} isDemo={isDemo} />;
}
