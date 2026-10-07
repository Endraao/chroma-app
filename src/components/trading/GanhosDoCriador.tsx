"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";
import { ganhosDoCriador, transacoesDeSaqueDoCriador } from "@/lib/meteora-dbc";
import { formatUsd } from "@/lib/utils";
import { SaquePrivado } from "@/components/trading/SaquePrivado";

const TEXTOS = traducoes({
  en: {
    titulo: "Your creator earnings",
    taxas: "Trading fees (40%)",
    bonus: "Creator bonus",
    claim: (v: string) => `Claim ${v}`,
    aprovar: "Approve in your wallet…",
    confirmando: "Confirming…",
    feito: "Done! Fees are in your wallet.",
    bonusACaminho: (v: string) => `Your ${v} bonus is on the way — paid in SOL within 7 days.`,
    nada: "Nothing to claim yet — you earn 40% of every trade fee, plus a bonus at each volume goal.",
    falhou: "The claim didn't go through. Nothing was charged — try again.",
    totalGanho: "Earned in total",
    historico: "Claim history",
    anteriores: "Earlier claims",
    semSaques: "No claims yet.",
  },
  pt: {
    titulo: "Seus ganhos de criador",
    taxas: "Taxas de negociação (40%)",
    bonus: "Bônus do criador",
    claim: (v: string) => `Sacar ${v}`,
    aprovar: "Aprove na carteira…",
    confirmando: "Confirmando…",
    feito: "Pronto! As taxas estão na sua carteira.",
    bonusACaminho: (v: string) => `Seu bônus de ${v} está a caminho — pago em SOL em até 7 dias.`,
    nada: "Nada pra sacar ainda — você ganha 40% da taxa de toda negociação, mais um bônus a cada meta de volume.",
    falhou: "O saque não foi. Nada foi cobrado — tente de novo.",
    totalGanho: "Ganho no total",
    historico: "Histórico de saques",
    anteriores: "Saques anteriores",
    semSaques: "Nenhum saque ainda.",
  },
  zh: {
    titulo: "你的创作者收益",
    taxas: "交易手续费（40%）",
    bonus: "创作者奖金",
    claim: (v: string) => `领取 ${v}`,
    aprovar: "请在钱包中确认…",
    confirmando: "确认中…",
    feito: "完成！手续费已到你的钱包。",
    bonusACaminho: (v: string) => `你的 ${v} 奖金正在路上——7 天内以 SOL 支付。`,
    nada: "暂无可领取收益——你可获得每笔交易 40% 的交易费，每个交易量目标还有奖金。",
    falhou: "领取未成功，未产生任何费用——请重试。",
    totalGanho: "累计收益",
    historico: "领取记录",
    anteriores: "更早的领取",
    semSaques: "暂无领取记录。",
  },
});

type Bonus = { conquistadoUsd: number; pagoUsd: number; pedidoUsd: number };
type Historico = { saques: { assinatura: string; sol: number; em: number }[]; sacadoSol: number };

/**
 * Os ganhos do criador numa moeda da Curva da Chroma, num número só (pedido
 * do dono, 03/10/2026: "claim de $150 parece mais grandioso que de $50").
 *
 * - Taxas (40%): ficam na pool e saem na hora, assinadas pelo criador.
 * - Bônus: sai da carteira da Chroma, que não fica no servidor (seria alvo de
 *   invasão). O botão registra o pedido e o dono paga pelo /admin/bonus.
 *
 * Só aparece pra carteira que CRIOU a moeda.
 */
export function GanhosDoCriador({ address }: { address: string }) {
  const t = useTextos(TEXTOS);
  const { connection } = useConnection();
  const { publicKey, signAllTransactions } = useWallet();
  const [dados, setDados] = useState<Awaited<ReturnType<typeof ganhosDoCriador>>>(null);
  const [bonus, setBonus] = useState<Bonus | null>(null);
  const [sol, setSol] = useState(0);
  const [estado, setEstado] = useState<"" | "aprovar" | "confirmando" | "feito" | "falhou">("");
  const [historico, setHistorico] = useState<Historico | null>(null);
  const [verHistorico, setVerHistorico] = useState(false);

  const ler = useCallback(() => {
    ganhosDoCriador(connection, address).then(setDados).catch(() => {});
    fetch(`/api/bonus-criador?address=${address}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setBonus)
      .catch(() => {});
    fetch(`/api/saques-criador?mint=${address}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setHistorico(j))
      .catch(() => {});
    fetch("/api/price?address=So11111111111111111111111111111111111111112")
      .then((r) => r.json())
      .then((j) => setSol(Number(j?.priceUsd) || 0))
      .catch(() => {});
  }, [connection, address]);

  useEffect(() => {
    if (!publicKey) return;
    ler();
    // 15 s: o valor do card não pode ficar pra trás de uma venda recém-feita.
    const id = window.setInterval(ler, 15_000);
    return () => window.clearInterval(id);
  }, [publicKey, ler]);

  if (!publicKey || !dados || dados.criador !== publicKey.toBase58()) return null;

  const taxasUsd = dados.aReceberSol * sol;
  const bonusDisponivel = bonus ? Math.max(0, bonus.conquistadoUsd - bonus.pagoUsd) : 0;
  const bonusJaPedido = bonus ? bonus.pedidoUsd >= bonus.conquistadoUsd && bonusDisponivel > 0 : false;
  const totalUsd = taxasUsd + (bonusJaPedido ? 0 : bonusDisponivel);
  // Total = taxas de criador já sacadas + a sacar, lidas direto da rede. O
  // bônus fica fora: ele é pago à parte e aparece no cartão do bônus.
  const totalGanhoUsd = dados.totalSol * sol;
  const temTaxa = dados.aReceberSol > 0.000001;
  const ocupado = estado === "aprovar" || estado === "confirmando";

  // As taxas guardadas (curva + pool da Meteora, se a moeda já se formou) vão
  // pra carteira. Quem garante que só o criador saca é o programa na rede.
  const sacarTaxas = async () => {
    if (!signAllTransactions) throw new Error("carteira");
    const txs = await transacoesDeSaqueDoCriador(connection, publicKey, address); // já vêm simuladas
    if (!txs.length) throw new Error("simulação");
    const assinadas = await signAllTransactions(txs);
    for (const tx of assinadas) {
      const assinatura = await connection.sendRawTransaction(tx.serialize());
      const r = await connection.confirmTransaction(assinatura, "confirmed");
      if (r.value.err) throw new Error("recusada");
    }
    ler();
  };

  const sacar = async () => {
    try {
      if (temTaxa) {
        setEstado("aprovar");
        await sacarTaxas();
      }
      if (bonusDisponivel > 0 && !bonusJaPedido) {
        await fetch("/api/bonus-criador", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address }),
        });
      }
      setEstado("feito");
      ler();
    } catch {
      setEstado("falhou");
    }
  };

  return (
    <div className="rounded-xl border border-bull/30 bg-ink-900 p-4">
      <p className="text-[12px] font-bold uppercase tracking-wider text-bull">{t.titulo}</p>
      <p className="tnum mt-2 text-[26px] font-black text-zinc-50">{formatUsd(totalUsd)}</p>
      <div className="tnum mt-2 space-y-1 text-[12px]">
        <div className="flex justify-between text-zinc-400">
          <span>{t.taxas}</span>
          <span className="text-zinc-200">{dados.aReceberSol.toFixed(5)} SOL</span>
        </div>
        {bonusDisponivel > 0 && (
          <div className="flex justify-between text-zinc-400">
            <span>{t.bonus}</span>
            <span className="text-zinc-200">{formatUsd(bonusDisponivel)}</span>
          </div>
        )}
      </div>
      <button
        type="button"
        disabled={(!temTaxa && totalUsd < 0.01) || ocupado}
        onClick={sacar}
        className="botao-negocio compra mt-3 inline-flex h-11 w-full items-center justify-center text-[15px]"
      >
        {estado === "aprovar" ? t.aprovar : estado === "confirmando" ? t.confirmando : t.claim(formatUsd(totalUsd))}
      </button>
      <p className="mt-2 text-[11.5px] leading-relaxed text-zinc-500">
        {bonusJaPedido || (estado === "feito" && bonusDisponivel > 0)
          ? t.bonusACaminho(formatUsd(bonusDisponivel))
          : estado === "feito"
            ? t.feito
            : estado === "falhou"
              ? t.falhou
              : !temTaxa && totalUsd < 0.01 && dados.totalSol <= 0
                ? t.nada
                : null}
      </p>
      {dados.totalSol > 0 && (
        <div className="mt-2 rounded-lg border border-bull/20 bg-bull/[0.05] px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[12.5px] font-bold text-zinc-300">{t.totalGanho}</span>
            <span className="tnum text-[17px] font-black text-bull">{dados.totalSol.toFixed(4)} SOL</span>
          </div>
          <p className="tnum text-right text-[12px] text-zinc-400">≈ {formatUsd(totalGanhoUsd)}</p>
          <button
            type="button"
            onClick={() => setVerHistorico((v) => !v)}
            className="mt-1.5 flex w-full items-center justify-between border-t border-white/[0.06] pt-1.5 text-[12px] font-semibold text-zinc-400 hover:text-zinc-200"
          >
            <span>
              {t.historico}
              {historico?.saques.length ? ` (${historico.saques.length})` : ""}
            </span>
            <span>{verHistorico ? "▴" : "▾"}</span>
          </button>
          {verHistorico && <ListaDeSaques historico={historico} sol={sol} t={t} />}
        </div>
      )}
      <SaquePrivado taxasSol={dados.aReceberSol} sacarTaxas={sacarTaxas} />
    </div>
  );
}

function ListaDeSaques({ historico, sol, t }: { historico: Historico | null; sol: number; t: (typeof TEXTOS)[keyof typeof TEXTOS] }) {
  if (!historico) return <p className="mt-1.5 text-[11.5px] text-zinc-500">…</p>;
  const registrado = historico.saques.reduce((s, x) => s + x.sol, 0);
  const anteriores = historico.sacadoSol - registrado;
  if (!historico.saques.length && anteriores < 0.00001) return <p className="mt-1.5 text-[11.5px] text-zinc-500">{t.semSaques}</p>;
  return (
    <ul className="tnum mt-1.5 space-y-1 text-[11.5px]">
      {historico.saques.map((x) => (
        <li key={x.assinatura} className="flex items-center justify-between gap-2 text-zinc-400">
          <span>{new Date(x.em).toLocaleString(undefined, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
          <a
            href={`https://solscan.io/tx/${x.assinatura}`}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-zinc-200 hover:text-bull"
          >
            +{x.sol.toFixed(4)} SOL <span className="text-zinc-500">≈ {formatUsd(x.sol * sol)} ↗</span>
          </a>
        </li>
      ))}
      {anteriores >= 0.00001 && (
        <li className="flex items-center justify-between gap-2 text-zinc-500">
          <span>{t.anteriores}</span>
          <span>+{anteriores.toFixed(4)} SOL</span>
        </li>
      )}
    </ul>
  );
}
