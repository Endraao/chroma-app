import { notFound } from "next/navigation";

import { PublicarContratos } from "@/components/dev/PublicarContratos";

/**
 * Ferramenta interna: publica ChromaCurve e ChromaRouter assinando pela
 * MetaMask. Só existe rodando `npm run dev` na máquina do dono — em produção
 * esta rota não existe. Ver `src/app/api/dev/publicar/route.ts`.
 */
export default function PublicarPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PublicarContratos />;
}
