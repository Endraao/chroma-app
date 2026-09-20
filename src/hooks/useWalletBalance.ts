"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

/**
 * Saldo da carteira conectada, em SOL e em dólar.
 *
 * O preço do SOL vem do nosso próprio `/api/price`, que já tem cache de 3s no
 * servidor — evita abrir mais uma fonte de preço só pra mostrar o saldo no
 * cabeçalho.
 *
 * Só Solana por enquanto: é a rede onde o swap funciona. Em EVM devolve null
 * e o cabeçalho esconde a pílula em vez de mostrar "0", que seria mentira.
 */
const SOL_MINT = "So11111111111111111111111111111111111111112";
const RECARREGA_MS = 30_000;

export function useWalletBalance() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const [sol, setSol] = useState<number | null>(null);
  const [usd, setUsd] = useState<number | null>(null);

  useEffect(() => {
    if (!publicKey) {
      setSol(null);
      setUsd(null);
      return;
    }

    let cancelado = false;

    const ler = async () => {
      try {
        const lamports = await connection.getBalance(publicKey);
        if (cancelado) return;

        const saldo = lamports / 1e9;
        setSol(saldo);

        const res = await fetch(`/api/price?address=${SOL_MINT}`);
        if (!res.ok || cancelado) return;
        const { priceUsd } = (await res.json()) as { priceUsd: number };
        if (!cancelado) setUsd(saldo * priceUsd);
      } catch {
        /* RPC recusou ou rede oscilou: mantém o último valor conhecido */
      }
    };

    void ler();
    const timer = window.setInterval(ler, RECARREGA_MS);

    return () => {
      cancelado = true;
      window.clearInterval(timer);
    };
  }, [publicKey, connection]);

  return { sol, usd };
}
