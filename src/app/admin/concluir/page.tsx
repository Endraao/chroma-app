"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { ConcluirLancamento } from "@/components/trading/ConcluirLancamento";
import { RequireChainWallet } from "@/components/web3/RequireChainWallet";

/**
 * Só no site local: conclui a divisão da taxa de criador de uma moeda da
 * pump.fun que ficou sem ela (a etapa 2 do lançamento não saiu).
 * /admin/concluir?mint=…&criador=…[&taxaPara=…] — com taxaPara, 100% vai pra
 * essa carteira (03/11/2026: $DIVVY → robô distribuidor).
 */
function Conteudo() {
  const p = useSearchParams();
  const mint = p.get("mint") ?? "";
  const criador = p.get("criador") ?? "";
  return (
    <main className="mx-auto max-w-lg space-y-4 p-8">
      <h1 className="text-xl font-bold text-zinc-100">Concluir lançamento</h1>
      <p className="break-all text-[13px] text-zinc-400">
        Moeda {mint || "?"} · taxa de criador vai para {p.get("taxaPara") || "criador + Chroma"}
      </p>
      <RequireChainWallet chain="solana">
        <ConcluirLancamento mint={mint} criador={criador} />
        <p className="text-[12px] text-zinc-500">Se nada aparecer acima, a divisão já foi feita ou a carteira conectada não é a criadora.</p>
      </RequireChainWallet>
    </main>
  );
}

export default function Pagina() {
  if (process.env.NODE_ENV === "production") return <p className="p-8 text-zinc-500">Indisponível.</p>;
  return (
    <Suspense>
      <Conteudo />
    </Suspense>
  );
}
