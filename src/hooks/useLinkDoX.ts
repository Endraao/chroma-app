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
  const [naMetaMask, setNaMetaMask] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent;
    const w = window as unknown as { ethereum?: unknown; phantom?: unknown; solana?: unknown; trustwallet?: unknown };
    const celular = /Android|iPhone|iPad|iPod/i.test(ua);
    if (celular && (w.ethereum || w.phantom || w.solana || w.trustwallet)) setModo("carteira");
    // Só a MetaMask bloqueia de vez abrir o X (a Trust e a Phantom também se
    // dizem "isMetaMask" pra compatibilidade, então elas são excluídas).
    const e = w.ethereum as { isMetaMask?: boolean; isTrust?: boolean; isTrustWallet?: boolean; isPhantom?: boolean } | undefined;
    setNaMetaMask(Boolean(celular && e?.isMetaMask && !e.isTrust && !e.isTrustWallet && !e.isPhantom && !w.phantom && !w.trustwallet));
    else if (/Android/i.test(ua)) setModo("android");
  }, []);

  const href = useCallback(
    (url: string) =>
      modo === "android"
        ? `intent://${url.replace(/^https:\/\//, "")}#Intent;scheme=https;package=com.twitter.android;S.browser_fallback_url=${encodeURIComponent(url)};end`
        : url,
    [modo],
  );

  /** Dentro da MetaMask o X não abre de jeito nenhum (o site do X manda pro
   *  app e a MetaMask bloqueia → Play Store). Nas outras carteiras, tenta. */
  return { href, alvo: modo === "pc" ? "_blank" : undefined, naCarteira: naMetaMask };
}
