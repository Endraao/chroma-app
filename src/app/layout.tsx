import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { Suspense } from "react";

import { WalletProviders } from "@/components/web3/WalletProviders";
import { Header } from "@/components/ui/Header";
import { Moldura } from "@/components/ui/Moldura";
import { Rodape } from "@/components/ui/Rodape";
import { idiomaAtual } from "@/lib/idioma-servidor";
import { IdiomaProvider } from "@/components/IdiomaProvider";
import { AffiliateBanner } from "@/components/web3/AffiliateBanner";
import { RpcNotice } from "@/components/web3/RpcNotice";

import "./globals.css";

/*
 * Space Grotesk no lugar da Inter.
 *
 * A Inter é a fonte padrão de todo painel de SaaS — é o que faz uma tela
 * parecer "gerada", porque é literalmente a mesma de milhares delas. A Space
 * Grotesk tem desenho próprio (o "g" de perna aberta, as curvas quadradas) e
 * é a que o meio cripto usa: lê como produto de gente que trabalha com rede,
 * não como apresentação de startup.
 */
const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

/** Números, endereços e tudo que precisa alinhar coluna. */
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  // O App Router serve src/app/icon.png e apple-icon.png como favicon sozinho;
  // estes aqui são para o card que aparece quando o link é compartilhado.
  openGraph: {
    title: "Chroma — Launchpad & Terminal Web3",
    images: ["/logo.png"],
  },
  title: "Chroma — Launchpad & Terminal Web3",
  description:
    "Lance e negocie meme coins na Robinhood Chain e na Solana, com gráfico ao vivo, auditoria de contrato e 0,30% de comissão para quem indica.",
  twitter: { card: "summary_large_image", site: "@ChromaLaunch", creator: "@ChromaLaunch" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /*
   * O idioma é decidido AQUI, no servidor, e desce como propriedade.
   *
   * Assim a página já nasce traduzida — ver `src/lib/idioma-servidor.ts` pro
   * porquê de ser cookie e não `localStorage`, e pro custo que isso tem.
   */
  const idioma = await idiomaAtual();

  return (
    /*
     * `lang` de verdade, não `pt-BR` fixo pra todo mundo.
     *
     * É o atributo que o leitor de tela usa pra escolher a PRONÚNCIA: uma
     * página em coreano marcada como português é lida em voz alta como se
     * fosse português. Também é o que diz ao buscador pra quem esta página
     * serve.
     */
    <html lang={idioma} className="dark">
      <body className={`${display.variable} ${mono.variable} min-h-screen font-sans`}>
        <IdiomaProvider idioma={idioma}>
        <WalletProviders>
          {/* useSearchParams precisa de um limite de Suspense no App Router. */}
          <Suspense fallback={null}>
            <AffiliateBanner />
          </Suspense>
          <RpcNotice />
          <Header idioma={idioma} />
          {/*
            Sem Suspense aqui de propósito.

            A barra de categorias lê `useSearchParams`, que suspende — mas a
            fronteira fica DENTRO da moldura, em volta só da barra. Envolvendo
            a moldura inteira, a página ia junto pro `<div hidden>` que o React
            usa enquanto espera, e o site abria com o cabeçalho e mais nada.
          */}
          <Moldura>{children}</Moldura>

          {/*
            O rodapé fica FORA da moldura de propósito: dentro, ele nasceria
            dentro da coluna de conteúdo e a barra de categorias empurraria o
            aviso de risco pro lado. Fora, ele atravessa a largura inteira em
            toda página, que é onde um aviso de risco tem que estar.
          */}
          <Rodape idioma={idioma} />
        </WalletProviders>
        </IdiomaProvider>
      </body>
    </html>
  );
}
