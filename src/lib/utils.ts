import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 0.0000123 -> "0.0₄123" (estilo Dexscreener para preços de meme coin) */
export function formatPrice(value: number, maxSig = 4): string {
  if (!Number.isFinite(value) || value === 0) return "0";
  if (value >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  const exp = Math.floor(Math.log10(value));
  const zeros = Math.abs(exp) - 1;
  if (zeros >= 4) {
    const digits = value.toFixed(zeros + maxSig).slice(2 + zeros);
    const sub = String(zeros)
      .split("")
      .map((d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)])
      .join("");
    return `0.0${sub}${digits}`;
  }
  return value.toFixed(Math.min(8, zeros + maxSig));
}

export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

export function formatPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function shortenAddress(address: string, chars = 4): string {
  if (!address) return "";
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

export function timeAgo(timestamp: number): string {
  const diff = Math.max(0, Date.now() - timestamp);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Heurística simples: endereço base58 (Solana) x hex 0x (EVM). */
export function detectChainFromAddress(address: string): "solana" | "evm" | "unknown" {
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) return "evm";
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return "solana";
  return "unknown";
}

/**
 * Converte "1.25" em unidades brutas (ex.: lamports) sem passar por float.
 *
 * `Number("0.1") * 1e9` dá 100000000.00000001 — em dinheiro isso vira bug.
 * Trabalhar com a string e BigInt evita o problema inteiro.
 */
export function parseUnits(value: string, decimals: number): bigint {
  const clean = value.trim();
  if (!clean || !/^\d*\.?\d*$/.test(clean)) return 0n;

  const [whole = "0", fraction = ""] = clean.split(".");
  const padded = (fraction + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

/** Caminho inverso: unidades brutas para número legível. */
export function formatUnits(value: bigint, decimals: number): number {
  const divisor = 10 ** decimals;
  return Number(value) / divisor;
}

/**
 * A mesma arte, no tamanho em que ela aparece.
 *
 * A Dexscreener serve 800×800 por padrão (~65 KB) e a vitrine mostra mais de
 * cem cartões: eram megabytes de imagem pra quadradinhos de 200 px, e parte
 * das artes "não carregava" porque ainda estava chegando (28/09/2026). A
 * CoinGecko tem versões menores no próprio caminho. Outras origens passam
 * como vieram.
 */
export function miniatura(url: string | undefined, px: number): string | undefined {
  if (!url) return url;
  // IPFS: troca por um portão que serve a imagem direto (ver urlsDaImagem).
  if (/ipfs/i.test(url)) url = urlsDaImagem(url)[0];
  /* Arte lida do contrato (IPFS): passa pelo otimizador, que só aceita esta rota. */
  // Direto, sem o otimizador do Next: quando não há arte, a rota devolve um
  // SVG de iniciais, e o otimizador recusa SVG — a imagem aparecia quebrada.
  if (url.startsWith("/api/logo/")) return url;
  try {
    const u = new URL(url);
    if (u.hostname === "cdn.dexscreener.com") {
      u.searchParams.set("width", String(px * 2));
      u.searchParams.set("height", String(px * 2));
      u.searchParams.set("quality", "85");
      return u.toString();
    }
    if (u.hostname === "coin-images.coingecko.com" && px <= 48) {
      return url.replace("/large/", "/small/");
    }
    return url;
  } catch {
    return url;
  }
}

const PORTOES_IPFS = ["https://ipfs.io/ipfs/", "https://dweb.link/ipfs/", "https://gateway.pinata.cloud/ipfs/"];

/**
 * Endereços para tentar, em ordem, pra uma imagem de moeda.
 *
 * Link de IPFS vem em vários formatos (`ipfs://CID`, `https://CID.ipfs.algo`,
 * `https://algo/ipfs/CID`) e alguns portões — como o `inbrowser.link` — só
 * funcionam abrindo a página no navegador, nunca numa tag de imagem. Aqui o
 * CID é extraído e servido por portões que entregam a imagem direto.
 */
export function urlsDaImagem(url: string | undefined): string[] {
  if (!url) return [];
  const cid =
    /^ipfs:\/\/(?:ipfs\/)?(.+)$/i.exec(url)?.[1] ??
    /^https?:\/\/([a-z0-9]{46,})\.ipfs\.[^/]+(\/.*)?$/i.exec(url)?.slice(1, 3).join("").replace(/undefined$/, "") ??
    /^https?:\/\/[^/]+\/ipfs\/(.+)$/i.exec(url)?.[1];
  if (!cid) return [url];
  // Primeiro pelo nosso servidor (vários portões ao mesmo tempo + CDN); os
  // portões diretos ficam de reserva.
  return [`/api/imagem?cid=${cid.replace(/\/$/, "")}`, ...PORTOES_IPFS.map((p) => p + cid)];
}
