"use client";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";

import { useEffect, useState } from "react";
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
    abrirNa: (c: string) => `Buy in ${c} ↗`,
    celularSemCarteira: "On your phone? Pick your wallet — it opens this coin with the amount already set.",
    outra: "Other",
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
    abrirNa: (c: string) => `Comprar na ${c} ↗`,
    celularSemCarteira: "No celular? Escolha sua carteira — ela abre esta moeda com o valor já preenchido.",
    outra: "Outra",
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
    abrirNa: (c: string) => `在 ${c} 中购买 ↗`,
    celularSemCarteira: "在手机上？选择你的钱包 —— 它会打开此代币，金额已填好。",
    outra: "其他",
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
  compacto = false,
  linkFora,
  rotuloFora,
  alvoNaCarteira,
}: {
  chain: ChainId;
  children: React.ReactNode;
  /** Só o botão, sem a caixa de explicação (janela dentro do post do X). */
  compacto?: boolean;
  /** Sem carteira visível aqui (iframe): o botão leva pra este endereço, em outra aba. */
  linkFora?: string;
  rotuloFora?: string;
  /** No celular sem carteira: página que o app da carteira abre (com valor e indicação). */
  alvoNaCarteira?: string;
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
  const [celular, setCelular] = useState(false);
  useEffect(() => {
    // Celular SEM carteira embutida no navegador (app do X, Safari, Chrome).
    // A lista de "detectadas" não serve aqui: no Android ela traz o Mobile
    // Wallet Adapter, que não funciona dentro do app do X.
    const w = window as unknown as { phantom?: unknown; solana?: unknown; solflare?: unknown; backpack?: unknown; ethereum?: unknown };
    const injetada = ehSolana ? Boolean(w.phantom || w.solana || w.solflare || w.backpack) : Boolean(w.ethereum);
    setCelular(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && !injetada);
  }, [ehSolana]);

  if (conectada && !redeErrada) return <>{children}</>;

  if (compacto) {
    /*
     * CELULAR (07/10/2026): no app do X não existe extensão de carteira. O
     * botão abre a moeda DENTRO do app da Phantom/Solflare — no navegador
     * deles a carteira existe — já com o valor, o lado e quem indicou.
     */
    if (celular && alvoNaCarteira) {
      const origem = new URL(alvoNaCarteira).origin;
      const u = encodeURIComponent(alvoNaCarteira);
      const r = encodeURIComponent(origem);
      const semProtocolo = alvoNaCarteira.replace(/^https?:\/\//, "");
      // Cada carteira abre o próprio navegador já nesta página (valor, lado e indicação juntos).
      const carteiras = ehSolana
        ? [
            ["Phantom", `https://phantom.app/ul/browse/${u}?ref=${r}`],
            ["Solflare", `https://solflare.com/ul/v1/browse/${u}?ref=${r}`],
            ["Backpack", `https://backpack.app/ul/v1/browse/${u}?ref=${r}`],
            ["MetaMask", `https://metamask.app.link/dapp/${semProtocolo}`],
            ["Trust", `https://link.trustwallet.com/open_url?coin_id=501&url=${u}`],
          ]
        : [
            ["MetaMask", `https://metamask.app.link/dapp/${semProtocolo}`],
            ["Coinbase", `https://go.cb-w.com/dapp?cb_url=${u}`],
            ["Trust", `https://link.trustwallet.com/open_url?coin_id=60&url=${u}`],
          ];
      return (
        <div className="space-y-1.5">
          <p className="text-[11px] text-zinc-400">{t.celularSemCarteira}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {carteiras.map(([nome, link], i) => (
              <a
                key={nome}
                href={link}
                target="_blank"
                rel="noreferrer"
                className={
                  i === 0
                    ? "col-span-3 rounded-lg bg-marca py-2.5 text-center text-[14px] font-black text-black"
                    : "rounded-lg border border-ink-600 bg-ink-800 py-2 text-center text-[12px] font-bold text-zinc-100"
                }
              >
                {i === 0 ? t.abrirNa(nome) : nome}
              </a>
            ))}
            <button type="button" onClick={abrir} className="rounded-lg border border-ink-600 py-2 text-[12px] font-bold text-zinc-400">
              {t.outra}
            </button>
          </div>
          <SignInModal open={modalAberto} onClose={() => setModalAberto(false)} rede={ehSolana ? "solana" : "evm"} />
        </div>
      );
    }
    // Dentro do post do X nem sempre a extensão da carteira aparece: aí o
    // botão abre a moeda na Chroma (com a indicação de quem postou).
    if (!detectadas.length && linkFora)
      return (
        <a href={linkFora} target="_blank" rel="noreferrer" className="block">
          <Button variant="chroma" size="lg" className="w-full">
            {rotuloFora ?? t.conectarCarteira(meta.label)}
          </Button>
        </a>
      );
    return (
      <>
        <Button variant="chroma" size="lg" className="w-full" onClick={abrir}>
          {vinculada ? t.liberar : t.conectarCarteira(meta.label)}
        </Button>
        <SignInModal open={modalAberto} onClose={() => setModalAberto(false)} rede={ehSolana ? "solana" : "evm"} />
      </>
    );
  }

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
