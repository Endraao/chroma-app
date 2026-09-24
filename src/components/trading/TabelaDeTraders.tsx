"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Card } from "@/components/ui/Card";
import { CHAINS } from "@/lib/web3";
import { cn, formatPrice, formatUsd, shortenAddress, timeAgo } from "@/lib/utils";
import type { ChainId } from "@/lib/types";

/**
 * A tabela dos traders: quem está posicionado, quanto botou, quanto ganhou.
 *
 * ---------------------------------------------------------------------------
 * A FRASE DO CABEÇALHO NÃO É DECORAÇÃO
 * ---------------------------------------------------------------------------
 * Isto é calculado sobre os últimos ~300 negócios do par. Numa moeda parada
 * isso pode ser um dia inteiro; numa moeda em movimento pode ser UM MINUTO E
 * MEIO — foi exatamente o que a primeira leitura devolveu em teste.
 *
 * Uma tabela de "lucro dos traders" sem essa informação vira outra coisa: a
 * pessoa lê "+$2.400" do lado de uma carteira e entende que aquele endereço
 * ganhou isso NA MOEDA. Ganhou isso na janela. Pode estar no prejuízo há três
 * dias. Por isso a janela aparece em cima, sempre, junto com o relógio.
 *
 * ---------------------------------------------------------------------------
 * "—" NÃO É ZERO
 * ---------------------------------------------------------------------------
 * Quem vendeu mais do que comprou na janela já tinha token antes dela, e o
 * preço que essa pessoa pagou está fora da nossa vista. O lucro dela aparece
 * como traço, com o motivo escrito ao lado. Mostrar zero ali seria afirmar uma
 * coisa que não sabemos — e é justo na conta de quem está vendendo em cima de
 * todo mundo que o erro sairia mais caro.
 */

interface Trader {
  carteira: string;
  saldo: number;
  pctDoFornecimento: number;
  investidoUsd: number;
  recebidoUsd: number;
  lucroUsd: number | null;
  precoMedioUsd: number | null;
  negocios: number;
  compras: number;
  vendas: number;
  vindoDeAntes: boolean;
  ultimoEm: number;
}

interface Quadro {
  lista: Trader[];
  negociosLidos: number;
  desde: number | null;
  ate: number | null;
  precoUsd: number;
  fornecimento: number;
}

type Ordem = "investido" | "posicao" | "lucro";

const ORDENS: { chave: Ordem; rotulo: string }[] = [
  { chave: "investido", rotulo: "Investido" },
  { chave: "posicao", rotulo: "Posição" },
  { chave: "lucro", rotulo: "Lucro" },
];

/** Quantas linhas antes do "mostrar mais". Vinte cabe numa tela sem rolar. */
const PRIMEIRA_LEVA = 20;

/** A tabela repesca junto com o resto dos números de mercado. */
const INTERVALO_MS = 30_000;

export function TabelaDeTraders({ address, symbol, chain }: { address: string; symbol: string; chain: ChainId }) {
  const [quadro, setQuadro] = useState<Quadro | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [falhou, setFalhou] = useState(false);
  const [ordem, setOrdem] = useState<Ordem>("investido");
  const [todos, setTodos] = useState(false);

  useEffect(() => {
    let cancelado = false;

    const ler = async () => {
      try {
        const res = await fetch(`/api/traders?address=${address}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const dados = (await res.json()) as Quadro;
        if (!cancelado) {
          setQuadro(dados);
          setFalhou(false);
        }
      } catch {
        /* A falha é só marcada; quem decide mostrá-la é o render, e só quando
           não há dado nenhum na tela. Com uma tabela já carregada, é melhor
           manter os números de 30s atrás do que piscar erro a cada oscilação. */
        if (!cancelado) setFalhou(true);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    };

    void ler();
    const timer = window.setInterval(() => void ler(), INTERVALO_MS);

    return () => {
      cancelado = true;
      window.clearInterval(timer);
    };
  }, [address]);

  const lista = quadro ? ordenar(quadro.lista, ordem) : [];
  const visiveis = todos ? lista : lista.slice(0, PRIMEIRA_LEVA);

  /* A barrinha da coluna de posição é relativa ao MAIOR da tabela, não ao
     fornecimento: com 0,2% de supply no topo, uma barra absoluta seria um
     fio invisível em todas as linhas e não compararia nada. */
  const maiorPct = lista.reduce((m, t) => Math.max(m, t.pctDoFornecimento), 0);

  return (
    <Card className="overflow-hidden">
      <Cabecalho
        quadro={quadro}
        ordem={ordem}
        setOrdem={setOrdem}
        carregando={carregando && !quadro}
        falhou={falhou && !quadro}
      />

      {carregando && !quadro ? (
        <Esqueleto />
      ) : falhou && !quadro ? (
        <p className="px-4 py-10 text-center text-[12px] text-zinc-600">
          Não foi possível carregar as operações deste par agora.
        </p>
      ) : lista.length === 0 ? (
        <p className="px-4 py-10 text-center text-[12px] text-zinc-600">
          Nenhum negócio recente neste par.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse">
              {/*
                Larguras fixas nas colunas de número, e só a do trader
                elástica. Sem isso o navegador distribui a largura pelo
                CONTEÚDO, e a tabela dança a cada atualização: um lucro que
                passa de $9,9K pra $10,1K empurra as outras quatro colunas.
              */}
              <colgroup>
                <col />
                <col className="w-[104px]" />
                <col className="w-[108px]" />
                <col className="w-[96px]" />
                <col className="w-[112px]" />
              </colgroup>
              <thead>
                <tr className="border-y border-ink-700 text-left">
                  <Th className="pl-4">Trader</Th>
                  <Th align="right">Posição</Th>
                  <Th align="right">Investido</Th>
                  <Th align="right">Retirado</Th>
                  <Th align="right" className="pr-4">
                    Lucro
                  </Th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((t, i) => (
                  <Linha
                    key={t.carteira}
                    trader={t}
                    posicao={i + 1}
                    symbol={symbol}
                    chain={chain}
                    maiorPct={maiorPct}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {lista.length > PRIMEIRA_LEVA && (
            <button
              onClick={() => setTodos((v) => !v)}
              className="w-full border-t border-ink-700 py-2.5 text-[12px] font-semibold text-zinc-500 transition-colors hover:bg-ink-800 hover:text-marca"
            >
              {todos
                ? "Mostrar menos"
                : `Mostrar as outras ${lista.length - PRIMEIRA_LEVA} carteiras`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function Cabecalho({
  quadro,
  ordem,
  setOrdem,
  carregando,
  falhou,
}: {
  quadro: Quadro | null;
  ordem: Ordem;
  setOrdem: (o: Ordem) => void;
  carregando: boolean;
  falhou: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-3.5 w-[2px] shrink-0 rounded-full bg-chroma-gradient" />
          <h2 className="text-[13px] font-bold uppercase tracking-rotulo text-zinc-100">
            Traders
          </h2>
          {quadro && (
            <span className="tnum text-[11px] text-zinc-600">{quadro.lista.length} carteiras</span>
          )}
        </div>

        {/*
          O escopo, em cima e sempre. Ver o comentário do topo do arquivo: sem
          esta frase os números viram outra coisa na cabeça de quem lê.
        */}
        <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">
          {carregando ? (
            "Carregando as operações recentes…"
          ) : falhou ? (
            /* "Sem negócios" seria uma afirmação sobre o mercado; o que houve
               foi uma falha nossa em ler. São coisas diferentes e a tela não
               pode confundir as duas. */
            "Não foi possível carregar as operações. Tentando novamente em instantes."
          ) : quadro?.desde && quadro?.ate ? (
            <>
              Calculado sobre os últimos{" "}
              <strong className="font-semibold text-zinc-400">
                {quadro.negociosLidos} negócios
              </strong>{" "}
              deste par — de {hora(quadro.desde)} até {hora(quadro.ate)} ({duracao(
                quadro.desde,
                quadro.ate,
              )}
              ). Não é o histórico da moeda nem o saldo real das carteiras.
            </>
          ) : (
            "Sem negócios na janela."
          )}
        </p>
      </div>

      <div className="flex shrink-0 gap-1">
        {ORDENS.map((o) => (
          <button
            key={o.chave}
            onClick={() => setOrdem(o.chave)}
            className={cn(
              "rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
              ordem === o.chave
                ? "bg-white/[0.06] text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            {o.rotulo}
          </button>
        ))}
      </div>
    </div>
  );
}

function Linha({
  trader,
  posicao,
  symbol,
  chain,
  maiorPct,
}: {
  trader: Trader;
  posicao: number;
  symbol: string;
  chain: ChainId;
  maiorPct: number;
}) {
  const t = trader;
  const lucrando = (t.lucroUsd ?? 0) >= 0;

  /*
   * O quanto o lucro representa do que a pessoa botou.
   *
   * Sem isso, "+$300" do lado de "+$300" não diz qual carteira foi melhor —
   * uma pode ter investido mil e a outra dez mil.
   */
  const pctSobreInvestido =
    t.lucroUsd !== null && t.investidoUsd > 0 ? (t.lucroUsd / t.investidoUsd) * 100 : null;

  return (
    <tr className="border-b border-ink-800/60 transition-colors last:border-0 hover:bg-white/[0.02]">
      <td className="py-2.5 pl-4 pr-2">
        <div className="flex items-center gap-2.5">
          <span className="tnum w-5 shrink-0 text-right text-[11px] font-semibold text-zinc-700">
            {posicao}
          </span>

          <Identicon carteira={t.carteira} />

          <div className="min-w-0">
            <a
              href={linkDaCarteira(chain, t.carteira)}
              target="_blank"
              rel="noreferrer"
              className="tnum block truncate text-[12px] font-semibold text-zinc-200 transition-colors hover:text-marca"
            >
              {shortenAddress(t.carteira, 4)}
            </a>
            <span className="flex items-center gap-1.5 text-[10px] text-zinc-600">
              <span className="tnum">
                {t.compras}C · {t.vendas}V
              </span>
              <span>·</span>
              <span className="tnum">{timeAgo(t.ultimoEm)}</span>
            </span>
          </div>
        </div>
      </td>

      {/* Posição */}
      <td className="px-2 py-2.5 text-right">
        {t.vindoDeAntes ? (
          <Desconhecido motivo="Vendeu mais do que comprou na janela: já tinha token antes dela." />
        ) : (
          <>
            <span className="tnum block text-[12px] font-bold text-zinc-200">
              {t.pctDoFornecimento.toFixed(2)}%
            </span>
            <span className="tnum block text-[10px] text-zinc-600">
              {compacto(t.saldo)} {symbol}
            </span>
            {/* Largura fixa e colada à direita. Com `w-full` o traço herdava a
                coluna inteira, e como a tabela é elástica a coluna de posição
                crescia até espremer as outras três pra fora da tela. */}
            <span className="ml-auto mt-1 block h-[2px] w-14 overflow-hidden rounded-full bg-ink-700">
              <span
                className="block h-full rounded-full bg-marca/70"
                style={{
                  width: `${maiorPct > 0 ? Math.min(100, (t.pctDoFornecimento / maiorPct) * 100) : 0}%`,
                }}
              />
            </span>
          </>
        )}
      </td>

      {/* Investido */}
      <td className="px-2 py-2.5 text-right">
        <span className="tnum block text-[12px] font-semibold text-zinc-300">
          {t.investidoUsd > 0 ? formatUsd(t.investidoUsd) : "—"}
        </span>
        {t.precoMedioUsd !== null && t.precoMedioUsd > 0 && (
          <span className="tnum block text-[10px] text-zinc-600">
            média ${precoCurto(t.precoMedioUsd)}
          </span>
        )}
      </td>

      {/* Retirado */}
      <td className="px-2 py-2.5 text-right">
        <span className="tnum block text-[12px] font-semibold text-zinc-300">
          {t.recebidoUsd > 0 ? formatUsd(t.recebidoUsd) : "—"}
        </span>
      </td>

      {/* Lucro */}
      <td className="py-2.5 pl-2 pr-4 text-right">
        {t.lucroUsd === null ? (
          <Desconhecido motivo="Comprou antes da janela, então o preço que pagou é desconhecido." />
        ) : (
          <>
            <span
              className={cn("tnum block text-[12px] font-bold", lucrando ? "text-bull" : "text-bear")}
            >
              {lucrando ? "+" : "−"}
              {formatUsd(Math.abs(t.lucroUsd))}
            </span>
            {pctSobreInvestido !== null && (
              <span
                className={cn("tnum block text-[10px]", lucrando ? "text-bull/70" : "text-bear/70")}
              >
                {lucrando ? "+" : "−"}
                {Math.abs(pctSobreInvestido).toFixed(1)}%
              </span>
            )}
          </>
        )}
      </td>
    </tr>
  );
}

function Desconhecido({ motivo }: { motivo: string }) {
  return (
    <span
      title={motivo}
      className="tnum cursor-help text-[12px] font-semibold text-zinc-700 underline decoration-dotted underline-offset-4"
    >
      —
    </span>
  );
}

/**
 * Um quadradinho de cor derivado do endereço.
 *
 * Não identifica ninguém — serve pra vista achar a mesma carteira de novo
 * quando ela aparece em duas linhas diferentes da tela, que é uma coisa que
 * texto monoespaçado faz mal.
 */
function Identicon({ carteira }: { carteira: string }) {
  let h = 0;
  for (let i = 0; i < carteira.length; i++) h = (h * 31 + carteira.charCodeAt(i)) >>> 0;
  const matiz = h % 360;

  return (
    <span
      aria-hidden
      className="size-5 shrink-0 rounded"
      style={{
        background: `linear-gradient(135deg, hsl(${matiz} 58% 52%), hsl(${(matiz + 48) % 360} 58% 38%))`,
      }}
    />
  );
}

function Th({
  children,
  align = "left",
  className,
}: {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      className={cn(
        "px-2 py-2 text-[10px] font-medium uppercase tracking-rotulo text-zinc-600",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Esqueleto() {
  return (
    <div className="space-y-2 px-4 py-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-9 animate-pulse rounded bg-ink-800" />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * O link do explorador pra uma CARTEIRA.
 *
 * O `explorer` de cada rede aponta pra página de TOKEN, que é o outro uso. Os
 * dois exploradores chamam a página de carteira de um jeito diferente
 * (`/account/` no Solscan, `/address/` no Blockscout), então a troca é feita
 * por rede em vez de por substituição de texto — que era como estava e daria
 * link quebrado na Robinhood Chain.
 */
function linkDaCarteira(chain: ChainId, carteira: string): string {
  const base = CHAINS[chain].explorer.replace(/\/token\/$/, "");
  return CHAINS[chain].kind === "solana"
    ? `${base}/account/${carteira}`
    : `${base}/address/${carteira}`;
}

function ordenar(lista: Trader[], ordem: Ordem): Trader[] {
  const copia = [...lista];

  if (ordem === "posicao") {
    return copia.sort((a, b) => b.pctDoFornecimento - a.pctDoFornecimento);
  }

  if (ordem === "lucro") {
    /* Quem tem lucro desconhecido vai pro fim: não dá pra ranquear um traço. */
    return copia.sort((a, b) => {
      if (a.lucroUsd === null && b.lucroUsd === null) return b.investidoUsd - a.investidoUsd;
      if (a.lucroUsd === null) return 1;
      if (b.lucroUsd === null) return -1;
      return b.lucroUsd - a.lucroUsd;
    });
  }

  return copia.sort((a, b) => b.investidoUsd - a.investidoUsd);
}

/** 12.345.678 → 12,3M. Na coluna de posição o número exato não cabe nem ajuda. */
function compacto(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

/**
 * Preço médio, na mesma notação do resto do site.
 *
 * A primeira versão caía em notação científica ("$9.24e−4") pra preço de meme
 * coin — que é praticamente todos eles. Fora de lugar num terminal, e pior:
 * impossível de comparar de bate-pronto com o preço do cabeçalho, que usa a
 * notação de zeros subscritos. Duas grafias pro mesmo número na mesma tela.
 */
function precoCurto(n: number): string {
  return formatPrice(n, 4);
}

function hora(ms: number): string {
  return new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function duracao(de: number, ate: number): string {
  const s = Math.max(1, Math.round((ate - de) / 1000));
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}
