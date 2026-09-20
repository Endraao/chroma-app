import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";

import { WalletProviders } from "@/components/web3/WalletProviders";
import { Header } from "@/components/ui/Header";
import { AffiliateBanner } from "@/components/web3/AffiliateBanner";
import { RpcNotice } from "@/components/web3/RpcNotice";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
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
      <body className={`${inter.variable} ${mono.variable} min-h-screen font-sans`}>
        <WalletProviders>
          {/* useSearchParams precisa de um limite de Suspense no App Router. */}
          <Suspense fallback={null}>
            <AffiliateBanner />
          </Suspense>
          <RpcNotice />
          <Header />
          <main className="mx-auto w-full max-w-[1600px] px-4 pb-16 pt-6 lg:px-6">{children}</main>
        </WalletProviders>
      </body>
    </html>
  );
}
