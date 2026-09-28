"use client";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { useChromaAccount } from "@/hooks/useChromaAccount";
import { feeLabel } from "@/lib/fees";
import { cn } from "@/lib/utils";
import type { TokenSummary } from "@/lib/types";

/**
 * Compartilhar a moeda com o link de indicação de quem está logado.
 *
 * É o caminho que faz o programa de afiliados funcionar de verdade: ninguém
 * divulga "a plataforma", as pessoas divulgam A MOEDA que elas compraram. O
 * link tem que sair daqui, da página do token, e não só do painel de afiliado.
 *
 * Sem conta, o botão ainda copia o link da moeda — só que sem o `?ref=`, e a
 * interface avisa o que a pessoa está deixando na mesa.
 */
const TEXTOS = traducoes({
  en: {
    texto: (n: string, s: string) => `${n} ($${s}) on Chroma`, compartilhar: "Share", link: "Link to this coin", comIndicacao: "with your referral",
    copiado: "copied", copiar: "copy",
    quemComprar: (p: React.ReactNode) => <>Whoever buys through this link pays you {p} of every trade — it comes from the platform&apos;s share, not from the buyer&apos;s pocket.</>,
    entreNaConta: "Sign in",
    entre: (s: React.ReactNode, p: string) => <>{s} to make this link yours: you then earn {p} of every trade from whoever comes through it.</>,
  },
  pt: {
    texto: (n: string, s: string) => `${n} ($${s}) na Chroma`, compartilhar: "Compartilhar", link: "Link desta moeda", comIndicacao: "com sua indicação",
    copiado: "copiado", copiar: "copiar",
    quemComprar: (p: React.ReactNode) => <>Quem comprar por este link te paga {p} de cada operação — sai da parte da plataforma, não do bolso de quem compra.</>,
    entreNaConta: "Entre na sua conta",
    entre: (s: React.ReactNode, p: string) => <>{s} para este link virar seu: você passa a receber {p} de cada operação de quem entrar por ele.</>,
  },
  zh: {
    texto: (n: string, s: string) => `${n} ($${s}) 在 Chroma`, compartilhar: "分享", link: "该代币链接", comIndicacao: "含你的推荐",
    copiado: "已复制", copiar: "复制",
    quemComprar: (p: React.ReactNode) => <>通过此链接买入的人，每笔交易都会支付你 {p} —— 来自平台的分成，不会增加买家的成本。</>,
    entreNaConta: "登录",
    entre: (s: React.ReactNode, p: string) => <>{s}后此链接即归你：通过它进入的人每笔交易你都能获得 {p}。</>,
  },
});

export function ShareToken({ token }: { token: TokenSummary }) {
  const t = useTextos(TEXTOS);
  const account = useChromaAccount();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => setOrigin(window.location.origin), []);

  // Fecha ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const caminho = `/token/${token.address}`;
  const link = account.referralId
    ? `${origin}${caminho}?ref=${account.referralId}`
    : `${origin}${caminho}`;

  const texto = t.texto(token.name, token.symbol);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard bloqueado: o link segue visível no campo abaixo */
    }
  }

  return (
    <div className="relative" ref={boxRef}>
      <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        <ShareIcon />
        {t.compartilhar}
      </Button>

      {open && (
        <div className="panel absolute right-0 z-40 mt-2 w-[320px] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-zinc-200">{t.link}</span>
            {account.referralId && (
              <span className="rounded-md bg-marca/15 px-1.5 py-0.5 text-[10px] font-bold text-marca">
                {t.comIndicacao}
              </span>
            )}
          </div>

          <div className="flex gap-1.5">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="tnum min-w-0 flex-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-[11px] text-zinc-300 outline-none"
            />
            <Button variant="chroma" size="sm" onClick={copiar}>
              {copied ? t.copiado : t.copiar}
            </Button>
          </div>

          <div className="mt-2 flex gap-1.5">
            <SocialLink
              label="X"
              href={`https://x.com/intent/tweet?text=${encodeURIComponent(texto)}&url=${encodeURIComponent(link)}`}
            />
            <SocialLink
              label="Telegram"
              href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(texto)}`}
            />
            <SocialLink
              label="WhatsApp"
              href={`https://wa.me/?text=${encodeURIComponent(`${texto} ${link}`)}`}
            />
          </div>

          <p className="mt-2.5 border-t border-white/[0.06] pt-2.5 text-[11px] leading-relaxed text-zinc-500">
            {account.referralId ? (
              t.quemComprar(<strong className="text-marca">{feeLabel.affiliate}</strong>)
            ) : (
              t.entre(<strong className="text-zinc-300">{t.entreNaConta}</strong>, feeLabel.affiliate)
            )}
          </p>
        </div>
      )}
    </div>
  );
}

function SocialLink({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "flex-1 rounded-lg border border-white/[0.06] bg-white/[0.02] py-1.5 text-center",
        "text-[11px] font-semibold text-zinc-400 transition-colors",
        "hover:border-marca/40 hover:text-marca",
      )}
    >
      {label}
    </a>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}
