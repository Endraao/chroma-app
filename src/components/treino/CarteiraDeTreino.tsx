"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";
import { SALDO_INICIAL_USD, useTreino, zerarTreino } from "@/lib/treino";
import { cn, formatPct, formatPrice, formatUsd, timeAgo } from "@/lib/utils";

/**
 * A carteira do modo treino: saldo, posições com o preço de agora (lido de
 * 10 em 10 s pelo /api/price, que já tem cache na CDN), lucro e histórico.
 */
const TEXTOS = traducoes({
  en: {
    titulo: "Practice wallet",
    sub: "Fake $10,000, real live prices. Buy and sell any coin with zero risk, then try it for real when you're ready.",
    total: "Total value",
    resultado: "Result",
    saldo: "Cash",
    realizado: "Realized",
    posicoes: "Positions",
    vazio: "No positions yet. Open any coin, switch to Practice 🎮 and buy.",
    explorar: "Explore coins →",
    moeda: "Coin",
    qtd: "Amount",
    vale: "Worth",
    lucro: "P&L",
    historico: "Recent trades",
    compra: "buy",
    venda: "sell",
    zerar: "Reset to $10,000",
    confirmar: "Reset the practice wallet? Positions and history will be erased.",
    aviso: "Practice only: nothing here is real money and nothing touches your wallet. Saved in this browser.",
  },
  pt: {
    titulo: "Carteira de treino",
    sub: "US$ 10.000 de mentira, preço real e ao vivo. Compre e venda qualquer moeda sem risco e, quando estiver pronto, faça de verdade.",
    total: "Valor total",
    resultado: "Resultado",
    saldo: "Em dinheiro",
    realizado: "Já embolsado",
    posicoes: "Posições",
    vazio: "Nenhuma posição ainda. Abra qualquer moeda, troque pra Treino 🎮 e compre.",
    explorar: "Ver moedas →",
    moeda: "Moeda",
    qtd: "Quantidade",
    vale: "Vale",
    lucro: "Lucro",
    historico: "Últimas operações",
    compra: "compra",
    venda: "venda",
    zerar: "Zerar pra US$ 10.000",
    confirmar: "Zerar a carteira de treino? Posições e histórico serão apagados.",
    aviso: "Só treino: nada aqui é dinheiro de verdade e nada toca a sua carteira. Fica salvo neste navegador.",
  },
  zh: {
    titulo: "练习钱包",
    sub: "虚拟 $10,000，真实实时价格。零风险买卖任意代币，准备好后再真实交易。",
    total: "总价值",
    resultado: "收益",
    saldo: "现金",
    realizado: "已实现",
    posicoes: "持仓",
    vazio: "暂无持仓。打开任意代币，切换到练习 🎮 后买入。",
    explorar: "浏览代币 →",
    moeda: "代币",
    qtd: "数量",
    vale: "价值",
    lucro: "盈亏",
    historico: "最近交易",
    compra: "买入",
    venda: "卖出",
    zerar: "重置为 $10,000",
    confirmar: "重置练习钱包？持仓和记录将被清除。",
    aviso: "仅为练习：这里没有真实资金，也不会动用你的钱包。数据保存在本浏览器。",
  },
});

export function CarteiraDeTreino() {
  const t = useTextos(TEXTOS);
  const carteira = useTreino();
  const [precos, setPrecos] = useState<Record<string, number>>({});

  const enderecos = Object.keys(carteira?.posicoes ?? {}).sort().join(",");
  useEffect(() => {
    if (!enderecos) return;
    let cancelado = false;
    const ler = async () => {
      const lidos = await Promise.all(
        enderecos.split(",").map(async (a) => {
          try {
            const r = await fetch(`/api/price?address=${a}`);
            const j = r.ok ? ((await r.json()) as { priceUsd?: number }) : null;
            return [a, Number(j?.priceUsd ?? 0)] as const;
          } catch {
            return [a, 0] as const;
          }
        }),
      );
      if (!cancelado) setPrecos((p) => ({ ...p, ...Object.fromEntries(lidos.filter(([, v]) => v > 0)) }));
    };
    void ler();
    const id = window.setInterval(() => void ler(), 10_000);
    return () => {
      cancelado = true;
      window.clearInterval(id);
    };
  }, [enderecos]);

  const posicoes = Object.values(carteira?.posicoes ?? {});
  // Sem preço ainda, a posição conta pelo custo (não some do total enquanto carrega).
  const valorDe = (p: (typeof posicoes)[number]) => (precos[p.address] ? p.qtd * precos[p.address] : p.custoUsd);
  const total = (carteira?.saldoUsd ?? SALDO_INICIAL_USD) + posicoes.reduce((s, p) => s + valorDe(p), 0);
  const resultado = total - SALDO_INICIAL_USD;

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-[28px] font-black text-zinc-50">🎮 {t.titulo}</h1>
        <p className="max-w-2xl text-[14.5px] text-zinc-300">{t.sub}</p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { rotulo: t.total, valor: formatUsd(total), cor: "text-zinc-50" },
          { rotulo: t.resultado, valor: `${formatUsd(resultado)} (${formatPct((resultado / SALDO_INICIAL_USD) * 100)})`, cor: resultado >= 0 ? "text-bull" : "text-bear" },
          { rotulo: t.saldo, valor: formatUsd(carteira?.saldoUsd ?? SALDO_INICIAL_USD), cor: "text-zinc-100" },
          { rotulo: t.realizado, valor: formatUsd(carteira?.realizadoUsd ?? 0), cor: (carteira?.realizadoUsd ?? 0) >= 0 ? "text-bull" : "text-bear" },
        ].map((c) => (
          <div key={c.rotulo} className="glass rounded-xl px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{c.rotulo}</div>
            <div className={cn("tnum mt-1 text-[18px] font-black", c.cor)}>{c.valor}</div>
          </div>
        ))}
      </section>

      <section className="glass overflow-hidden rounded-xl">
        <h2 className="border-b border-white/[0.06] px-4 py-3 text-[13px] font-semibold uppercase tracking-wider text-zinc-400">{t.posicoes}</h2>
        {carteira && posicoes.length === 0 ? (
          <div className="space-y-2 px-4 py-6 text-center">
            <p className="text-[14px] text-zinc-400">{t.vazio}</p>
            <Link href="/" className="text-[14px] font-semibold text-marca hover:underline">
              {t.explorar}
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500">
                  <th className="px-4 py-2 font-semibold">{t.moeda}</th>
                  <th className="hidden px-4 py-2 text-right font-semibold sm:table-cell">{t.qtd}</th>
                  <th className="px-4 py-2 text-right font-semibold">{t.vale}</th>
                  <th className="px-4 py-2 text-right font-semibold">{t.lucro}</th>
                </tr>
              </thead>
              <tbody>
                {posicoes.map((p) => {
                  const vale = valorDe(p);
                  const lucro = vale - p.custoUsd;
                  return (
                    <tr key={p.address} className="border-t border-white/[0.04]">
                      <td className="px-4 py-2.5">
                        <Link href={`/token/${p.address}`} className="flex items-center gap-2 font-bold text-zinc-100 hover:text-marca">
                          {p.imagem ? <img src={p.imagem} alt="" className="size-6 rounded-full object-cover" /> : <span className="size-6 rounded-full bg-white/10" />}
                          ${p.symbol}
                        </Link>
                      </td>
                      <td className="tnum hidden px-4 py-2.5 text-right text-zinc-300 sm:table-cell">{formatPrice(p.qtd, 3)}</td>
                      <td className="tnum px-4 py-2.5 text-right text-zinc-100">{formatUsd(vale)}</td>
                      <td className={cn("tnum px-4 py-2.5 text-right font-bold", lucro >= 0 ? "text-bull" : "text-bear")}>
                        {formatUsd(lucro)} <span className="text-[11px] font-semibold">({formatPct(p.custoUsd > 0 ? (lucro / p.custoUsd) * 100 : 0)})</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!!carteira?.historico.length && (
        <section className="glass overflow-hidden rounded-xl">
          <h2 className="border-b border-white/[0.06] px-4 py-3 text-[13px] font-semibold uppercase tracking-wider text-zinc-400">{t.historico}</h2>
          <ul className="divide-y divide-white/[0.04]">
            {carteira.historico.slice(0, 20).map((o) => (
              <li key={`${o.em}-${o.address}`} className="flex items-center justify-between gap-3 px-4 py-2 text-[13px]">
                <span className="flex items-center gap-2">
                  <span className={cn("font-bold", o.lado === "compra" ? "text-bull" : "text-bear")}>{o.lado === "compra" ? t.compra : t.venda}</span>
                  <Link href={`/token/${o.address}`} className="font-semibold text-zinc-200 hover:text-marca">
                    ${o.symbol}
                  </Link>
                </span>
                <span className="tnum text-zinc-400">
                  {formatUsd(o.usd)} · {timeAgo(o.em)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 text-[12px] text-zinc-500">
        <span>{t.aviso}</span>
        <button
          onClick={() => window.confirm(t.confirmar) && zerarTreino()}
          className="rounded-lg border border-white/15 px-3 py-1.5 font-semibold text-zinc-300 transition hover:bg-white/5 active:scale-95"
        >
          {t.zerar}
        </button>
      </footer>
    </main>
  );
}
