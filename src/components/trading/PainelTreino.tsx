"use client";

import Link from "next/link";
import { useState } from "react";

import { useTextos } from "@/components/IdiomaProvider";
import { Card } from "@/components/ui/Card";
import { traducoes } from "@/lib/idiomas";
import { comprarNoTreino, TAXA_TREINO, useTreino, venderNoTreino } from "@/lib/treino";
import type { ChainId } from "@/lib/types";
import { cn, formatPct, formatPrice, formatUsd } from "@/lib/utils";

/**
 * O painel de compra do MODO TREINO (17/10/2026): mesmo lugar do swap real,
 * mas com os US$ 10.000 de mentira da carteira de treino (lib/treino.ts).
 * Preço = o do gráfico ao vivo; nada passa pela carteira nem pela rede.
 */
const TEXTOS = traducoes({
  en: {
    titulo: "Practice mode",
    sub: "Fake $10,000, real live prices. Nothing leaves your wallet.",
    saldo: "Practice balance",
    comprar: "Buy",
    vender: "Sell",
    valor: "Amount in USD",
    tudo: "All",
    voceTem: "You hold",
    valeAgora: "Worth now",
    lucro: "P&L",
    semPreco: "Waiting for the live price…",
    erroSaldo: "Not enough practice balance.",
    erroValor: "Type an amount.",
    comprou: "Bought (practice) ✓",
    vendeu: "Sold (practice) ✓",
    taxa: `Same ${(TAXA_TREINO * 100).toFixed(2)}% fee as a real trade. No slippage.`,
    carteira: "My practice wallet →",
  },
  pt: {
    titulo: "Modo treino",
    sub: "US$ 10.000 de mentira, preço real e ao vivo. Nada sai da sua carteira.",
    saldo: "Saldo de treino",
    comprar: "Comprar",
    vender: "Vender",
    valor: "Valor em dólar",
    tudo: "Tudo",
    voceTem: "Você tem",
    valeAgora: "Vale agora",
    lucro: "Lucro",
    semPreco: "Esperando o preço ao vivo…",
    erroSaldo: "Saldo de treino insuficiente.",
    erroValor: "Digite um valor.",
    comprou: "Comprado (treino) ✓",
    vendeu: "Vendido (treino) ✓",
    taxa: `Mesma taxa de ${(TAXA_TREINO * 100).toFixed(2).replace(".", ",")}% do real. Sem slippage.`,
    carteira: "Minha carteira de treino →",
  },
  zh: {
    titulo: "练习模式",
    sub: "虚拟 $10,000，真实实时价格。资金不会离开你的钱包。",
    saldo: "练习余额",
    comprar: "买入",
    vender: "卖出",
    valor: "美元金额",
    tudo: "全部",
    voceTem: "持有",
    valeAgora: "当前价值",
    lucro: "盈亏",
    semPreco: "正在等待实时价格…",
    erroSaldo: "练习余额不足。",
    erroValor: "请输入金额。",
    comprou: "已买入（练习）✓",
    vendeu: "已卖出（练习）✓",
    taxa: `与真实交易相同的 ${(TAXA_TREINO * 100).toFixed(2)}% 手续费，无滑点。`,
    carteira: "我的练习钱包 →",
  },
});

export function PainelTreino({
  address,
  chain,
  symbol,
  imagem,
  priceUsd,
}: {
  address: string;
  chain: ChainId;
  symbol: string;
  imagem?: string;
  priceUsd: number;
}) {
  const t = useTextos(TEXTOS);
  const carteira = useTreino();
  const [lado, setLado] = useState<"compra" | "venda">("compra");
  const [valor, setValor] = useState("100");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const posicao = carteira?.posicoes[address];
  const valeAgora = posicao ? posicao.qtd * priceUsd : 0;
  const lucro = posicao ? valeAgora - posicao.custoUsd : 0;
  const temPreco = priceUsd > 0;

  const mostrar = (ok: boolean, texto: string) => {
    setAviso({ ok, texto });
    window.setTimeout(() => setAviso(null), 2500);
  };

  const comprar = () => {
    const erro = comprarNoTreino({ address, chain, symbol, imagem }, Number(valor.replace(",", ".")), priceUsd);
    if (erro === "saldo") mostrar(false, t.erroSaldo);
    else if (erro === "valor") mostrar(false, t.erroValor);
    else if (!erro) mostrar(true, t.comprou);
  };

  const vender = (fracao: number) => {
    if (!venderNoTreino(address, fracao, priceUsd)) mostrar(true, t.vendeu);
  };

  return (
    <Card className="overflow-hidden">
      <div className="space-y-3 p-4">
        <div>
          <div className="text-[15px] font-black text-zinc-50">{t.titulo} 🎮</div>
          <p className="text-[12px] text-zinc-500">{t.sub}</p>
        </div>

        <div className="flex items-baseline justify-between rounded-lg bg-white/[0.03] px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{t.saldo}</span>
          <span className="tnum text-[15px] font-bold text-zinc-100">{carteira ? formatUsd(carteira.saldoUsd) : "…"}</span>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/[0.03] p-1">
          {(["compra", "venda"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLado(l)}
              className={cn(
                "rounded-md py-2 text-[13px] font-bold transition active:scale-95",
                lado === l ? (l === "compra" ? "bg-bull/15 text-bull" : "bg-bear/15 text-bear") : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              {l === "compra" ? t.comprar : t.vender}
            </button>
          ))}
        </div>

        {lado === "compra" ? (
          <>
            <label className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 focus-within:border-marca/50">
              <span className="text-zinc-500">$</span>
              <input
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ""))}
                aria-label={t.valor}
                className="tnum w-full bg-transparent text-[18px] font-bold text-zinc-50 outline-none"
              />
              <span className="text-[12px] font-bold text-zinc-500">USD</span>
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {["50", "100", "500", "1000"].map((v) => (
                <button
                  key={v}
                  onClick={() => setValor(v)}
                  className="rounded-md bg-white/[0.05] py-1.5 text-[12px] font-semibold text-zinc-300 transition hover:bg-white/[0.09] active:scale-95"
                >
                  ${v}
                </button>
              ))}
            </div>
            <button
              onClick={comprar}
              disabled={!temPreco}
              className="w-full rounded-lg bg-bull py-3 text-[15px] font-black text-black transition hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
            >
              {temPreco ? `${t.comprar} $${symbol}` : t.semPreco}
            </button>
          </>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {[0.25, 0.5, 1].map((f) => (
              <button
                key={f}
                onClick={() => vender(f)}
                disabled={!posicao || !temPreco}
                className="rounded-lg bg-bear/90 py-3 text-[14px] font-black text-white transition hover:brightness-110 active:scale-95 disabled:opacity-30"
              >
                {f === 1 ? t.tudo : `${f * 100}%`}
              </button>
            ))}
          </div>
        )}

        {aviso && <p className={cn("fx-surgir text-center text-[13px] font-semibold", aviso.ok ? "text-bull" : "text-bear")}>{aviso.texto}</p>}

        {posicao && (
          <div className="fx-surgir grid grid-cols-3 gap-2 rounded-lg border border-white/[0.06] px-3 py-2 text-center">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">{t.voceTem}</div>
              <div className="tnum text-[13px] font-bold text-zinc-100">{formatPrice(posicao.qtd, 3)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">{t.valeAgora}</div>
              <div className="tnum text-[13px] font-bold text-zinc-100">{formatUsd(valeAgora)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">{t.lucro}</div>
              <div className={cn("tnum text-[13px] font-bold", lucro >= 0 ? "text-bull" : "text-bear")}>
                {formatUsd(lucro)} <span className="text-[11px]">({formatPct(posicao.custoUsd > 0 ? (lucro / posicao.custoUsd) * 100 : 0)})</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-600">
          <span>{t.taxa}</span>
          <Link href="/treino" className="shrink-0 font-semibold text-marca hover:underline">
            {t.carteira}
          </Link>
        </div>
      </div>
    </Card>
  );
}
