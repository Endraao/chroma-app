"use client";

import { useMemo, useState } from "react";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";
import { PARES_DA_PUMP, type CategoriaDePar, type ParDaPumpInfo } from "@/lib/pares-pump";
import { ENDERECOS_DOS_PARES } from "@/lib/tabela-solana";
import { cn, miniatura } from "@/lib/utils";

const TEXTOS = traducoes({
  en: { busca: "Search name, ticker or address", todas: "All", cripto: "Crypto", acoes: "Stocks", memes: "Memes", vazio: "Nothing found." },
  pt: { busca: "Buscar nome, símbolo ou endereço", todas: "Todas", cripto: "Cripto", acoes: "Ações", memes: "Memes", vazio: "Nada encontrado." },
  zh: { busca: "搜索名称、代号或地址", todas: "全部", cripto: "加密", acoes: "股票", memes: "模因", vazio: "未找到。" },
});

const FILTROS: ("todas" | CategoriaDePar)[] = ["todas", "acoes", "cripto", "memes"];

// Só entram os pares que cabem em uma transação: os que estão na tabela de endereços.
const PARES_LIBERADOS = PARES_DA_PUMP.filter((p) => p.par === "SOL" || ENDERECOS_DOS_PARES.includes(p.par));

/** A escolha do par na Solana: busca, categorias e grade, com todos os pares aceitos. */
export function EscolhaDePar({ valor, onChange }: { valor: ParDaPumpInfo; onChange: (p: ParDaPumpInfo) => void }) {
  const t = useTextos(TEXTOS);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>("todas");

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return PARES_LIBERADOS.filter(
      (p) =>
        (filtro === "todas" || p.categoria === filtro) &&
        (!q || p.simbolo.toLowerCase().includes(q) || p.nome.toLowerCase().includes(q) || p.par.toLowerCase() === q),
    );
  }, [busca, filtro]);

  return (
    <div className="space-y-3">
      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder={t.busca}
        autoComplete="off"
        className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-[15px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-marca/50"
      />
      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={cn(
              "rounded-full border px-3 py-1 text-[13px] font-medium transition-colors",
              filtro === f ? "border-marca/50 bg-marca/10 text-marca" : "border-white/[0.08] text-zinc-400 hover:text-zinc-100",
            )}
          >
            {t[f]}
          </button>
        ))}
      </div>
      {lista.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-zinc-500">{t.vazio}</p>
      ) : (
        <div className="grid max-h-[300px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {lista.map((p) => (
            <button
              key={p.par}
              type="button"
              onClick={() => onChange(p)}
              className={cn(
                "flex min-w-0 items-center gap-3 rounded-xl border p-2.5 text-left transition-colors",
                valor.par === p.par ? "border-marca/60 bg-marca/10" : "border-white/[0.08] bg-black/30 hover:border-white/20",
              )}
            >
              <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-white/5 text-[12px] font-bold text-zinc-300">
                {p.imagem ? <img src={miniatura(p.imagem, 72)} alt="" loading="lazy" className="size-full object-cover" /> : p.simbolo.slice(0, 2)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-bold text-zinc-100">{p.simbolo}</span>
                <span className="block truncate text-[12.5px] text-zinc-400">{p.nome}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
