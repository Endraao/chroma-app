import Link from "next/link";

import { LinhaDeMoeda } from "@/components/home/LinhaDeMoeda";
import type { TokenSummary } from "@/lib/types";

/**
 * A barra da esquerda: o que está quente AGORA.
 *
 * ---------------------------------------------------------------------------
 * POR QUE VOLUME, E NÃO ALTA
 * ---------------------------------------------------------------------------
 * "Quente" podia ser quem mais subiu — mas variação alta em moeda sem giro é
 * ruído: um par com 4 mil dólares de liquidez sobe 300% com uma compra de
 * cem. Isso colocaria no topo da página justamente as moedas onde a pessoa
 * tem mais chance de se machucar.
 *
 * Volume é dinheiro que de fato passou pela moeda nas últimas 24h. É o número
 * mais difícil de forjar dos que temos, e responde a pergunta certa: onde tem
 * gente negociando neste momento.
 *
 * ---------------------------------------------------------------------------
 * POR QUE FICA GRUDADA NA ROLAGEM
 * ---------------------------------------------------------------------------
 * A vitrine é longa. Se a barra rolasse junto, ela sumiria na primeira tela e
 * seria só mais um bloco no começo da página — que é o que ela já não devia
 * ser. Grudada, vira o painel lateral do terminal: você desce a lista inteira
 * e continua vendo o que está girando.
 */
export function MoedasQuentes({ tokens }: { tokens: TokenSummary[] }) {
  if (tokens.length === 0) return null;

  return (
    <aside className="hidden w-[272px] shrink-0 xl:block">
      <div className="sticky top-20">
        <div className="brilho relative overflow-hidden rounded-lg border border-ink-700 bg-ink-900">
          {/* A aresta de luz na borda de cima do painel. */}
          <div className="aresta" />

          {/*
            E a mesma luz descendo pela borda da esquerda.

            Duas arestas que se encontram no canto é o que dá a leitura de peça
            talhada em vez de retângulo com borda — é a quina do cristal. Fica
            na LATERAL e não atrás da lista de propósito: cruzando os números de
            posição, o fio riscaria os dígitos.

            Os dois fios somem nas pontas por máscara, senão viram um traço que
            começa e termina do nada.
          */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 z-[2] w-px bg-chroma-vertical opacity-70"
            style={{
              maskImage:
                "linear-gradient(180deg, black, black 55%, transparent)",
              WebkitMaskImage:
                "linear-gradient(180deg, black, black 55%, transparent)",
            }}
          />

          <div className="flex items-center justify-between px-3 pb-2 pt-3">
            <div className="flex items-center gap-2">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-pulse-dot rounded-full bg-bull" />
              </span>
              <h2 className="text-[11px] font-bold uppercase tracking-rotulo text-zinc-200">
                Quentes
              </h2>
            </div>
            <span className="rotulo">24h</span>
          </div>

          <p className="px-3 pb-2 text-[10px] leading-snug text-zinc-600">
            As moedas com maior volume negociado nas últimas 24 horas.
          </p>

          <div className="relative z-[1] px-1 pb-1">
            {tokens.map((token, i) => (
              <LinhaDeMoeda
                key={token.address}
                token={token}
                posicao={i + 1}
                metrica="volume"
                compacto
              />
            ))}
          </div>

          <Link
            href="/?sort=volume"
            className="block border-t border-ink-700 px-3 py-2.5 text-center text-[11px] font-semibold text-zinc-500 transition-colors hover:bg-ink-800 hover:text-marca"
          >
            Ver ranking completo →
          </Link>
        </div>
      </div>
    </aside>
  );
}
