"use client";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";

import { useCallback, useEffect, useState } from "react";

import { useChromaAccount } from "@/hooks/useChromaAccount";
import { CristalHolografico } from "@/components/ui/CristalHolografico";
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

/**
 * Abaixo disto o placar não aparece.
 *
 * Placar com uma ou duas carteiras diz "ninguém usa isto" no dia do
 * lançamento. A saída honesta não é inventar carteiras (o dono sugeriu, e
 * foi recusado: atividade falsa numa plataforma de dinheiro é enganar quem
 * entra) — é esconder o placar até existir disputa de verdade.
 */
const MINIMO_PARA_O_PLACAR = 10;

const TEXTOS = traducoes({
  en: {
    seusPontos: "Your points", continue: "Keep using Chroma to earn more.", zerado: "Still zero. Everything you do on Chroma from now on counts.",
    conecte: "Connect your wallet to see your points", contados: "Counted by your address, straight from the blockchain. No sign-up, no form, nothing to sign.",
    quantoMais: "The more you use it,", maisLeva: "the more you get.",
    segredo: "Everything you do on Chroma can count. Some things count much more than others — and that stays secret until the season ends.",
    placar: "Leaderboard", resumo: (c: string, p: string) => `${c} wallets · ${p} points distributed`, voce: "you",
  },
  pt: {
    seusPontos: "Seus pontos", continue: "Continue usando a Chroma para acumular mais.", zerado: "Ainda zerado. Tudo o que você fizer na Chroma a partir de agora conta.",
    conecte: "Conecte a carteira para ver seus pontos", contados: "Contados pelo seu endereço, direto da blockchain. Sem inscrição, sem formulário, sem assinar nada.",
    quantoMais: "Quanto mais você usa,", maisLeva: "mais você leva.",
    segredo: "Cada coisa que você faz na Chroma pode contar. Algumas contam muito mais do que outras — e isso fica em segredo até o fim da temporada.",
    placar: "Placar", resumo: (c: string, p: string) => `${c} carteiras · ${p} pontos distribuídos`, voce: "você",
  },
  zh: {
    seusPontos: "你的积分", continue: "继续使用 Chroma 以获得更多积分。", zerado: "目前为零。从现在起你在 Chroma 上的每个操作都算数。",
    conecte: "连接钱包查看你的积分", contados: "按你的地址直接从区块链统计。无需注册、无需填表、无需签名。",
    quantoMais: "用得越多，", maisLeva: "得到越多。",
    segredo: "你在 Chroma 上做的每件事都可能计分。有些比其他的重要得多 —— 这在赛季结束前保密。",
    placar: "排行榜", resumo: (c: string, p: string) => `${c} 个钱包 · 已发放 ${p} 积分`, voce: "你",
  },
});

export function PainelDeAirdrop() {
  const t = useTextos(TEXTOS);
  const account = useChromaAccount();
  /* As duas carteiras da pessoa: pontos da Solana e da Robinhood somam. */
  const minhas = [
    ...new Set(Object.values(account.conectadas).filter(Boolean) as string[]),
  ];
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

  const eu = new Set(
    minhas.map((c) => (c.startsWith("0x") ? c.toLowerCase() : c)),
  );
  const pontos = dados?.pontos ?? null;

  return (
    <div className="space-y-12">
      {/* ---------------- O seu saldo ---------------- */}
      <section>
        <div className="faceta brilho glass relative overflow-hidden p-6 text-center sm:p-10">
          {chave && pontos !== null ? (
            <>
              <p className="rotulo">{t.seusPontos}</p>
              <p className="tnum mt-2 text-6xl font-black tracking-tight text-zinc-50 sm:text-7xl">
                {pontos.toLocaleString()}
              </p>
              <p className="mt-3 text-[13px] text-zinc-500">
                {/* Sem posição no placar, por pedido do dono (28/09/2026). */}
                {pontos > 0 ? (
                  t.continue
                ) : (
                  t.zerado
                )}
              </p>
            </>
          ) : (
            <div className="py-4">
              <p className="text-[15px] font-bold text-zinc-100">
                {t.conecte}
              </p>
              <p className="mx-auto mt-2 max-w-[440px] text-[13px] leading-relaxed text-zinc-500">
                {t.contados}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ---------------- O segredo ---------------- */}
      <section className="relative overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 px-6 py-12 text-center">
        <div className="pointer-events-none absolute inset-0 fundo-pontos opacity-40" />
        <CristalHolografico size={150} className="relative mx-auto" />
        <h2 className="relative mt-6 text-2xl font-black tracking-tight text-zinc-50 sm:text-3xl">
          {t.quantoMais}{" "}
          <span className="text-chroma">{t.maisLeva}</span>
        </h2>
        <p className="relative mx-auto mt-3 max-w-[460px] text-[13.5px] leading-relaxed text-zinc-400">
          {t.segredo}
        </p>
      </section>

      {/* ---------------- Placar ---------------- */}
      {dados && dados.placar.length >= MINIMO_PARA_O_PLACAR && (
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-lg font-black tracking-tight text-zinc-100">
              {t.placar}
            </h2>
            {dados?.temporada && (
              <p className="tnum text-[11.5px] text-zinc-600">
                {t.resumo(dados.temporada.carteiras.toLocaleString(), dados.temporada.pontos.toLocaleString())}
              </p>
            )}
          </div>

          <div className="mt-5 overflow-hidden rounded-xl border border-ink-700">
            {dados && dados.placar.length > 0
              ? dados.placar.slice(0, 25).map((l, i) => {
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
                        {euMesmo && (
                          <span className="ml-2 font-sans font-bold">{t.voce}</span>
                        )}
                      </span>
                      <span className="tnum shrink-0 text-[13px] font-bold text-zinc-200">
                        {l.pontos.toLocaleString()}
                      </span>
                    </div>
                  );
                })
              : null}
          </div>
        </section>
      )}
    </div>
  );
}
