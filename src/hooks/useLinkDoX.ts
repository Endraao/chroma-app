"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Link pro X no celular (09/10/2026).
 *
 * - Android FORA de carteira (navegador do X, Chrome): intent:// com o pacote
 *   do X abre o app direto; sem o app, abre o site. Mesma aba de propósito.
 * - DENTRO do navegador de uma carteira (MetaMask, Trust, Phantom): elas
 *   bloqueiam abrir outro app ("site bloqueado de abrir aplicativos
 *   externos") e o intent não faz nada; com https numa aba nova caía na Play
 *   Store. Ali o link abre o SITE do X na mesma aba.
 * - PC: como sempre, aba nova.
 */
export function useLinkDoX() {
  const [modo, setModo] = useState<"pc" | "android" | "carteira">("pc");
  useEffect(() => {
    const ua = navigator.userAgent;
    const w = window as unknown as { ethereum?: unknown; phantom?: unknown; solana?: unknown; trustwallet?: unknown };
    const celular = /Android|iPhone|iPad|iPod/i.test(ua);
    if (celular && (w.ethereum || w.phantom || w.solana || w.trustwallet)) setModo("carteira");
    else if (/Android/i.test(ua)) setModo("android");
  }, []);

  const href = useCallback(
    (url: string) =>
      modo === "android"
        ? `intent://${url.replace(/^https:\/\//, "")}#Intent;scheme=https;package=com.twitter.android;S.browser_fallback_url=${encodeURIComponent(url)};end`
        : url,
    [modo],
  );

  return { href, alvo: modo === "pc" ? "_blank" : undefined };
}
