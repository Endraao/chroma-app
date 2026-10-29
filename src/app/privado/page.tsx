import type { Metadata } from "next";

import { EnvioPrivado } from "@/components/privado/EnvioPrivado";

/**
 * /privado — ENVIO PRIVADO numa aba própria (28/10/2026, pedido do dono):
 * qualquer carteira Solana conectada na Chroma manda SOL pra qualquer carteira
 * sem deixar rastro, pela Cloak (lib/saque-privado.ts). Antes só existia
 * dentro do painel de ganhos do criador.
 */
export const metadata: Metadata = {
  title: "Private send · Chroma",
  description: "Send SOL to any wallet without a trace, through Cloak's privacy pool. Connect your Solana wallet and send.",
};

export default function PaginaPrivado() {
  return <EnvioPrivado />;
}
