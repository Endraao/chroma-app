"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";
import { CA_DO_CHROMA, LANCAMENTO_DO_CHROMA } from "@/lib/token-oficial";

/**
 * Contagem regressiva do relançamento do $CHROMA (pedido do dono, 12/10/2026):
 * na pump.fun, pelo site da Chroma, quinta 15/10 às 11h de Brasília. Some
 * sozinha quando o endereço novo é posto em lib/token-oficial.ts.
 */
const TEXTOS = traducoes({
  en: {
    selo: "$CHROMA relaunch",
    titulo: "The new $CHROMA launches on Solana",
    sub: "25% of Chroma's revenue buys back $CHROMA every week, with every receipt posted on X. Fair launch on pump.fun.",
    agora: "Launching now — follow @ChromaLaunch for the address",
    dias: "d",
  },
  pt: {
    selo: "Relançamento do $CHROMA",
    titulo: "O novo $CHROMA nasce na Solana",
    sub: "25% da receita da Chroma recompra $CHROMA toda semana, com cada recibo postado no X. Lançamento justo na pump.fun.",
    agora: "Lançando agora — siga @ChromaLaunch pra pegar o endereço",
    dias: "d",
  },
  zh: {
    selo: "$CHROMA 重新发行",
    titulo: "全新 $CHROMA 在 Solana 发行",
    sub: "Chroma 每周用 25% 的收入回购 $CHROMA，每笔回购凭证都会发布在 X 上。在 pump.fun 公平发行。",
    agora: "正在发行——关注 @ChromaLaunch 获取地址",
    dias: "天",
  },
});

const dois = (n: number) => String(n).padStart(2, "0");

export function ContagemChroma() {
  const t = useTextos(TEXTOS);
  const alvo = new Date(LANCAMENTO_DO_CHROMA).getTime();
  const [agora, setAgora] = useState<number | null>(null);

  useEffect(() => {
    setAgora(Date.now());
    const id = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Já tem endereço novo: o selo do token oficial assume.
  if (CA_DO_CHROMA) return null;

  const falta = agora === null ? null : Math.max(0, alvo - agora);
  const quando = new Date(alvo).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <a
      href="https://x.com/ChromaLaunch"
      target="_blank"
      rel="noopener noreferrer"
      className="promo-card group block"
    >
      <div className="promo-card-dentro flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <Image src="/logo.png" alt="" width={56} height={56} className="hidden shrink-0 sm:block" />
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-marca/15 px-2.5 py-0.5 text-[10.5px] font-black uppercase tracking-[0.14em] text-marca">
              <span className="size-1.5 animate-pulse rounded-full bg-marca" />
              {t.selo}
            </span>
            <p className="mt-2 text-[22px] font-black leading-tight text-zinc-50 sm:text-[24px]">{t.titulo}</p>
            <p className="mt-1 text-[13px] text-zinc-400">{t.sub}</p>
          </div>
        </div>
        <div className="shrink-0 text-left sm:text-right">
          {falta === 0 ? (
            <p className="text-[15px] font-black text-marca">{t.agora}</p>
          ) : (
            <>
              <p className="tnum text-[30px] font-black leading-none text-marca">
                {falta === null
                  ? "—"
                  : `${Math.floor(falta / 86_400_000)}${t.dias} ${dois(Math.floor(falta / 3_600_000) % 24)}:${dois(Math.floor(falta / 60_000) % 60)}:${dois(Math.floor(falta / 1000) % 60)}`}
              </p>
              <p className="mt-1.5 text-[12px] text-zinc-400">{quando}</p>
            </>
          )}
        </div>
      </div>
    </a>
  );
}
