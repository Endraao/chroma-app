import type { Metadata } from "next";

import { Campanhas } from "@/components/trading/Campanhas";

export const metadata: Metadata = {
  title: "Promoter campaigns — Chroma",
  description: "Sponsors pay promoters per verified trade they bring. No upfront payments, verified on-chain.",
};

export default function PaginaCampanhas() {
  return <Campanhas />;
}
