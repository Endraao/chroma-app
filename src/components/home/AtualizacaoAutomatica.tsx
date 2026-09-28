"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Atualiza a vitrine sozinha: moeda nova aparece sem a pessoa dar F5.
 *
 * `router.refresh()` pede ao servidor só os dados novos e troca na tela sem
 * recarregar a página nem perder a rolagem. Aba escondida não atualiza — não
 * faz sentido gastar consulta com quem não está olhando —, e ao voltar pra
 * aba atualiza na hora.
 */
export function AtualizacaoAutomatica({ segundos = 30 }: { segundos?: number }) {
  const router = useRouter();

  useEffect(() => {
    const atualizar = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(atualizar, segundos * 1000);
    document.addEventListener("visibilitychange", atualizar);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", atualizar);
    };
  }, [router, segundos]);

  return null;
}
