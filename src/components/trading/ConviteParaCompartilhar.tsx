"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAccount } from "wagmi";

import { useTextos } from "@/components/IdiomaProvider";
import { useChromaAccount } from "@/hooks/useChromaAccount";
import { traducoes } from "@/lib/idiomas";
import type { TokenSummary } from "@/lib/types";

/**
 * "POSTE E GANHE" — logo abaixo do comprar/vender (08/10/2026: "deveria ficar
 * bem mais visível"). O link do post vira uma janela de compra no X (ver
 * /e/[address]) e quem comprar por ele paga 0,30% a quem postou, na hora.
 *
 * Sem cadastro: o apelido da conta, se houver; senão a carteira conectada da
 * rede da moeda. Sem nenhum dos dois, o post sai mesmo assim (sem ganho) e um
 * aviso pede pra conectar.
 */
const TEXTOS = traducoes({
  en: {
    titulo: "Post it on X. Earn 0.30% of every buy.",
    texto: "Your post becomes a buy box right on X. Everyone who trades through it pays you instantly, on-chain — on this coin and any other they trade later.",
    postar: "Post on X & earn",
    copiar: "Copy my link",
    copiado: "Copied!",
    conectar: "Connect your wallet to get paid for the trades your post brings.",
    tweet: (s: string) => `$${s} — buy it right here in this post 👇`,
  },
  pt: {
    titulo: "Poste no X. Ganhe 0,30% de cada compra.",
    texto: "Seu post vira uma janela de compra direto no X. Todo mundo que negociar por ele te paga na hora, na blockchain — nesta moeda e em qualquer outra que negociar depois.",
    postar: "Postar no X e ganhar",
    copiar: "Copiar meu link",
    copiado: "Copiado!",
    conectar: "Conecte sua carteira pra receber pelos negócios que o seu post trouxer.",
    tweet: (s: string) => `$${s} — buy it right here in this post 👇`,
  },
  zh: {
    titulo: "发到 X，每笔买入赚 0.30%。",
    texto: "你的帖子会在 X 上直接变成购买窗口。通过它交易的每个人都会即时在链上付给你 —— 这个代币以及他们之后交易的任何代币。",
    postar: "发到 X 赚钱",
    copiar: "复制我的链接",
    copiado: "已复制！",
    conectar: "连接钱包，帖子带来的交易才能给你分成。",
    tweet: (s: string) => `$${s} — buy it right here in this post 👇`,
  },
});

export function ConviteParaCompartilhar({ token }: { token: TokenSummary }) {
  const t = useTextos(TEXTOS);
  const account = useChromaAccount();
  const { publicKey } = useWallet();
  const { address: carteiraEvm } = useAccount();
  const [origem, setOrigem] = useState("https://chromalaunch.fun");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => setOrigem(window.location.origin), []);

  const ref = account.account?.nickname ?? (token.chain === "solana" ? publicKey?.toBase58() : carteiraEvm) ?? null;
  // /e/…: no X o post vira uma janela de compra (player card); fora do X, abre a moeda.
  const link = `${origem}/e/${token.address}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`;
  const postar = `https://x.com/intent/post?text=${encodeURIComponent(t.tweet(token.symbol))}&url=${encodeURIComponent(link)}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      /* clipboard bloqueado */
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-marca/50 bg-gradient-to-br from-marca/[0.18] via-marca/[0.06] to-transparent p-4 shadow-[0_0_28px_-6px_rgba(34,211,238,0.45)]">
      <p className="text-[17px] font-black leading-tight tracking-tight text-zinc-50">💸 {t.titulo}</p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-zinc-300">{t.texto}</p>
      <a
        href={postar}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-marca text-[15px] font-black text-black transition-opacity hover:opacity-90"
      >
        <span className="text-[17px]">𝕏</span> {t.postar}
      </a>
      <button
        type="button"
        onClick={copiar}
        className="mt-2 w-full rounded-lg py-1.5 text-[12.5px] font-bold text-marca hover:bg-marca/10"
      >
        {copiado ? t.copiado : t.copiar}
      </button>
      {!ref && <p className="mt-1 text-center text-[11.5px] text-zinc-400">{t.conectar}</p>}
    </div>
  );
}
