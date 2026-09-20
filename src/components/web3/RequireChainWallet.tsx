"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";

import { Button } from "@/components/ui/Button";
import { SignInModal } from "@/components/web3/SignInModal";
import { chainIcon } from "@/lib/chain-icons";
import { CHAINS, robinhoodChain } from "@/lib/web3";
import type { ChainId } from "@/lib/types";

/**
 * Garante que a carteira certa PARA AQUELA MOEDA está pronta antes de deixar
 * operar.
 *
 * A regra é: quem manda é a rede do token, nunca a carteira que está
 * conectada. Sem isso, com as duas carteiras plugadas ao mesmo tempo, dava pra
 * abrir uma moeda da Robinhood com só a Phantom conectada e ver um botão
 * genérico "Conecte a carteira" que não dizia qual.
 *
 * Também trava a rede da carteira EVM. Esse é o risco de verdade, não estético:
 * a Robinhood Chain é a {@link robinhoodChain.id}, e uma transação assinada com
 * a MetaMask na Ethereum iria pra OUTRA rede, onde aquele mesmo endereço pode
 * ser um contrato diferente, de outro dono. Por isso a troca de rede é pedida
 * antes de qualquer ação — e é pedida, nunca feita à revelia.
 */
export function RequireChainWallet({
  chain,
  children,
}: {
  chain: ChainId;
  children: React.ReactNode;
}) {
  const [modalAberto, setModalAberto] = useState(false);

  const { connected: solanaConectada } = useWallet();
  const { isConnected: evmConectada } = useAccount();
  const chainIdAtual = useChainId();
  const { switchChain, isPending: trocando } = useSwitchChain();

  const meta = CHAINS[chain];
  const ehSolana = chain === "solana";

  const conectada = ehSolana ? solanaConectada : evmConectada;
  const redeErrada = !ehSolana && evmConectada && chainIdAtual !== robinhoodChain.id;

  if (conectada && !redeErrada) return <>{children}</>;

  return (
    <>
      <div className="space-y-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
        <div className="flex items-center gap-2">
          <img
            src={chainIcon(chain)}
            alt=""
            width={20}
            height={20}
            className="size-5 rounded-full"
          />
          <span className="text-[13px] font-semibold text-zinc-200">
            {redeErrada ? `Sua carteira está em outra rede` : `Esta moeda é da ${meta.label}`}
          </span>
        </div>

        <p className="text-[11px] leading-relaxed text-zinc-500">
          {redeErrada ? (
            <>
              Pra operar esta moeda a carteira precisa estar na{" "}
              <strong className="text-zinc-300">{meta.label}</strong>. Assinar em outra rede mandaria
              a transação pro lugar errado.
            </>
          ) : (
            <>
              Conecte uma carteira da <strong className="text-zinc-300">{meta.label}</strong> pra
              comprar ou vender. As duas redes podem ficar conectadas ao mesmo tempo — cada moeda usa
              a sua.
            </>
          )}
        </p>

        {redeErrada ? (
          <Button
            variant="chroma"
            size="lg"
            className="w-full"
            disabled={trocando}
            onClick={() => switchChain({ chainId: robinhoodChain.id })}
          >
            {trocando ? "Aguardando a carteira…" : `Trocar para ${meta.label}`}
          </Button>
        ) : (
          <Button
            variant="chroma"
            size="lg"
            className="w-full"
            onClick={() => setModalAberto(true)}
          >
            Conectar carteira {meta.label}
          </Button>
        )}
      </div>

      <SignInModal open={modalAberto} onClose={() => setModalAberto(false)} />
    </>
  );
}
