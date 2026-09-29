"use client";

import { useEffect, useState } from "react";

import { useTextos } from "@/components/IdiomaProvider";
import { useChromaAccount } from "@/hooks/useChromaAccount";
import { feeLabel } from "@/lib/fees";
import { traducoes } from "@/lib/idiomas";
import type { TokenSummary } from "@/lib/types";

const TEXTOS = traducoes({
  en: {
    titulo: "Share and earn with every trade",
    texto: (p: string, s: string) =>
      `Send $${s} to your friends, group or community. Every time someone who came through your link buys or sells — here or on any coin afterwards — you get ${p} of the amount traded, straight to your wallet, in the same transaction. No sign-up, no withdrawal, forever.`,
    copiar: "Copy my link", copiado: "Link copied!", postar: "Post on X", entrar: "Sign in to get your link",
    tweet: (s: string) => `$${s} is live on Chroma 👇`,
  },
  pt: {
    titulo: "Compartilhe e ganhe em cada operação",
    texto: (p: string, s: string) =>
      `Mande a $${s} pros seus amigos, grupo ou comunidade. Toda vez que alguém que entrou pelo seu link comprar ou vender — nesta moeda ou em qualquer outra depois — você recebe ${p} do valor negociado, direto na sua carteira, na mesma transação. Sem cadastro, sem saque, pra sempre.`,
    copiar: "Copiar meu link", copiado: "Link copiado!", postar: "Postar no X", entrar: "Entre para gerar o seu link",
    tweet: (s: string) => `$${s} está no ar na Chroma 👇`,
  },
  zh: {
    titulo: "分享，每笔交易都有收益",
    texto: (p: string, s: string) =>
      `把 $${s} 分享给你的朋友、群组或社区。每当通过你的链接进来的人买入或卖出 —— 无论是这个代币还是之后的任何代币 —— 你都能获得交易金额的 ${p}，在同一笔交易中直接打入你的钱包。无需注册、无需提现、永久有效。`,
    copiar: "复制我的链接", copiado: "链接已复制！", postar: "发到 X", entrar: "登录以获取你的链接",
    tweet: (s: string) => `$${s} 已在 Chroma 上线 👇`,
  },
});

/**
 * O convite pra divulgar, logo abaixo do botão de compra.
 *
 * O botão "Compartilhar" do cabeçalho é pequeno e não diz o que a pessoa
 * ganha — quase ninguém clicava. Aqui o ganho vem escrito, com o link pronto.
 */
export function ConviteParaCompartilhar({ token }: { token: TokenSummary }) {
  const t = useTextos(TEXTOS);
  const account = useChromaAccount();
  const [origem, setOrigem] = useState("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => setOrigem(window.location.origin), []);

  const link = account.referralId ? `${origem}/token/${token.address}?ref=${account.referralId}` : "";

  async function copiar() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      /* clipboard bloqueado */
    }
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-bull/30 bg-gradient-to-br from-bull/[0.12] via-bull/[0.04] to-transparent p-4">
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-full bg-bull/20 text-[15px]">💸</span>
        <p className="text-[14px] font-black tracking-tight text-zinc-50">{t.titulo}</p>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-zinc-300">{t.texto(feeLabel.affiliate, token.symbol)}</p>

      {account.isSignedIn && link ? (
        <div className="mt-3 flex gap-2">
          <button
            onClick={copiar}
            className="flex-1 rounded-lg bg-bull px-3 py-2 text-[13px] font-bold text-black transition-opacity hover:opacity-90"
          >
            {copiado ? t.copiado : t.copiar}
          </button>
          <a
            href={`https://x.com/intent/tweet?text=${encodeURIComponent(t.tweet(token.symbol))}&url=${encodeURIComponent(link)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-bull/40 px-3 py-2 text-[13px] font-bold text-bull transition-colors hover:bg-bull/10"
          >
            {t.postar}
          </a>
        </div>
      ) : (
        <p className="mt-3 text-[12px] font-semibold text-bull">{t.entrar}</p>
      )}
    </div>
  );
}
