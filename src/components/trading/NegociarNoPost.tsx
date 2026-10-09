"use client";

import { Suspense, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { parseEther } from "viem";
import { useAccount, usePublicClient, useSendTransaction, useSwitchChain } from "wagmi";

import { NumeroVivo, AoVivoProvider, useTokenVivo } from "@/components/home/AoVivo";
import { ImagemDaMoeda } from "@/components/home/CardDaMoeda";
import { useTextos } from "@/components/IdiomaProvider";
import { SwapWidget } from "@/components/trading/SwapWidget";
import { RequireChainWallet } from "@/components/web3/RequireChainWallet";
import { useLinkDoX } from "@/hooks/useLinkDoX";
import { traducoes } from "@/lib/idiomas";
import type { TokenSummary } from "@/lib/types";
import { cn, formatPct, formatPrice, formatUsd } from "@/lib/utils";
import { feeLabelFor } from "@/lib/fees";
import { PLATFORM_FEE_WALLET_EVM, PLATFORM_FEE_WALLET_SOL, robinhoodChain } from "@/lib/web3";

const X_DA_CHROMA = "https://x.com/ChromaLaunch";
const BOTAO_DO_TOPO =
  "flex h-6 w-[148px] items-center justify-center gap-1.5 rounded-lg bg-ink-900 text-[12px] font-bold text-zinc-200 hover:bg-ink-800";
const TAXA_DO_LINK_SOL = 0.005;
const TAXA_DO_LINK_ETH = "0.0002";

const TEXTOS = traducoes({
  en: {
    abrir: "Open on Chroma", mc: "MC",
    abaNegociar: "Trade", abaLink: "My link",
    pool: "Pool",
    comoFunciona: (taxa: string, curva: boolean) =>
      `Chroma charges ${taxa} per trade — 0.30% of it goes to whoever shared the post.${curva ? " On coins launched on the Chroma Curve, the 1% pool fee splits 40% creator · 40% Chroma · 20% Meteora." : ""}`,
    emSol: (m: string) => `All fees and payouts in ${m}, on-chain, in the same transaction.`,
    linkTitulo: "Share with your own link",
    linkTexto: (m: string) => `Everyone who trades through your link pays you 0.30% of the trade — in ${m}, on-chain, instantly.`,
    passo1: "Connect your wallet", passo1b: "where your earnings will land",
    passo2: "Follow @ChromaLaunch on X", passo2b: "stay on top of new features",
    passo3: "Register your link", passo3b: (s: string) => `one-time registration fee: ${s}`,
    passo4: "Share it on X", passo4b: "your post becomes a buy box too",
    seguir: "Follow ↗", registrar: "Register", registrando: "Approve in your wallet…", compartilhar: "Post on X ↗", cancelado: "Cancelled in your wallet.", semSaldo: (m: string) => `Not enough ${m} in this wallet for the fee.`, naoDeu: "It didn't go through. Try again.",
    pronto: "Your link is ready:", copiar: "Copy", copiado: "Copied!", sigaAntes: "Click Follow first",
    tweet: (s: string) => `$${s} — buy it right here in this post 👇`,
  },
  pt: {
    abrir: "Abrir na Chroma", mc: "MC",
    abaNegociar: "Negociar", abaLink: "Meu link",
    pool: "Pool",
    comoFunciona: (taxa: string, curva: boolean) =>
      `A Chroma cobra ${taxa} por negócio — 0,30% disso vai pra quem compartilhou o post.${curva ? " Nas moedas lançadas na Curva da Chroma, a taxa de 1% da pool é dividida: 40% criador · 40% Chroma · 20% Meteora." : ""}`,
    emSol: (m: string) => `Todas as taxas e pagamentos em ${m}, na blockchain, na mesma transação.`,
    linkTitulo: "Compartilhe com o seu link",
    linkTexto: (m: string) => `Quem negociar pelo seu link te paga 0,30% do negócio — em ${m}, na blockchain, na hora.`,
    passo1: "Conecte sua carteira", passo1b: "onde os seus ganhos vão cair",
    passo2: "Siga a @ChromaLaunch no X", passo2b: "fique por dentro das novidades",
    passo3: "Registre o seu link", passo3b: (s: string) => `taxa única de registro: ${s}`,
    passo4: "Compartilhe no X", passo4b: "o seu post também vira janela de compra",
    seguir: "Seguir ↗", registrar: "Registrar", registrando: "Aprove na sua carteira…", compartilhar: "Postar no X ↗", cancelado: "Cancelado na carteira.", semSaldo: (m: string) => `Saldo de ${m} insuficiente nesta carteira pra taxa.`, naoDeu: "Não deu certo. Tente de novo.",
    pronto: "Seu link está pronto:", copiar: "Copiar", copiado: "Copiado!", sigaAntes: "Clique em Seguir antes",
    tweet: (s: string) => `$${s} — buy it right here in this post 👇`,
  },
  zh: {
    abrir: "在 Chroma 打开", mc: "市值",
    abaNegociar: "交易", abaLink: "我的链接",
    pool: "池子",
    comoFunciona: (taxa: string, curva: boolean) =>
      `Chroma 每笔交易收取 ${taxa} —— 其中 0.30% 归分享该帖子的人。${curva ? "在 Chroma 曲线上发行的代币，1% 池子手续费分配为：40% 创建者 · 40% Chroma · 20% Meteora。" : ""}`,
    emSol: (m: string) => `所有手续费和收益均以 ${m} 链上同笔交易支付。`,
    linkTitulo: "用你自己的链接分享",
    linkTexto: (m: string) => `通过你的链接交易的每个人都会付给你 0.30% —— ${m}，链上，即时。`,
    passo1: "连接钱包", passo1b: "收益将打入这里",
    passo2: "在 X 上关注 @ChromaLaunch", passo2b: "第一时间了解新功能",
    passo3: "注册你的链接", passo3b: (s: string) => `一次性注册费：${s}`,
    passo4: "分享到 X", passo4b: "你的帖子也会变成购买窗口",
    seguir: "关注 ↗", registrar: "注册", registrando: "请在钱包中确认…", compartilhar: "发到 X ↗", cancelado: "已在钱包中取消。", semSaldo: (m: string) => `钱包中的 ${m} 不足以支付费用。`, naoDeu: "未成功，请重试。",
    pronto: "你的链接已就绪：", copiar: "复制", copiado: "已复制！", sigaAntes: "请先点击关注",
    tweet: (s: string) => `$${s} — buy it right here in this post 👇`,
  },
});

/** De onde vem a liquidez da moeda, em palavras. */
function origemDaPool(t: TokenSummary): string {
  const dex = (t.dexId ?? "").toLowerCase();
  if (dex === "chroma-curve") return "Chroma Curve (Meteora DBC)";
  if (t.plataforma === "chroma" && dex.startsWith("meteora")) return "graduated · Meteora DAMM v2";
  const nomes: Record<string, string> = {
    pumpfun: "pump.fun curve",
    pumpswap: "PumpSwap AMM (graduated)",
    meteoradbc: "Meteora DBC curve",
    meteora: "Meteora",
    raydium: "Raydium",
    launchlab: "Raydium LaunchLab",
    orca: "Orca",
    pons: "Pons curve",
    uniswap: "Uniswap v4",
  };
  return nomes[dex] ?? (dex ? dex.charAt(0).toUpperCase() + dex.slice(1) : "—");
}

/** O que aparece dentro do post do X: cabeçalho da moeda + negociar / meu link. */
export function NegociarNoPost({ token }: { token: TokenSummary }) {
  return (
    <AoVivoProvider tokens={[token]}>
      <Conteudo base={token} />
    </AoVivoProvider>
  );
}

function Conteudo({ base }: { base: TokenSummary }) {
  const linkX = useLinkDoX();
  const t = useTextos(TEXTOS);
  const token = useTokenVivo(base);
  const pct = token.change24h;
  const [aba, setAba] = useState<"negociar" | "link">("negociar");
  const [explicando, setExplicando] = useState(false);
  // A indicação de quem postou segue junto se a compra tiver de abrir fora do X.
  const [ref, setRef] = useState("");
  useEffect(() => setRef(new URLSearchParams(window.location.search).get("ref") ?? ""), []);
  // A carteira conectada aqui segue junto: a aba da Chroma conecta sozinha e
  // mostra o saldo (ver ConectarPeloLink) — sem isso pedia conexão de novo.
  const { wallet: carteiraSol, connected: solConectada } = useWallet();
  const { connector: conectorEvm, isConnected: evmConectada } = useAccount();
  const paramsFora = new URLSearchParams();
  if (ref) paramsFora.set("ref", ref);
  if (solConectada && carteiraSol) paramsFora.set("carteira", carteiraSol.adapter.name);
  if (evmConectada && conectorEvm) paramsFora.set("carteira-evm", conectorEvm.id);
  const linkFora = `/token/${token.address}${paramsFora.size ? `?${paramsFora}` : ""}`;

  return (
    <main className="relative mx-auto flex max-w-[480px] flex-col gap-1 bg-ink-950 p-2">
      <div className="flex items-center gap-3">
        <div className="size-10 shrink-0 overflow-hidden rounded-full bg-ink-800">
          <ImagemDaMoeda token={token} px={88} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-black text-zinc-50">
            {token.name} <span className="text-[12.5px] font-semibold text-sky-300/90">${token.symbol}</span>
          </p>
          <p className="tnum text-[12px] text-zinc-400">
            $<NumeroVivo valor={token.priceUsd} formatar={formatPrice} /> ·{" "}
            <NumeroVivo valor={token.marketCapUsd} formatar={formatUsd} /> {t.mc}
            {Number.isFinite(pct) && pct !== 0 && (
              <span className={cn("ml-1.5 font-bold", pct >= 0 ? "text-bull" : "text-bear")}>{formatPct(pct)}</span>
            )}
          </p>
        </div>
        {/* Os dois botões com o mesmo formato (pedido do dono): logo + texto, sem contorno. */}
        <div className="flex shrink-0 flex-col gap-1">
          <a href={linkFora} target="_blank" rel="noreferrer" className={BOTAO_DO_TOPO}>
            <img src="/logo.png" alt="" className="size-4 rounded-full" />
            {t.abrir} ↗
          </a>
          <a href={linkX.href(X_DA_CHROMA)} target={linkX.alvo} rel="noreferrer" className={BOTAO_DO_TOPO}>
            <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 fill-current">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            @ChromaLaunch
          </a>
        </div>
      </div>

      {/* Abas em texto sublinhado: não competem com os botões de Buy/Sell logo abaixo. */}
      <div className="grid grid-cols-2 border-b border-white/[0.08] text-[12.5px] font-bold">
        {(["negociar", "link"] as const).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAba(a)}
            className={cn(
              "-mb-px border-b-2 pb-1",
              aba === a ? "border-zinc-100 text-zinc-50" : "border-transparent text-zinc-500 hover:text-zinc-200",
            )}
          >
            {a === "negociar" ? t.abaNegociar : t.abaLink}
          </button>
        ))}
      </div>

      {aba === "negociar" ? (
        <>
          <Suspense fallback={null}>
            <SwapWidget
              symbol={token.symbol}
              chain={token.chain}
              tokenAddress={token.address}
              pool={token.pairAddress ?? null}
              priceUsd={token.priceUsd}
              naCurvaDaChroma={token.dexId === "chroma-curve"}
              compacto
              linkFora={linkFora}
            />
          </Suspense>
          {/* Uma linha só (o post do X corta o que passar da altura); a explicação abre no ⓘ. */}
          {/* A explicação abre POR CIMA (o post não cresce; abrir pra baixo cortava). */}
          <button
            type="button"
            onClick={() => setExplicando((v) => !v)}
            className="truncate rounded-lg border border-white/[0.06] bg-ink-900/60 px-3 py-1.5 text-left text-[11px] leading-snug text-zinc-400"
          >
            <span className="font-bold text-zinc-300">{t.pool}:</span> {origemDaPool(token)} ·{" "}
            <span className="font-semibold text-marca">{token.chain === "robinhood" ? "ETH" : "SOL"}</span>{" "}
            {/* Ícone desenhado: o caractere ⓘ sai deformado em alguns navegadores. */}
            <svg viewBox="0 0 16 16" aria-hidden className="inline size-3.5 -translate-y-px align-middle text-zinc-400">
              <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <rect x="7.25" y="7" width="1.5" height="4.5" rx="0.75" fill="currentColor" />
              <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
            </svg>
          </button>
          {explicando && (
            <div
              onClick={() => setExplicando(false)}
              className="absolute inset-x-2 top-[92px] z-20 cursor-pointer space-y-1 rounded-lg border border-white/10 bg-ink-900 px-3 py-2.5 text-[11.5px] leading-snug text-zinc-300 shadow-2xl"
            >
              <p>{t.comoFunciona(feeLabelFor(token.chain).swap, token.chain === "solana")}</p>
              <p className="font-semibold text-marca">{t.emSol(token.chain === "robinhood" ? "ETH" : "SOL")}</p>
              <p className="text-right text-[10.5px] text-zinc-500">✕</p>
            </div>
          )}
        </>
      ) : (
        <MeuLink token={token} />
      )}
    </main>
  );
}

function MeuLink({ token }: { token: TokenSummary }) {
  const linkX = useLinkDoX();
  const t = useTextos(TEXTOS);
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [segue, setSegue] = useState(false);
  const [pago, setPago] = useState(false);
  const [estado, setEstado] = useState("");
  // Na Robinhood Chain tudo é em ETH e a comissão cai numa carteira EVM.
  const ehEvm = token.chain === "robinhood";
  // A rede REAL da carteira (useAccount): o useChainId() fica preso na Robinhood,
  // única rede da config, e aí não pedia a troca — "chain 1 does not match 4663".
  const { address: carteiraEvm, chainId: redeAtual } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const clienteEvm = usePublicClient({ chainId: robinhoodChain.id });
  const carteira = (ehEvm ? carteiraEvm : publicKey?.toBase58()) ?? "";
  const taxaDoLink = ehEvm ? `${TAXA_DO_LINK_ETH} ETH` : `${TAXA_DO_LINK_SOL} SOL`;
  // Apelido da conta Chroma desta carteira: deixa o link curto (?ref=apelido em
  // vez do endereço). O ?ref= aceita os dois e resolve pra carteira da rede.
  const [apelido, setApelido] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [postou, setPostou] = useState(false);

  useEffect(() => {
    if (!carteira) return;
    fetch(`/api/link-no-post?carteira=${carteira}`)
      .then((r) => r.json())
      .then((j) => setPago(Boolean(j?.pago)))
      .catch(() => {});
    fetch(`/api/account?wallet=${carteira}`)
      .then((r) => r.json())
      .then((c) => setApelido(c?.nickname && c?.carteiras?.[token.chain] === carteira ? c.nickname : ""))
      .catch(() => {});
  }, [carteira, token.chain]);

  // O passo 3 só libera depois do clique em "Seguir" (pedido do dono, 09/10/2026).
  useEffect(() => {
    try {
      if (localStorage.getItem("chroma-clicou-seguir") === "1") setSegue(true);
    } catch {}
  }, []);
  const clicouSeguir = () => {
    setSegue(true);
    try {
      localStorage.setItem("chroma-clicou-seguir", "1");
    } catch {}
  };

  async function confirmarNoSite(tx: string) {
    const r = await fetch("/api/link-no-post", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ carteira, tx }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.erro ?? "erro");
    setPago(true);
    setEstado("");
  }

  async function registrar() {
    if (ehEvm) {
      if (!carteiraEvm || !PLATFORM_FEE_WALLET_EVM || !clienteEvm) return;
      try {
        const saldo = await clienteEvm.getBalance({ address: carteiraEvm });
        if (saldo < parseEther(TAXA_DO_LINK_ETH) + parseEther("0.00002")) {
          setEstado(t.semSaldo("ETH"));
          return;
        }
        setEstado(t.registrando);
        if (redeAtual !== robinhoodChain.id) await switchChainAsync({ chainId: robinhoodChain.id });
        const hash = await sendTransactionAsync({
          to: PLATFORM_FEE_WALLET_EVM as `0x${string}`,
          value: parseEther(TAXA_DO_LINK_ETH),
          chainId: robinhoodChain.id,
        });
        await clienteEvm.waitForTransactionReceipt({ hash });
        await confirmarNoSite(hash);
      } catch (e) {
        setEstado(erroAmigavel(e));
      }
      return;
    }
    if (!publicKey || !sendTransaction || !PLATFORM_FEE_WALLET_SOL) return;
    try {
      // Sem saldo, cada carteira recusa com uma mensagem diferente (a Trust,
      // genérica): confere antes e diz o motivo certo. +0,001 SOL de rede.
      const saldo = await connection.getBalance(publicKey, "confirmed");
      if (saldo < Math.round((TAXA_DO_LINK_SOL + 0.001) * LAMPORTS_PER_SOL)) {
        setEstado(t.semSaldo("SOL"));
        return;
      }
      setEstado(t.registrando);
      // O bloco vai NA transação e é o mesmo que a confirmação espera (antes era
      // pego depois do envio e a espera estourava: "block height exceeded").
      const bloco = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: publicKey, ...bloco }).add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(PLATFORM_FEE_WALLET_SOL),
          lamports: Math.round(TAXA_DO_LINK_SOL * LAMPORTS_PER_SOL),
        }),
      );
      const assinatura = await sendTransaction(tx, connection);
      try {
        await connection.confirmTransaction({ signature: assinatura, ...bloco }, "confirmed");
      } catch (e) {
        // A espera pode desistir com o pagamento já feito (09/10/2026): confere na rede.
        const { value } = await connection.getSignatureStatus(assinatura, { searchTransactionHistory: true });
        if (!value || value.err || !value.confirmationStatus) throw e;
      }
      await confirmarNoSite(assinatura);
    } catch (e) {
      setEstado(erroAmigavel(e));
    }
  }

  // A mensagem crua da carteira é enorme (endereços, dados da transação) e
  // ficava cortada no fim do post: aqui vira uma frase curta.
  function erroAmigavel(e: unknown) {
    console.error("[registrar link]", e);
    const msg = e instanceof Error ? e.message : String(e);
    if (/reject|denied|cancel/i.test(msg)) return t.cancelado;
    if (/insufficient|not enough|exceeds the balance/i.test(msg)) return t.semSaldo(ehEvm ? "ETH" : "SOL");
    return t.naoDeu;
  }

  const ref = apelido || carteira;
  const link = `https://chromalaunch.fun/e3/${token.address}?ref=${encodeURIComponent(ref)}`;
  const curto = (s: string) => (s.length > 14 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s);
  const linkNaTela = `chromalaunch.fun/e3/${curto(token.address)}?ref=${curto(ref)}`;
  const copiar = () => {
    const avisar = () => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    };
    // Dentro do post o X não libera navigator.clipboard (iframe sem
    // "clipboard-write"): o jeito antigo, com um campo escondido, funciona.
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
    if (ok) return avisar();
    navigator.clipboard?.writeText(link).then(avisar).catch(() => {});
  };
  const postar = `https://x.com/intent/post?text=${encodeURIComponent(t.tweet(token.symbol))}&url=${encodeURIComponent(link)}`;
  const Passo = ({ n, feito, titulo, sub, children }: { n: number; feito: boolean; titulo: string; sub: string; children?: React.ReactNode }) => (
    <div className="flex items-center gap-3 border-t border-white/[0.06] py-1.5">
      <span className={cn("grid size-6 shrink-0 place-items-center rounded-md text-[12px] font-black", feito ? "bg-marca text-black" : "border border-white/15 text-zinc-400")}>
        {feito ? "✓" : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[13px] font-bold", feito ? "text-zinc-100" : "text-zinc-300")}>{titulo}</p>
        <p className="text-[11px] text-zinc-500">{sub}</p>
      </div>
      {children}
    </div>
  );

  return (
    <div className="rounded-lg border border-white/[0.06] bg-ink-900/60 px-3 py-2">
      <p className="text-[14px] font-black text-zinc-50">{t.linkTitulo}</p>
      <p className="mb-1 text-[11.5px] leading-snug text-zinc-400">{t.linkTexto(ehEvm ? "ETH" : "SOL")}</p>
      <Passo n={1} feito={Boolean(carteira)} titulo={t.passo1} sub={t.passo1b} />
      {!carteira && (
        <RequireChainWallet chain={ehEvm ? "robinhood" : "solana"} compacto>
          <span />
        </RequireChainWallet>
      )}
      <Passo n={2} feito={segue} titulo={t.passo2} sub={t.passo2b}>
        <a href={linkX.href(X_DA_CHROMA)} target={linkX.alvo} rel="noreferrer" onClick={clicouSeguir} className="rounded-md border border-marca/40 px-2.5 py-1 text-[11.5px] font-bold text-marca">
          {t.seguir}
        </a>
      </Passo>
      <Passo n={3} feito={pago} titulo={t.passo3} sub={t.passo3b(taxaDoLink)}>
        {!pago && carteira && (
          <button
            type="button"
            onClick={registrar}
            disabled={!segue}
            title={segue ? undefined : t.sigaAntes}
            className="rounded-md bg-marca px-2.5 py-1 text-[11.5px] font-black text-black disabled:cursor-not-allowed disabled:opacity-35"
          >
            {t.registrar}
          </button>
        )}
      </Passo>
      <Passo n={4} feito={postou} titulo={t.passo4} sub={t.passo4b}>
        {pago && carteira && (
          <a href={linkX.href(postar)} target={linkX.alvo} rel="noreferrer" onClick={() => setPostou(true)} className="rounded-md bg-marca px-2.5 py-1 text-[11.5px] font-black text-black">
            {t.compartilhar}
          </a>
        )}
      </Passo>
      {pago && carteira && (
        <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-400">
          <span className="shrink-0">{t.pronto}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-marca" title={link}>
            {linkNaTela}
          </span>
          <button type="button" onClick={copiar} className="shrink-0 rounded-md border border-marca/40 px-2 py-0.5 text-[11px] font-bold text-marca">
            {copiado ? t.copiado : t.copiar}
          </button>
        </div>
      )}
      {estado && <p className="mt-1 text-[11.5px] text-zinc-300">{estado}</p>}
    </div>
  );
}
