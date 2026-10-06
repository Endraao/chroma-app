"use client";

import { useEffect, useState } from "react";

/**
 * De qual conta é esta carteira (apelido), ou null se de nenhuma.
 *
 * Serve pra tela não oferecer "Vincular" numa carteira que já pertence a OUTRA
 * conta (pedido do dono, 05/10/2026): o servidor recusaria de qualquer jeito,
 * mas o botão dava a entender que dava.
 */
const cache = new Map<string, string | null>();

export function useDonoDaCarteira(endereco: string | null): string | null {
  const chave = endereco?.toLowerCase() ?? null;
  const [dono, setDono] = useState<string | null>(chave ? (cache.get(chave) ?? null) : null);

  useEffect(() => {
    if (!chave) {
      setDono(null);
      return;
    }
    if (cache.has(chave)) {
      setDono(cache.get(chave) ?? null);
      return;
    }
    let cancelado = false;
    fetch(`/api/account?wallet=${encodeURIComponent(endereco!)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((conta: { nickname?: string } | null) => {
        const apelido = conta?.nickname ?? null;
        cache.set(chave, apelido);
        if (!cancelado) setDono(apelido);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [chave, endereco]);

  return dono;
}
