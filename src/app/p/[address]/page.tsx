import type { Metadata } from "next";

import { NegociarNoPost } from "@/components/trading/NegociarNoPost";
import { getToken } from "@/lib/tokens";

/**
 * A NEGOCIAÇÃO DENTRO DO POST DO X (pedido do dono, 07/10/2026, ideia do
 * XPeriment).
 *
 * O X mostra esta página num iframe dentro do post ("player card", ver
 * /e/[address]). Só cabe o essencial: a moeda, o preço e o botão de comprar e
 * vender. Quem postou o link ganha a indicação de quem negociar por aqui
 * (?ref=, o mesmo sistema de afiliados do site).
 *
 * É a ÚNICA rota que aceita ser embutida, e só pelo X (next.config.mjs).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false } };

export default async function PaginaNoPost({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const { token } = await getToken(address);
  return <NegociarNoPost token={token} />;
}
