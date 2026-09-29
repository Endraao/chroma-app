"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";

const TEXTOS = traducoes({
  en: { placeholder: "Search coin, symbol or address…" },
  pt: { placeholder: "Buscar moeda, símbolo ou endereço…" },
  zh: { placeholder: "搜索代币、代号或地址…" },
});

/**
 * Busca do cabeçalho. Endereço vai direto pra página da moeda; nome ou
 * símbolo abre a vitrine filtrada, nas duas redes.
 */
export function BuscaDeMoedas({ movel = false }: { movel?: boolean }) {
  const t = useTextos(TEXTOS);
  const router = useRouter();
  const [texto, setTexto] = useState("");

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    const q = texto.trim();
    if (!q) return;
    const ehEndereco = /^0x[0-9a-fA-F]{40}$/.test(q) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q);
    router.push(ehEndereco ? `/token/${q}` : `/?chain=todas&q=${encodeURIComponent(q)}#mercado`);
  }

  return (
    <form
      onSubmit={buscar}
      className={movel ? "relative w-full" : "relative hidden min-w-0 flex-1 lg:block lg:max-w-[340px]"}
    >
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={t.placeholder}
        spellCheck={false}
        className="h-9 w-full rounded-lg border border-ink-600 bg-ink-800 pl-9 pr-3 text-[13px] text-zinc-100 placeholder:text-zinc-500 focus:border-marca/50 focus:outline-none"
      />
    </form>
  );
}
