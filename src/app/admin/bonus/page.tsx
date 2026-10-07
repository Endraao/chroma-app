"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";

import { ganhosDeTodasAsMoedas } from "@/lib/meteora-dbc";

/**
 * Painel do BÔNUS DO CRIADOR, só na máquina local (ver lib/bonus-criador.ts).
 *
 * Lista toda moeda da Curva da Chroma, quanto a Chroma ganhou com ela, o
 * bônus conquistado, se o criador já PEDIU (botão "Claim" na página da moeda)
 * e quanto falta pagar. Pague em SOL pra carteira do criador e clique em
 * "Marcar pago": fica no banco, e a página da moeda para de mostrar o bônus.
 * Em produção a página não faz nada.
 */
type Linha = { pool: string; mint: string; criador: string; ganhoSol: number };
type Registro = { pagoUsd: number; pedidoUsd: number; volumeUsd: number; conquistadoUsd: number };

export default function PainelDeBonus() {
  const { connection } = useConnection();
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [sol, setSol] = useState(0);
  const [regs, setRegs] = useState<Record<string, Registro>>({});
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    Promise.all([
      ganhosDeTodasAsMoedas(connection),
      fetch("/api/price?address=So11111111111111111111111111111111111111112").then((r) => r.json()),
    ])
      .then(async ([l, p]) => {
        setLinhas(l.sort((a, b) => b.ganhoSol - a.ganhoSol));
        setSol(Number(p?.priceUsd) || 0);
        const r = await Promise.all(
          l.map((x) =>
            fetch(`/api/bonus-criador?address=${x.mint}`, { cache: "no-store" })
              .then((q) => (q.ok ? q.json() : null))
              .catch(() => null),
          ),
        );
        setRegs(Object.fromEntries(l.map((x, i) => [
              x.mint,
              { pagoUsd: r[i]?.pagoUsd ?? 0, pedidoUsd: r[i]?.pedidoUsd ?? 0, volumeUsd: r[i]?.volumeUsd ?? 0, conquistadoUsd: r[i]?.conquistadoUsd ?? 0 },
            ])));
      })
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)));
  }, [connection]);

  if (process.env.NODE_ENV === "production") return <p className="p-8 text-zinc-500">Indisponível.</p>;

  const marcarPago = async (mint: string, usd: number) => {
    const r = await fetch("/api/bonus-criador", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: mint, pago: usd }),
    });
    if (r.ok) setRegs((x) => ({ ...x, [mint]: { ...x[mint], pagoUsd: usd } }));
  };

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-8">
      <h1 className="text-xl font-bold text-zinc-100">Bônus do criador — pagamentos</h1>
      <p className="text-[13px] text-zinc-400">SOL a ${sol.toFixed(2)}. Pague em SOL pra carteira do criador e clique em &quot;Marcar pago&quot;.</p>
      {erro && <p className="text-[13px] text-bear">{erro}</p>}
      {!linhas ? (
        <p className="text-[13px] text-zinc-500">Carregando…</p>
      ) : (
        <table className="w-full text-[12px]">
          <thead className="text-left text-zinc-500">
            <tr>
              <th className="py-2">Moeda</th>
              <th>Criador</th>
              <th className="text-right">Chroma ganhou</th>
              <th className="text-right">Volume ~</th>
              <th className="text-right">Bônus</th>
              <th className="text-right">Pedido</th>
              <th className="text-right">Pago</th>
              <th className="text-right">A pagar</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              // Volume REAL e bônus vêm da rota (sem a taxa anti-sniper).
              const p = { volumeUsd: regs[l.mint]?.volumeUsd ?? 0, conquistadoUsd: regs[l.mint]?.conquistadoUsd ?? 0 };
              const pago = regs[l.mint]?.pagoUsd ?? 0;
              const pedido = regs[l.mint]?.pedidoUsd ?? 0;
              const devido = Math.max(0, p.conquistadoUsd - pago);
              return (
                <tr key={l.pool} className="border-t border-ink-700 text-zinc-300">
                  <td className="py-2 font-mono">
                    <a href={`/token/${l.mint}`} target="_blank" rel="noreferrer" className="hover:text-marca">
                      {l.mint.slice(0, 6)}…{l.mint.slice(-4)}
                    </a>
                  </td>
                  <td className="select-all font-mono">{l.criador}</td>
                  <td className="tnum text-right">{l.ganhoSol.toFixed(4)} SOL</td>
                  <td className="tnum text-right">${Math.round(p.volumeUsd).toLocaleString("en-US")}</td>
                  <td className="tnum text-right">${p.conquistadoUsd}</td>
                  <td className={`tnum text-right ${pedido > pago ? "font-bold text-warn" : ""}`}>{pedido > pago ? `$${pedido}` : "—"}</td>
                  <td className="tnum text-right">${pago}</td>
                  <td className={`tnum text-right font-bold ${devido > 0 ? "text-bull" : "text-zinc-600"}`}>
                    {devido > 0 ? `$${devido} (${sol > 0 ? (devido / sol).toFixed(4) : "?"} SOL)` : "—"}
                  </td>
                  <td className="text-right">
                    {devido > 0 && (
                      <button
                        onClick={() => marcarPago(l.mint, p.conquistadoUsd)}
                        className="rounded border border-marca/50 px-2 py-0.5 text-marca hover:bg-marca/10"
                      >
                        Marcar pago
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
