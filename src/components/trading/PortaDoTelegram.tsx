"use client";

import { useEffect } from "react";

/**
 * Reserva da porta do mini app (/p/tg): se o Telegram mandou o parâmetro só no
 * "#" do endereço (o servidor não enxerga), lê aqui e recarrega com ele.
 */
export function PortaDoTelegram() {
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const inicio = hash.get("tgWebAppStartParam");
    if (inicio) window.location.replace(`/p/tg?startapp=${encodeURIComponent(inicio)}`);
  }, []);
  return <p className="p-6 text-center text-zinc-400">Open a coin from the Chroma Buy Bot.</p>;
}
