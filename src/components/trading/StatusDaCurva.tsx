"use client";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";

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
const TEXTOS = traducoes({
  en: {
    seloUniswap: "On Uniswap", seloCheia: "Curve full", seloCurva: "On the curve",
    tituloUniswap: "Graduated to Uniswap", tituloCheia: "Ready to graduate", tituloCurva: "Chroma bonding curve",
    textoUniswap: "The curve closed and became a Uniswap v4 pool. Liquidity is locked forever: there is no function that removes it, not even for Chroma.",
    textoCheia: "The curve is full. Anyone can move the liquidity to Uniswap with the button below.",
    textoCurva: "Until the curve fills up you can always buy and sell — the contract itself is the other side of the trade. When it fills, the coin moves to Uniswap.",
    progresso: "Curve progress", liquidez: "Liquidity", travada: "Locked on Uniswap v4", dentro: "Inside the curve", contrato: "Curve contract",
  },
  pt: {
    seloUniswap: "Na Uniswap", seloCheia: "Curva cheia", seloCurva: "Na curva",
    tituloUniswap: "Migrou pra Uniswap", tituloCheia: "Pronta pra migrar", tituloCurva: "Curva de preço da Chroma",
    textoUniswap: "A curva fechou e virou uma pool da Uniswap v4. A liquidez ficou travada pra sempre: não existe função que a retire, nem pra Chroma.",
    textoCheia: "A curva encheu. Qualquer pessoa pode levar a liquidez pra Uniswap no botão logo abaixo.",
    textoCurva: "Enquanto a curva não enche, comprar e vender é sempre possível — o próprio contrato é o outro lado do negócio. Quando ela enche, a moeda vai pra Uniswap.",
    progresso: "Progresso da curva", liquidez: "Liquidez", travada: "Travada na Uniswap v4", dentro: "Dentro da curva", contrato: "Contrato da curva",
  },
  zh: {
    seloUniswap: "已上 Uniswap", seloCheia: "曲线已满", seloCurva: "曲线中",
    tituloUniswap: "已迁移至 Uniswap", tituloCheia: "可以迁移", tituloCurva: "Chroma 联合曲线",
    textoUniswap: "曲线已关闭并成为 Uniswap v4 池。流动性被永久锁定：没有任何函数可以移除，包括 Chroma。",
    textoCheia: "曲线已满。任何人都可以通过下方按钮把流动性迁移到 Uniswap。",
    textoCurva: "曲线填满之前，随时可以买卖 —— 合约本身就是交易对手方。填满后，代币将迁移到 Uniswap。",
    progresso: "曲线进度", liquidez: "流动性", travada: "锁定在 Uniswap v4", dentro: "在曲线内", contrato: "曲线合约",
  },
});

export function StatusDaCurva({ token }: { token: TokenSummary }) {
  const t = useTextos(TEXTOS);
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
        {migrou ? t.seloUniswap : cheia ? t.seloCheia : t.seloCurva}
      </span>

      <h3 className="mt-3 text-[17px] font-bold text-zinc-50">
        {migrou ? t.tituloUniswap : cheia ? t.tituloCheia : t.tituloCurva}
      </h3>

      <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">
        {migrou ? t.textoUniswap : cheia ? t.textoCheia : t.textoCurva}
      </p>

      {!migrou && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-[11px] text-zinc-500">
            <span>{t.progresso}</span>
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
        <Linha rotulo={t.liquidez} valor={migrou ? t.travada : t.dentro} />
        <Linha
          rotulo={t.contrato}
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
