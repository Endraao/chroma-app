"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";
import { ganhosDoCriador, transacaoDeSaqueDoCriador } from "@/lib/meteora-dbc";
import { cn } from "@/lib/utils";

const TEXTOS = traducoes({
  en: {
    titulo: "Your creator earnings",
    aReceber: "Ready to withdraw",
    total: (v: string) => `${v} SOL earned in total`,
    sacar: "Withdraw to my wallet",
    aprovar: "Approve in your wallet…",
    confirmando: "Confirming…",
    feito: "Done! The SOL is in your wallet.",
    nada: "Nothing to withdraw yet — you earn 40% of every trade fee.",
    falhou: "The withdrawal didn't go through. Nothing was charged — try again.",
  },
  pt: {
    titulo: "Seus ganhos de criador",
    aReceber: "Disponível pra sacar",
    total: (v: string) => `${v} SOL ganhos no total`,
    sacar: "Sacar pra minha carteira",
    aprovar: "Aprove na carteira…",
    confirmando: "Confirmando…",
    feito: "Pronto! O SOL está na sua carteira.",
    nada: "Nada pra sacar ainda — você ganha 40% da taxa de toda negociação.",
    falhou: "O saque não foi. Nada foi cobrado — tente de novo.",
  },
  zh: {
    titulo: "你的创作者收益",
    aReceber: "可提取",
    total: (v: string) => `累计收益 ${v} SOL`,
    sacar: "提取到我的钱包",
    aprovar: "请在钱包中确认…",
    confirmando: "确认中…",
    feito: "完成！SOL 已到你的钱包。",
    nada: "暂无可提取收益——你可获得每笔交易 40% 的交易费。",
    falhou: "提取未成功，未产生任何费用——请重试。",
  },
});

/**
 * Saque dos ganhos do criador numa moeda da Curva da Chroma. Só aparece pra
 * carteira que CRIOU a moeda: os 40% da taxa ficam guardados na pool até ela
 * sacar — sem este botão, "você ganha 40%" seria uma promessa sem caminho.
 */
export function GanhosDoCriador({ address }: { address: string }) {
  const t = useTextos(TEXTOS);
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [dados, setDados] = useState<Awaited<ReturnType<typeof ganhosDoCriador>>>(null);
  const [estado, setEstado] = useState<"" | "aprovar" | "confirmando" | "feito" | "falhou">("");

  const ler = useCallback(() => {
    ganhosDoCriador(connection, address)
      .then(setDados)
      .catch(() => {});
  }, [connection, address]);

  useEffect(() => {
    if (!publicKey) return;
    ler();
    const id = window.setInterval(ler, 60_000);
    return () => window.clearInterval(id);
  }, [publicKey, ler]);

  if (!publicKey || !dados || dados.criador !== publicKey.toBase58()) return null;

  const sacar = async () => {
    if (!signTransaction) return;
    try {
      setEstado("aprovar");
      const tx = await transacaoDeSaqueDoCriador(connection, publicKey, dados.pool);
      const sim = await connection.simulateTransaction(tx);
      if (sim.value.err) throw new Error("simulação");
      const assinada = await signTransaction(tx);
      setEstado("confirmando");
      const assinatura = await connection.sendRawTransaction(assinada.serialize());
      const r = await connection.confirmTransaction(assinatura, "confirmed");
      if (r.value.err) throw new Error("recusada");
      setEstado("feito");
      ler();
    } catch {
      setEstado("falhou");
    }
  };

  const temSaldo = dados.aReceberSol > 0.000001;
  const ocupado = estado === "aprovar" || estado === "confirmando";

  return (
    <div className="rounded-xl border border-bull/30 bg-ink-900 p-4">
      <p className="text-[12px] font-bold uppercase tracking-wider text-bull">{t.titulo}</p>
      <p className="tnum mt-2 text-[22px] font-black text-zinc-50">{dados.aReceberSol.toFixed(6)} SOL</p>
      <p className="text-[11px] text-zinc-500">
        {t.aReceber} · {t.total(dados.totalSol.toFixed(6))}
      </p>
      <button
        type="button"
        disabled={!temSaldo || ocupado}
        onClick={sacar}
        className={cn("botao-negocio compra mt-3 inline-flex h-10 w-full items-center justify-center text-[14px]")}
      >
        {estado === "aprovar" ? t.aprovar : estado === "confirmando" ? t.confirmando : t.sacar}
      </button>
      <p className="mt-2 text-[11.5px] text-zinc-500">
        {estado === "feito" ? t.feito : estado === "falhou" ? t.falhou : !temSaldo ? t.nada : ""}
      </p>
    </div>
  );
}
