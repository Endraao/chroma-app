import type { Metadata } from "next";
import Link from "next/link";

import { idiomaAtual } from "@/lib/idioma-servidor";
import { rankingDeDivulgadores } from "@/lib/ranking-divulgadores";
import { cn, formatUsd } from "@/lib/utils";

/**
 * Ranking público de divulgadores: quem mais gerou negócios pelo próprio link
 * e quanto ganhou — tudo conferido na blockchain (ver lib/ranking-divulgadores).
 */
export const dynamic = "force-dynamic";

const TEXTOS = {
  en: {
    titulo: "Top promoters",
    sub: "Stop paying KOLs upfront. On Chroma, promoters earn only when their link or post brings a trade — paid on-chain, in the same transaction.",
    verificado: "Every number below is verified on Solana: the trade happened and the SOL landed in the promoter's wallet.",
    periodos: { "7": "7 days", "30": "30 days", tudo: "All time" },
    cols: ["#", "Promoter", "Trades", "Coins", "Volume brought", "Earned"],
    vazio: "No verified trades in this period yet. Be the first: share any coin with your link.",
    cta: "Get your link →",
  },
  pt: {
    titulo: "Ranking de divulgadores",
    sub: "Chega de pagar influenciador adiantado. Na Chroma, quem divulga só ganha quando o link ou o post dele gera negócio — pago na blockchain, na mesma transação.",
    verificado: "Todos os números abaixo são conferidos na Solana: o negócio aconteceu e o SOL caiu na carteira do divulgador.",
    periodos: { "7": "7 dias", "30": "30 dias", tudo: "Sempre" },
    cols: ["#", "Divulgador", "Negócios", "Moedas", "Volume gerado", "Ganhou"],
    vazio: "Nenhum negócio comprovado neste período ainda. Seja o primeiro: compartilhe qualquer moeda com o seu link.",
    cta: "Pegar meu link →",
  },
  zh: {
    titulo: "推广者排行榜",
    sub: "别再预付 KOL。在 Chroma，推广者只有在其链接或帖子带来交易时才赚钱 —— 链上同笔交易内支付。",
    verificado: "以下所有数据均在 Solana 上验证：交易真实发生，SOL 已到推广者钱包。",
    periodos: { "7": "7 天", "30": "30 天", tudo: "全部" },
    cols: ["#", "推广者", "交易", "代币", "带来的交易量", "收益"],
    vazio: "此期间暂无已验证的交易。成为第一个：用你的链接分享任意代币。",
    cta: "获取我的链接 →",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const t = TEXTOS[await idiomaAtual()];
  return { title: `${t.titulo} — Chroma`, description: t.sub };
}

export default async function Ranking({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const t = TEXTOS[await idiomaAtual()];
  const { p } = await searchParams;
  const periodo = p === "30" || p === "tudo" ? p : "7";
  const lista = await rankingDeDivulgadores(periodo === "tudo" ? null : Number(periodo)).catch(() => []);

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-[28px] font-black text-zinc-50">🏆 {t.titulo}</h1>
        <p className="max-w-2xl text-[14.5px] text-zinc-300">{t.sub}</p>
        <p className="flex items-center gap-2 text-[12.5px] text-marca">
          <span className="size-1.5 rounded-full bg-marca" /> {t.verificado}
        </p>
      </header>

      <div className="flex items-center gap-2">
        {(["7", "30", "tudo"] as const).map((k) => (
          <Link
            key={k}
            href={k === "7" ? "/ranking" : `/ranking?p=${k}`}
            className={cn(
              "rounded-md px-3 py-1.5 text-[13px] font-bold",
              periodo === k ? "bg-marca text-black" : "text-zinc-400 hover:bg-ink-800 hover:text-zinc-100",
            )}
          >
            {t.periodos[k]}
          </Link>
        ))}
        <Link href="/divulgar" className="ml-auto text-[13px] font-bold text-marca hover:underline">
          {t.cta}
        </Link>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/[0.07] bg-ink-900/70">
        <table className="w-full min-w-[560px] text-[13.5px]">
          <thead>
            <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-zinc-500">
              {t.cols.map((c, i) => (
                <th key={c} className={cn("px-4 py-3 font-semibold", i >= 2 && "text-right")}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lista.map((d, i) => (
              <tr key={d.carteira + d.nome} className="border-b border-white/[0.04] last:border-0">
                <td className="px-4 py-3 font-black text-zinc-500">{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</td>
                <td className="px-4 py-3">
                  <a
                    href={`https://solscan.io/account/${d.carteira}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-zinc-100 hover:text-marca"
                  >
                    {d.nome}
                  </a>
                </td>
                <td className="tnum px-4 py-3 text-right text-zinc-300">{d.negocios}</td>
                <td className="tnum px-4 py-3 text-right text-zinc-300">{d.moedas}</td>
                <td className="tnum px-4 py-3 text-right text-zinc-300">{formatUsd(d.volumeUsd)}</td>
                <td className="tnum px-4 py-3 text-right font-black text-marca">
                  {formatUsd(d.ganhoUsd)} <span className="text-[11px] font-semibold text-zinc-500">{d.ganhoSol.toFixed(4)} SOL</span>
                </td>
              </tr>
            ))}
            {!lista.length && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-zinc-400">
                  {t.vazio}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
