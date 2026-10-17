"use client";
import { Preco } from "@/components/ui/Preco";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAccount } from "wagmi";

import { TabelaDeTraders } from "@/components/trading/TabelaDeTraders";
import { usePrecoNativo } from "@/hooks/usePrecoNativo";
import { CHAINS } from "@/lib/web3";
import { cn, formatPrice, formatUsd, shortenAddress, timeAgo } from "@/lib/utils";
import { EVENTO_NEGOCIO, type NegocioRecente } from "@/lib/posicoes-locais";
import type { ChainId } from "@/lib/types";

interface Negocio {
  carteira: string;
  lado: "compra" | "venda";
  tokens: number;
  usd: number;
  em: number;
  txHash: string;
}

// 3 s: os negócios vêm direto da rede agora (07/10/2026) — a lista acompanha o mercado.
const RECARREGA_MS = 4_000;

const TEXTOS = traducoes({
  en: { transacoes: "Transactions", traders: "Traders", aoVivo: "live", carregando: "Loading…", nenhum: "No trades yet. The first one could be yours.", quando: "Time", lado: "Side", trader: "Trader", preco: "Price", compra: "Buy", venda: "Sell", todas: "All", compras: "Buys", vendas: "Sells", grandes: "≥ $100", minhas: "Mine", voce: "YOU", mc: "MC", valor: "Value", nenhumFiltro: "No trades match this filter." },
  pt: { transacoes: "Transações", traders: "Traders", aoVivo: "ao vivo", carregando: "Carregando…", nenhum: "Nenhum negócio ainda. O primeiro pode ser o seu.", quando: "Quando", lado: "Lado", trader: "Trader", preco: "Preço", compra: "Compra", venda: "Venda", todas: "Todas", compras: "Compras", vendas: "Vendas", grandes: "≥ $100", minhas: "Minhas", voce: "VOCÊ", mc: "MC", valor: "Valor", nenhumFiltro: "Nenhum negócio com esse filtro." },
  zh: { transacoes: "交易记录", traders: "交易者", aoVivo: "实时", carregando: "加载中…", nenhum: "还没有交易。第一笔可能就是你的。", quando: "时间", lado: "方向", trader: "交易者", preco: "价格", compra: "买入", venda: "卖出", todas: "全部", compras: "买入", vendas: "卖出", grandes: "≥ $100", minhas: "我的", voce: "你", mc: "市值", valor: "金额", nenhumFiltro: "没有符合筛选条件的交易。" },
});

/**
 * Abas embaixo do gráfico: os negócios ao vivo e quem está na moeda.
 *
 * Formato pedido pelo dono em 28/09/2026 (referência: página de moeda da
 * PEAR). A aba de transações é a que prova que a moeda está VIVA — quem
 * chega vê gente comprando e vendendo agora, não só um número de volume.
 */
export function PainelDeAtividade({
  address,
  symbol,
  chain,
  fornecimento = 0,
}: {
  address: string;
  symbol: string;
  chain: ChainId;
  /** Fornecimento da moeda, pra mostrar o market cap de cada negócio. */
  fornecimento?: number;
}) {
  const t = useTextos(TEXTOS);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const { publicKey } = useWallet();
  const { address: carteiraEvm } = useAccount();
  const minha = (chain === "solana" ? publicKey?.toBase58() : carteiraEvm)?.toLowerCase() ?? null;
  const [aba, setAba] = useState<"negocios" | "holders">("negocios");
  const [negocios, setNegocios] = useState<Negocio[] | null>(null);
  const [total, setTotal] = useState(0);
  // Negócios que a PRÓPRIA pessoa acabou de fazer, antes de os índices mostrarem.
  const [recentes, setRecentes] = useState<Negocio[]>([]);
  const [lerAgora, setLerAgora] = useState(0);
  const precoNativo = usePrecoNativo(chain);
  const meta = CHAINS[chain];

  useEffect(() => {
    let cancelado = false;
    const ler = async () => {
      try {
        const r = await fetch(`/api/negocios?address=${address}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { negocios: Negocio[]; total: number };
        if (!cancelado) {
          setNegocios(j.negocios);
          setTotal(j.total);
        }
      } catch {
        /* rede oscilou: fica a última lista */
      }
    };
    void ler();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void ler();
    }, RECARREGA_MS);
    return () => {
      cancelado = true;
      window.clearInterval(id);
    };
  }, [address, lerAgora]);

  /*
   * A negociação feita aqui entra na lista na hora, com o que o recibo sabe;
   * a lista pública é relida algumas vezes logo depois e assume o lugar
   * quando a negociação aparece nela.
   */
  useEffect(() => {
    const aoNegociar = (e: Event) => {
      const n = (e as CustomEvent<NegocioRecente>).detail;
      if (!n || n.moeda.toLowerCase() !== address.toLowerCase()) return;
      setRecentes((r) => [
        { carteira: n.carteira, lado: n.lado === "buy" ? "compra" : "venda", tokens: n.tokens, usd: n.usd, em: Date.now(), txHash: n.hash },
        ...r,
      ]);
      for (const ms of [4_000, 12_000, 25_000, 45_000]) window.setTimeout(() => setLerAgora((v) => v + 1), ms);
    };
    window.addEventListener(EVENTO_NEGOCIO, aoNegociar);
    return () => window.removeEventListener(EVENTO_NEGOCIO, aoNegociar);
  }, [address]);

  const jaListados = new Set((negocios ?? []).map((n) => n.txHash));
  const pendentes = recentes.filter((r) => !jaListados.has(r.txHash) && Date.now() - r.em < 3 * 60_000);
  const lista = negocios === null && pendentes.length === 0 ? null : [...pendentes, ...(negocios ?? [])];

  const linkDaTx = (hash: string) => `${meta.explorer.replace(/\/token\/$/, "/tx/")}${hash}`;

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900">
      {/* Abas */}
      <div className="flex items-center gap-1 border-b border-ink-700 px-3">
        <Aba ativa={aba === "negocios"} onClick={() => setAba("negocios")}>
          {t.transacoes} {total + pendentes.length > 0 && <Contador>{total + pendentes.length}</Contador>}
        </Aba>
        <Aba ativa={aba === "holders"} onClick={() => setAba("holders")}>
          {t.traders}
        </Aba>
        {aba === "negocios" && (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-zinc-500">
            <span className="size-1.5 animate-pulse rounded-full bg-bull" /> {t.aoVivo}
          </span>
        )}
      </div>

      {aba === "holders" ? (
        <div className="p-1">
          <TabelaDeTraders address={address} symbol={symbol} chain={chain} />
        </div>
      ) : lista === null ? (
        <p className="px-4 py-10 text-center text-[13px] text-zinc-600">{t.carregando}</p>
      ) : lista.length === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] text-zinc-600">
          {t.nenhum}
        </p>
      ) : (
        <ListaDeNegocios
          lista={lista}
          filtro={filtro}
          setFiltro={setFiltro}
          minha={minha}
          symbol={symbol}
          precoNativo={precoNativo}
          simboloNativo={meta.nativeSymbol}
          fornecimento={fornecimento}
          linkDaTx={linkDaTx}
          linkDaCarteira={(c) => `${meta.explorer.replace(/\/token\/$/, "")}/${meta.kind === "solana" ? "account" : "address"}/${c}`}
        />
      )}
    </div>
  );
}

function compacto(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(2);
}

function Aba({
  ativa,
  onClick,
  children,
}: {
  ativa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-3 text-[13px] font-semibold transition-colors",
        ativa ? "border-marca text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-200",
      )}
    >
      {children}
    </button>
  );
}

function Contador({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-ink-600 px-1.5 text-[10px] font-bold text-zinc-400">
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*
 * A LISTA DE NEGÓCIOS no molde da Fomo (17/10/2026: "arruma a tela de
 * transações também"). Em vez de uma planilha com hash de transação e preço
 * de 10 casas, cada linha diz o que importa de relance: quem, comprou ou
 * vendeu, quanto em dólar (grande e colorido) e a que market cap. A linha
 * inteira abre a transação no explorador. Filtros pra achar as compras, as
 * vendas, os negócios grandes e os seus.
 */
type Filtro = "todas" | "compras" | "vendas" | "grandes" | "minhas";

function ListaDeNegocios({
  lista,
  filtro,
  setFiltro,
  minha,
  symbol,
  precoNativo,
  simboloNativo,
  fornecimento,
  linkDaTx,
  linkDaCarteira,
}: {
  lista: Negocio[];
  filtro: Filtro;
  setFiltro: (f: Filtro) => void;
  minha: string | null;
  symbol: string;
  precoNativo: number | null;
  simboloNativo: string;
  fornecimento: number;
  linkDaTx: (hash: string) => string;
  linkDaCarteira: (carteira: string) => string;
}) {
  const t = useTextos(TEXTOS);
  /*
   * Quais negócios já estavam na tela. Só os que chegam DEPOIS da primeira
   * leitura ganham o efeito de entrada — senão a lista inteira "chegaria" ao
   * abrir a página. A linha é montada uma vez (chave estável), então o efeito
   * roda uma vez e não repete quando a lista atualiza.
   */
  const vistosRef = useRef<Set<string> | null>(null);
  const chave = (n: Negocio) => n.txHash + n.lado + n.tokens;
  /*
   * O destaque dura 2,5 s mesmo que a lista atualize no meio (ela atualiza a
   * cada 4 s): sem guardar, a próxima renderização tirava a classe e cortava
   * o efeito pela metade. Marcado num efeito de LAYOUT (antes de pintar a
   * tela), pra linha nova já nascer com a animação — sem aparecer parada
   * por um quadro antes de deslizar.
   */
  const [destaques, setDestaques] = useState<Set<string>>(() => new Set());
  const novos = destaques;
  useLayoutEffect(() => {
    if (!vistosRef.current) {
      vistosRef.current = new Set(lista.map(chave));
      return;
    }
    const vistos = vistosRef.current;
    const chegaram = lista.map(chave).filter((k) => !vistos.has(k));
    if (!chegaram.length) return;
    chegaram.forEach((k) => vistos.add(k));
    setDestaques((d) => new Set([...d, ...chegaram]));
    window.setTimeout(() => {
      setDestaques((d) => {
        const resto = new Set(d);
        chegaram.forEach((k) => resto.delete(k));
        return resto;
      });
    }, 2_500);
  });
  const filtrada = lista.filter((n) => {
    if (filtro === "compras") return n.lado === "compra";
    if (filtro === "vendas") return n.lado === "venda";
    if (filtro === "grandes") return n.usd >= 100;
    if (filtro === "minhas") return minha !== null && n.carteira.toLowerCase() === minha;
    return true;
  });
  const filtros: Filtro[] = minha ? ["todas", "compras", "vendas", "grandes", "minhas"] : ["todas", "compras", "vendas", "grandes"];

  return (
    <>
      <div className="flex gap-1 overflow-x-auto border-b border-ink-700/60 px-3 py-2 [scrollbar-width:none]">
        {filtros.map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={cn(
              "fx-aperto shrink-0 rounded-full px-3 py-1 text-[11.5px] font-semibold",
              filtro === f ? "bg-white/[0.08] text-zinc-50" : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            {t[f]}
          </button>
        ))}
      </div>

      {filtrada.length === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] text-zinc-600">{t.nenhumFiltro}</p>
      ) : (
        <ul className="tnum">
          {filtrada.slice(0, 40).map((n) => {
            const compra = n.lado === "compra";
            const eu = minha !== null && n.carteira.toLowerCase() === minha;
            const novo = novos.has(chave(n));
            const preco = n.tokens > 0 ? n.usd / n.tokens : 0;
            const mc = fornecimento > 0 ? preco * fornecimento : 0;
            return (
              <li
                key={chave(n)}
                className={cn(
                  "group relative flex items-center gap-3 border-b border-ink-700/40 px-3 py-2 transition-colors last:border-0 hover:bg-white/[0.03]",
                  eu && "bg-marca/[0.06]",
                  novo && (compra ? "fx-entrar-compra" : "fx-entrar-venda"),
                )}
              >
                {/* faixa lateral na cor do lado */}
                <span className={cn("absolute inset-y-1 left-0 w-0.5 rounded-full", compra ? "bg-bull/70" : "bg-bear/70")} />
                <span className="w-9 shrink-0 text-[11px] text-zinc-500">{timeAgo(n.em)}</span>

                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Bolinha carteira={n.carteira} />
                  <a href={linkDaCarteira(n.carteira)} target="_blank" rel="noopener noreferrer" className="truncate text-[12.5px] font-semibold text-zinc-200 hover:text-marca">
                    {shortenAddress(n.carteira, 4)}
                  </a>
                  {eu && <span className="rounded bg-marca/15 px-1.5 py-px text-[9.5px] font-black tracking-wider text-marca">{t.voce}</span>}
                  {n.usd >= 500 && <span title="whale">🐋</span>}
                </div>

                <div className={cn("w-[96px] shrink-0 text-right text-[13.5px] font-black", compra ? "text-bull" : "text-bear")}>
                  {compra ? "+" : "-"}
                  {formatUsd(n.usd)}
                  <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{compra ? t.compra : t.venda}</div>
                </div>

                <div className="hidden w-[92px] shrink-0 text-right text-[11.5px] leading-tight text-zinc-400 sm:block">
                  {compacto(n.tokens)} <span className="text-zinc-600">{symbol}</span>
                  <div className="text-zinc-500">
                    {precoNativo ? (n.usd / precoNativo).toFixed(3) : "—"} {simboloNativo}
                  </div>
                </div>

                <div className="hidden w-[78px] shrink-0 text-right text-[11.5px] text-zinc-400 md:block">
                  {mc > 0 ? (
                    <>
                      <span className="text-zinc-600">{t.mc} </span>
                      {formatUsd(mc)}
                    </>
                  ) : (
                    <>
                      $<Preco valor={preco} />
                    </>
                  )}
                </div>

                <a
                  href={linkDaTx(n.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="tx"
                  className="shrink-0 text-[13px] text-zinc-600 transition-colors group-hover:text-marca"
                >
                  ↗
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/** Bolinha de cor derivada do endereço — a mesma da aba de holders. */
function Bolinha({ carteira }: { carteira: string }) {
  let h = 0;
  for (let i = 0; i < carteira.length; i++) h = (h * 31 + carteira.charCodeAt(i)) >>> 0;
  const matiz = h % 360;
  return (
    <span
      aria-hidden
      className="size-5 shrink-0 rounded-full"
      style={{ background: `linear-gradient(135deg, hsl(${matiz} 58% 52%), hsl(${(matiz + 48) % 360} 58% 38%))` }}
    />
  );
}
