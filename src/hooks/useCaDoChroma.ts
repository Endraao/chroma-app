"use client";

import { useEffect, useState } from "react";

import { CA_DO_CHROMA } from "@/lib/token-oficial";

/**
 * O token OFICIAL da Chroma (endereço e símbolo), lido do servidor —
 * trocável sem recompilar (POST /api/token-oficial). 18/10/2026: o símbolo
 * deixou de ser "$CHROMA" fixo no código; vale o que estiver registrado.
 */
export function useTokenOficial(): { ca: string; simbolo: string } {
  const [oficial, setOficial] = useState({ ca: CA_DO_CHROMA, simbolo: "" });
  useEffect(() => {
    fetch("/api/token-oficial", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => typeof j?.ca === "string" && setOficial({ ca: j.ca, simbolo: typeof j.simbolo === "string" ? j.simbolo : "" }))
      .catch(() => {});
  }, []);
  return oficial;
}

/** Só o endereço (quem não precisa do símbolo). */
export function useCaDoChroma(): string {
  return useTokenOficial().ca;
}
