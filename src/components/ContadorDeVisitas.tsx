"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Avisa /api/visita a cada página aberta (15/10/2026). O id é sorteado e fica
 * no navegador; nada de IP, nome ou carteira.
 */
export function ContadorDeVisitas() {
  const pagina = usePathname();

  useEffect(() => {
    let id = "";
    try {
      id = localStorage.getItem("chroma.visitante") ?? "";
      if (!id) {
        id = Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem("chroma.visitante", id);
      }
    } catch {
      return;
    }
    let origem = "";
    try {
      const host = document.referrer ? new URL(document.referrer).hostname : "";
      if (host && host !== location.hostname) origem = host;
    } catch {}
    const corpo = JSON.stringify({ v: id, p: pagina, r: origem });
    if (!navigator.sendBeacon?.("/api/visita", new Blob([corpo], { type: "application/json" }))) {
      fetch("/api/visita", { method: "POST", body: corpo, keepalive: true }).catch(() => {});
    }
  }, [pagina]);

  return null;
}
