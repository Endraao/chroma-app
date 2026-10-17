"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useAccount } from "wagmi";
import { useChromaAccount } from "@/hooks/useChromaAccount";
import { usePrecoDoSol } from "@/hooks/usePrecoDoSol";

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
  tokensUsd?: number;
  moedas?: number;
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
  const { account } = useChromaAccount();

  /*
   * A conectada agora OU a vinculada à conta. Antes só contava a conectada:
   * com a MetaMask conectada e a Phantom só vinculada, o saldo do topo
   * mostrava o ETH e ignorava o SOL — enquanto o perfil mostrava os dois.
   */
  const donoSolana = publicKey?.toBase58() ?? account?.carteiras?.solana ?? null;
  const donoEvm = address ?? account?.carteiras?.robinhood ?? null;

  const solana = useLeitura<SaldoSolana>(donoSolana);
  const evm = useLeitura<SaldoEvm>(donoEvm);

  /*
   * SOL NA HORA (17/10/2026: "logo que conecta, demora a ver o saldo real").
   *
   * A conta completa (/api/carteira) lê todas as moedas e os preços — ~2 s na
   * Solana e ~6 s na Robinhood. Enquanto ela não chega, o saldo em SOL lido
   * direto da rede (uma chamada, instantânea) vezes o preço do SOL já dá um
   * número de verdade no topo; as moedas entram por cima quando chegarem.
   */
  const { connection } = useConnection();
  const precoDoSol = usePrecoDoSol();
  const [solRapido, setSolRapido] = useState<number | null>(null);
  const donoConectado = publicKey?.toBase58() ?? null;
  useEffect(() => {
    setSolRapido(null);
    if (!donoConectado) return;
    let cancelado = false;
    connection
      .getBalance(new PublicKey(donoConectado), "confirmed")
      .then((l) => !cancelado && setSolRapido(l / 1e9))
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [connection, donoConectado]);

  const parteSolana = solana
    ? solana.totalUsd
    : solRapido !== null && precoDoSol !== null && donoSolana === donoConectado
      ? solRapido * precoDoSol
      : null;

  /*
   * Cada rede soma quando chega, em vez de o total esperar pela mais lenta (a
   * Robinhood segurava o número do topo por ~6 s). `parcial` diz que ainda
   * falta alguma parte — quem mostra pode indicar que está carregando.
   */
  const partes: (number | null)[] = [];
  if (donoSolana) partes.push(parteSolana);
  if (donoEvm) partes.push(evm && evm.ethUsd !== null ? evm.ethUsd + (evm.tokensUsd ?? 0) : null);
  const prontas = partes.filter((p): p is number => p !== null);
  const usd = prontas.length ? prontas.reduce((soma, p) => soma + p, 0) : null;
  const parcial = prontas.length < partes.length || (Boolean(donoSolana) && !solana);

  return {
    parcial,
    sol: solana?.sol ?? solRapido,
    eth: evm?.eth ?? null,
    usd,
    emMoedas:
      solana || evm ? (solana?.tokensUsd ?? 0) + (evm?.tokensUsd ?? 0) : null,
    quantasMoedas: (solana?.moedas ?? 0) + (evm?.moedas ?? 0),
  };
}
