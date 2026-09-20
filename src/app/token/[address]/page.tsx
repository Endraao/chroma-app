import type { Metadata } from "next";

import { TokenTerminal } from "@/components/trading/TokenTerminal";
import { getToken } from "@/lib/tokens";

interface Props {
  params: { address: string };
}

/** Dados de mercado mudam a cada segundo: nada de cachear esta página. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await getToken(params.address);
  return {
    title: `${token.name} ($${token.symbol}) — Chroma`,
    description: token.description,
  };
}

export default async function TokenPage({ params }: Props) {
  const { token, isDemo } = await getToken(params.address);

  return <TokenTerminal token={token} isDemo={isDemo} />;
}
