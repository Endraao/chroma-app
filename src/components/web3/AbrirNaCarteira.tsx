"use client";

import { useEffect, useState } from "react";

import { refGuardado } from "@/hooks/useAffiliateTracking";

/**
 * "Abrir na MetaMask / Phantom" no celular sem carteira.
 *
 * ---------------------------------------------------------------------------
 * POR QUE EXISTE
 * ---------------------------------------------------------------------------
 * Link de indicação divulgado em grupo é aberto no navegador de dentro do
 * Telegram, do X ou do WhatsApp — que não tem carteira. A pessoa então copia
 * o site pro navegador da MetaMask e, quase sempre, copia sem o \`?ref=\`: a
 * indicação se perde e o promotor não recebe (28/09/2026).
 *
 * Estes botões abrem a MESMA página dentro do app da carteira, com o \`?ref=\`
 * garantido (o da URL ou o que ficou guardado nesta visita).
 */
export function AbrirNaCarteira() {
  const [alvo, setAlvo] = useState<string | null>(null);

  useEffect(() => {
    const celular = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const w = window as unknown as { ethereum?: unknown; phantom?: unknown; solana?: unknown };
    const temCarteira = Boolean(w.ethereum || w.phantom || w.solana);
    if (!celular || temCarteira) return;

    const url = new URL(window.location.href);
    const ref = url.searchParams.get("ref") ?? refGuardado();
    if (ref) url.searchParams.set("ref", ref);
    setAlvo(url.toString());
  }, []);

  if (!alvo) return null;

  const semProtocolo = alvo.replace(/^https?:\/\//, "");
  const origem = new URL(alvo).origin;

  return (
    <div className="rounded-lg border border-marca/25 bg-marca/[0.06] p-3">
      <p className="text-[12px] leading-snug text-zinc-300">
        Este navegador não tem carteira. Abra a Chroma direto no app da sua carteira:
      </p>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <a
          href={`https://metamask.app.link/dapp/${semProtocolo}`}
          className="rounded-md border border-ink-600 bg-ink-800 py-2 text-center text-[12px] font-bold text-zinc-100"
        >
          MetaMask
        </a>
        <a
          href={`https://phantom.app/ul/browse/${encodeURIComponent(alvo)}?ref=${encodeURIComponent(origem)}`}
          className="rounded-md border border-ink-600 bg-ink-800 py-2 text-center text-[12px] font-bold text-zinc-100"
        >
          Phantom
        </a>
      </div>
    </div>
  );
}
