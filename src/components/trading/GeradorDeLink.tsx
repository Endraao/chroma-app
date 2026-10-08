"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAccount } from "wagmi";

import { useTextos } from "@/components/IdiomaProvider";
import { RequireChainWallet } from "@/components/web3/RequireChainWallet";
import { SugestoesDoDia } from "@/components/trading/SugestoesDoDia";
import { useChromaAccount } from "@/hooks/useChromaAccount";
import { traducoes } from "@/lib/idiomas";
import { comLinkDoCelular } from "@/lib/link-do-post";
import type { ChainId } from "@/lib/types";
import { cn, formatUsd } from "@/lib/utils";

/**
 * GERADOR DE LINK PRA QUALQUER MOEDA (pedido do dono, 07/10/2026).
 *
 * Cola o endereço (ou o link) de qualquer moeda da Solana ou da Robinhood e
 * sai com o link do post — que no X vira a janela de compra — já com a SUA
 * indicação. Sem cadastro: basta a carteira da rede da moeda conectada (o
 * apelido da conta, se houver, vale nas duas redes).
 */
const TEXTOS = traducoes({
  en: {
    titulo: "Share any coin. Earn on every trade.",
    sub: "Paste any Solana or Robinhood Chain coin. Your post becomes a buy box on X, and you earn 0.30% of every trade it brings — paid on-chain, in the same transaction.",
    campo: "Coin address or link",
    exemplo: "e.g. 6Mix12Li…bordr or a chromalaunch.fun/token/… link",
    invalido: "That doesn't look like a Solana or Robinhood Chain address.",
    buscando: "Looking up the coin…",
    naoAchou: "Couldn't find this coin. Check the address.",
    seuLink: "Your post link",
    copiar: "Copy link",
    copiado: "Copied!",
    postar: "Post on X",
    semRef: "Connect your wallet to get paid for the trades your post brings.",
    tweet: (s: string) => `$${s} — buy it right here in this post 👇`,
    ranking: "See the top promoters →",
    meuCard: "My earnings card →",
    campanhas: "Campaigns with extra bonus →",
    mc: "MC",
  },
  pt: {
    titulo: "Divulgue qualquer moeda. Ganhe em cada negócio.",
    sub: "Cole qualquer moeda da Solana ou da Robinhood Chain. Seu post vira uma janela de compra no X, e você ganha 0,30% de cada negócio que ele trouxer — pago na blockchain, na mesma transação.",
    campo: "Endereço ou link da moeda",
    exemplo: "ex.: 6Mix12Li…bordr ou um link chromalaunch.fun/token/…",
    invalido: "Isso não parece um endereço da Solana ou da Robinhood Chain.",
    buscando: "Procurando a moeda…",
    naoAchou: "Não encontramos essa moeda. Confira o endereço.",
    seuLink: "Seu link do post",
    copiar: "Copiar link",
    copiado: "Copiado!",
    postar: "Postar no X",
    semRef: "Conecte sua carteira pra receber pelos negócios que o seu post trouxer.",
    tweet: (s: string) => `$${s} — buy it right here in this post 👇`,
    ranking: "Ver o ranking de divulgadores →",
    meuCard: "Meu card de ganhos →",
    campanhas: "Campanhas com bônus extra →",
    mc: "MC",
  },
  zh: {
    titulo: "推广任意代币，每笔交易都赚钱。",
    sub: "粘贴任意 Solana 或 Robinhood Chain 代币。你的帖子会在 X 上变成购买窗口，帖子带来的每笔交易你都能获得 0.30% —— 链上同笔交易内支付。",
    campo: "代币地址或链接",
    exemplo: "例如 6Mix12Li…bordr 或 chromalaunch.fun/token/… 链接",
    invalido: "这看起来不像 Solana 或 Robinhood Chain 地址。",
    buscando: "正在查找代币…",
    naoAchou: "找不到这个代币，请检查地址。",
    seuLink: "你的帖子链接",
    copiar: "复制链接",
    copiado: "已复制！",
    postar: "发到 X",
    semRef: "连接钱包，帖子带来的交易才能给你分成。",
    tweet: (s: string) => `$${s} — buy it right here in this post 👇`,
    ranking: "查看推广者排行榜 →",
    meuCard: "我的收益卡片 →",
    campanhas: "有额外奖励的活动 →",
    mc: "市值",
  },
});

const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM = /^0x[0-9a-fA-F]{40}$/;

/** Aceita o endereço puro ou qualquer link que tenha um endereço dentro. */
function extrairEndereco(texto: string): string | null {
  const t = texto.trim();
  if (SOLANA.test(t) || EVM.test(t)) return t;
  const evm = t.match(/0x[0-9a-fA-F]{40}/)?.[0];
  if (evm) return evm;
  const partes = t.split(/[/?#&=\s]+/).filter((p) => SOLANA.test(p));
  return partes[partes.length - 1] ?? null;
}

interface Moeda {
  name: string;
  symbol: string;
  imageUrl: string | null;
  chain: ChainId;
  marketCapUsd: number;
}

export function GeradorDeLink() {
  const t = useTextos(TEXTOS);
  const [texto, setTexto] = useState("");
  const [moeda, setMoeda] = useState<Moeda | null>(null);
  const [estado, setEstado] = useState<"" | "buscando" | "nao-achou">("");
  const [copiado, setCopiado] = useState(false);
  const [origem, setOrigem] = useState("https://chromalaunch.fun");

  const endereco = extrairEndereco(texto);
  const { publicKey } = useWallet();
  const { address: carteiraEvm } = useAccount();
  const { account } = useChromaAccount();

  useEffect(() => {
    setOrigem(window.location.origin);
    const m = new URLSearchParams(window.location.search).get("moeda");
    if (m) setTexto(m);
  }, []);

  useEffect(() => {
    setMoeda(null);
    if (!endereco) return setEstado("");
    let vivo = true;
    setEstado("buscando");
    fetch(`/api/token-stats?address=${endereco}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!vivo) return;
        if (!j?.symbol || j.symbol === endereco.slice(0, 4).toUpperCase()) return setEstado("nao-achou");
        setMoeda(j as Moeda);
        setEstado("");
      })
      .catch(() => vivo && setEstado("nao-achou"));
    return () => {
      vivo = false;
    };
  }, [endereco]);

  const chain: ChainId = endereco?.startsWith("0x") ? "robinhood" : "solana";
  // Apelido da conta vale nas duas redes; sem conta, a carteira da rede da moeda.
  const ref = account?.nickname ?? (chain === "solana" ? publicKey?.toBase58() : carteiraEvm) ?? null;
  const link = endereco ? `${origem}/e/${endereco}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}` : "";

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      /* clipboard bloqueado */
    }
  }

  const postar = moeda
    ? `https://x.com/intent/post?text=${encodeURIComponent(comLinkDoCelular(t.tweet(moeda.symbol), link))}&url=${encodeURIComponent(link)}`
    : "";

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-[30px] font-black leading-tight text-zinc-50">{t.titulo}</h1>
        <p className="text-[14.5px] leading-relaxed text-zinc-300">{t.sub}</p>
      </header>

      <label className="block space-y-1.5">
        <span className="text-[12px] font-bold uppercase tracking-wider text-zinc-500">{t.campo}</span>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={t.exemplo}
          spellCheck={false}
          className="w-full rounded-xl border border-ink-600 bg-ink-900 px-4 py-3.5 font-mono text-[14px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-marca/60"
        />
      </label>

      {texto && !endereco && <p className="text-[13px] text-warn">{t.invalido}</p>}
      {estado === "buscando" && <p className="text-[13px] text-zinc-400">{t.buscando}</p>}
      {estado === "nao-achou" && <p className="text-[13px] text-warn">{t.naoAchou}</p>}

      {moeda && endereco && (
        <section className="space-y-3 rounded-2xl border border-marca/25 bg-ink-900/70 p-4">
          <div className="flex items-center gap-3">
            <img
              src={moeda.imageUrl || `/api/logo/${endereco}`}
              alt=""
              className="size-11 rounded-full bg-ink-800 object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px] font-black text-zinc-50">
                {moeda.name} <span className="text-[13px] font-semibold text-sky-300/90">${moeda.symbol}</span>
              </p>
              <p className="tnum text-[12.5px] text-zinc-400">
                {formatUsd(moeda.marketCapUsd)} {t.mc} · {chain === "solana" ? "Solana" : "Robinhood Chain"}
              </p>
            </div>
          </div>

          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-zinc-500">{t.seuLink}</p>
            <p className="break-all rounded-lg border border-white/[0.06] bg-ink-950 px-3 py-2.5 font-mono text-[12.5px] text-marca">{link}</p>
          </div>

          {!ref && (
            <RequireChainWallet chain={chain}>
              <span />
            </RequireChainWallet>
          )}
          {!ref && <p className="text-[12px] text-zinc-500">{t.semRef}</p>}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={copiar}
              className={cn(
                "rounded-xl border px-4 py-3 text-[14px] font-bold transition-colors",
                copiado ? "border-bull/50 text-bull" : "border-marca/40 text-marca hover:bg-marca/10",
              )}
            >
              {copiado ? t.copiado : t.copiar}
            </button>
            <a
              href={postar}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-marca px-4 py-3 text-center text-[14px] font-black text-black hover:opacity-90"
            >
              {t.postar}
            </a>
          </div>
        </section>
      )}

      <SugestoesDoDia origem={origem} refId={account?.nickname ?? publicKey?.toBase58() ?? null} />

      <div className="flex flex-wrap gap-4">
        <Link href="/ranking" className="text-[13px] font-bold text-marca hover:underline">
          {t.ranking}
        </Link>
        <Link href="/campanhas" className="text-[13px] font-bold text-marca hover:underline">
          {t.campanhas}
        </Link>
        {ref && (
          <Link href={`/ganhos/${encodeURIComponent(ref)}`} className="text-[13px] font-bold text-marca hover:underline">
            {t.meuCard}
          </Link>
        )}
      </div>
    </main>
  );
}
