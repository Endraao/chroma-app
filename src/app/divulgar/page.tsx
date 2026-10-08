import type { Metadata } from "next";

import { GeradorDeLink } from "@/components/trading/GeradorDeLink";

export const metadata: Metadata = {
  title: "Share any coin & earn — Chroma",
  description: "Paste any Solana or Robinhood Chain coin, get your post link and earn 0.30% of every trade it brings.",
};

export default function PaginaDivulgar() {
  return <GeradorDeLink />;
}
