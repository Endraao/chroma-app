"use client";

import { useState } from "react";
import Link from "next/link";

import { useTextos } from "@/components/IdiomaProvider";
import { CardDaMoeda } from "@/components/home/CardDaMoeda";
import { traducoes } from "@/lib/idiomas";
import type { TokenSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const TEXTOS = traducoes({
  en: {
    titulo: "Created on Chroma", novas: "Just launched", maiores: "Biggest",
    vazio: "No coins created on Chroma yet.", crie: "Create the first one", mais: "Show more", menos: "Show less",
  },
  pt: {
    titulo: "Criadas na Chroma", novas: "Recém lançadas", maiores: "Maiores",
    vazio: "Ainda não há moedas criadas na Chroma.", crie: "Crie a primeira", mais: "Ver mais", menos: "Ver menos",
  },
  zh: {
    titulo: "在 Chroma 创建", novas: "最新发行", maiores: "市值最高",
    vazio: "还没有在 Chroma 创建的代币。", crie: "创建第一个", mais: "查看更多", menos: "收起",
  },
});

const POR_PAGINA = 14;

/**
 * O painel do topo: só moedas nascidas na Chroma, das DUAS redes.
 *
 * Não segue a rede escolhida de propósito — é a vitrine do que só este site
 * tem, e quem chega pela Robinhood também precisa ver o que nasceu na Solana
 * (cada card mostra a rede). A página se atualiza sozinha, então moeda
 * lançada agora aparece aqui em segundos.
 */
export function PainelDaChroma({ moedas }: { moedas: TokenSummary[] }) {
  const t = useTextos(TEXTOS);
  const [aba, setAba] = useState<"novas" | "maiores">("maiores");
  const [tudo, setTudo] = useState(false);

  const ordenadas = [...moedas].sort((a, b) =>
    aba === "novas" ? b.createdAt - a.createdAt : b.marketCapUsd - a.marketCapUsd,
  );
  const visiveis = tudo ? ordenadas : ordenadas.slice(0, POR_PAGINA);

  return (
    <section className="rounded-xl border border-bull/20 bg-gradient-to-b from-bull/[0.05] to-transparent p-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-bull opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-bull" />
        </span>
        <h2 className="mr-2 text-[16px] font-black tracking-tight text-zinc-50">{t.titulo}</h2>
        {/* No celular as abas descem pra uma linha só delas, lado a lado. */}
        <div className="flex w-full gap-1 sm:w-auto">
        {(["maiores", "novas"] as const).map((a) => (
          <button
            key={a}
            onClick={() => setAba(a)}
            className={cn(
              "rounded-md px-3 py-1 text-[12.5px] font-semibold transition-colors",
              aba === a ? "bg-bull text-black" : "text-zinc-400 hover:bg-ink-800 hover:text-zinc-100",
            )}
          >
            {t[a]}
          </button>
        ))}
        </div>
      </div>

      {moedas.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-zinc-500">
          {t.vazio}{" "}
          <Link href="/create" className="font-semibold text-marca hover:underline">
            {t.crie}
          </Link>
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {visiveis.map((token) => (
              <CardDaMoeda key={token.address} token={token} destaque />
            ))}
          </div>
          {ordenadas.length > POR_PAGINA && (
            <button
              onClick={() => setTudo((v) => !v)}
              className="mx-auto mt-4 block text-[12.5px] font-semibold text-marca hover:underline"
            >
              {tudo ? t.menos : t.mais}
            </button>
          )}
        </>
      )}
    </section>
  );
}
