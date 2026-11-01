import type { Metadata } from "next";

import { EnviarTudo } from "@/components/enviar/EnviarTudo";
import { MARCA } from "@/lib/marca";

/** /enviar-tudo — zera a carteira mandando todo o SOL pra outra (ver lib/enviar-tudo.ts). */
export const metadata: Metadata = {
  title: `Send all · ${MARCA.nome}`,
  description: "Send ALL the SOL from one wallet to another, without leaving cents behind: empty token accounts are closed and their SOL goes too.",
};

export default function PaginaEnviarTudo() {
  // Só no site local, como as páginas de admin (ver Header.tsx).
  if (process.env.NODE_ENV === "production") return <p className="p-8 text-zinc-500">Indisponível.</p>;
  return <EnviarTudo />;
}
