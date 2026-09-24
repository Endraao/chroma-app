"use client";

import { useCallback, useEffect, useState } from "react";

import { useWallet } from "@solana/wallet-adapter-react";

import { NIVEIS, REGRAS, nivelDe, type TipoDePonto } from "@/lib/airdrop-regras";
import { cn, formatUsd, shortenAddress } from "@/lib/utils";

/**
 * O painel vivo do airdrop: o que a carteira conectada já acumulou.
 *
 * ---------------------------------------------------------------------------
 * A PÁGINA FUNCIONA SEM CARTEIRA
 * ---------------------------------------------------------------------------
 * Quem chega pela primeira vez não tem carteira conectada — e é exatamente
 * essa pessoa que a página precisa convencer. Por isso o placar e o resumo da
 * temporada carregam sempre, e a área de saldo vira um convite em vez de um
 * vazio.
 *
 * Exigir conexão pra ver qualquer coisa é o erro clássico dessas páginas: ela
 * só impressiona quem já está dentro.
 */

interface Saldo {
  total: number;
  porTipo: Record<TipoDePonto, number>;
  contagem: Record<TipoDePonto, number>;
  volumeUsd: number;
}

interface Resposta {
  saldo: Saldo | null;
  nivel: ReturnType<typeof nivelDe> | null;
  placar: { carteira: string; pontos: number }[];
  temporada: { carteiras: number; pontos: number; temporada: number };
  posicao?: number | null;
}

const RECARREGA_MS = 60_000;

export function PainelDeAirdrop() {
  const { publicKey } = useWallet();
  const dono = publicKey?.toBase58() ?? null;

  const [dados, setDados] = useState<Resposta | null>(null);

  const ler = useCallback(async () => {
    try {
      const url = dono ? `/api/airdrop?dono=${dono}` : "/api/airdrop";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      setDados((await res.json()) as Resposta);
    } catch {
      /* rede oscilou: mantém o último quadro conhecido */
    }
  }, [dono]);

  useEffect(() => {
    void ler();
    const id = window.setInterval(ler, RECARREGA_MS);
    return () => window.clearInterval(id);
  }, [ler]);

  const saldo = dados?.saldo ?? null;
  const nivel = dados?.nivel ?? null;

  return (
    <div className="space-y-12">
      {/* ---------------- O seu saldo ---------------- */}
      <section>
        <div className="faceta brilho glass relative overflow-hidden p-6 sm:p-8">
          {saldo && nivel ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <p className="rotulo">Seus pontos</p>
                  <p className="tnum mt-1 text-5xl font-black tracking-tight text-zinc-50">
                    {saldo.total.toLocaleString("pt-BR")}
                  </p>
                </div>

                <div className="text-right">
                  <p className="rotulo">Nível</p>
                  <p className="text-chroma mt-1 text-2xl font-black tracking-tight">
                    {nivel.atual}
                  </p>
                  {dados?.posicao && (
                    <p className="tnum mt-0.5 text-[11px] text-zinc-600">
                      #{dados.posicao} no placar
                    </p>
                  )}
                </div>
              </div>

              {/* A barra de progresso pro próximo nível. */}
              {nivel.proximo && (
                <div className="mt-6">
                  <div className="mb-1.5 flex items-baseline justify-between text-[11px]">
                    <span className="text-zinc-600">
                      faltam{" "}
                      <span className="tnum font-bold text-zinc-400">
                        {nivel.faltam.toLocaleString("pt-BR")}
                      </span>{" "}
                      pontos
                    </span>
                    <span className="font-semibold text-zinc-500">{nivel.proximo}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
                    <div
                      className="h-full rounded-full bg-chroma-gradient transition-[width] duration-700"
                      style={{
                        width: `${Math.max(2, nivel.progresso * 100)}%`,
                        backgroundSize: "200% 200%",
                      }}
                    />
                  </div>
                </div>
              )}

              {/* De onde vieram os pontos. */}
              <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-ink-700 bg-ink-700 sm:grid-cols-4">
                <Fatia
                  rotulo="Negociando"
                  pontos={saldo.porTipo.volume}
                  nota={saldo.volumeUsd > 0 ? formatUsd(saldo.volumeUsd) : "—"}
                />
                <Fatia
                  rotulo="Moedas"
                  pontos={saldo.porTipo.moeda}
                  nota={`${saldo.contagem.moeda} lançada${saldo.contagem.moeda === 1 ? "" : "s"}`}
                />
                <Fatia
                  rotulo="Indicações"
                  pontos={saldo.porTipo.indicacao}
                  nota={`${saldo.contagem.indicacao} ativa${saldo.contagem.indicacao === 1 ? "" : "s"}`}
                />
                <Fatia
                  rotulo="Bugs"
                  pontos={saldo.porTipo.bug}
                  nota={`${saldo.contagem.bug} aceito${saldo.contagem.bug === 1 ? "" : "s"}`}
                />
              </div>
            </>
          ) : (
            <div className="py-6 text-center">
              <p className="text-[15px] font-bold text-zinc-100">
                Conecte a carteira para ver seus pontos
              </p>
              <p className="mx-auto mt-2 max-w-[440px] text-[13px] leading-relaxed text-zinc-500">
                Seus pontos são contados pelo endereço, direto da blockchain. Não precisa se
                inscrever, não precisa assinar nada, não precisa cadastro.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ---------------- Como pontuar ---------------- */}
      <section>
        <Titulo>Como acumular</Titulo>

        <div className="mt-5 grid gap-px overflow-hidden rounded-xl border border-ink-700 bg-ink-700 sm:grid-cols-2">
          {REGRAS.map((r) => (
            <div key={r.tipo} className="faceta group relative bg-ink-900 p-5 transition-colors hover:bg-ink-800/60">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[15px] font-bold text-zinc-100">{r.titulo}</h3>
                <span className="tnum shrink-0 rounded-full border border-marca/25 bg-marca/[0.07] px-2.5 py-1 text-[11px] font-bold text-marca">
                  {r.valor}
                </span>
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">{r.comoGanhar}</p>
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">{r.detalhe}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- Níveis ---------------- */}
      <section>
        <Titulo>Níveis</Titulo>
        <p className="mt-1.5 text-[12.5px] text-zinc-600">
          Os níveis sobem conforme você acumula pontos e servem para medir o seu progresso.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {NIVEIS.map((n) => {
            const alcancado = (saldo?.total ?? -1) >= n.minimo;
            return (
              <div
                key={n.nome}
                className={cn(
                  "rounded-lg border px-3.5 py-2.5 transition-colors",
                  alcancado
                    ? "border-marca/30 bg-marca/[0.07]"
                    : "border-ink-700 bg-ink-900",
                )}
              >
                <p
                  className={cn(
                    "text-[13px] font-bold",
                    alcancado ? "text-marca" : "text-zinc-400",
                  )}
                >
                  {n.nome}
                </p>
                <p className="tnum mt-0.5 text-[10.5px] text-zinc-600">
                  {n.minimo.toLocaleString("pt-BR")} pts
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------------- Placar ---------------- */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <Titulo>Placar</Titulo>
          {dados?.temporada && (
            <p className="tnum text-[11.5px] text-zinc-600">
              {dados.temporada.carteiras.toLocaleString("pt-BR")} carteiras ·{" "}
              {dados.temporada.pontos.toLocaleString("pt-BR")} pontos distribuídos
            </p>
          )}
        </div>

        <div className="mt-5 overflow-hidden rounded-xl border border-ink-700">
          {dados && dados.placar.length > 0 ? (
            dados.placar.slice(0, 25).map((l, i) => {
              const euMesmo = l.carteira === dono;
              return (
                <div
                  key={l.carteira}
                  className={cn(
                    "flex items-center gap-3 border-b border-ink-700/60 px-4 py-2.5 last:border-b-0",
                    euMesmo ? "bg-marca/[0.07]" : "bg-ink-900",
                  )}
                >
                  <span
                    className={cn(
                      "tnum w-7 shrink-0 text-[12px] font-bold",
                      i < 3 ? "text-marca" : "text-zinc-600",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span
                    className={cn(
                      "tnum min-w-0 flex-1 truncate font-mono text-[12px]",
                      euMesmo ? "text-marca" : "text-zinc-400",
                    )}
                  >
                    {shortenAddress(l.carteira, 6)}
                    {euMesmo && <span className="ml-2 font-sans font-bold">você</span>}
                  </span>
                  <span className="tnum shrink-0 text-[13px] font-bold text-zinc-200">
                    {l.pontos.toLocaleString("pt-BR")}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="bg-ink-900 px-4 py-10 text-center text-[13px] text-zinc-600">
              Ninguém pontuou ainda. O primeiro lugar está vago.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Titulo({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-black tracking-tight text-zinc-100">{children}</h2>;
}

function Fatia({ rotulo, pontos, nota }: { rotulo: string; pontos: number; nota: string }) {
  return (
    <div className="bg-ink-900 px-3.5 py-3">
      <p className="rotulo">{rotulo}</p>
      <p className="tnum mt-1 text-[17px] font-black text-zinc-100">
        {pontos.toLocaleString("pt-BR")}
      </p>
      <p className="mt-0.5 truncate text-[10.5px] text-zinc-600">{nota}</p>
    </div>
  );
}
