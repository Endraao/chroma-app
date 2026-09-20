"use client";

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
export function ShareToken({ token }: { token: TokenSummary }) {
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

  const texto = `${token.name} ($${token.symbol}) na Chroma`;

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
        Compartilhar
      </Button>

      {open && (
        <div className="panel absolute right-0 z-40 mt-2 w-[320px] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-zinc-200">Link desta moeda</span>
            {account.referralId && (
              <span className="rounded-md bg-chroma-violet/15 px-1.5 py-0.5 text-[10px] font-bold text-chroma-violet">
                com sua indicação
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
              {copied ? "copiado" : "copiar"}
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
              <>
                Quem comprar por este link te paga{" "}
                <strong className="text-chroma-violet">{feeLabel.affiliate}</strong> de cada operação
                — sai da nossa parte, não do bolso de quem compra.
              </>
            ) : (
              <>
                <strong className="text-zinc-300">Faça login</strong> pra este link virar seu: você
                passa a receber {feeLabel.affiliate} de cada operação de quem entrar por ele.
              </>
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
        "hover:border-chroma-violet/40 hover:text-chroma-violet",
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
