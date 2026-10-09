import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LancarBnb } from "@/components/dev/LancarBnb";
import { lerDoCacheDoBanco } from "@/lib/db";

/**
 * LANÇAR NA BNB — página ESCONDIDA (pedido do dono, 09/10/2026).
 *
 * Não aparece no site nem em menu nenhum. Abre só com o link que tem a chave
 * guardada no banco (meta "cache:pagina-bnb"); qualquer outra chave dá 404.
 * A chave fica no banco, e não no código, porque o repositório é público.
 * Contrato: contracts/src/ChromaBnb.sol.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Chroma", robots: { index: false, follow: false } };

export default async function PaginaLancarBnb({ params }: { params: Promise<{ chave: string }> }) {
  const { chave } = await params;
  const salva = await lerDoCacheDoBanco<{ chave: string }>("pagina-bnb").catch(() => null);
  if (!salva?.chave || salva.chave !== chave) notFound();
  const [lancador, troca] = await Promise.all([
    lerDoCacheDoBanco<{ endereco: string }>("lancador-bnb").catch(() => null),
    lerDoCacheDoBanco<{ endereco: string }>("troca-bnb").catch(() => null),
  ]);
  return <LancarBnb chave={chave} lancadorSalvo={lancador?.endereco ?? null} trocaSalva={troca?.endereco ?? null} />;
}
