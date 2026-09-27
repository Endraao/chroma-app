"use client";

import { useCallback, useEffect, useState } from "react";

import { useChromaAccount } from "@/hooks/useChromaAccount";
import { cn, shortenAddress } from "@/lib/utils";

/**
 * O painel vivo do airdrop.
 *
 * ---------------------------------------------------------------------------
 * AS REGRAS SÃO SEGREDO (decisão do dono, 27/09/2026)
 * ---------------------------------------------------------------------------
 * A página mostrava quanto valia cada ação e uma escada de níveis. Isso ensina
 * a farmar a regra — o menor esforço que rende o maior número — em vez de
 * usar a plataforma. Agora a pessoa vê só o próprio total, a posição e o
 * placar. O que conta e quanto conta não aparece em lugar nenhum, e a API
 * também deixou de devolver o detalhamento.
 *
 * A página continua funcionando sem carteira: o placar é o que convence
 * quem ainda não entrou.
 */

interface Resposta {
  pontos: number | null;
  placar: { carteira: string; pontos: number }[];
  temporada: { carteiras: number; pontos: number; temporada: number };
  posicao?: number | null;
}

const RECARREGA_MS = 60_000;

/** Bloco que parece texto riscado: a regra existe, só não é pública. */
function Censurado({ largura }: { largura: string }) {
  return (
    <span
      aria-label="confidencial"
      className={cn("inline-block h-[0.9em] translate-y-[0.1em] rounded-sm bg-zinc-700/70", largura)}
    />
  );
}

export function PainelDeAirdrop() {
  const account = useChromaAccount();
  /* As duas carteiras da pessoa: pontos da Solana e da Robinhood somam. */
  const minhas = [...new Set(Object.values(account.conectadas).filter(Boolean) as string[])];
  const chave = minhas.join(",");

  const [dados, setDados] = useState<Resposta | null>(null);

  const ler = useCallback(async () => {
    try {
      const url = chave ? `/api/airdrop?dono=${chave}` : "/api/airdrop";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      setDados((await res.json()) as Resposta);
    } catch {
      /* rede oscilou: mantém o último quadro conhecido */
    }
  }, [chave]);

  useEffect(() => {
    void ler();
    const id = window.setInterval(ler, RECARREGA_MS);
    return () => window.clearInterval(id);
  }, [ler]);

  const eu = new Set(minhas.map((c) => (c.startsWith("0x") ? c.toLowerCase() : c)));
  const pontos = dados?.pontos ?? null;

  return (
    <div className="space-y-12">
      {/* ---------------- O seu saldo ---------------- */}
      <section>
        <div className="faceta brilho glass relative overflow-hidden p-6 text-center sm:p-10">
          {chave && pontos !== null ? (
            <>
              <p className="rotulo">Seus pontos</p>
              <p className="tnum mt-2 text-6xl font-black tracking-tight text-zinc-50 sm:text-7xl">
                {pontos.toLocaleString("pt-BR")}
              </p>
              <p className="mt-3 text-[13px] text-zinc-500">
                {dados?.posicao ? (
                  <>
                    Você está em <span className="font-bold text-marca">#{dados.posicao}</span> no
                    placar.
                  </>
                ) : pontos > 0 ? (
                  "Continue usando — o placar está logo ali."
                ) : (
                  "Ainda zerado. Tudo o que você fizer na Chroma a partir de agora conta."
                )}
              </p>
            </>
          ) : (
            <div className="py-4">
              <p className="text-[15px] font-bold text-zinc-100">
                Conecte a carteira para ver seus pontos
              </p>
              <p className="mx-auto mt-2 max-w-[440px] text-[13px] leading-relaxed text-zinc-500">
                Contados pelo seu endereço, direto da blockchain. Sem inscrição, sem formulário,
                sem assinar nada.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ---------------- As regras (que não são públicas) ---------------- */}
      <section className="text-center">
        <h2 className="text-2xl font-black tracking-tight text-zinc-100">
          Quanto mais você usa, mais você leva.
        </h2>
        <p className="mx-auto mt-2 max-w-[520px] text-[13.5px] leading-relaxed text-zinc-500">
          É só isso que vamos contar. O que pontua, quanto pontua e o que vale mais ficam em
          segredo até o fim da temporada — assim ganha quem usa a Chroma de verdade, não quem
          decora uma tabela.
        </p>

        <div className="mx-auto mt-7 grid max-w-[640px] gap-px overflow-hidden rounded-xl border border-ink-700 bg-ink-700 text-left sm:grid-cols-3">
          {["Regra 01", "Regra 02", "Regra 03"].map((r, i) => (
            <div key={r} className="bg-ink-900 p-4">
              <p className="rotulo">{r}</p>
              <p className="mt-2 space-y-1.5 text-[13px] leading-relaxed">
                <Censurado largura={["w-24", "w-28", "w-20"][i]} />{" "}
                <Censurado largura={["w-12", "w-16", "w-14"][i]} />
                <br />
                <Censurado largura={["w-16", "w-10", "w-24"][i]} />
              </p>
              <p className="tnum mt-3 text-[12px] font-bold text-marca">??? pts</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-zinc-600">Classificado · temporada {dados?.temporada.temporada ?? 1}</p>
      </section>

      {/* ---------------- Placar ---------------- */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-black tracking-tight text-zinc-100">Placar</h2>
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
              const euMesmo = eu.has(l.carteira);
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
