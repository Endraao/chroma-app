import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { Suspense } from "react";

import { WalletProviders } from "@/components/web3/WalletProviders";
import { Header } from "@/components/ui/Header";
import { Moldura } from "@/components/ui/Moldura";
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
    "Lance e negocie tokens em Solana e EVM com gráfico ao vivo, auditoria de contrato e revenue-share de 0,5% para afiliados.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body className={`${display.variable} ${mono.variable} min-h-screen font-sans`}>
        <WalletProviders>
          {/* useSearchParams precisa de um limite de Suspense no App Router. */}
          <Suspense fallback={null}>
            <AffiliateBanner />
          </Suspense>
          <RpcNotice />
          <Header />
          {/*
            Sem Suspense aqui de propósito.

            A barra de categorias lê `useSearchParams`, que suspende — mas a
            fronteira fica DENTRO da moldura, em volta só da barra. Envolvendo
            a moldura inteira, a página ia junto pro `<div hidden>` que o React
            usa enquanto espera, e o site abria com o cabeçalho e mais nada.
          */}
          <Moldura>{children}</Moldura>
        </WalletProviders>
      </body>
    </html>
  );
}
