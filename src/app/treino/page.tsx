import type { Metadata } from "next";

import { CarteiraDeTreino } from "@/components/treino/CarteiraDeTreino";

/**
 * /treino — a carteira do MODO TREINO (17/10/2026): US$ 10.000 de mentira,
 * posições a preço real e ao vivo. Tudo mora no navegador (lib/treino.ts).
 */
export const metadata: Metadata = {
  title: "Practice mode · Chroma",
  description: "Trade any Solana coin with a fake $10,000 at real live prices. No wallet, no risk.",
};

export default function PaginaTreino() {
  return <CarteiraDeTreino />;
}
