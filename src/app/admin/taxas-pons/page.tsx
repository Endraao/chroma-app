"use client";

import { useState } from "react";
import { usePublicClient } from "wagmi";

import { Button } from "@/components/ui/Button";
import { esperarRecibo, useCarteiraRobinhood } from "@/hooks/useCarteiraRobinhood";
import { ABI_CHROMA_PONS, CHROMA_PONS } from "@/lib/chroma-pons";
import { robinhoodChain } from "@/lib/web3";

/**
 * Ferramenta local: muda as taxas do contrato ChromaPons já publicado
 * (função configurar, só a autoridade 0x49a8… assina). Pedido do dono,
 * 11/10/2026: negociação 0,75% → 0,50% (0,30% indicador + 0,20% Chroma) e
 * lançamento sem a parte da Chroma (fica só a taxa da própria Pons).
 * Em produção não faz nada.
 */
const PLATAFORMA = "0xc00D47A88A1e737fcBc496ceabD7a96397429e6e";
const TAXA_TOTAL_BPS = 50; // 0,50% por negociação
const TAXA_AFILIADO_BPS = 30; // 0,30% pro indicador
const TAXA_DE_LANCAMENTO = 0n; // a Chroma não cobra; a Pons cobra a dela (0,0005 ETH)
const JANELA_CONTRA_ROBOS = 60n; // segundos (igual ao atual)

export default function TaxasPons() {
  const { address, obterCarteira } = useCarteiraRobinhood();
  const publicClient = usePublicClient({ chainId: robinhoodChain.id });
  const [estado, setEstado] = useState("");

  if (process.env.NODE_ENV === "production") return <p className="p-8 text-zinc-500">Indisponível.</p>;

  async function aplicar() {
    try {
      if (!publicClient) throw new Error("rede indisponível");
      const carteira = await obterCarteira();
      setEstado("Aprove na carteira…");
      const hash = await carteira.writeContract({
        address: CHROMA_PONS,
        abi: ABI_CHROMA_PONS,
        functionName: "configurar",
        args: [PLATAFORMA, TAXA_TOTAL_BPS, TAXA_AFILIADO_BPS, TAXA_DE_LANCAMENTO, JANELA_CONTRA_ROBOS],
        chain: robinhoodChain,
        account: address!,
      });
      setEstado("Confirmando na rede…");
      const recibo = await esperarRecibo(publicClient, hash);
      if (recibo.status !== "success") throw new Error("a rede recusou");
      setEstado("Pronto! Taxas novas valendo.");
    } catch (e) {
      setEstado(e instanceof Error ? e.message.split("\n")[0] : String(e));
    }
  }

  return (
    <main className="mx-auto max-w-lg space-y-4 p-8">
      <h1 className="text-xl font-bold text-zinc-100">Novas taxas da Robinhood</h1>
      <ul className="space-y-1 text-[13px] text-zinc-400">
        <li>Negociação: 0,75% → 0,50% (0,30% pro indicador + 0,20% Chroma)</li>
        <li>Lançamento: a Chroma para de cobrar (fica só 0,0005 ETH da Pons)</li>
        <li>Taxas continuam indo para: {PLATAFORMA}</li>
        <li>Assina a autoridade 0x49a8…4E57 · custo: centavos de gás</li>
      </ul>
      <p className="text-[13px] text-zinc-500">Carteira conectada: {address ?? "nenhuma — conecte a Robinhood Chain no topo"}</p>
      <Button variant="chroma" size="lg" className="w-full" onClick={aplicar} disabled={!address}>
        Aplicar taxas novas
      </Button>
      {estado && <p className="text-[13px] text-zinc-300">{estado}</p>}
    </main>
  );
}
