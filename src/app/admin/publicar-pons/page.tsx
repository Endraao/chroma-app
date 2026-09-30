"use client";

import { useState } from "react";
import { usePublicClient } from "wagmi";
import type { Abi, Hex } from "viem";

import { Button } from "@/components/ui/Button";
import { esperarRecibo, useCarteiraRobinhood } from "@/hooks/useCarteiraRobinhood";
import artefato from "@/lib/chroma-pons-artefato.json";
import { robinhoodChain } from "@/lib/web3";

/**
 * Ferramenta de uso ÚNICO, só na máquina local: publica o contrato ChromaPons
 * na Robinhood Chain com a carteira conectada (ver contracts/src/ChromaPons.sol
 * e os testes em contracts/test/ChromaPons.t.sol). Em produção não faz nada.
 */
const FABRICA_DA_PONS = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";
const AUTORIDADE = "0x49a83B8F7E1A353a9a967887E938eEb15e724E57";
const PLATAFORMA = "0xc00D47A88A1e737fcBc496ceabD7a96397429e6e";
const TAXA_TOTAL_BPS = 75; // 0,75% por negociação
const TAXA_AFILIADO_BPS = 30; // 0,30% pro indicador
const TAXA_DE_LANCAMENTO = 500_000_000_000_000n; // 0,0005 ETH
const JANELA_CONTRA_ROBOS = 60n; // segundos

export default function PublicarPons() {
  const { address, obterCarteira } = useCarteiraRobinhood();
  const publicClient = usePublicClient({ chainId: robinhoodChain.id });
  const [estado, setEstado] = useState("");
  const [endereco, setEndereco] = useState<string | null>(null);

  if (process.env.NODE_ENV === "production") return <p className="p-8 text-zinc-500">Indisponível.</p>;

  async function publicar() {
    try {
      if (!publicClient) throw new Error("rede indisponível");
      const carteira = await obterCarteira();
      setEstado("Aprove na carteira…");
      const hash = await carteira.deployContract({
        abi: artefato.abi as Abi,
        bytecode: artefato.bytecode as Hex,
        args: [FABRICA_DA_PONS, AUTORIDADE, PLATAFORMA, TAXA_TOTAL_BPS, TAXA_AFILIADO_BPS, TAXA_DE_LANCAMENTO, JANELA_CONTRA_ROBOS],
        chain: robinhoodChain,
        account: address!,
      });
      setEstado("Confirmando na rede…");
      const recibo = await esperarRecibo(publicClient, hash);
      if (recibo.status !== "success" || !recibo.contractAddress) throw new Error("a rede recusou a publicação");
      setEndereco(recibo.contractAddress);
      setEstado("Pronto! Mande este endereço para o Claude.");
    } catch (e) {
      setEstado(e instanceof Error ? e.message.split("\n")[0] : String(e));
    }
  }

  return (
    <main className="mx-auto max-w-lg space-y-4 p-8">
      <h1 className="text-xl font-bold text-zinc-100">Publicar o contrato Chroma × Pons (uma vez só)</h1>
      <ul className="space-y-1 text-[13px] text-zinc-400">
        <li>Rede: Robinhood Chain · custo: menos de 1 centavo de dólar em gás</li>
        <li>Autoridade: {AUTORIDADE}</li>
        <li>Taxas vão para: {PLATAFORMA}</li>
        <li>Negociação: 0,75% (0,30% pro indicador) · lançamento: 0,0005 ETH · janela contra robôs: 60 s</li>
      </ul>
      <p className="text-[13px] text-zinc-500">Carteira conectada: {address ?? "nenhuma — conecte a Robinhood Chain no topo"}</p>
      <Button variant="chroma" size="lg" className="w-full" onClick={publicar} disabled={!address}>
        Publicar contrato
      </Button>
      {estado && <p className="text-[13px] text-zinc-300">{estado}</p>}
      {endereco && <p className="select-all break-all rounded-lg border border-marca/40 p-3 font-mono text-[13px] text-marca">{endereco}</p>}
    </main>
  );
}
