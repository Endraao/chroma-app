import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { NegociarNoPost } from "@/components/trading/NegociarNoPost";
import { PortaDoTelegram } from "@/components/trading/PortaDoTelegram";
import { lerDoCacheDoBanco } from "@/lib/db";
import { getToken } from "@/lib/tokens";

/**
 * A NEGOCIAÇÃO DENTRO DO POST DO X (pedido do dono, 07/10/2026, ideia do
 * XPeriment) — e dentro do Telegram (mini app do bot de compra).
 *
 * O X mostra esta página num iframe dentro do post ("player card", ver
 * /e/[address]). Só cabe o essencial: a moeda, o preço e o botão de comprar e
 * vender. Quem postou o link ganha a indicação de quem negociar por aqui
 * (?ref=, o mesmo sistema de afiliados do site).
 *
 * /p/tg é a porta do mini app do Telegram: o parâmetro vem como
 * "<moeda>__t<id do Telegram>" e vira /p/<moeda>?ref=<carteira ligada>.
 *
 * É a ÚNICA rota que aceita ser embutida, e só pelo X/Telegram (next.config.mjs).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false } };

type Props = { params: Promise<{ address: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function PaginaNoPost({ params, searchParams }: Props) {
  const { address } = await params;
  if (address === "tg") {
    const q = await searchParams;
    const inicio = q.tgWebAppStartParam ?? q.startapp ?? "";
    const [moeda, quem] = inicio.split("__t");
    if (!moeda) return <PortaDoTelegram />;
    const ligado = quem && /^\d+$/.test(quem) ? await lerDoCacheDoBanco<{ carteira: string }>(`tg-carteira:${quem}`).catch(() => null) : null;
    redirect(`/p/${moeda}${ligado ? `?ref=${encodeURIComponent(ligado.carteira)}` : ""}`);
  }
  const { token } = await getToken(address);
  return <NegociarNoPost token={token} />;
}
