import type { Metadata } from "next";

import { CopiarTexto } from "@/app/top5/CopiarTexto";
import { textoDoPost, top5, type RedeDoTop } from "@/lib/top5";

/**
 * /top5 — o post diário "Top 5 do dia" pronto: imagem pra baixar e texto pra
 * copiar (pedido do dono, 02/10/2026). Página fora do menu e fora do Google:
 * é ferramenta de quem posta pela Chroma.
 */
export const metadata: Metadata = { title: "Top 5 — Chroma", robots: { index: false, follow: false } };
export const revalidate = 1800;

export default async function Top5({ searchParams }: { searchParams: Promise<{ rede?: string }> }) {
  const rede: RedeDoTop = (await searchParams).rede === "solana" ? "solana" : "robinhood";
  const lista = await top5(rede).catch(() => []);
  const { post, resposta } = textoDoPost(rede, lista);
  const imagem = `/top5/imagem?rede=${rede}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-zinc-50">Top 5 do dia</h1>
        <div className="flex gap-2 text-[13px]">
          {(["robinhood", "solana"] as const).map((r) => (
            <a
              key={r}
              href={`/top5?rede=${r}`}
              className={`rounded-lg border px-3 py-1.5 font-semibold ${r === rede ? "border-marca/60 text-marca" : "border-ink-600 text-zinc-400 hover:text-zinc-100"}`}
            >
              {r === "robinhood" ? "Robinhood Chain" : "Solana"}
            </a>
          ))}
        </div>
      </header>

      {lista.length === 0 ? (
        <p className="text-[14px] text-zinc-400">Não deu pra ler as moedas em alta agora. Tenta de novo em alguns minutos.</p>
      ) : (
        <>
          <section className="space-y-2">
            <p className="text-[12px] font-bold uppercase tracking-wider text-zinc-500">1. Imagem</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- imagem gerada, sem otimizador */}
            <img src={imagem} alt="Top 5" className="w-full rounded-xl border border-ink-700" />
            <a href={imagem} download={`top5-${rede}.png`} className="inline-block rounded-lg bg-marca px-4 py-2 text-[13px] font-bold text-[#08090b]">
              Baixar imagem
            </a>
          </section>
          <section className="space-y-2">
            <p className="text-[12px] font-bold uppercase tracking-wider text-zinc-500">2. Texto do post (sem link)</p>
            <CopiarTexto texto={post} />
          </section>
          <section className="space-y-2">
            <p className="text-[12px] font-bold uppercase tracking-wider text-zinc-500">3. Responda o próprio post com</p>
            <CopiarTexto texto={resposta} />
          </section>
        </>
      )}
    </div>
  );
}
