"use client";

 
import { useState } from "react";

import { cn } from "@/lib/utils";

export type WalletState = "detected" | "recent" | "not-installed";

export type WalletNetwork = "solana" | "evm";

export interface WalletOption {
  key: string;
  name: string;
  /** data URI do logo oficial; ausente cai no quadrado com a inicial */
  icon?: string;
  network: WalletNetwork;
  /**
   * Logo da rede, no canto do ícone. Só aparece em carteira que serve as DUAS
   * redes (MetaMask, Phantom): nelas o mesmo aplicativo aparece nos dois
   * grupos, e sem a marcação a pessoa não sabe qual das duas está escolhendo.
   */
  networkBadge?: string;
  state: WalletState;
  onSelect: () => void;
}

const BADGE: Record<WalletState, { text: string; className: string } | null> = {
  recent: { text: "recente", className: "bg-bull/10 text-bull ring-bull/25" },
  detected: { text: "detectada", className: "bg-bull/10 text-bull ring-bull/25" },
  "not-installed": { text: "instalar", className: "bg-white/5 text-zinc-500 ring-white/10" },
};

export function WalletRow({ option, subtitle }: { option: WalletOption; subtitle?: string }) {
  const badge = BADGE[option.state];
  const isInstalled = option.state !== "not-installed";

  return (
    <button
      onClick={option.onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-all",
        "hover:border-chroma-violet/30 hover:bg-chroma-violet/[0.07]",
        !isInstalled && "opacity-70 hover:opacity-100",
      )}
    >
      <WalletLogo name={option.name} icon={option.icon} badge={option.networkBadge} />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-zinc-100">{option.name}</span>
        {subtitle && <span className="block truncate text-[11px] text-zinc-600">{subtitle}</span>}
      </span>

      {badge && (
        <span
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset",
            badge.className,
          )}
        >
          {isInstalled && <span className="size-1.5 rounded-full bg-current" />}
          {badge.text}
        </span>
      )}
    </button>
  );
}

/**
 * Logo da carteira.
 *
 * Os data URIs vêm dos próprios adapters, então são os logos oficiais. Se
 * algum falhar ao carregar (data URI corrompido, formato exótico), cai num
 * quadrado com a inicial em vez de deixar um buraco na lista.
 */
export function WalletLogo({
  name,
  icon,
  badge,
  size = 32,
}: {
  name: string;
  icon?: string;
  badge?: string;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);

  const base =
    !icon || broken ? (
      <span
        style={{ width: size, height: size }}
        className="grid size-full place-items-center rounded-lg bg-ink-800 text-[12px] font-black text-zinc-500"
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
    ) : (
      <img
        src={icon}
        alt=""
        width={size}
        height={size}
        onError={() => setBroken(true)}
        className="rounded-lg bg-ink-900 object-contain"
        style={{ width: size, height: size }}
      />
    );

  if (!badge) return <span className="shrink-0">{base}</span>;

  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      {base}
      {/*
        Selo da rede sobreposto, não um logo alterado: os dois ícones são os
        oficiais, a composição é da interface.
      */}
      <img
        src={badge}
        alt=""
        width={14}
        height={14}
        className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-ink-950 object-contain ring-2 ring-ink-900"
      />
    </span>
  );
}
