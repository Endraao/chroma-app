"use client";

import Link from "next/link";
import { useState } from "react";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";
import { cn } from "@/lib/utils";

/**
 * O contrato OFICIAL do $CHROMA, fixo no site (pedido do dono, 02/10/2026).
 *
 * Pra quem quer negociar não precisar caçar o endereço no X — e pra ninguém
 * cair em cópia com o mesmo nome: o endereço completo fica à vista, com copiar
 * e o atalho direto pra página da moeda.
 */
export const CA_DO_CHROMA = "0x475ab8dd5b1a13a5d18b0b70a1599e3501b0941c";

const TEXTOS = traducoes({
  en: { oficial: "Official token", copiar: "Copy", copiado: "Copied!", negociar: "Trade" },
  pt: { oficial: "Token oficial", copiar: "Copiar", copiado: "Copiado!", negociar: "Negociar" },
  zh: { oficial: "官方代币", copiar: "复制", copiado: "已复制！", negociar: "交易" },
});

export function TokenOficial({ compacto = false, className }: { compacto?: boolean; className?: string }) {
  const t = useTextos(TEXTOS);
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(CA_DO_CHROMA);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* sem permissão de área de transferência: o endereço continua à vista */
    }
  };

  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg border border-marca/30 bg-marca/[0.06] px-3 py-2",
        className,
      )}
    >
      <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.12em] text-marca">
        {t.oficial} · $CHROMA
      </span>
      <button
        type="button"
        onClick={copiar}
        title={t.copiar}
        className="min-w-0 truncate font-mono text-[12px] text-zinc-200 hover:text-white"
      >
        {compacto ? `${CA_DO_CHROMA.slice(0, 8)}…${CA_DO_CHROMA.slice(-6)}` : CA_DO_CHROMA}
      </button>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={copiar}
          className="rounded-md border border-white/10 px-2 py-0.5 text-[11px] font-semibold text-zinc-300 transition-colors hover:border-marca/50 hover:text-white"
        >
          {copiado ? t.copiado : t.copiar}
        </button>
        <Link
          href={`/token/${CA_DO_CHROMA}`}
          className="rounded-md bg-marca px-2.5 py-0.5 text-[11px] font-bold text-[#08090b] transition-colors hover:bg-marca-forte"
        >
          {t.negociar} →
        </Link>
      </div>
    </div>
  );
}
