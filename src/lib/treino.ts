"use client";

import { useEffect, useState } from "react";

import type { ChainId } from "@/lib/types";

/**
 * MODO TREINO (17/10/2026, ideia tirada da weft.fi): comprar e vender com
 * US$ 10.000 de mentira, a preço real e ao vivo. Zero risco pra quem testa,
 * zero custo pra Chroma — a carteira de treino mora no navegador da pessoa
 * (localStorage), sem banco e sem carteira conectada.
 *
 * Simplificações assumidas: o preço é o do gráfico na hora do clique (sem
 * slippage nem impacto de preço) e a taxa é a do site, 0,75%, nas duas pontas.
 */
export const SALDO_INICIAL_USD = 10_000;
export const TAXA_TREINO = 0.0075;

const CHAVE = "chroma-treino-v1";
const EVENTO = "chroma-treino";

export interface PosicaoTreino {
  address: string;
  chain: ChainId;
  symbol: string;
  imagem?: string;
  qtd: number;
  /** quanto saiu do saldo pra montar o que ainda está na mão (com taxa) */
  custoUsd: number;
}

export interface OperacaoTreino {
  em: number;
  address: string;
  symbol: string;
  lado: "compra" | "venda";
  usd: number;
  qtd: number;
  preco: number;
}

export interface CarteiraTreino {
  saldoUsd: number;
  posicoes: Record<string, PosicaoTreino>;
  historico: OperacaoTreino[];
  /** lucro já embolsado nas vendas */
  realizadoUsd: number;
}

const nova = (): CarteiraTreino => ({ saldoUsd: SALDO_INICIAL_USD, posicoes: {}, historico: [], realizadoUsd: 0 });

export function lerTreino(): CarteiraTreino {
  try {
    const bruto = window.localStorage.getItem(CHAVE);
    if (!bruto) return nova();
    const c = JSON.parse(bruto) as CarteiraTreino;
    return typeof c.saldoUsd === "number" && c.posicoes ? { ...nova(), ...c } : nova();
  } catch {
    return nova();
  }
}

function gravar(c: CarteiraTreino) {
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify({ ...c, historico: c.historico.slice(0, 100) }));
  } catch {
    /* navegador sem armazenamento (aba anônima): o treino vale só nesta visita */
  }
  window.dispatchEvent(new Event(EVENTO));
}

/** A carteira de treino, sempre igual em todos os painéis abertos (inclusive outras abas). */
export function useTreino(): CarteiraTreino | null {
  const [c, setC] = useState<CarteiraTreino | null>(null);
  useEffect(() => {
    const ler = () => setC(lerTreino());
    ler();
    const naOutraAba = (e: StorageEvent) => e.key === CHAVE && ler();
    window.addEventListener(EVENTO, ler);
    window.addEventListener("storage", naOutraAba);
    return () => {
      window.removeEventListener(EVENTO, ler);
      window.removeEventListener("storage", naOutraAba);
    };
  }, []);
  return c;
}

type Moeda = Pick<PosicaoTreino, "address" | "chain" | "symbol" | "imagem">;

export function comprarNoTreino(moeda: Moeda, usd: number, preco: number): string | null {
  const c = lerTreino();
  if (!(preco > 0)) return "sem-preco";
  if (!(usd > 0)) return "valor";
  if (usd > c.saldoUsd + 1e-9) return "saldo";
  const qtd = (usd * (1 - TAXA_TREINO)) / preco;
  const atual = c.posicoes[moeda.address];
  c.posicoes[moeda.address] = {
    ...moeda,
    qtd: (atual?.qtd ?? 0) + qtd,
    custoUsd: (atual?.custoUsd ?? 0) + usd,
  };
  c.saldoUsd -= usd;
  c.historico.unshift({ em: Date.now(), address: moeda.address, symbol: moeda.symbol, lado: "compra", usd, qtd, preco });
  gravar(c);
  return null;
}

/** Vende uma fração (0–1) do que tem da moeda. */
export function venderNoTreino(address: string, fracao: number, preco: number): string | null {
  const c = lerTreino();
  const p = c.posicoes[address];
  if (!p || p.qtd <= 0) return "sem-posicao";
  if (!(preco > 0)) return "sem-preco";
  const f = Math.min(1, Math.max(0, fracao));
  const qtd = p.qtd * f;
  const usd = qtd * preco * (1 - TAXA_TREINO);
  const custo = p.custoUsd * f;
  c.saldoUsd += usd;
  c.realizadoUsd += usd - custo;
  if (f >= 0.999) delete c.posicoes[address];
  else c.posicoes[address] = { ...p, qtd: p.qtd - qtd, custoUsd: p.custoUsd - custo };
  c.historico.unshift({ em: Date.now(), address, symbol: p.symbol, lado: "venda", usd, qtd, preco });
  gravar(c);
  return null;
}

export function zerarTreino() {
  gravar(nova());
}
