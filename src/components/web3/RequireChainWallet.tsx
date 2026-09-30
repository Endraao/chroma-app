"use client";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";

import { Button } from "@/components/ui/Button";
import { SignInModal } from "@/components/web3/SignInModal";
import { useChromaAccount } from "@/hooks/useChromaAccount";
import { useWalletOptions } from "@/hooks/useWalletOptions";
import { shortenAddress } from "@/lib/utils";
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
const TEXTOS = traducoes({
  en: {
    outraRede: "Your wallet is on another network",
    moedaDa: (rede: string) => `This coin is on ${rede}`,
    precisaEstar: (rede: React.ReactNode) => <>To trade this coin your wallet must be on {rede}. Switch networks in your wallet to continue.</>,
    conecteUma: (rede: React.ReactNode) => <>Connect a {rede} wallet to buy or sell. You can keep both networks connected at the same time: each coin uses the wallet of its own network.</>,
    aguardando: "Waiting for the wallet…",
    trocarPara: (rede: string) => `Switch to ${rede}`,
    conectarCarteira: (rede: string) => `Connect ${rede} wallet`,
    liberarTitulo: (end: string) => `Your wallet ${end} is on your account`,
    liberarTexto: "To sign, it needs to be opened in this tab. One click: pick the same wallet in the list and approve.",
    liberar: "Open wallet to sign",
  },
  pt: {
    outraRede: "Sua carteira está em outra rede",
    moedaDa: (rede: string) => `Esta moeda é da ${rede}`,
    precisaEstar: (rede: React.ReactNode) => <>Para negociar esta moeda, a sua carteira precisa estar na {rede}. Troque de rede na carteira para continuar.</>,
    conecteUma: (rede: React.ReactNode) => <>Conecte uma carteira da {rede} para comprar ou vender. Você pode manter as duas redes conectadas ao mesmo tempo: cada moeda usa a carteira da sua rede.</>,
    aguardando: "Aguardando a carteira…",
    trocarPara: (rede: string) => `Trocar para ${rede}`,
    conectarCarteira: (rede: string) => `Conectar carteira ${rede}`,
    liberarTitulo: (end: string) => `Sua carteira ${end} já está na conta`,
    liberarTexto: "Para assinar, ela precisa ser aberta nesta aba. É um clique: escolha a mesma carteira na lista e aprove.",
    liberar: "Abrir carteira para assinar",
  },
  zh: {
    outraRede: "你的钱包在其他网络上",
    moedaDa: (rede: string) => `该代币属于 ${rede}`,
    precisaEstar: (rede: React.ReactNode) => <>交易该代币需要钱包切换到 {rede}。请在钱包中切换网络后继续。</>,
    conecteUma: (rede: React.ReactNode) => <>连接 {rede} 钱包即可买卖。两条网络可以同时连接：每个代币使用其所在网络的钱包。</>,
    aguardando: "等待钱包…",
    trocarPara: (rede: string) => `切换到 ${rede}`,
    conectarCarteira: (rede: string) => `连接 ${rede} 钱包`,
    liberarTitulo: (end: string) => `你的钱包 ${end} 已在账户中`,
    liberarTexto: "签名前需要在此页面打开钱包。只需一步：在列表中选择同一个钱包并确认。",
    liberar: "打开钱包签名",
  },
});

export function RequireChainWallet({
  chain,
  children,
}: {
  chain: ChainId;
  children: React.ReactNode;
}) {
  const t = useTextos(TEXTOS);
  const [modalAberto, setModalAberto] = useState(false);

  const { connected: solanaConectada } = useWallet();
  const { isConnected: evmConectada } = useAccount();
  const chainIdAtual = useChainId();
  const { switchChain, isPending: trocando } = useSwitchChain();

  const meta = CHAINS[chain];
  const ehSolana = chain === "solana";

  const conectada = ehSolana ? solanaConectada : evmConectada;
  const redeErrada = !ehSolana && evmConectada && chainIdAtual !== robinhoodChain.id;

  // Já vinculada à conta: a pessoa não precisa "conectar" de novo, só abrir a
  // carteira nesta aba para o site poder pedir a assinatura.
  const { account } = useChromaAccount();
  const vinculada = account?.carteiras?.[chain] ?? null;

  /*
   * Um clique conecta: com uma carteira só instalada (ou a usada da última
   * vez), pede a conexão direto nela. A lista só abre quando há mais de uma
   * e nenhuma usada antes.
   */
  const opcoes = useWalletOptions();
  const detectadas = opcoes[ehSolana ? "solana" : "evm"].detected;
  const direta =
    detectadas.length === 1 ? detectadas[0] : detectadas.find((o) => o.state === "recent");
  const abrir = () => (direta ? direta.onSelect() : setModalAberto(true));

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
            {redeErrada
              ? t.outraRede
              : vinculada
                ? t.liberarTitulo(shortenAddress(vinculada, 4))
                : t.moedaDa(meta.label)}
          </span>
        </div>

        <p className="text-[11px] leading-relaxed text-zinc-500">
          {redeErrada ? (
            t.precisaEstar(<strong className="text-zinc-300">{meta.label}</strong>)
          ) : vinculada ? (
            t.liberarTexto
          ) : (
            t.conecteUma(<strong className="text-zinc-300">{meta.label}</strong>)
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
            {trocando ? t.aguardando : t.trocarPara(meta.label)}
          </Button>
        ) : (
          <Button
            variant="chroma"
            size="lg"
            className="w-full"
            onClick={abrir}
          >
            {vinculada ? t.liberar : t.conectarCarteira(meta.label)}
          </Button>
        )}
      </div>

      <SignInModal
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        rede={ehSolana ? "solana" : "evm"}
      />
    </>
  );
}
