"use client";

import { useCurvaEvm } from "@/hooks/useCurvaEvm";
import { CHROMA_CURVE_EVM } from "@/lib/chroma-evm";
import type { TokenSummary } from "@/lib/types";

/**
 * Onde a moeda está: na curva (com o quanto falta) ou já na Uniswap, com a
 * liquidez travada. Só para moedas da curva da Chroma na Robinhood.
 *
 * Referência do dono: o cartão "Graduated" da PEAR (28/09/2026). A pessoa
 * decide diferente numa moeda que ainda está na curva e numa que já migrou,
 * e antes a página não dizia em qual das duas ela estava.
 */
export function StatusDaCurva({ token }: { token: TokenSummary }) {
  const { curva } = useCurvaEvm(token.address);
  if (token.chain !== "robinhood" || !curva) return null;

  const migrou = curva.migrada;
  const cheia = curva.concluida && !migrou;
  const progresso = Math.max(0, Math.min(100, token.bondingProgress ?? 0));

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-4">
      <span
        className={
          "inline-block rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider " +
          (migrou ? "border-bull/40 text-bull" : "border-marca/40 text-marca")
        }
      >
        {migrou ? "Na Uniswap" : cheia ? "Curva cheia" : "Na curva"}
      </span>

      <h3 className="mt-3 text-[17px] font-bold text-zinc-50">
        {migrou ? "Migrou pra Uniswap" : cheia ? "Pronta pra migrar" : "Curva de preço da Chroma"}
      </h3>

      <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">
        {migrou
          ? "A curva fechou e virou uma pool da Uniswap v4. A liquidez ficou travada pra sempre: não existe função que a retire, nem pra Chroma."
          : cheia
            ? "A curva encheu. Qualquer pessoa pode levar a liquidez pra Uniswap no botão logo abaixo."
            : "Enquanto a curva não enche, comprar e vender é sempre possível — o próprio contrato é o outro lado do negócio. Quando ela enche, a moeda vai pra Uniswap."}
      </p>

      {!migrou && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-[11px] text-zinc-500">
            <span>Progresso da curva</span>
            <span className="tnum font-semibold text-zinc-300">
              {progresso.toFixed(progresso < 10 ? 1 : 0)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-ink-700">
            <div
              className="h-full rounded-full bg-marca transition-[width] duration-700"
              style={{ width: `${Math.max(1.5, progresso)}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-4 space-y-1.5 border-t border-ink-700 pt-3 text-[11.5px]">
        <Linha rotulo="Liquidez" valor={migrou ? "Travada na Uniswap v4" : "Dentro da curva"} />
        <Linha
          rotulo="Contrato da curva"
          valor={
            <a
              href={`https://robinhoodchain.blockscout.com/address/${CHROMA_CURVE_EVM}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-marca hover:underline"
            >
              {String(CHROMA_CURVE_EVM).slice(0, 6)}…{String(CHROMA_CURVE_EVM).slice(-4)} ↗
            </a>
          }
        />
      </div>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-zinc-500">{rotulo}</span>
      <span className="text-right text-zinc-300">{valor}</span>
    </div>
  );
}
