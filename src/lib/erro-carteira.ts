/**
 * Erro da carteira vira aviso na tela (09/10/2026): no celular, dentro do app
 * de uma carteira, não há console pra ver — o botão parecia morto. O
 * RequireChainWallet escuta "chroma-erro-carteira" e mostra a mensagem.
 */
export function avisarErroDaCarteira(e: unknown) {
  console.error("[carteira]", e);
  const err = e as { message?: string; error?: { message?: string }; name?: string };
  const msg = err?.error?.message || err?.message || err?.name || String(e);
  window.dispatchEvent(new CustomEvent("chroma-erro-carteira", { detail: msg }));
}
