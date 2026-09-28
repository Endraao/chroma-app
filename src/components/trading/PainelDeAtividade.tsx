"use client";

import { useEffect, useState } from "react";

import { TabelaDeTraders } from "@/components/trading/TabelaDeTraders";
import { usePrecoNativo } from "@/hooks/usePrecoNativo";
import { CHAINS } from "@/lib/web3";
import { cn, formatPrice, formatUsd, shortenAddress, timeAgo } from "@/lib/utils";
import type { ChainId } from "@/lib/types";

interface Negocio {
  carteira: string;
  lado: "compra" | "venda";
  tokens: number;
  usd: number;
  em: number;
  txHash: string;
}

const RECARREGA_MS = 10_000;

/**
 * Abas embaixo do gráfico: os negócios ao vivo e quem está na moeda.
 *
 * Formato pedido pelo dono em 28/09/2026 (referência: página de moeda da
 * PEAR). A aba de transações é a que prova que a moeda está VIVA — quem
 * chega vê gente comprando e vendendo agora, não só um número de volume.
 */
export function PainelDeAtividade({
  address,
  symbol,
  chain,
}: {
  address: string;
  symbol: string;
  chain: ChainId;
}) {
  const [aba, setAba] = useState<"negocios" | "holders">("negocios");
  const [negocios, setNegocios] = useState<Negocio[] | null>(null);
  const [total, setTotal] = useState(0);
  const precoNativo = usePrecoNativo(chain);
  const meta = CHAINS[chain];

  useEffect(() => {
    let cancelado = false;
    const ler = async () => {
      try {
        const r = await fetch(`/api/negocios?address=${address}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { negocios: Negocio[]; total: number };
        if (!cancelado) {
          setNegocios(j.negocios);
          setTotal(j.total);
        }
      } catch {
        /* rede oscilou: fica a última lista */
      }
    };
    void ler();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void ler();
    }, RECARREGA_MS);
    return () => {
      cancelado = true;
      window.clearInterval(id);
    };
  }, [address]);

  const linkDaTx = (hash: string) => `${meta.explorer.replace(/\/token\/$/, "/tx/")}${hash}`;

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900">
      {/* Abas */}
      <div className="flex items-center gap-1 border-b border-ink-700 px-3">
        <Aba ativa={aba === "negocios"} onClick={() => setAba("negocios")}>
          Transações {total > 0 && <Contador>{total}</Contador>}
        </Aba>
        <Aba ativa={aba === "holders"} onClick={() => setAba("holders")}>
          Traders
        </Aba>
        {aba === "negocios" && (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-zinc-500">
            <span className="size-1.5 animate-pulse rounded-full bg-bull" /> ao vivo
          </span>
        )}
      </div>

      {aba === "holders" ? (
        <div className="p-1">
          <TabelaDeTraders address={address} symbol={symbol} chain={chain} />
        </div>
      ) : negocios === null ? (
        <p className="px-4 py-10 text-center text-[13px] text-zinc-600">Carregando…</p>
      ) : negocios.length === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] text-zinc-600">
          Nenhum negócio ainda. O primeiro pode ser o seu.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="tnum w-full min-w-[720px] text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-600">
                <th className="px-4 py-2.5 font-semibold">Quando</th>
                <th className="px-2 py-2.5 font-semibold">Lado</th>
                <th className="px-2 py-2.5 font-semibold">Trader</th>
                <th className="px-2 py-2.5 text-right font-semibold">{meta.nativeSymbol}</th>
                <th className="px-2 py-2.5 text-right font-semibold">USD</th>
                <th className="px-2 py-2.5 text-right font-semibold">{symbol}</th>
                <th className="px-2 py-2.5 text-right font-semibold">Preço</th>
                <th className="px-4 py-2.5 text-right font-semibold">TX</th>
              </tr>
            </thead>
            <tbody>
              {negocios.map((n) => {
                const compra = n.lado === "compra";
                return (
                  <tr key={n.txHash + n.lado + n.tokens} className="border-t border-ink-700/60">
                    <td className="whitespace-nowrap px-4 py-2.5 text-zinc-500">{timeAgo(n.em)}</td>
                    <td className="px-2 py-2.5">
                      <span
                        className={cn(
                          "rounded border px-1.5 py-0.5 text-[11px] font-semibold",
                          compra ? "border-bull/40 text-bull" : "border-bear/40 text-bear",
                        )}
                      >
                        {compra ? "Compra" : "Venda"}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 font-mono text-zinc-300">{shortenAddress(n.carteira, 4)}</td>
                    <td className="px-2 py-2.5 text-right text-zinc-200">
                      {precoNativo ? (n.usd / precoNativo).toFixed(5) : "—"}
                    </td>
                    <td className="px-2 py-2.5 text-right text-zinc-200">{formatUsd(n.usd)}</td>
                    <td className="px-2 py-2.5 text-right text-zinc-300">{compacto(n.tokens)}</td>
                    <td className="px-2 py-2.5 text-right text-zinc-400">
                      ${formatPrice(n.tokens > 0 ? n.usd / n.tokens : 0)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <a
                        href={linkDaTx(n.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-marca hover:underline"
                      >
                        {n.txHash.slice(0, 8)}… ↗
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function compacto(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(2);
}

function Aba({
  ativa,
  onClick,
  children,
}: {
  ativa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-3 text-[13px] font-semibold transition-colors",
        ativa ? "border-marca text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-200",
      )}
    >
      {children}
    </button>
  );
}

function Contador({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-ink-600 px-1.5 text-[10px] font-bold text-zinc-400">
      {children}
    </span>
  );
}
