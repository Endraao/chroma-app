"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Link pro X que abre o APP do X no Android (09/10/2026).
 *
 * Dentro do navegador de uma carteira (MetaMask, Phantom…), um link
 * https://x.com/… não é entregue ao app do X: cai na Play Store. Com
 * intent:// + o pacote do X, o Android abre o app direto; sem o app
 * instalado, abre o site do X. Mesma aba de propósito: com target=_blank
 * esses navegadores não passam o link pro app. Fora do Android, nada muda.
 */
export function useLinkDoX() {
  const [android, setAndroid] = useState(false);
  useEffect(() => setAndroid(/Android/i.test(navigator.userAgent)), []);

  const href = useCallback(
    (url: string) =>
      android
        ? `intent://${url.replace(/^https:\/\//, "")}#Intent;scheme=https;package=com.twitter.android;S.browser_fallback_url=${encodeURIComponent(url)};end`
        : url,
    [android],
  );

  return { href, alvo: android ? undefined : "_blank" };
}
