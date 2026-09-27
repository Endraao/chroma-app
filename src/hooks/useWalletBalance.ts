"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAccount } from "wagmi";

/**
 * Quanto as carteiras conectadas valem: SOL e moedas da Solana, mais o ETH da
 * Robinhood Chain.
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO É SÓ O SOL
 * ---------------------------------------------------------------------------
 * Antes o cabeçalho somava só o saldo em SOL. Quem comprasse uma moeda via o
 * número DIMINUIR — o SOL saiu, e o token que entrou não contava em lugar
 * nenhum. O site dizia à pessoa que ela tinha perdido dinheiro toda vez que
 * ela comprava.
 *
 * ---------------------------------------------------------------------------
 * AS DUAS REDES ENTRAM NO TOTAL
 * ---------------------------------------------------------------------------
 * Com as duas carteiras conectadas, mostrar só a Solana fazia o saldo da
 * Robinhood — que virou a rede principal — simplesmente não existir. O total
 * em dólar soma as duas; o menu mostra cada uma na sua linha, na sua moeda.
 *
 * As moedas lançadas na Robinhood ainda não entram (ver `/api/carteira`): o
 * que aparece lá é o ETH.
 *
 * ---------------------------------------------------------------------------
 * A CONTA É FEITA NO SERVIDOR
 * ---------------------------------------------------------------------------
 * Uma carteira ativa carrega dezenas de moedas, cada uma precisando de preço.
 * Feito aqui seriam dezenas de requisições a cada visita; feito lá, é uma
 * chamada só, com cache compartilhado por todo mundo — ver `/api/carteira`.
 */
const RECARREGA_MS = 30_000;

interface SaldoSolana {
  sol: number;
  totalUsd: number;
  tokensUsd: number;
  moedas: number;
}

interface SaldoEvm {
  eth: number;
  ethUsd: number | null;
}

/** Lê `/api/carteira` para um dono, repetindo a cada 30s. */
function useLeitura<T>(dono: string | null): T | null {
  const [dados, setDados] = useState<T | null>(null);

  useEffect(() => {
    if (!dono) {
      setDados(null);
      return;
    }

    let cancelado = false;
    const ler = async () => {
      try {
        const res = await fetch(`/api/carteira?dono=${dono}`, { cache: "no-store" });
        if (!res.ok || cancelado) return;
        const j = (await res.json()) as T;
        if (!cancelado) setDados(j);
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
  }, [dono]);

  return dados;
}

export function useWalletBalance() {
  const { publicKey } = useWallet();
  const { address } = useAccount();

  const solana = useLeitura<SaldoSolana>(publicKey?.toBase58() ?? null);
  const evm = useLeitura<SaldoEvm>(address ?? null);

  /*
   * O total só existe se todas as partes conectadas tiverem valor em dólar.
   * Somar uma parte e ignorar a outra (preço do ETH fora do ar, por exemplo)
   * daria um número menor que o real com cara de certo.
   */
  const partes: (number | null)[] = [];
  if (publicKey) partes.push(solana ? solana.totalUsd : null);
  if (address) partes.push(evm ? evm.ethUsd : null);
  const usd =
    partes.length > 0 && partes.every((p) => p !== null)
      ? partes.reduce<number>((soma, p) => soma + (p as number), 0)
      : null;

  return {
    sol: solana?.sol ?? null,
    eth: evm?.eth ?? null,
    usd,
    emMoedas: solana?.tokensUsd ?? null,
    quantasMoedas: solana?.moedas ?? 0,
  };
}
