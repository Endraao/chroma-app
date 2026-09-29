"use client";

import { useEffect, useState } from "react";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";
import type { TokenSummary } from "@/lib/types";
import { cn, formatUsd } from "@/lib/utils";
import { CHAINS } from "@/lib/web3";

const TEXTOS = traducoes({
  en: { sobre: "About", compras: "buys", vendas: "sells", vol: "vol.", compradores: "buyers", vendedores: "sellers", site: "Site", buscar: "Search on", verMais: "Show more", verMenos: "Show less" },
  pt: { sobre: "Sobre", compras: "compras", vendas: "vendas", vol: "vol.", compradores: "compradores", vendedores: "vendedores", site: "Site", buscar: "Buscar no", verMais: "Ver mais", verMenos: "Ver menos" },
  zh: { sobre: "关于", compras: "买入", vendas: "卖出", vol: "交易量", compradores: "买家", vendedores: "卖家", site: "官网", buscar: "搜索于", verMais: "展开", verMenos: "收起" },
});

type Janela = "m5" | "h1" | "h6" | "h24";
const JANELAS: { chave: Janela; rotulo: string }[] = [
  { chave: "m5", rotulo: "5M" },
  { chave: "h1", rotulo: "1H" },
  { chave: "h6", rotulo: "6H" },
  { chave: "h24", rotulo: "1D" },
];

interface Estatisticas {
  variacao: Partial<Record<Janela, number>>;
  transacoes: Partial<Record<Janela, { buys: number; sells: number; buyers: number; sellers: number }>>;
  volume: Partial<Record<Janela, number>>;
}

/**
 * "Sobre" no formato da Fomo Family: variação por janela, compras × vendas,
 * volume, compradores × vendedores e os links da moeda. Lido direto da
 * GeckoTerminal pelo navegador (cada visitante tem o próprio limite).
 */
export function PainelSobre({ token }: { token: TokenSummary }) {
  const t = useTextos(TEXTOS);
  const [janela, setJanela] = useState<Janela>("h24");
  const [dados, setDados] = useState<Estatisticas | null>(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    const rede = CHAINS[token.chain]?.gecko;
    if (!token.pairAddress || !rede) return;
    let cancelado = false;
    const ler = async () => {
      try {
        const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/${rede}/pools/${token.pairAddress}`, {
          headers: { accept: "application/json" },
        });
        if (!r.ok) return;
        const a = (await r.json()).data?.attributes;
        if (!a || cancelado) return;
        const num = (o: Record<string, string> | undefined) =>
          Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, Number(v)]));
        setDados({ variacao: num(a.price_change_percentage), transacoes: a.transactions ?? {}, volume: num(a.volume_usd) });
      } catch {
        /* sem estatística, o painel mostra só os links */
      }
    };
    void ler();
    const id = window.setInterval(ler, 30_000);
    return () => {
      cancelado = true;
      window.clearInterval(id);
    };
  }, [token.chain, token.pairAddress]);

  const tx = dados?.transacoes[janela];
  const buscaNoX = `https://x.com/search?q=${encodeURIComponent(`${token.address} OR $${token.symbol}`)}&f=live`;

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-4">
      <p className="text-[16px] font-black tracking-tight text-zinc-50">
        {t.sobre} {token.symbol}
      </p>
      <p className="text-[12.5px] text-zinc-500">{token.name}</p>

      {dados && (
        <>
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {JANELAS.map(({ chave, rotulo }) => {
              const v = dados.variacao[chave] ?? 0;
              return (
                <button
                  key={chave}
                  onClick={() => setJanela(chave)}
                  className={cn(
                    "rounded-lg border px-1 py-1.5 text-center transition-colors",
                    janela === chave ? "border-ink-500 bg-ink-700" : "border-ink-700 hover:border-ink-600",
                  )}
                >
                  <div className="text-[11px] text-zinc-400">{rotulo}</div>
                  <div className={cn("tnum text-[12px] font-bold", v >= 0 ? "text-bull" : "text-bear")}>
                    {v >= 0 ? "▲" : "▼"} {Math.abs(v).toFixed(2)}%
                  </div>
                </button>
              );
            })}
          </div>

          {tx && (
            <div className="mt-3 space-y-2.5">
              <Barra esquerda={`${tx.buys}`} rotuloE={t.compras} direita={`${tx.sells}`} rotuloD={t.vendas} a={tx.buys} b={tx.sells} />
              <div className="tnum text-[13px]">
                <span className="font-bold text-zinc-100">{formatUsd(dados.volume[janela] ?? 0)}</span>{" "}
                <span className="text-zinc-500">{t.vol}</span>
              </div>
              <Barra esquerda={`${tx.buyers}`} rotuloE={t.compradores} direita={`${tx.sellers}`} rotuloD={t.vendedores} a={tx.buyers} b={tx.sellers} />
            </div>
          )}
        </>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {token.website && <Pilula href={token.website} icone={<IconeSite />} rotulo={t.site} />}
        {token.twitter && <Pilula href={token.twitter} icone={<IconeX />} rotulo="Twitter" />}
        {token.telegram && <Pilula href={token.telegram} icone={<IconeTelegram />} rotulo="Telegram" />}
        <Pilula href={buscaNoX} rotulo={t.buscar} depois={<IconeX />} />
      </div>

      {token.description && (
        <>
          <p className={cn("mt-3 text-[12px] leading-relaxed text-zinc-500", !aberto && "line-clamp-2")}>{token.description}</p>
          {token.description.length > 110 && (
            <button onClick={() => setAberto((v) => !v)} className="mx-auto mt-1 block rounded-md bg-ink-800 px-2 py-0.5 text-[11px] text-zinc-400 hover:text-zinc-200">
              {aberto ? t.verMenos : t.verMais}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Barra({ esquerda, rotuloE, direita, rotuloD, a, b }: { esquerda: string; rotuloE: string; direita: string; rotuloD: string; a: number; b: number }) {
  const total = a + b || 1;
  return (
    <div>
      <div className="tnum flex justify-between text-[13px]">
        <span><b className="text-zinc-100">{esquerda}</b> <span className="text-zinc-500">{rotuloE}</span></span>
        <span><b className="text-zinc-100">{direita}</b> <span className="text-zinc-500">{rotuloD}</span></span>
      </div>
      <div className="mt-1 flex h-1.5 gap-1">
        <div className="rounded-full bg-bull" style={{ width: `${(a / total) * 100}%` }} />
        <div className="rounded-full bg-bear" style={{ width: `${(b / total) * 100}%` }} />
      </div>
    </div>
  );
}

function Pilula({ href, rotulo, icone, depois }: { href: string; rotulo: string; icone?: React.ReactNode; depois?: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-ink-600 bg-ink-800 px-2.5 py-1.5 text-[12.5px] font-semibold text-zinc-200 transition-colors hover:border-ink-500 hover:text-white"
    >
      {icone}
      {rotulo}
      {depois}
    </a>
  );
}

function IconeSite() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
    </svg>
  );
}

function IconeX() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function IconeTelegram() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
      <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
    </svg>
  );
}
