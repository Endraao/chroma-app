"use client";

import { useEffect, useRef } from "react";
import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAccount, useConnect } from "wagmi";

/**
 * CONTINUA CONECTADO AO SAIR DO POST DO X (08/10/2026).
 *
 * A janela de compra dentro do post roda num "cantinho" separado do navegador:
 * o que ela guarda (qual carteira a pessoa escolheu) não chega na aba da
 * Chroma. Resultado: a pessoa compra no post, clica em "Open on Chroma" e a
 * página pede pra conectar de novo — sem saldo na tela.
 *
 * O link de saída leva `?carteira=<nome>` (Solana) ou `?carteira-evm=<id>`
 * (Robinhood). Aqui, se essa carteira estiver instalada, ela é escolhida e
 * conecta sozinha — o site já foi autorizado nela pelo post, então a carteira
 * não pergunta de novo.
 */
export function ConectarPeloLink() {
  const { wallets, select, connected, connecting } = useWallet();
  const { isConnected: evmConectado } = useAccount();
  const { connectors, connect } = useConnect();
  const feito = useRef({ sol: false, evm: false });

  useEffect(() => {
    if (feito.current.sol || connected || connecting) return;
    const nome = new URLSearchParams(window.location.search).get("carteira");
    if (!nome) return;
    const w = wallets.find((x) => x.adapter.name === nome && x.readyState === WalletReadyState.Installed);
    if (!w) return;
    feito.current.sol = true;
    // Com autoConnect ligado no WalletProvider, escolher já conecta.
    select(w.adapter.name as WalletName);
  }, [wallets, select, connected, connecting]);

  useEffect(() => {
    if (feito.current.evm || evmConectado) return;
    const id = new URLSearchParams(window.location.search).get("carteira-evm");
    if (!id) return;
    const c = connectors.find((x) => x.id === id);
    if (!c) return;
    feito.current.evm = true;
    connect({ connector: c });
  }, [connectors, connect, evmConectado]);

  return null;
}
