"use client";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAccount, useSwitchChain } from "wagmi";

import { Button } from "@/components/ui/Button";
import { SignInModal } from "@/components/web3/SignInModal";
import { useChromaAccount } from "@/hooks/useChromaAccount";
import { useWalletOptions } from "@/hooks/useWalletOptions";
import { cn, shortenAddress } from "@/lib/utils";
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
    conecteSua: "Connect your wallet",
    celularSemCarteira: "On your phone? Pick your wallet — it opens this coin with the amount already set.",
    outra: "Other",
    metamaskSemSolana: "MetaMask did not offer its Solana wallet on this page. Open this coin in a Solana wallet:",
    copiado: "Link copied ✓",
    coleNaCarteira: "Open your wallet app, go to its browser and paste the link.",
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
    conecteSua: "Conecte sua carteira",
    celularSemCarteira: "No celular? Escolha sua carteira — ela abre esta moeda com o valor já preenchido.",
    outra: "Outra",
    metamaskSemSolana: "A MetaMask não ofereceu a carteira Solana dela nesta página. Abra a moeda numa carteira Solana:",
    copiado: "Link copiado ✓",
    coleNaCarteira: "Abra o app da sua carteira, vá no navegador dela e cole o link.",
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
    conecteSua: "连接你的钱包",
    celularSemCarteira: "在手机上？选择你的钱包 —— 它会打开此代币，金额已填好。",
    outra: "其他",
    metamaskSemSolana: "MetaMask 未在此页面提供 Solana 钱包。请在 Solana 钱包中打开此代币：",
    copiado: "已复制链接 ✓",
    coleNaCarteira: "打开你的钱包 App，进入其内置浏览器并粘贴链接。",
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

/** O app de cada carteira no Android (pra abrir o link direto nele). */
const PACOTE_ANDROID: Record<string, string> = {
  Phantom: "app.phantom",
  Solflare: "com.solflare.mobile",
  Backpack: "app.backpack.mobile",
  MetaMask: "io.metamask",
  Trust: "com.wallet.crypto.trustapp",
  Coinbase: "org.toshi",
};

export function RequireChainWallet({
  chain,
  children,
  compacto = false,
  linkFora,
  rotuloFora,
  alvoNaCarteira,
  rotuloConectar,
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
  /** Texto do botão de conectar no post (ex.: "Connect wallet to trade $BORDR"). */
  rotuloConectar?: string;
}) {
  const t = useTextos(TEXTOS);
  const [modalAberto, setModalAberto] = useState(false);

  const { connected: solanaConectada, connecting: solanaConectando, wallet: solanaEscolhida, publicKey: solanaChave } = useWallet();
  // Rede REAL da carteira: o useChainId() fica preso na Robinhood (única da config).
  const { isConnected: evmConectada, chainId: chainIdAtual } = useAccount();
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
  /*
   * Carteiras de verdade nesta página. O "Mobile Wallet Adapter" do Android não
   * conta: dentro do app do X (ou do navegador de outra carteira) ele não abre.
   * Dentro do app da MetaMask, a carteira Solana dela chega pelo Wallet
   * Standard (não por window.solana) — por isso a lista conta, e não só o window.
   */
  const reais = detectadas.filter((o) => !/mobile wallet adapter/i.test(o.name));
  const direta =
    reais.length === 1 ? reais[0] : (reais.find((o) => o.state === "recent") ?? (detectadas.length === 1 ? detectadas[0] : undefined));
  const abrir = () => (direta ? direta.onSelect() : setModalAberto(true));
  const [celular, setCelular] = useState(false);
  const [android, setAndroid] = useState(false);
  const [naMetaMask, setNaMetaMask] = useState(false);
  const [listaAberta, setListaAberta] = useState(false);
  const [linkCopiado, setLinkCopiado] = useState(false);
  const copiarLink = (link: string) => {
    // Campo escondido + execCommand: funciona também no navegador do X.
    const campo = document.createElement("textarea");
    campo.value = link;
    campo.setAttribute("readonly", "");
    campo.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(campo);
    campo.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {}
    campo.remove();
    if (ok) return setLinkCopiado(true);
    navigator.clipboard?.writeText(link).then(() => setLinkCopiado(true)).catch(() => {});
  };
  useEffect(() => {
    // Celular SEM carteira embutida no navegador (app do X, Safari, Chrome).
    // A lista de "detectadas" não serve aqui: no Android ela traz o Mobile
    // Wallet Adapter, que não funciona dentro do app do X.
    const w = window as unknown as { phantom?: unknown; solana?: unknown; solflare?: unknown; backpack?: unknown; ethereum?: unknown };
    const injetada = ehSolana ? Boolean(w.phantom || w.solana || w.solflare || w.backpack) : Boolean(w.ethereum);
    setCelular(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && !injetada);
    setAndroid(/Android/i.test(navigator.userAgent));
    setNaMetaMask(Boolean((w.ethereum as { isMetaMask?: boolean } | undefined)?.isMetaMask));
  }, [ehSolana]);

  /*
   * AUTOMÁTICO (pedido do dono, 09/10/2026): a rede certa vem sozinha.
   * - Robinhood com a carteira em outra rede: pede a troca uma vez, sem a
   *   pessoa ter que achar o ícone de rede na carteira.
   * - Celular, página aberta pelo botão de carteira do post (o link leva
   *   "lado="): já pede pra conectar a carteira desta rede dentro do app dela.
   * Só PEDE — quem troca/conecta é sempre a carteira, com a aprovação da pessoa.
   */
  const [erroCarteira, setErroCarteira] = useState("");
  /*
   * "Transport request timed out" (MetaMask no celular, 09/10/2026): ao reabrir
   * a página, o pedido de conexão sai antes de a carteira Solana da MetaMask
   * terminar de carregar e expira. Tenta de novo sozinho, com uma espera.
   */
  const diretaAtual = useRef(direta);
  useEffect(() => {
    diretaAtual.current = direta;
  });
  const novasTentativas = useRef(0);
  useEffect(() => {
    const ouvir = (e: Event) => {
      const msg = String((e as CustomEvent).detail ?? "");
      if (/timed? ?out|timeout/i.test(msg)) {
        if (novasTentativas.current < 2) {
          novasTentativas.current += 1;
          setTimeout(() => diretaAtual.current?.onSelect(), 2500 * novasTentativas.current);
          return;
        }
        // Ainda expirando: a MetaMask do celular prende a ligação na aba
        // anterior. Recarregar a página uma vez costuma refazer a ligação.
        try {
          if (!sessionStorage.getItem("chroma-recarregou-carteira")) {
            sessionStorage.setItem("chroma-recarregou-carteira", "1");
            window.location.reload();
            return;
          }
        } catch {}
      }
      setErroCarteira(msg.slice(0, 180));
    };
    window.addEventListener("chroma-erro-carteira", ouvir);
    return () => window.removeEventListener("chroma-erro-carteira", ouvir);
  }, []);
  // Diagnóstico no celular (09/10/2026): sem console dentro do app da carteira.
  const diagnostico =
    android || /iPhone|iPad|iPod/i.test(typeof navigator === "undefined" ? "" : navigator.userAgent)
      ? `[${solanaEscolhida?.adapter.name ?? "nenhuma"} · ${solanaEscolhida?.readyState ?? "-"} · ${solanaConectando ? "conectando" : solanaConectada ? "conectada" : "desconectada"} · ${solanaChave ? "com chave" : "sem chave"} · ${reais.map((o) => o.name).join("/") || "sem carteiras"}]`
      : "";
  const avisoDeErro = (
    <>
      {erroCarteira && <p className="mt-1.5 text-[11px] leading-snug text-bear">{erroCarteira}</p>}
      {ehSolana && diagnostico && <p className="mt-1 text-[10px] text-zinc-600">{diagnostico}</p>}
    </>
  );
  const pediuTroca = useRef(false);
  useEffect(() => {
    if (!redeErrada || pediuTroca.current) return;
    pediuTroca.current = true;
    switchChain({ chainId: robinhoodChain.id });
  }, [redeErrada, switchChain]);
  const pediuConexao = useRef(false);
  useEffect(() => {
    if (conectada || pediuConexao.current || !direta) return;
    const celularDeVerdade = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const veioDoBotaoDaCarteira = new URLSearchParams(window.location.search).has("lado");
    if (!celularDeVerdade || !veioDoBotaoDaCarteira || !reais.length) return;
    pediuConexao.current = true;
    const d = direta;
    setTimeout(() => d.onSelect(), 1200);
  }, [conectada, direta, reais.length]);

  if (conectada && !redeErrada) return <>{children}</>;

  if (compacto) {
    /*
     * CELULAR (07/10/2026): no app do X não existe extensão de carteira. O
     * botão abre a moeda DENTRO do app da Phantom/Solflare — no navegador
     * deles a carteira existe — já com o valor, o lado e quem indicou.
     */
    if (celular && alvoNaCarteira && !reais.length) {
      const origem = new URL(alvoNaCarteira).origin;
      const u = encodeURIComponent(alvoNaCarteira);
      const r = encodeURIComponent(origem);
      const semProtocolo = alvoNaCarteira.replace(/^https?:\/\//, "");
      // Cada carteira abre o próprio navegador já nesta página (valor, lado e indicação juntos).
      const lista: [string, string][] = ehSolana
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
      /*
       * ANDROID (09/10/2026): o navegador do X abre o link https da carteira
       * POR DENTRO em vez de passar pro app ("nenhum aplicativo pode executar
       * esta ação"). O intent:// com o pacote manda o MESMO link direto pro app
       * da carteira; sem o app instalado, o Android cai no link https normal
       * (página de baixar). Testado com a MetaMask no app do X.
       */
      // Já dentro do app da MetaMask, sem a carteira Solana dela aqui: mandar
      // pra MetaMask de novo daria volta em círculo.
      const semLoop = naMetaMask && ehSolana ? lista.filter(([nome]) => nome !== "MetaMask") : lista;
      const carteiras = android
        ? semLoop.map(([nome, link]): [string, string] =>
            PACOTE_ANDROID[nome]
              ? [nome, `intent://${link.replace("https://", "")}#Intent;scheme=https;package=${PACOTE_ANDROID[nome]};S.browser_fallback_url=${encodeURIComponent(link)};end`]
              : [nome, link],
          )
        : semLoop;
      return (
        <div className="space-y-1.5">
          {/* No post do X cada linha conta (o X corta o que passa da altura): sem o texto, demais carteiras numa fileira só. */}
          {!compacto && <p className="text-[11px] text-zinc-400">{t.celularSemCarteira}</p>}
          {naMetaMask && ehSolana && <p className="text-[11px] leading-snug text-warn">{t.metamaskSemSolana}</p>}
          {/* Nenhuma carteira preferida (pedido do dono, 09/10/2026): o botão só abre a lista. */}
          <button
            type="button"
            onClick={() => setListaAberta((v) => !v)}
            className="block w-full rounded-lg bg-marca py-2.5 text-center text-[14px] font-black text-black"
          >
            {t.conecteSua} {listaAberta ? "▴" : "▾"}
          </button>
          {listaAberta && (
          <div className="grid grid-cols-3 gap-1.5">
            {carteiras.map(([nome, link]) => (
              <a
                key={nome}
                href={link}
                // Mesma aba, de propósito (09/10/2026): com target=_blank o navegador
                // do X no Android não entrega o link pro app da carteira — dava
                // "nenhum aplicativo pode executar esta ação". Na mesma aba, abre.
                className="rounded-lg border border-ink-600 bg-ink-800 py-2 text-center text-[12px] font-bold text-zinc-100"
              >
                {nome}
              </a>
            ))}
            <button
              type="button"
              onClick={() => copiarLink(alvoNaCarteira)}
              className="rounded-lg border border-ink-600 py-2 text-[12px] font-bold text-zinc-400"
            >
              {linkCopiado ? t.copiado : t.outra}
            </button>
          </div>
          )}
          {/* "Outra" no celular (09/10/2026): a lista do site manda pra Play Store
              mesmo com o app instalado. Copiar o link serve pra qualquer carteira. */}
          {linkCopiado && <p className="text-[11px] leading-snug text-zinc-400">{t.coleNaCarteira}</p>}
          {avisoDeErro}
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
        <Button variant="chroma" size="lg" className="w-full uppercase tracking-wide" onClick={abrir}>
          {rotuloConectar ?? (vinculada ? t.liberar : t.conectarCarteira(meta.label))}
        </Button>
        {avisoDeErro}
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
