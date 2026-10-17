import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { chaveInterna } from "@/lib/chave-interna";
import { postsDoXDeHoje } from "@/lib/obsi";

/**
 * POSTS DO OBSI PRO X — página ESCONDIDA (17/10/2026).
 *
 * O Obsi fala pela @ChromaLaunch sem API paga: aqui aparecem os 2 posts do dia
 * (personagem e diário) com o botão "Postar no X", que abre o X já escrito.
 * Só abre com a chave certa no link (sai do DATABASE_URL — nada no código,
 * o repositório é público); qualquer outra dá 404. ?outro=N troca o post de
 * personagem.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Chroma", robots: { index: false, follow: false } };

export default async function PostsDoObsi({
  params,
  searchParams,
}: {
  params: Promise<{ chave: string }>;
  searchParams: Promise<{ outro?: string }>;
}) {
  const { chave } = await params;
  if (chave !== chaveInterna("obsi-x").slice(0, 24)) notFound();
  const outro = Math.max(0, Number((await searchParams).outro) || 0);
  const posts = await postsDoXDeHoje(outro);

  const cartoes = [
    { titulo: "Personagem · posta de manhã (~11h)", texto: posts.personagem, trocar: true },
    { titulo: "Diário · posta à noite (~19h)", texto: posts.diario, trocar: false },
  ];

  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 py-8">
      <div className="flex items-center gap-3">
        <img src="/obsi.webp" alt="Obsi" className="size-12 rounded-full border border-marca/40 object-cover" />
        <div>
          <h1 className="text-xl font-black text-zinc-50">Posts do Obsi pro X</h1>
          <p className="text-[13px] text-zinc-500">Toque em Postar no X: o X abre com o texto pronto, é só confirmar.</p>
        </div>
      </div>

      {cartoes.map((c) => (
        <section key={c.titulo} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <div className="mb-2 text-[12px] font-bold uppercase tracking-wider text-zinc-500">{c.titulo}</div>
          <p className="whitespace-pre-line text-[15px] leading-snug text-zinc-100">{c.texto}</p>
          <div className="mt-1 text-[11px] text-zinc-600">{c.texto.length}/280</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={`https://x.com/intent/post?text=${encodeURIComponent(c.texto)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-marca px-4 py-2 text-[14px] font-bold text-black transition hover:brightness-110 active:scale-95"
            >
              Postar no X
            </a>
            {c.trocar && (
              <a
                href={`?outro=${outro + 1}`}
                className="rounded-lg border border-white/15 px-4 py-2 text-[14px] font-semibold text-zinc-200 transition hover:bg-white/5 active:scale-95"
              >
                Outro texto
              </a>
            )}
          </div>
        </section>
      ))}
    </main>
  );
}
