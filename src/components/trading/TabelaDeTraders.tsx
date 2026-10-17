"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

import { useTextos } from "@/components/IdiomaProvider";
import { Card } from "@/components/ui/Card";
import { traducoes } from "@/lib/idiomas";
import { CHAINS } from "@/lib/web3";
import { cn, formatUsd, shortenAddress, timeAgo } from "@/lib/utils";
import type { ChainId } from "@/lib/types";

/**
 * Holders e traders da moeda — refeita no molde da Fomo Family (17/10/2026:
 * "nossa tela de traders é horrível").
 *
 * Duas abas:
 *   - HOLDERS: quem segura AGORA, lido da rede (as 20 maiores contas), com o
 *     valor em dólar, a fatia do fornecimento e o que cada conta é — carteira,
 *     curva, pool ou o DEV. É a pergunta que importa antes de comprar.
 *   - TOP TRADERS: quem mais lucrou/investiu nos últimos negócios do par. A
 *     janela (ex.: "300 negócios · 3 min") fica num selo com a explicação no
 *     título — antes era um parágrafo inteiro em cima da tabela.
 *
 * "—" no lucro continua querendo dizer "não sabemos" (comprou antes da janela),
 * nunca zero.
 */

interface Trader {
  carteira: string;
  saldo: number;
  pctDoFornecimento: number;
  investidoUsd: number;
  recebidoUsd: number;
  lucroUsd: number | null;
  negocios: number;
  compras: number;
  vendas: number;
  vindoDeAntes: boolean;
  ultimoEm: number;
}

interface QuadroTraders {
  lista: Trader[];
  negociosLidos: number;
  desde: number | null;
  ate: number | null;
}

type TipoDeHolder = "carteira" | "curva" | "pool" | "contrato";

interface Holder {
  carteira: string;
  quantidade: number;
  pct: number;
  tipo: TipoDeHolder;
  dev: boolean;
}

interface QuadroHolders {
  lista: Holder[];
  top10Pct: number;
  devPct: number | null;
  precoUsd: number;
  totalDeHolders: number;
}

type Aba = "holders" | "traders";
type Ordem = "lucro" | "investido";

const INTERVALO_MS = 30_000;
const PRIMEIRA_LEVA = 15;

const TEXTOS = traducoes({
  en: {
    holders: "Holders", traders: "Top traders", top10: "Top 10", dev: "Dev", lucro: "PnL", investido: "Invested",
    comprou: "Bought", vendeu: "Sold", voce: "YOU", curva: "CURVE", pool: "POOL", contrato: "CONTRACT", devSelo: "DEV",
    janela: (n: number, dur: string) => `last ${n} trades · ${dur}`,
    janelaDica: "Profit is calculated over this pair's recent trades only, not the wallet's full history.",
    compras: (c: number, v: number) => `${c} buy${c === 1 ? "" : "s"} · ${v} sell${v === 1 ? "" : "s"}`,
    desconhecido: "Bought before this window: the price paid is unknown.",
    carregando: "Loading…", falhou: "Could not load this right now. Retrying shortly.", vazio: "Nothing to show yet.",
    mais: (n: number) => `Show ${n} more`, menos: "Show less", soNaSolana: "Live holders are available for Solana coins.",
  },
  pt: {
    holders: "Holders", traders: "Top traders", top10: "Top 10", dev: "Dev", lucro: "Lucro", investido: "Investido",
    comprou: "Comprou", vendeu: "Vendeu", voce: "VOCÊ", curva: "CURVA", pool: "POOL", contrato: "CONTRATO", devSelo: "DEV",
    janela: (n: number, dur: string) => `últimos ${n} negócios · ${dur}`,
    janelaDica: "O lucro é calculado só sobre os negócios recentes deste par, não sobre o histórico inteiro da carteira.",
    compras: (c: number, v: number) => `${c} compra${c === 1 ? "" : "s"} · ${v} venda${v === 1 ? "" : "s"}`,
    desconhecido: "Comprou antes desta janela: o preço que pagou é desconhecido.",
    carregando: "Carregando…", falhou: "Não deu pra carregar agora. Tentando de novo em instantes.", vazio: "Nada pra mostrar ainda.",
    mais: (n: number) => `Mostrar mais ${n}`, menos: "Mostrar menos", soNaSolana: "Holders ao vivo estão disponíveis para moedas da Solana.",
  },
  zh: {
    holders: "持有者", traders: "顶级交易者", top10: "前 10", dev: "开发者", lucro: "盈亏", investido: "投入",
    comprou: "买入", vendeu: "卖出", voce: "你", curva: "曲线", pool: "池子", contrato: "合约", devSelo: "开发者",
    janela: (n: number, dur: string) => `最近 ${n} 笔交易 · ${dur}`,
    janelaDica: "盈亏只按该交易对最近的交易计算，不是钱包的完整历史。",
    compras: (c: number, v: number) => `${c} 买 · ${v} 卖`,
    desconhecido: "在此时间段之前买入：买入价格未知。",
    carregando: "加载中…", falhou: "暂时无法加载，稍后自动重试。", vazio: "暂无数据。",
    mais: (n: number) => `再显示 ${n} 个`, menos: "收起", soNaSolana: "实时持有者仅适用于 Solana 代币。",
  },
});

/** Lê uma rota a cada 30 s, mantendo o último dado bom se uma leitura falhar. */
function useLeitura<T>(url: string | null): { dados: T | null; falhou: boolean } {
  const [dados, setDados] = useState<T | null>(null);
  const [falhou, setFalhou] = useState(false);
  useEffect(() => {
    setDados(null);
    setFalhou(false);
    if (!url) return;
    let cancelado = false;
    const ler = async () => {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as T;
        if (!cancelado) {
          setDados(j);
          setFalhou(false);
        }
      } catch {
        if (!cancelado) setFalhou(true);
      }
    };
    void ler();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void ler();
    }, INTERVALO_MS);
    return () => {
      cancelado = true;
      window.clearInterval(id);
    };
  }, [url]);
  return { dados, falhou };
}

export function TabelaDeTraders({ address, symbol, chain }: { address: string; symbol: string; chain: ChainId }) {
  const t = useTextos(TEXTOS);
  const solana = chain === "solana";
  const [aba, setAba] = useState<Aba>(solana ? "holders" : "traders");
  const [ordem, setOrdem] = useState<Ordem>("lucro");
  const [todos, setTodos] = useState(false);
  const { publicKey } = useWallet();
  const minha = publicKey?.toBase58() ?? null;

  const traders = useLeitura<QuadroTraders>(`/api/traders?address=${address}`);
  const holders = useLeitura<QuadroHolders>(solana ? `/api/holders?address=${address}` : null);

  // O lucro da janela entra também na aba de holders, quando a carteira negociou nela.
  const lucroPorCarteira = new Map((traders.dados?.lista ?? []).map((tr) => [tr.carteira, tr]));

  const trocar = (nova: Aba) => {
    setAba(nova);
    setTodos(false);
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-700 px-3 py-2.5">
        <div className="flex gap-1 rounded-lg bg-white/[0.03] p-0.5">
          {solana && (
            <Aba ativa={aba === "holders"} onClick={() => trocar("holders")}>
              {t.holders}
              {holders.dados?.totalDeHolders ? (
                <span className="ml-1.5 text-zinc-500">{holders.dados.totalDeHolders.toLocaleString("en-US")}</span>
              ) : null}
            </Aba>
          )}
          <Aba ativa={aba === "traders"} onClick={() => trocar("traders")}>
            {t.traders}
          </Aba>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5 text-[11px]">
          {aba === "holders" && holders.dados && (
            <>
              <Selo tom={holders.dados.top10Pct >= 50 ? "ruim" : holders.dados.top10Pct >= 30 ? "medio" : "bom"}>
                {t.top10} {holders.dados.top10Pct.toFixed(1)}%
              </Selo>
              {holders.dados.devPct !== null && (
                <Selo tom={holders.dados.devPct >= 5 ? "ruim" : holders.dados.devPct >= 2 ? "medio" : "bom"}>
                  {t.dev} {holders.dados.devPct.toFixed(1)}%
                </Selo>
              )}
            </>
          )}
          {aba === "traders" && (
            <>
              {traders.dados?.desde && traders.dados.ate ? (
                <span title={t.janelaDica} className="cursor-help rounded-full border border-white/[0.08] px-2 py-0.5 text-zinc-500">
                  {t.janela(traders.dados.negociosLidos, duracao(traders.dados.desde, traders.dados.ate))}
                </span>
              ) : null}
              <div className="flex gap-1">
                {(["lucro", "investido"] as const).map((o) => (
                  <button
                    key={o}
                    onClick={() => setOrdem(o)}
                    className={cn(
                      "rounded-md px-2 py-0.5 font-semibold transition-colors",
                      ordem === o ? "bg-white/[0.08] text-zinc-100" : "text-zinc-500 hover:text-zinc-300",
                    )}
                  >
                    {o === "lucro" ? t.lucro : t.investido}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {aba === "holders" ? (
        <ListaDeHolders
          quadro={holders.dados}
          falhou={holders.falhou}
          chain={chain}
          symbol={symbol}
          minha={minha}
          lucroPorCarteira={lucroPorCarteira}
          todos={todos}
          setTodos={setTodos}
        />
      ) : (
        <ListaDeTraders quadro={traders.dados} falhou={traders.falhou} chain={chain} minha={minha} ordem={ordem} todos={todos} setTodos={setTodos} />
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function ListaDeHolders({
  quadro,
  falhou,
  chain,
  symbol,
  minha,
  lucroPorCarteira,
  todos,
  setTodos,
}: {
  quadro: QuadroHolders | null;
  falhou: boolean;
  chain: ChainId;
  symbol: string;
  minha: string | null;
  lucroPorCarteira: Map<string, Trader>;
  todos: boolean;
  setTodos: (v: boolean) => void;
}) {
  const t = useTextos(TEXTOS);
  if (!quadro) return falhou ? <Aviso>{t.falhou}</Aviso> : <Esqueleto />;
  if (!quadro.lista.length) return <Aviso>{t.vazio}</Aviso>;

  const lista = todos ? quadro.lista : quadro.lista.slice(0, PRIMEIRA_LEVA);
  const maiorPct = quadro.lista.reduce((m, h) => Math.max(m, h.pct), 0);

  return (
    <>
      <ul>
        {lista.map((h, i) => {
          const tr = lucroPorCarteira.get(h.carteira);
          const valor = h.quantidade * quadro.precoUsd;
          const naoEhCarteira = h.tipo !== "carteira";
          return (
            <li
              key={h.carteira}
              className={cn(
                "flex items-center gap-3 border-b border-ink-700/60 px-3 py-2.5 last:border-0",
                "fx-surgir",
                h.carteira === minha && "bg-marca/[0.06]",
                naoEhCarteira && "opacity-75",
              )}
              style={{ animationDelay: `${Math.min(i, 14) * 25}ms` }}
            >
              <span className="tnum w-5 shrink-0 text-right text-[11px] text-zinc-600">{i + 1}</span>
              <Identicon carteira={h.carteira} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <a href={linkDaCarteira(chain, h.carteira)} target="_blank" rel="noreferrer" className="tnum text-[13px] font-semibold text-zinc-100 hover:text-marca">
                    {shortenAddress(h.carteira, 4)}
                  </a>
                  {h.carteira === minha && <Marca cor="marca">{t.voce}</Marca>}
                  {h.dev && <Marca cor="ambar">{t.devSelo}</Marca>}
                  {h.tipo === "curva" && <Marca cor="marca">{t.curva}</Marca>}
                  {h.tipo === "pool" && <Marca cor="marca">{t.pool}</Marca>}
                  {h.tipo === "contrato" && <Marca cor="cinza">{t.contrato}</Marca>}
                  {h.tipo === "carteira" && h.pct >= 2 && <span title="whale">🐋</span>}
                </div>
                <div className="tnum text-[11px] text-zinc-500">
                  {compacto(h.quantidade)} ${symbol}
                  {tr && tr.lucroUsd !== null && (
                    <span className={cn("ml-2 font-semibold", tr.lucroUsd >= 0 ? "text-bull" : "text-bear")}>
                      {t.lucro} {sinal(tr.lucroUsd)}
                      {formatUsd(Math.abs(tr.lucroUsd))}
                    </span>
                  )}
                </div>
              </div>
              <div className="tnum w-[84px] shrink-0 text-right text-[13px] font-bold text-zinc-100">{quadro.precoUsd > 0 ? formatUsd(valor) : "—"}</div>
              <div className="w-[76px] shrink-0">
                <div className="tnum text-right text-[12px] font-semibold text-zinc-300">{h.pct.toFixed(2)}%</div>
                <div className="mt-1 h-1 rounded-full bg-white/[0.06]">
                  <div className={cn("h-1 rounded-full", naoEhCarteira ? "bg-zinc-500" : "bg-marca")} style={{ width: `${maiorPct > 0 ? (h.pct / maiorPct) * 100 : 0}%` }} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <MaisMenos total={quadro.lista.length} todos={todos} setTodos={setTodos} />
    </>
  );
}

function ListaDeTraders({
  quadro,
  falhou,
  chain,
  minha,
  ordem,
  todos,
  setTodos,
}: {
  quadro: QuadroTraders | null;
  falhou: boolean;
  chain: ChainId;
  minha: string | null;
  ordem: Ordem;
  todos: boolean;
  setTodos: (v: boolean) => void;
}) {
  const t = useTextos(TEXTOS);
  if (!quadro) return falhou ? <Aviso>{t.falhou}</Aviso> : <Esqueleto />;
  if (!quadro.lista.length) return <Aviso>{t.vazio}</Aviso>;

  const ordenada = [...quadro.lista].sort((a, b) => {
    if (ordem === "investido") return b.investidoUsd - a.investidoUsd;
    // Lucro desconhecido vai pro fim: não dá pra ranquear um traço.
    if (a.lucroUsd === null && b.lucroUsd === null) return b.investidoUsd - a.investidoUsd;
    if (a.lucroUsd === null) return 1;
    if (b.lucroUsd === null) return -1;
    return b.lucroUsd - a.lucroUsd;
  });
  const lista = todos ? ordenada : ordenada.slice(0, PRIMEIRA_LEVA);

  return (
    <>
      <ul>
        {lista.map((tr, i) => {
          const pct = tr.lucroUsd !== null && tr.investidoUsd > 0 ? (tr.lucroUsd / tr.investidoUsd) * 100 : null;
          return (
            <li
              key={tr.carteira}
              className={cn("fx-surgir flex items-center gap-3 border-b border-ink-700/60 px-3 py-2.5 last:border-0", tr.carteira === minha && "bg-marca/[0.06]")}
              style={{ animationDelay: `${Math.min(i, 14) * 25}ms` }}
            >
              <span className="tnum w-5 shrink-0 text-right text-[11px] text-zinc-600">{i + 1}</span>
              <Identicon carteira={tr.carteira} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <a href={linkDaCarteira(chain, tr.carteira)} target="_blank" rel="noreferrer" className="tnum text-[13px] font-semibold text-zinc-100 hover:text-marca">
                    {shortenAddress(tr.carteira, 4)}
                  </a>
                  {tr.carteira === minha && <Marca cor="marca">{t.voce}</Marca>}
                </div>
                <div className="text-[11px] text-zinc-500">
                  {t.compras(tr.compras, tr.vendas)} · {timeAgo(tr.ultimoEm)}
                </div>
              </div>
              <div className="tnum hidden w-[150px] shrink-0 text-right text-[11px] leading-tight sm:block">
                <div className="text-zinc-400">
                  {t.comprou} <span className="font-semibold text-zinc-200">{formatUsd(tr.investidoUsd)}</span>
                </div>
                <div className="text-zinc-500">
                  {t.vendeu} <span className="font-semibold text-zinc-300">{tr.recebidoUsd > 0 ? formatUsd(tr.recebidoUsd) : "—"}</span>
                </div>
              </div>
              <div className="tnum w-[92px] shrink-0 text-right">
                {tr.lucroUsd === null ? (
                  <span title={t.desconhecido} className="cursor-help text-[13px] font-semibold text-zinc-600 underline decoration-dotted underline-offset-4">
                    —
                  </span>
                ) : (
                  <>
                    <div className={cn("text-[14px] font-black", tr.lucroUsd >= 0 ? "text-bull" : "text-bear")}>
                      {sinal(tr.lucroUsd)}
                      {formatUsd(Math.abs(tr.lucroUsd))}
                    </div>
                    {pct !== null && <div className={cn("text-[11px]", tr.lucroUsd >= 0 ? "text-bull/80" : "text-bear/80")}>{`${sinal(pct)}${Math.abs(pct).toFixed(1)}%`}</div>}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <MaisMenos total={ordenada.length} todos={todos} setTodos={setTodos} />
    </>
  );
}

/* ------------------------------------------------------------------ */

function Aba({ ativa, onClick, children }: { ativa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "fx-aperto rounded-md px-3 py-1 text-[12px] font-bold",
        ativa ? "bg-white/[0.08] text-zinc-50" : "text-zinc-500 hover:text-zinc-300",
      )}
    >
      {children}
    </button>
  );
}

function Selo({ tom, children }: { tom: "bom" | "medio" | "ruim"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "tnum rounded-full border px-2 py-0.5 font-semibold",
        tom === "bom" && "border-bull/30 text-bull",
        tom === "medio" && "border-warn/30 text-warn",
        tom === "ruim" && "border-bear/30 text-bear",
      )}
    >
      {children}
    </span>
  );
}

function Marca({ cor, children }: { cor: "marca" | "ambar" | "cinza"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-px text-[9.5px] font-black tracking-wider",
        cor === "marca" && "bg-marca/15 text-marca",
        cor === "ambar" && "bg-warn/15 text-warn",
        cor === "cinza" && "bg-white/[0.06] text-zinc-400",
      )}
    >
      {children}
    </span>
  );
}

function MaisMenos({ total, todos, setTodos }: { total: number; todos: boolean; setTodos: (v: boolean) => void }) {
  const t = useTextos(TEXTOS);
  if (total <= PRIMEIRA_LEVA) return null;
  return (
    <button
      onClick={() => setTodos(!todos)}
      className="w-full border-t border-ink-700 py-2.5 text-[12px] font-semibold text-zinc-500 transition-colors hover:bg-ink-800 hover:text-marca"
    >
      {todos ? t.menos : t.mais(total - PRIMEIRA_LEVA)}
    </button>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-10 text-center text-[12px] text-zinc-600">{children}</p>;
}

/**
 * Um quadradinho de cor derivado do endereço: não identifica ninguém, só ajuda
 * a vista a achar a mesma carteira nas duas abas.
 */
function Identicon({ carteira }: { carteira: string }) {
  let h = 0;
  for (let i = 0; i < carteira.length; i++) h = (h * 31 + carteira.charCodeAt(i)) >>> 0;
  const matiz = h % 360;
  return (
    <span
      aria-hidden
      className="size-7 shrink-0 rounded-full"
      style={{ background: `linear-gradient(135deg, hsl(${matiz} 58% 52%), hsl(${(matiz + 48) % 360} 58% 38%))` }}
    />
  );
}

function Esqueleto() {
  return (
    <div className="space-y-2 px-4 py-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded bg-ink-800" />
      ))}
    </div>
  );
}

/** Carteira no explorador: `/account/` no Solscan, `/address/` no Blockscout. */
function linkDaCarteira(chain: ChainId, carteira: string): string {
  const base = CHAINS[chain].explorer.replace(/\/token\/$/, "");
  return CHAINS[chain].kind === "solana" ? `${base}/account/${carteira}` : `${base}/address/${carteira}`;
}

const sinal = (n: number) => (n >= 0 ? "+" : "-");

/** 12.345.678 → 12.35M. */
function compacto(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

function duracao(de: number, ate: number): string {
  const s = Math.max(1, Math.round((ate - de) / 1000));
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}
