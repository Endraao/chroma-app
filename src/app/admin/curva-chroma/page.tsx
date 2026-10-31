"use client";

import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { Button } from "@/components/ui/Button";
import { transacaoDeCriarConfig, type VarianteDaCurva } from "@/lib/meteora-dbc";

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
  // Qual anti-sniper: 10%/25% (até 1% em 30 s), 50% fixos 2 min ou 50% caindo em 2 min.
  const [variante, setVariante] = useState<VarianteDaCurva>("50c");
  // Taxas da parceira pra carteira CONECTADA em vez da 2jbv (teste com carteira nova, 31/10/2026).
  const [paraConectada, setParaConectada] = useState(true);

  if (process.env.NODE_ENV === "production") return <p className="p-8 text-zinc-500">Indisponível.</p>;
  const plataforma = process.env.NEXT_PUBLIC_PLATFORM_FEE_WALLET_SOL ?? "";

  async function criar() {
    if (!publicKey || !signTransaction) return setEstado("Conecte a carteira Solana no topo da página.");
    if (!plataforma) return setEstado("Falta NEXT_PUBLIC_PLATFORM_FEE_WALLET_SOL.");
    try {
      setEstado("Montando…");
      const dona = paraConectada ? publicKey : new PublicKey(plataforma);
      const { tx, config } = await transacaoDeCriarConfig(connection, publicKey, dona, variante);
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
        Custa uns 0,006 SOL, pagos pela carteira conectada. As taxas da Chroma vão para{" "}
        {paraConectada ? (publicKey ? `a carteira conectada (${publicKey.toBase58().slice(0, 6)}…)` : "a carteira conectada") : `${plataforma.slice(0, 6)}…${plataforma.slice(-4)}`}.
      </p>
      <label className="flex items-center gap-2 text-[13px] text-zinc-300">
        <input type="checkbox" checked={paraConectada} onChange={(e) => setParaConectada(e.target.checked)} />
        Taxas pra carteira conectada (não pra 2jbv)
      </label>
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/[0.06] p-1">
        {(["10", "25", "50", "50c"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setVariante(v)}
            className={`rounded-lg py-2.5 text-[13px] font-bold ${variante === v ? "bg-ink-700 text-zinc-50" : "text-zinc-500 hover:text-zinc-200"}`}
          >
            {v === "50" ? "50% fixos 2 min → 1%" : v === "50c" ? "50% caindo → 1% em 2 min" : `Anti-sniper ${v}% → 1% em 30 s`}
          </button>
        ))}
      </div>
      <Button variant="chroma" size="lg" className="w-full" onClick={criar}>
        Criar curva {variante === "50c" ? "50% caindo" : `de ${variante}%`}
      </Button>
      {estado && <p className="break-all text-[13px] text-zinc-300">{estado}</p>}
      {endereco && <p className="select-all break-all rounded-lg border border-marca/40 p-3 font-mono text-[13px] text-marca">{endereco}</p>}
    </main>
  );
}
