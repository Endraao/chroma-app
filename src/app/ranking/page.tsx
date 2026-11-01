import { redirect } from "next/navigation";

/** O ranking agora mora no /divulgar, embaixo do gerador de link (01/11/2026). */
export default async function Ranking({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  redirect(p === "30" || p === "tudo" ? `/divulgar?p=${p}#ranking` : "/divulgar#ranking");
}
