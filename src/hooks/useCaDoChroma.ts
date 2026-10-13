"use client";

import { useEffect, useState } from "react";

import { CA_DO_CHROMA } from "@/lib/token-oficial";

/** O endereço oficial do $CHROMA, lido do servidor (trocável sem recompilar). */
export function useCaDoChroma(): string {
  const [ca, setCa] = useState(CA_DO_CHROMA);
  useEffect(() => {
    fetch("/api/token-oficial", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => typeof j?.ca === "string" && setCa(j.ca))
      .catch(() => {});
  }, []);
  return ca;
}
