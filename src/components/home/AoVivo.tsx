"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

import type { TokenSummary } from "@/lib/types";

/**
 * PREÇOS AO VIVO NA VITRINE (pedido do dono, 06/10/2026: "quero ver os
 * números mudando a todo segundo, igual na fomo").
 *
 * O servidor monta a vitrine a cada 30 s. Por cima disso, o NAVEGADOR de quem
 * está olhando pergunta direto à DexScreener — grátis, 30 moedas por pedido —
 * o preço das moedas visíveis a cada 2 s, e os cards mostram o número novo.
 * Nada é inventado: é o dado real chegando mais rápido.
 */
export interface DadoVivo {
  priceUsd: number;
  marketCapUsd: number;
  change24h: number;
  m5: number;
  volume24hUsd: number;
  /** o par de maior liquidez (usado pelo feed de negócios) */
  pairAddress?: string;
  liquidityUsd: number;
  /** últimos preços vistos nesta visita (mini-gráfico ao vivo) */
  historico: number[];
}

const Contexto = createContext<Map<string, DadoVivo>>(new Map());
const INTERVALO_MS = 1_000;
const HISTORICO_MAX = 40;
/** Valor de mercado acima disso × liquidez é dado quebrado (par fantasma). */
export const MC_POR_LIQUIDEZ_MAX = 400;
const POR_PEDIDO = 30;

interface ParDex {
  chainId: string;
  pairAddress?: string;
  baseToken: { address: string };
  priceUsd?: string;
  marketCap?: number;
  fdv?: number;
  liquidity?: { usd?: number };
  priceChange?: { m5?: number; h24?: number };
  volume?: { h24?: number };
}

async function buscar(rede: string, enderecos: string[], sinal: AbortSignal): Promise<ParDex[]> {
  const r = await fetch(`https://api.dexscreener.com/tokens/v1/${rede}/${enderecos.join(",")}`, { signal: sinal, cache: "no-store" });
  if (!r.ok) return [];
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

export function AoVivoProvider({ tokens, children }: { tokens: TokenSummary[]; children: React.ReactNode }) {
  const [dados, setDados] = useState<Map<string, DadoVivo>>(new Map());
  const chave = tokens.map((t) => `${t.chain}:${t.address}`).join("|");
  const lista = useRef(tokens);
  lista.current = tokens;

  useEffect(() => {
    let vivo = true;
    let vez = 0;
    const controle = new AbortController();
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      // Revezamento: cada tick busca um lote de 30 por rede, girando pela lista.
      const porRede = new Map<string, string[]>();
      for (const t of lista.current) {
        const rede = t.chain === "robinhood" ? "robinhood" : "solana";
        porRede.set(rede, [...(porRede.get(rede) ?? []), t.address]);
      }
      const pedidos: Promise<ParDex[]>[] = [];
      for (const [rede, ends] of porRede) {
        // O primeiro lote (as "Em alta", que vêm primeiro) a cada 2 s; os demais revezam no meio.
        const lotes = Math.max(1, Math.ceil(ends.length / POR_PEDIDO));
        const i = lotes === 1 || vez % 2 === 0 ? 0 : 1 + (Math.floor(vez / 2) % (lotes - 1));
        pedidos.push(buscar(rede, ends.slice(i * POR_PEDIDO, (i + 1) * POR_PEDIDO), controle.signal).catch(() => []));
      }
      vez++;
      const pares = (await Promise.all(pedidos)).flat();
      if (!vivo || !pares.length) return;
      // Por moeda, o par com mais liquidez.
      const melhor = new Map<string, ParDex>();
      for (const p of pares) {
        const k = p.baseToken.address.toLowerCase();
        const atual = melhor.get(k);
        if (!atual || (p.liquidity?.usd ?? 0) > (atual.liquidity?.usd ?? 0)) melhor.set(k, p);
      }
      setDados((antes) => {
        const novo = new Map(antes);
        for (const [k, p] of melhor) {
          const preco = Number(p.priceUsd) || 0;
          const mc = Number(p.marketCap ?? p.fdv) || 0;
          if (!preco || !mc) continue;
          const liq = Number(p.liquidity?.usd) || 0;
          if (liq > 0 && mc > liq * MC_POR_LIQUIDEZ_MAX) continue;
          const hist = antes.get(k)?.historico ?? [];
          const historico = hist[hist.length - 1] === preco ? hist : [...hist, preco].slice(-HISTORICO_MAX);
          novo.set(k, {
            liquidityUsd: liq,
            historico,
            priceUsd: preco,
            marketCapUsd: mc,
            change24h: Number(p.priceChange?.h24) || 0,
            m5: Number(p.priceChange?.m5) || 0,
            volume24hUsd: Number(p.volume?.h24) || 0,
            pairAddress: p.pairAddress,
          });
        }
        return novo;
      });
    };
    tick();
    const id = window.setInterval(tick, INTERVALO_MS);
    return () => {
      vivo = false;
      controle.abort();
      window.clearInterval(id);
    };
  }, [chave]);

  return <Contexto.Provider value={dados}>{children}</Contexto.Provider>;
}

/** O token com os números ao vivo por cima (quando já chegaram). */
export function useTokenVivo(token: TokenSummary): TokenSummary {
  const vivo = useContext(Contexto).get(token.address.toLowerCase());
  if (!vivo) return token;
  // Dado absurdo da fonte (moeda recém-criada com par esquisito): ignora.
  if (token.marketCapUsd > 0 && (vivo.marketCapUsd > token.marketCapUsd * 50 || vivo.marketCapUsd < token.marketCapUsd / 20)) return token;
  const desdeOLancamento = token.mcapInicialUsd ? (vivo.marketCapUsd / token.mcapInicialUsd - 1) * 100 : null;
  return {
    ...token,
    priceUsd: vivo.priceUsd,
    marketCapUsd: vivo.marketCapUsd,
    change24h: desdeOLancamento ?? (vivo.change24h || token.change24h),
    volume24hUsd: vivo.volume24hUsd || token.volume24hUsd,
    priceChanges: { ...(token.priceChanges ?? {}), m5: vivo.m5, h24: vivo.change24h || token.change24h },
  };
}

/**
 * Número que ROLA até o valor novo (~0,7 s) e acende verde/vermelho quando
 * muda — o efeito de "placar" da fomo.
 */
export function NumeroVivo({ valor, formatar, className = "" }: { valor: number; formatar: (n: number) => string; className?: string }) {
  const [mostrado, setMostrado] = useState(valor);
  const [cor, setCor] = useState<"" | "sobe" | "desce">("");
  const de = useRef(valor);

  useEffect(() => {
    const inicio = de.current;
    if (inicio === valor) return;
    setCor(valor > inicio ? "sobe" : "desce");
    const t0 = performance.now();
    let quadro = 0;
    const passo = (agora: number) => {
      const k = Math.min(1, (agora - t0) / 700);
      const suave = 1 - Math.pow(1 - k, 3);
      const v = inicio + (valor - inicio) * suave;
      setMostrado(v);
      if (k < 1) quadro = requestAnimationFrame(passo);
      else de.current = valor;
    };
    quadro = requestAnimationFrame(passo);
    const apaga = window.setTimeout(() => setCor(""), 1100);
    return () => {
      cancelAnimationFrame(quadro);
      window.clearTimeout(apaga);
      de.current = valor;
    };
  }, [valor]);

  return (
    <span className={`${className} transition-colors duration-300 ${cor === "sobe" ? "!text-bull" : cor === "desce" ? "!text-bear" : ""}`}>
      {formatar(mostrado)}
    </span>
  );
}

/** Todos os dados ao vivo (o feed de negócios usa os pares). */
export function useDadosVivos(): Map<string, DadoVivo> {
  return useContext(Contexto);
}

/**
 * Os preços vistos ao vivo, em proporção ao preço do servidor — pro
 * mini-gráfico continuar andando a cada novo preço.
 */
export function useHistoricoVivo(token: TokenSummary): number[] {
  const vivo = useContext(Contexto).get(token.address.toLowerCase());
  if (!vivo || !(token.priceUsd > 0)) return [];
  if (token.marketCapUsd > 0 && (vivo.marketCapUsd > token.marketCapUsd * 50 || vivo.marketCapUsd < token.marketCapUsd / 20)) return [];
  return vivo.historico.map((p) => p / token.priceUsd);
}
