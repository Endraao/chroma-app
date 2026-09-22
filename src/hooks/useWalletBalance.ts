"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

/**
 * Quanto a carteira conectada vale: SOL MAIS as moedas que ela carrega.
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO É SÓ O SOL
 * ---------------------------------------------------------------------------
 * Antes o cabeçalho somava só o saldo em SOL. Quem comprasse uma moeda via o
 * número DIMINUIR — o SOL saiu, e o token que entrou não contava em lugar
 * nenhum. O site dizia à pessoa que ela tinha perdido dinheiro toda vez que
 * ela comprava.
 *
 * Numa launchpad isso é pior que um número errado: o produto inteiro é
 * converter SOL em moeda nova, e o painel tratava essa conversão como
 * prejuízo.
 *
 * ---------------------------------------------------------------------------
 * A CONTA É FEITA NO SERVIDOR
 * ---------------------------------------------------------------------------
 * Uma carteira ativa carrega dezenas de moedas, cada uma precisando de preço.
 * Feito aqui seriam dezenas de requisições a cada visita; feito lá, é uma
 * chamada só, com cache compartilhado por todo mundo — ver `/api/carteira`.
 *
 * Só Solana por enquanto: é a rede onde o swap funciona. Em EVM devolve null e
 * o cabeçalho esconde a pílula, em vez de mostrar "0" — que seria mentira.
 */
const RECARREGA_MS = 30_000;

export function useWalletBalance() {
  const { publicKey } = useWallet();

  const [sol, setSol] = useState<number | null>(null);
  const [usd, setUsd] = useState<number | null>(null);
  /** Quanto do total está em moedas, e não em SOL. */
  const [emMoedas, setEmMoedas] = useState<number | null>(null);
  const [quantasMoedas, setQuantasMoedas] = useState(0);

  useEffect(() => {
    if (!publicKey) {
      setSol(null);
      setUsd(null);
      setEmMoedas(null);
      setQuantasMoedas(0);
      return;
    }

    let cancelado = false;
    const dono = publicKey.toBase58();

    const ler = async () => {
      try {
        const res = await fetch(`/api/carteira?dono=${dono}`, { cache: "no-store" });
        if (!res.ok || cancelado) return;

        const dados = (await res.json()) as {
          sol: number;
          solUsd: number;
          tokensUsd: number;
          totalUsd: number;
          moedas: number;
        };
        if (cancelado) return;

        setSol(dados.sol);
        setUsd(dados.totalUsd);
        setEmMoedas(dados.tokensUsd);
        setQuantasMoedas(dados.moedas);
      } catch {
        /* rede oscilou: mantém o último valor conhecido */
      }
    };

    void ler();
    const timer = window.setInterval(ler, RECARREGA_MS);

    return () => {
      cancelado = true;
      window.clearInterval(timer);
    };
  }, [publicKey]);

  return { sol, usd, emMoedas, quantasMoedas };
}
