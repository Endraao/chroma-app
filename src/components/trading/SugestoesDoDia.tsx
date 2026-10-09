"use client";

import { useEffect, useState } from "react";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";
import { formatUsd } from "@/lib/utils";

/**
 * "MOEDAS QUENTES PRA DIVULGAR HOJE" (08/10/2026) — o site escolhe 5 moedas e
 * escreve um texto diferente pra cada; a pessoa só copia e posta na comunidade
 * da moeda no X. Postar continua sendo humano (automatizar post promocional é
 * spam pro X e derruba a conta).
 */
const TEXTOS = traducoes({
  en: {
    titulo: "🔥 Hot coins to share today",
    sub: "Pick one, copy the post, paste it in that coin's X community. 3–5 a day is plenty — post like a person, not a bot.",
    copiar: "Copy post",
    copiado: "Copied!",
    comunidade: "Open community ↗",
    buscar: "Search on X ↗",
    confira: "No official community linked — if you find one, check that its CA matches before posting.",
    postar: "Post ↗",
  },
  pt: {
    titulo: "🔥 Moedas quentes pra divulgar hoje",
    sub: "Escolha uma, copie o post e cole na comunidade da moeda no X. 3 a 5 por dia é o suficiente — poste como gente, não como robô.",
    copiar: "Copiar post",
    copiado: "Copiado!",
    comunidade: "Abrir comunidade ↗",
    buscar: "Buscar no X ↗",
    confira: "Sem comunidade oficial cadastrada — se achar uma, confira se o CA dela é o mesmo antes de postar.",
    postar: "Postar ↗",
  },
  zh: {
    titulo: "🔥 今日热门代币推广",
    sub: "选一个，复制帖子，粘贴到该代币的 X 社区。每天 3–5 条就够了 —— 像真人一样发帖，别像机器人。",
    copiar: "复制帖子",
    copiado: "已复制！",
    comunidade: "打开社区 ↗",
    buscar: "在 X 上搜索 ↗",
    confira: "没有登记官方社区 —— 如果找到社区，发帖前请确认其 CA 与此一致。",
    postar: "发帖 ↗",
  },
});

interface Moeda { address: string; symbol: string; name: string; imageUrl: string | null; change24h: number; marketCapUsd: number; chain?: string; twitter?: string | null }

/** Textos em inglês (o público das comunidades), um por moeda, variando por dia. */
function textoDoPost(m: Moeda, i: number): string {
  const s = `$${m.symbol}`;
  const alta = Number.isFinite(m.change24h) && m.change24h > 0 ? ` (+${Math.round(m.change24h).toLocaleString("en-US")}%)` : "";
  const modelos = [
    `${s} fam 👇\n\nYou can now buy ${s} right inside this post. No new tab, no copy-pasting the CA: connect, tap Buy, done.`,
    `${s} is moving today${alta}. Fastest way in: buy it right here, inside the post 👇`,
    `${s} holders: you can trade it without leaving X now. Works on phone too (opens straight in your wallet) 👇`,
    `Grab ${s} in one tap, right inside this post. No tabs, no CA hunting 👇`,
    `${s} — buy it right here in this post 👇 Connect, tap Buy, done.`,
  ];
  const dia = Math.floor(Date.now() / 86_400_000);
  return modelos[(i + dia) % modelos.length];
}

export function SugestoesDoDia({ origem, refId }: { origem: string; refId: string | null }) {
  const t = useTextos(TEXTOS);
  const [lista, setLista] = useState<Moeda[]>([]);
  const [copiado, setCopiado] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sugestoes")
      .then((r) => (r.ok ? r.json() : []))
      .then((j) => setLista(Array.isArray(j) ? j : []))
      .catch(() => {});
  }, []);

  if (!lista.length) return null;

  return (
    <section className="space-y-3 rounded-2xl border border-white/[0.07] bg-ink-900/70 p-4">
      <div>
        <h2 className="text-[17px] font-black text-zinc-50">{t.titulo}</h2>
        <p className="text-[12.5px] text-zinc-400">{t.sub}</p>
      </div>
      {lista.map((m, i) => {
        const link = `${origem}/e3/${m.address}${refId ? `?ref=${encodeURIComponent(refId)}` : ""}`;
        const post = `${textoDoPost(m, i)}\n\n${link}`;
        return (
          <div key={m.address} className="flex flex-wrap items-center gap-3 border-t border-white/[0.05] pt-3">
            <img src={m.imageUrl || `/api/logo/${m.address}`} alt="" className="size-9 rounded-full bg-ink-800 object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-bold text-zinc-100">
                {m.name} <span className="text-[12px] text-sky-300/90">${m.symbol}</span>
              </p>
              <p className="tnum text-[11.5px] text-zinc-500">
                {m.chain === "robinhood" ? "Robinhood · " : "Solana · "}{formatUsd(m.marketCapUsd)} MC
                {Number.isFinite(m.change24h) && m.change24h !== 0 && (
                  <span className={m.change24h >= 0 ? "text-bull" : "text-bear"}> · {m.change24h >= 0 ? "+" : ""}{Math.round(m.change24h).toLocaleString()}%</span>
                )}
              </p>
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(post);
                    setCopiado(m.address);
                    setTimeout(() => setCopiado(null), 1600);
                  } catch {
                    /* clipboard bloqueado */
                  }
                }}
                className="rounded-lg bg-marca px-3 py-2 text-[12.5px] font-black text-black hover:opacity-90"
              >
                {copiado === m.address ? t.copiado : t.copiar}
              </button>
              <a
                href={m.twitter?.includes("/communities/") ? m.twitter : `https://x.com/search?q=${encodeURIComponent(`$${m.symbol}`)}&src=typed_query&f=live`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-marca/40 px-3 py-2 text-[12.5px] font-bold text-marca hover:bg-marca/10"
              >
                {m.twitter?.includes("/communities/") ? t.comunidade : t.buscar}
              </a>
            </div>
            {!m.twitter?.includes("/communities/") && (
              <p className="w-full text-[11px] text-warn">
                {t.confira} <span className="font-mono text-zinc-400">CA {m.address.slice(0, 6)}…{m.address.slice(-6)}</span>
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}
