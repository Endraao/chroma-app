import type { Metadata } from "next";

import { RankingDeDivulgadores } from "@/components/divulgar/RankingDeDivulgadores";
import { GeradorDeLink } from "@/components/trading/GeradorDeLink";
import { MARCA } from "@/lib/marca";

export const metadata: Metadata = {
  title: `Share any coin & earn — ${MARCA.nome}`,
  description: "Paste any Solana or Robinhood Chain coin, get your post link and earn 0.30% of every trade it brings. See the top promoters.",
};

// O ranking embaixo lê a blockchain a cada visita.
export const dynamic = "force-dynamic";

/** Divulgar + ranking de divulgadores numa página só (01/11/2026, pedido do dono). */
export default async function PaginaDivulgar({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  return (
    <>
      <GeradorDeLink />
      <RankingDeDivulgadores p={p} />
    </>
  );
}
