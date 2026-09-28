import Link from "next/link";

import { Sparkline } from "@/components/ui/Sparkline";
import { CHAINS } from "@/lib/web3";
import { cn, formatPct, formatPrice, formatUsd, timeAgo, miniatura } from "@/lib/utils";
import type { TokenSummary } from "@/lib/types";

/**
 * Card da vitrine, no formato de ficha (pedido do dono em 28/09/2026, com a
 * PEAR como referência).
 *
 * Antes a arte ocupava o card inteiro em quadrado. Funcionava com arte boa;
 * com metade das moedas novas SEM arte, a vitrine virava uma parede de
 * quadrados cinza com duas letras. Na ficha, a arte é um avatar pequeno e o
 * que manda são os números — que toda moeda tem.
 */
export function TokenCard({ token }: { token: TokenSummary }) {
  const up = token.change24h >= 0;
  const meta = CHAINS[token.chain];
  const naCurva = token.bondingProgress !== null;
  const progresso = Math.max(0, Math.min(100, token.bondingProgress ?? 0));

  return (
    <Link
      href={`/token/${token.address}`}
      className={cn(
        "group flex flex-col rounded-xl border bg-ink-900 p-4 transition-colors",
        naCurva ? "border-marca/25 hover:border-marca/60" : "border-ink-700 hover:border-marca/40",
      )}
    >
      {/* Identidade */}
      <div className="flex items-start gap-3">
        <div className="size-12 shrink-0 overflow-hidden rounded-lg border border-ink-700 bg-ink-800">
          {token.imageUrl ? (
            <img
              src={miniatura(token.imageUrl, 48)}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
          ) : (
            <div className="grid size-full place-items-center text-[15px] font-bold text-zinc-600">
              {token.symbol.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold leading-tight text-zinc-50 group-hover:text-white">
            ${token.symbol}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-zinc-500">{token.name}</p>
        </div>

        <span
          className={cn(
            "shrink-0 rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            naCurva ? "border-marca/40 text-marca" : "border-ink-600 text-zinc-500",
          )}
        >
          {naCurva ? "Curva" : meta.label}
        </span>
      </div>

      {/* Mini-gráfico e variação */}
      <div className="mt-3 flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2">
        <div className="h-7 min-w-0 flex-1">
          <Sparkline changes={token.priceChanges} up={up} />
        </div>
        <span className={cn("tnum shrink-0 text-[12px] font-bold", up ? "text-bull" : "text-bear")}>
          {formatPct(token.change24h)}
        </span>
      </div>

      {/* Números */}
      <div className="tnum mt-3 grid grid-cols-3 gap-2">
        <Numero rotulo="Preço" valor={`$${formatPrice(token.priceUsd)}`} />
        <Numero rotulo="Mcap" valor={formatUsd(token.marketCapUsd)} />
        {token.holders > 0 ? (
          <Numero rotulo="Holders" valor={token.holders.toLocaleString("pt-BR")} />
        ) : (
          <Numero rotulo="Liquidez" valor={formatUsd(token.liquidityUsd)} />
        )}
      </div>

      {/* Rodapé: progresso da curva, ou idade da moeda */}
      <div className="mt-auto pt-3">
        {naCurva ? (
          <>
            <div className="mb-1 flex justify-between text-[10px] text-zinc-600">
              <span className="uppercase tracking-wider">Curva</span>
              <span className="tnum">{progresso.toFixed(progresso < 10 ? 1 : 0)}%</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-ink-700">
              <div className="h-full rounded-full bg-marca" style={{ width: `${Math.max(1.5, progresso)}%` }} />
            </div>
          </>
        ) : (
          <p className="tnum text-[10px] uppercase tracking-wider text-zinc-600">
            {meta.label} · {timeAgo(token.createdAt)}
          </p>
        )}
      </div>
    </Link>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9.5px] font-semibold uppercase tracking-wider text-zinc-600">{rotulo}</p>
      <p className="mt-0.5 truncate text-[13px] font-bold text-zinc-100">{valor}</p>
    </div>
  );
}
