"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

import { useCaDoChroma } from "@/hooks/useCaDoChroma";
import { HOLDER_CHROMA_MINIMO } from "@/lib/fees";

/*
 * A carteira Solana conectada segura $CHROMA suficiente pro desconto?
 * (16/10/2026). Lido da rede: soma as contas da carteira naquele mint.
 * Guardado 60 s por carteira — o widget e o hook de swap perguntam juntos.
 */
const memoria = new Map<string, { em: number; valor: Promise<number> }>();

function saldoDeChroma(conexao: ReturnType<typeof useConnection>["connection"], dono: string, mint: string): Promise<number> {
  const chave = `${dono}:${mint}`;
  const visto = memoria.get(chave);
  if (visto && Date.now() - visto.em < 60_000) return visto.valor;
  const valor = conexao
    .getParsedTokenAccountsByOwner(new PublicKey(dono), { mint: new PublicKey(mint) })
    .then((r) => r.value.reduce((soma, c) => soma + Number(c.account.data.parsed?.info?.tokenAmount?.uiAmount ?? 0), 0))
    .catch(() => 0);
  memoria.set(chave, { em: Date.now(), valor });
  return valor;
}

export function useHolderDoChroma(): { holder: boolean; saldo: number } {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const ca = useCaDoChroma();
  const [saldo, setSaldo] = useState(0);
  const dono = publicKey?.toBase58() ?? null;

  useEffect(() => {
    if (!dono || !ca) {
      setSaldo(0);
      return;
    }
    let cancelado = false;
    void saldoDeChroma(connection, dono, ca).then((s) => {
      if (!cancelado) setSaldo(s);
    });
    return () => {
      cancelado = true;
    };
  }, [connection, dono, ca]);

  return { holder: saldo >= HOLDER_CHROMA_MINIMO, saldo };
}
