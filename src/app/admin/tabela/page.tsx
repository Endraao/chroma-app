"use client";

import { useState } from "react";
import { AddressLookupTableProgram, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { Button } from "@/components/ui/Button";
import { ENDERECOS_DA_TABELA, ENDERECOS_DOS_PARES, TABELA_SOLANA } from "@/lib/tabela-solana";

/**
 * Ferramenta de uso ÚNICO, só na máquina local: cria a tabela de endereços da
 * Chroma na Solana (lançamento em uma transação só — ver lib/tabela-solana.ts).
 * Em produção a página não faz nada.
 */
export default function CriarTabela() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [estado, setEstado] = useState<string>("");
  const [endereco, setEndereco] = useState<string | null>(null);

  if (process.env.NODE_ENV === "production") return <p className="p-8 text-zinc-500">Indisponível.</p>;

  async function criar() {
    if (!publicKey) return setEstado("Conecte a carteira Solana no topo da página.");
    try {
      setEstado("Aprove na carteira…");
      const slot = await connection.getSlot("finalized");
      const [criarIx, tabela] = AddressLookupTableProgram.createLookupTable({ authority: publicKey, payer: publicKey, recentSlot: slot });
      const estender = AddressLookupTableProgram.extendLookupTable({
        payer: publicKey,
        authority: publicKey,
        lookupTable: tabela,
        addresses: ENDERECOS_DA_TABELA.map((a) => new PublicKey(a)),
      });
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      const tx = new VersionedTransaction(
        new TransactionMessage({ payerKey: publicKey, recentBlockhash: blockhash, instructions: [criarIx, estender] }).compileToV0Message(),
      );
      const assinatura = await sendTransaction(tx, connection);
      setEstado("Confirmando…");
      await connection.confirmTransaction(assinatura, "confirmed");
      setEndereco(tabela.toBase58());
      setEstado("Pronto! Copie este endereço.");
    } catch (e) {
      setEstado(e instanceof Error ? e.message : String(e));
    }
  }

  /** Acrescenta na tabela existente os endereços que ainda faltam. */
  async function adicionarPares() {
    if (!publicKey || !TABELA_SOLANA) return setEstado("Conecte a carteira dona da tabela.");
    try {
      const tabela = new PublicKey(TABELA_SOLANA);
      const conta = (await connection.getAddressLookupTable(tabela)).value;
      if (!conta) throw new Error("tabela não encontrada");
      const ja = new Set(conta.state.addresses.map((a) => a.toBase58()));
      const todos = ENDERECOS_DOS_PARES.filter((a) => !ja.has(a));
      if (!todos.length) return setEstado("A tabela já tem todos os pares.");
      // Até 25 por transação: mais do que isso não cabe.
      const faltam = todos.slice(0, 25);
      setEstado(`Aprove na carteira: ${faltam.length} de ${todos.length} endereços…`);
      const { blockhash } = await connection.getLatestBlockhash("finalized");
      const tx = new VersionedTransaction(
        new TransactionMessage({
          payerKey: publicKey,
          recentBlockhash: blockhash,
          instructions: [
            AddressLookupTableProgram.extendLookupTable({
              payer: publicKey,
              authority: publicKey,
              lookupTable: tabela,
              addresses: faltam.map((a) => new PublicKey(a)),
            }),
          ],
        }).compileToV0Message(),
      );
      const assinatura = await sendTransaction(tx, connection);
      setEstado("Confirmando…");
      await connection.confirmTransaction(assinatura, "confirmed");
      setEstado(todos.length > faltam.length ? "Parte adicionada. Clique de novo para o restante." : "Pronto! Todos os pares estão na tabela.");
    } catch (e) {
      setEstado(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main className="mx-auto max-w-lg space-y-4 p-8">
      <h1 className="text-xl font-bold text-zinc-100">Adicionar pares na tabela</h1>
      <p className="text-[13px] text-zinc-400">Acrescenta na tabela da Chroma os endereços dos pares. Use a carteira dona da tabela.</p>
      <Button variant="chroma" size="lg" className="w-full" onClick={adicionarPares}>
        Adicionar pares na tabela
      </Button>
      {!TABELA_SOLANA && (
        <Button variant="outline" size="lg" className="w-full" onClick={criar}>
          Criar tabela
        </Button>
      )}
      {estado && <p className="text-[13px] text-zinc-300">{estado}</p>}
      {endereco && <p className="select-all break-all rounded-lg border border-marca/40 p-3 font-mono text-[13px] text-marca">{endereco}</p>}
    </main>
  );
}
