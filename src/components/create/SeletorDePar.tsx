"use client";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";

import { useEffect, useMemo, useRef, useState } from "react";

import { pairLogo, type LiquidityPair } from "@/lib/pairs";
import { cn } from "@/lib/utils";
import type { ChainId } from "@/lib/types";

/**
 * Escolha do par de liquidez, em lista suspensa com busca.
 *
 * ---------------------------------------------------------------------------
 * POR QUE DEIXOU DE SER UMA PILHA DE BOTÕES
 * ---------------------------------------------------------------------------
 * Com três opções, empilhar cartões era o formato certo: tudo à vista, sem
 * clique. Com setenta — que é o número de ativos tokenizados da Robinhood —
 * a mesma pilha vira uma página de rolagem antes do formulário, e o campo
 * seguinte some da tela.
 *
 * A busca não é enfeite. Ninguém percorre setenta linhas atrás de "TSLA":
 * digita. Ela casa com o símbolo E com o nome, porque as duas coisas são como
 * as pessoas chamam a mesma ação — quem procura "Tesla" e quem procura "TSLA"
 * têm que achar.
 */
const TEXTOS = traducoes({
  en: { buscar: "Search by symbol or name…", nenhum: "No asset with that name.", dicas: { ETH: "Robinhood Chain gas token. The most liquid pair on the network.", SOL: "Default. Deepest liquidity and what every buyer already holds.", USDC: "Priced in dollars. Your token's value does not swing with SOL." } as Record<string, string> },
  pt: { buscar: "Buscar por símbolo ou nome…", nenhum: "Nenhum ativo com esse nome.", dicas: {} as Record<string, string> },
  zh: { buscar: "按代号或名称搜索…", nenhum: "没有该名称的资产。", dicas: { ETH: "Robinhood Chain 的 Gas 代币，网络上流动性最高的交易对。", SOL: "默认选项，流动性最深，每个买家都持有。", USDC: "以美元计价，代币价值不随 SOL 波动。" } as Record<string, string> },
});

export function SeletorDePar({
  chain,
  pares,
  valor,
  onChange,
}: {
  chain: ChainId;
  pares: LiquidityPair[];
  valor: string;
  onChange: (simbolo: string) => void;
}) {
  const t = useTextos(TEXTOS);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const caixa = useRef<HTMLDivElement>(null);

  const escolhido = pares.find((p) => p.symbol === valor) ?? pares[0];

  /* Fecha ao clicar fora ou apertar Esc, como qualquer lista suspensa. */
  useEffect(() => {
    if (!aberto) return;

    const noClique = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const naTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };

    window.addEventListener("mousedown", noClique);
    window.addEventListener("keydown", naTecla);
    return () => {
      window.removeEventListener("mousedown", noClique);
      window.removeEventListener("keydown", naTecla);
    };
  }, [aberto]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return pares;
    return pares.filter(
      (p) =>
        p.symbol.toLowerCase().includes(termo) || p.name.toLowerCase().includes(termo),
    );
  }, [pares, busca]);

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => {
          setAberto((v) => !v);
          setBusca("");
        }}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
          aberto
            ? "border-marca/50 bg-marca/[0.06]"
            : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14]",
        )}
      >
        <Logo chain={chain} simbolo={escolhido?.symbol ?? ""} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold text-zinc-100">
            {escolhido?.symbol ?? "—"}
          </span>
          <span className="block truncate text-[11px] text-zinc-600">{escolhido?.name}</span>
        </span>
        <Seta aberto={aberto} />
      </button>

      {aberto && (
        <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-ink-600 bg-ink-900 shadow-2xl shadow-black/60">
          {/*
            O campo de busca só aparece quando há o bastante pra procurar.
            Numa lista de três, ele seria mais um passo entre a pessoa e a
            escolha que já estava visível.
          */}
          {pares.length > 6 && (
            <div className="border-b border-white/[0.06] p-2">
              <input
                autoFocus
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={t.buscar}
                className="w-full rounded-lg border border-white/[0.06] bg-ink-950 px-2.5 py-1.5 text-[12px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-marca/40"
              />
            </div>
          )}

          <div className="max-h-[280px] overflow-y-auto py-1">
            {filtrados.length === 0 ? (
              <p className="px-3 py-6 text-center text-[12px] text-zinc-600">
                {t.nenhum}
              </p>
            ) : (
              filtrados.map((p) => (
                <button
                  key={p.symbol}
                  type="button"
                  onClick={() => {
                    onChange(p.symbol);
                    setAberto(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors",
                    p.symbol === valor ? "bg-marca/10" : "hover:bg-white/[0.04]",
                  )}
                >
                  <Logo chain={chain} simbolo={p.symbol} pequeno />
                  <span
                    className={cn(
                      "text-[12.5px] font-bold",
                      p.symbol === valor ? "text-marca" : "text-zinc-200",
                    )}
                  >
                    {p.symbol}
                  </span>
                  <span className="ml-auto truncate pl-2 text-right text-[11px] text-zinc-600">
                    {p.name}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {escolhido?.hint && (
        <p className="mt-1.5 text-[11px] leading-snug text-zinc-600">{t.dicas[escolhido.symbol] ?? escolhido.hint}</p>
      )}
    </div>
  );
}

/**
 * Logo do ativo, com as iniciais como reserva.
 *
 * Setenta logos é gente demais pra garantir que todas existam sempre: uma que
 * falte não pode deixar buraco na linha.
 */
function Logo({
  chain,
  simbolo,
  pequeno,
}: {
  chain: ChainId;
  simbolo: string;
  pequeno?: boolean;
}) {
  const [quebrou, setQuebrou] = useState(false);
  const src = pairLogo(chain, simbolo);
  const tamanho = pequeno ? "size-5" : "size-8";

  if (!src || quebrou) {
    return (
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-full bg-ink-800 text-[9px] font-black text-zinc-500",
          tamanho,
        )}
      >
        {simbolo.slice(0, 2)}
      </span>
    );
  }

  return (

    <img
      src={src}
      alt=""
      onError={() => setQuebrou(true)}
      className={cn("shrink-0 rounded-full bg-ink-800 object-cover", tamanho)}
    />
  );
}

function Seta({ aberto }: { aberto: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn(
        "size-4 shrink-0 text-zinc-500 transition-transform",
        aberto && "rotate-180",
      )}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
