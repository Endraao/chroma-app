"use client";

import { useEffect, useState } from "react";

import { useIdioma, useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";
import { timeAgo } from "@/lib/utils";

/**
 * O mural do Obsi na home (16/10/2026): o mascote comenta a Chroma de hora em
 * hora e dá boas-vindas a cada moeda lançada. Os posts são em inglês (é a voz
 * dele); a moldura segue o idioma do site. Desde 17/10/2026 as notas
 * prontas vêm nas 3 línguas e aparecem na do site.
 */
const TEXTOS = traducoes({
  en: {
    titulo: "Obsi's notes",
    sub: "Chroma's crystal agent. Hourly notes from the trenches.",
    selo: "AI agent",
    aviso: "AI · not financial advice",
    vazio: "Obsi is waking up. First note soon.",
    nota: "hourly note",
    boasVindas: "new launch",
    mais: "Show more",
    menos: "Show less",
  },
  pt: {
    titulo: "Notas do Obsi",
    sub: "O agente de cristal da Chroma. Notas das trincheiras, de hora em hora.",
    selo: "Agente de IA",
    aviso: "IA · não é conselho financeiro",
    vazio: "O Obsi está acordando. A primeira nota sai já.",
    nota: "nota da hora",
    boasVindas: "lançamento",
    mais: "Ver mais",
    menos: "Ver menos",
  },
  zh: {
    titulo: "Obsi 的笔记",
    sub: "Chroma 的水晶智能体。每小时来自战壕的笔记。",
    selo: "AI 智能体",
    aviso: "AI · 非投资建议",
    vazio: "Obsi 正在醒来，第一条笔记马上就来。",
    nota: "每小时笔记",
    boasVindas: "新发行",
    mais: "显示更多",
    menos: "收起",
  },
});

interface Post {
  id: number;
  tipo: string;
  texto: string;
  textos: Partial<Record<string, string>> | null;
  modelo: string | null;
  criadoEm: number;
}

export function MuralDoObsi() {
  const t = useTextos(TEXTOS);
  const idioma = useIdioma();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    const ler = async () => {
      try {
        const r = await fetch("/api/mural", { cache: "no-store" });
        if (!r.ok) return;
        const { posts } = (await r.json()) as { posts: Post[] };
        if (!cancelado) setPosts(posts);
      } catch {
        /* rede oscilou: a próxima leitura tenta de novo */
      }
    };
    void ler();
    const id = window.setInterval(() => void ler(), 60_000);
    return () => {
      cancelado = true;
      window.clearInterval(id);
    };
  }, []);

  const visiveis = (posts ?? []).slice(0, aberto ? 12 : 3);

  return (
    <section className="rounded-xl border border-marca/20 bg-gradient-to-b from-marca/[0.05] to-transparent p-4">
      <div className="mb-3 flex items-center gap-3">
        <img src="/obsi.webp" alt="Obsi" className="size-10 rounded-full border border-marca/40 object-cover shadow-[0_0_18px_rgba(34,211,238,.35)]" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[16px] font-black tracking-tight text-zinc-50">{t.titulo}</h2>
            <span className="rounded-full border border-marca/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-marca">{t.selo}</span>
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-marca opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-marca" />
            </span>
          </div>
          <p className="text-[12px] text-zinc-500">{t.sub}</p>
        </div>
      </div>

      {posts !== null && posts.length === 0 && <p className="text-[13px] text-zinc-500">{t.vazio}</p>}

      <ul className="space-y-2">
        {visiveis.map((p) => (
          <li key={p.id} className="fx-surgir rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
            <div className="mb-1 flex items-center gap-2 text-[11px] text-zinc-500">
              <span className="font-bold text-zinc-300">Obsi</span>
              <span>·</span>
              <span>{p.tipo === "boas-vindas" ? t.boasVindas : t.nota}</span>
              <span>·</span>
              <span>{timeAgo(p.criadoEm)}</span>
            </div>
            <p className="text-[13.5px] leading-snug text-zinc-100">{p.textos?.[idioma] || p.texto}</p>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-zinc-600">
              {t.aviso}
              {p.modelo ? ` · runs on ${p.modelo}` : ""}
            </div>
          </li>
        ))}
      </ul>

      {(posts?.length ?? 0) > 3 && (
        <button onClick={() => setAberto((a) => !a)} className="mt-2 text-[12px] font-semibold text-marca hover:underline">
          {aberto ? t.menos : t.mais}
        </button>
      )}
    </section>
  );
}
