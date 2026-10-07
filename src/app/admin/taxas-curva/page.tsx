"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { Button } from "@/components/ui/Button";
import { transacoesDeResgate, transacoesDeResgateNaMeteora } from "@/lib/meteora-dbc";

/**
 * Resgate das taxas da Chroma na Curva da Chroma (Meteora DBC), só na máquina
 * local. Precisa da CARTEIRA DA PLATAFORMA conectada: é ela o "fee claimer"
 * da config e dona da metade da liquidez das moedas que já se formaram (pool
 * da Meteora) — as duas taxas saem aqui. Em produção a página não faz nada.
 */
export default function ResgatarTaxasDaCurva() {
  const { connection } = useConnection();
  const { publicKey, signAllTransactions } = useWallet();
  const [estado, setEstado] = useState("");
  const plataforma = process.env.NEXT_PUBLIC_PLATFORM_FEE_WALLET_SOL ?? "";

  if (process.env.NODE_ENV === "production") return <p className="p-8 text-zinc-500">Indisponível.</p>;

  async function resgatar() {
    if (!publicKey || !signAllTransactions) return setEstado("Conecte a carteira Solana no topo da página.");
    if (publicKey.toBase58() !== plataforma) {
      return setEstado(`Conecte a carteira da plataforma (${plataforma.slice(0, 6)}…${plataforma.slice(-4)}). A conectada não pode resgatar.`);
    }
    try {
      setEstado("Procurando taxas nas moedas da curva…");
      const [curva, meteora] = await Promise.all([
        transacoesDeResgate(connection, publicKey),
        transacoesDeResgateNaMeteora(connection, publicKey),
      ]);
      const { pools } = curva;
      const txs = [...curva.txs, ...meteora.txs];
      const taxaNegociacaoSol = curva.taxaNegociacaoSol + meteora.taxaSol;
      if (!txs.length) return setEstado(`Nada a resgatar agora (${pools} moeda(s) na curva).`);
      setEstado(`${txs.length} resgate(s) prontos (${taxaNegociacaoSol.toFixed(6)} SOL de negociação + taxas de lançamento). Aprove na carteira…`);
      // Blockhash novo e "finalized" na hora de assinar: o montado lá atrás
      // vencia ou ainda não existia no nó da simulação ("Blockhash not found").
      const { blockhash } = await connection.getLatestBlockhash("finalized");
      for (const tx of txs) tx.recentBlockhash = blockhash;
      const assinadas = await signAllTransactions(txs);
      let ok = 0;
      for (const tx of assinadas) {
        const assinatura = await connection.sendRawTransaction(tx.serialize(), { preflightCommitment: "confirmed" });
        const r = await connection.confirmTransaction(assinatura, "confirmed");
        if (!r.value.err) ok++;
      }
      setEstado(`Pronto: ${ok} de ${assinadas.length} resgate(s) confirmados. O SOL já está na carteira da plataforma.`);
    } catch (e) {
      setEstado(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main className="mx-auto max-w-lg space-y-4 p-8">
      <h1 className="text-xl font-bold text-zinc-100">Resgatar taxas da Curva da Chroma</h1>
      <p className="text-[13px] text-zinc-400">
        Junta a taxa de negociação e a taxa de lançamento de todas as moedas da curva e manda para a carteira da plataforma.
        Custa só a taxa de rede de cada transação.
      </p>
      <Button variant="chroma" size="lg" className="w-full" onClick={resgatar}>
        Resgatar tudo
      </Button>
      {estado && <p className="break-all text-[13px] text-zinc-300">{estado}</p>}
    </main>
  );
}
