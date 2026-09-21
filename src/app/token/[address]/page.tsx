import type { Metadata } from "next";

import { TokenTerminal } from "@/components/trading/TokenTerminal";
import { getToken } from "@/lib/tokens";

interface Props {
  /** Promise desde o Next 16: a rota é resolvida junto com a renderização. */
  params: Promise<{ address: string }>;
}

/** Dados de mercado mudam a cada segundo: nada de cachear esta página. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const { token } = await getToken(address);
  return {
    title: `${token.name} ($${token.symbol}) — Chroma`,
    description: token.description,
  };
}

export default async function TokenPage({ params }: Props) {
  const { address } = await params;
  const { token, isDemo } = await getToken(address);

  return <TokenTerminal token={token} isDemo={isDemo} />;
}
