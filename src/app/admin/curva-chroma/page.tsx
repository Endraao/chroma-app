"use client";

import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { Button } from "@/components/ui/Button";
import { transacaoDeCriarConfig } from "@/lib/meteora-dbc";

/**
 * Ferramenta de uso ÚNICO, só na máquina local: cria a config da "Curva da
 * Chroma" na Meteora DBC (ver lib/meteora-dbc.ts). Quem recebe as taxas da
 * Chroma é a carteira da plataforma. Em produção a página não faz nada.
 */
export default function CriarCurvaChroma() {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [estado, setEstado] = useState("");
  const [endereco, setEndereco] = useState<string | null>(null);

  if (process.env.NODE_ENV === "production") return <p className="p-8 text-zinc-500">Indisponível.</p>;
  const plataforma = process.env.NEXT_PUBLIC_PLATFORM_FEE_WALLET_SOL ?? "";

  async function criar() {
    if (!publicKey || !signTransaction) return setEstado("Conecte a carteira Solana no topo da página.");
    if (!plataforma) return setEstado("Falta NEXT_PUBLIC_PLATFORM_FEE_WALLET_SOL.");
    try {
      setEstado("Montando…");
      const { tx, config } = await transacaoDeCriarConfig(connection, publicKey, new PublicKey(plataforma));
      // Simula antes de pedir assinatura: se for falhar, falha aqui, de graça.
      const sim = await connection.simulateTransaction(tx);
      if (sim.value.err) throw new Error("Simulação falhou: " + JSON.stringify(sim.value.err));
      setEstado("Aprove na carteira…");
      const assinada = await signTransaction(tx);
      assinada.partialSign(config);
      const assinatura = await connection.sendRawTransaction(assinada.serialize());
      setEstado("Confirmando…");
      await connection.confirmTransaction(assinatura, "confirmed");
      setEndereco(config.publicKey.toBase58());
      setEstado("Pronto! Copie este endereço.");
    } catch (e) {
      setEstado(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main className="mx-auto max-w-lg space-y-4 p-8">
      <h1 className="text-xl font-bold text-zinc-100">Criar a Curva da Chroma (uma vez só)</h1>
      <p className="text-[13px] text-zinc-400">
        Custa uns 0,006 SOL, pagos pela carteira conectada. As taxas da Chroma vão para {plataforma.slice(0, 6)}…{plataforma.slice(-4)}.
      </p>
      <Button variant="chroma" size="lg" className="w-full" onClick={criar}>
        Criar curva
      </Button>
      {estado && <p className="break-all text-[13px] text-zinc-300">{estado}</p>}
      {endereco && <p className="select-all break-all rounded-lg border border-marca/40 p-3 font-mono text-[13px] text-marca">{endereco}</p>}
    </main>
  );
}
