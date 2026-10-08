"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";

import { useTextos } from "@/components/IdiomaProvider";
import { RequireChainWallet } from "@/components/web3/RequireChainWallet";
import { mensagemDaCampanha } from "@/lib/campanhas-mensagem";
import { traducoes } from "@/lib/idiomas";
import { cn } from "@/lib/utils";

/**
 * CAMPANHAS PAGAS POR RESULTADO (ver lib/campanhas.ts): criar, acompanhar e
 * — pro patrocinador — pagar os divulgadores num clique, da própria carteira.
 */
const TEXTOS = traducoes({
  en: {
    titulo: "Promoter campaigns",
    sub: "Sponsors offer an extra bonus to whoever brings buyers to a coin. Every trade is verified on-chain; sponsors pay promoters directly from their wallet — Chroma holds no funds. Payment history is public.",
    criar: "Create a campaign",
    moeda: "Coin address (Solana)",
    bonus: "Extra bonus (% of the volume promoters bring)",
    orcamento: "Max budget (SOL)",
    dias: "Duration (days)",
    assinar: "Sign & create (free)",
    assinando: "Approve in your wallet…",
    criada: "Campaign created!",
    ativas: "Active campaigns",
    nenhuma: "No campaigns yet. Be the first sponsor.",
    extra: (p: number) => `+${p}% extra for promoters`,
    ate: (s: number) => `budget ${s} SOL`,
    faltam: (d: number) => (d > 0 ? `${d}d left` : "ended"),
    divulgar: "Promote this coin →",
    devido: "Owed",
    pago: "Paid",
    divulgador: "Promoter",
    negocios: "Trades",
    volume: "Volume brought",
    pagarTudo: (s: string) => `Pay ${s} SOL to promoters`,
    pagando: "Paying…",
    pagoOk: "Paid and verified on-chain ✓",
    patrocinador: "Sponsor",
    reputacao: (p: string, d: string) => `paid ${p} of ${d} SOL owed`,
    aviso: "Bonuses are paid by the sponsor, not by Chroma. Check the sponsor's payment history before promoting.",
  },
  pt: {
    titulo: "Campanhas de divulgação",
    sub: "Patrocinadores oferecem um bônus extra a quem trouxer compradores para uma moeda. Cada negócio é conferido na blockchain; o patrocinador paga os divulgadores direto da carteira dele — a Chroma não guarda dinheiro. O histórico de pagamentos é público.",
    criar: "Criar campanha",
    moeda: "Endereço da moeda (Solana)",
    bonus: "Bônus extra (% do volume que os divulgadores trouxerem)",
    orcamento: "Orçamento máximo (SOL)",
    dias: "Duração (dias)",
    assinar: "Assinar e criar (grátis)",
    assinando: "Aprove na sua carteira…",
    criada: "Campanha criada!",
    ativas: "Campanhas ativas",
    nenhuma: "Nenhuma campanha ainda. Seja o primeiro patrocinador.",
    extra: (p: number) => `+${p}% extra pra quem divulgar`,
    ate: (s: number) => `orçamento ${s} SOL`,
    faltam: (d: number) => (d > 0 ? `faltam ${d}d` : "encerrada"),
    divulgar: "Divulgar esta moeda →",
    devido: "Devido",
    pago: "Pago",
    divulgador: "Divulgador",
    negocios: "Negócios",
    volume: "Volume trazido",
    pagarTudo: (s: string) => `Pagar ${s} SOL aos divulgadores`,
    pagando: "Pagando…",
    pagoOk: "Pago e conferido na blockchain ✓",
    patrocinador: "Patrocinador",
    reputacao: (p: string, d: string) => `pagou ${p} de ${d} SOL devidos`,
    aviso: "O bônus é pago pelo patrocinador, não pela Chroma. Confira o histórico de pagamentos dele antes de divulgar.",
  },
  zh: {
    titulo: "推广活动",
    sub: "赞助者为给代币带来买家的人提供额外奖励。每笔交易都在链上验证；赞助者直接从自己的钱包向推广者付款 —— Chroma 不托管任何资金。付款记录公开。",
    criar: "创建活动",
    moeda: "代币地址（Solana）",
    bonus: "额外奖励（推广者带来交易量的 %）",
    orcamento: "最高预算（SOL）",
    dias: "持续天数",
    assinar: "签名并创建（免费）",
    assinando: "请在钱包中确认…",
    criada: "活动已创建！",
    ativas: "进行中的活动",
    nenhuma: "还没有活动。成为第一个赞助者。",
    extra: (p: number) => `推广者额外 +${p}%`,
    ate: (s: number) => `预算 ${s} SOL`,
    faltam: (d: number) => (d > 0 ? `剩余 ${d} 天` : "已结束"),
    divulgar: "推广这个代币 →",
    devido: "应付",
    pago: "已付",
    divulgador: "推广者",
    negocios: "交易",
    volume: "带来的交易量",
    pagarTudo: (s: string) => `向推广者支付 ${s} SOL`,
    pagando: "支付中…",
    pagoOk: "已支付并链上验证 ✓",
    patrocinador: "赞助者",
    reputacao: (p: string, d: string) => `已付 ${p} / 应付 ${d} SOL`,
    aviso: "奖励由赞助者支付，而非 Chroma。推广前请查看赞助者的付款记录。",
  },
});

interface Resultado { carteira: string; nome: string; negocios: number; volumeSol: number; devidoSol: number; pagoSol: number }
interface Campanha {
  id: string; moeda: string; simbolo: string; nome: string; imagem: string | null; patrocinador: string;
  bonusPct: number; orcamentoSol: number; inicio: number; fim: number;
  resultados: { lista: Resultado[]; devidoTotal: number; pagoTotal: number };
}

const f = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 });

export function Campanhas() {
  const t = useTextos(TEXTOS);
  const { publicKey, signMessage, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [lista, setLista] = useState<Campanha[] | null>(null);
  const [form, setForm] = useState({ moeda: "", bonus: "2", orcamento: "1", dias: "7" });
  const [estado, setEstado] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);

  const ler = useCallback(() => {
    fetch("/api/campanhas", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setLista(Array.isArray(j) ? j : []))
      .catch(() => setLista([]));
  }, []);
  useEffect(ler, [ler]);

  async function criar() {
    if (!publicKey || !signMessage) return;
    try {
      setEstado(t.assinando);
      const mensagem = mensagemDaCampanha({
        moeda: form.moeda.trim(),
        bonusPct: Number(form.bonus),
        orcamentoSol: Number(form.orcamento),
        dias: Math.round(Number(form.dias)),
        momento: Date.now(),
      });
      const bytes = await signMessage(new TextEncoder().encode(mensagem));
      const assinatura = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      const r = await fetch("/api/campanhas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acao: "criar", assinante: publicKey.toBase58(), mensagem, assinatura }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "erro");
      setEstado(t.criada);
      ler();
    } catch (e) {
      setEstado(e instanceof Error ? e.message : String(e));
    }
  }

  async function pagar(c: Campanha) {
    if (!publicKey || !sendTransaction) return;
    const aPagar = c.resultados.lista
      .map((d) => ({ carteira: d.carteira, lamports: Math.floor((d.devidoSol - d.pagoSol) * LAMPORTS_PER_SOL) }))
      .filter((d) => d.lamports > 5_000)
      .slice(0, 18);
    if (!aPagar.length) return;
    try {
      setEstado(t.pagando);
      const tx = new Transaction();
      for (const d of aPagar) tx.add(SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: new PublicKey(d.carteira), lamports: d.lamports }));
      const assinatura = await sendTransaction(tx, connection);
      const bloco = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: assinatura, ...bloco }, "confirmed");
      const r = await fetch("/api/campanhas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acao: "pago", id: c.id, tx: assinatura }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.erro ?? j?.error ?? "erro");
      setEstado(t.pagoOk);
      ler();
    } catch (e) {
      setEstado(e instanceof Error ? e.message : String(e));
    }
  }

  const campo = "w-full rounded-lg border border-ink-600 bg-ink-950 px-3 py-2.5 text-[14px] text-zinc-100 outline-none focus:border-marca/60";

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-[30px] font-black text-zinc-50">📣 {t.titulo}</h1>
        <p className="max-w-3xl text-[14.5px] leading-relaxed text-zinc-300">{t.sub}</p>
      </header>

      <details className="rounded-2xl border border-marca/25 bg-ink-900/70 p-4">
        <summary className="cursor-pointer text-[15px] font-black text-marca">{t.criar}</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2">
            <span className="text-[12px] text-zinc-400">{t.moeda}</span>
            <input className={cn(campo, "font-mono")} value={form.moeda} onChange={(e) => setForm({ ...form, moeda: e.target.value })} />
          </label>
          <label className="space-y-1">
            <span className="text-[12px] text-zinc-400">{t.bonus}</span>
            <input className={campo} inputMode="decimal" value={form.bonus} onChange={(e) => setForm({ ...form, bonus: e.target.value })} />
          </label>
          <label className="space-y-1">
            <span className="text-[12px] text-zinc-400">{t.orcamento}</span>
            <input className={campo} inputMode="decimal" value={form.orcamento} onChange={(e) => setForm({ ...form, orcamento: e.target.value })} />
          </label>
          <label className="space-y-1">
            <span className="text-[12px] text-zinc-400">{t.dias}</span>
            <input className={campo} inputMode="numeric" value={form.dias} onChange={(e) => setForm({ ...form, dias: e.target.value })} />
          </label>
          <div className="flex items-end">
            <RequireChainWallet chain="solana">
              <button type="button" onClick={criar} className="w-full rounded-xl bg-marca px-4 py-3 text-[14px] font-black text-black hover:opacity-90">
                {t.assinar}
              </button>
            </RequireChainWallet>
          </div>
        </div>
      </details>

      {estado && <p className="text-[13px] text-zinc-300">{estado}</p>}

      <section className="space-y-3">
        <h2 className="text-[18px] font-black text-zinc-100">{t.ativas}</h2>
        {lista && !lista.length && <p className="text-[14px] text-zinc-400">{t.nenhuma}</p>}
        {lista?.map((c) => {
          const dias = Math.ceil((c.fim - Date.now()) / 86_400_000);
          const souPatrocinador = publicKey?.toBase58() === c.patrocinador;
          const falta = c.resultados.devidoTotal - c.resultados.pagoTotal;
          return (
            <article key={c.id} className="rounded-2xl border border-white/[0.07] bg-ink-900/70 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <img src={c.imagem || `/api/logo/${c.moeda}`} alt="" className="size-11 rounded-full bg-ink-800 object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-black text-zinc-50">
                    {c.nome} <span className="text-[13px] font-semibold text-sky-300/90">${c.simbolo}</span>
                  </p>
                  <p className="text-[12.5px] text-zinc-400">
                    <span className="font-bold text-marca">{t.extra(c.bonusPct)}</span> · {t.ate(c.orcamentoSol)} · {t.faltam(dias)}
                  </p>
                  <p className="text-[11.5px] text-zinc-500">
                    {t.patrocinador}{" "}
                    <a href={`https://solscan.io/account/${c.patrocinador}`} target="_blank" rel="noreferrer" className="font-mono hover:text-marca">
                      {c.patrocinador.slice(0, 4)}…{c.patrocinador.slice(-4)}
                    </a>{" "}
                    · {t.reputacao(f(c.resultados.pagoTotal), f(c.resultados.devidoTotal))}
                  </p>
                </div>
                <Link href={`/divulgar?moeda=${c.moeda}`} className="rounded-xl bg-marca px-4 py-2.5 text-[13px] font-black text-black hover:opacity-90">
                  {t.divulgar}
                </Link>
              </div>

              {c.resultados.lista.length > 0 && (
                <button type="button" onClick={() => setAberta(aberta === c.id ? null : c.id)} className="mt-3 text-[12.5px] font-bold text-zinc-400 hover:text-zinc-100">
                  {aberta === c.id ? "▴" : "▾"} {c.resultados.lista.length} {t.divulgador.toLowerCase()}
                </button>
              )}
              {aberta === c.id && (
                <table className="mt-2 w-full text-[12.5px]">
                  <thead>
                    <tr className="text-left text-[10.5px] uppercase tracking-wider text-zinc-500">
                      <th className="py-1.5">{t.divulgador}</th>
                      <th className="text-right">{t.negocios}</th>
                      <th className="text-right">{t.volume}</th>
                      <th className="text-right">{t.devido}</th>
                      <th className="text-right">{t.pago}</th>
                    </tr>
                  </thead>
                  <tbody className="tnum text-zinc-300">
                    {c.resultados.lista.map((d) => (
                      <tr key={d.carteira} className="border-t border-white/[0.04]">
                        <td className="py-1.5">{d.nome}</td>
                        <td className="text-right">{d.negocios}</td>
                        <td className="text-right">{f(d.volumeSol)} SOL</td>
                        <td className="text-right font-bold text-marca">{f(d.devidoSol)} SOL</td>
                        <td className="text-right">{f(d.pagoSol)} SOL</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {souPatrocinador && falta > 0.00001 && (
                <button type="button" onClick={() => pagar(c)} className="mt-3 w-full rounded-xl bg-marca px-4 py-3 text-[14px] font-black text-black hover:opacity-90">
                  {t.pagarTudo(f(falta))}
                </button>
              )}
            </article>
          );
        })}
      </section>

      <p className="text-[12px] text-zinc-500">{t.aviso}</p>
    </main>
  );
}
