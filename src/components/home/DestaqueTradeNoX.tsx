"use client";

import { useState } from "react";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";

/**
 * O destaque da primeira tela (pedido do dono, 19/10/2026; substitui a
 * promoção do bônus do criador, que acabou): "faça trades dentro do X". O
 * "Experimente aqui" abre, na própria home, o MESMO widget que aparece dentro
 * do post no X (/p/[moeda]) — com uma moeda conhecida, pra ninguém cair numa
 * memecoin aleatória só por testar. O botão do X leva pra um post de exemplo.
 */
const MOEDA_DE_EXEMPLO = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"; // BONK
const LINK_DO_X = "https://x.com/ChromaLaunch/status/2115664829210050633"; // post de exemplo (BONK), 29/10/2026

const TEXTOS = traducoes({
  en: {
    selo: "Only on Chroma",
    titulo: "Trade inside X. Without leaving X.",
    sub: "Buy and sell any Solana coin right inside an X post. No new tab, no copy-pasting contracts.",
    experimentar: "Try it here",
    fechar: "Close demo",
    verNoX: "See it on X ↗",
    aviso: "This is the real widget that opens inside X posts. Trades are real: connect a wallet only if you want to buy.",
  },
  pt: {
    selo: "Só na Chroma",
    titulo: "Faça trades dentro do X. Sem sair do X.",
    sub: "Compre e venda qualquer moeda da Solana direto dentro de um post do X. Sem abrir outra aba, sem copiar contrato.",
    experimentar: "Experimente aqui",
    fechar: "Fechar demonstração",
    verNoX: "Ver no X ↗",
    aviso: "Este é o widget de verdade que abre dentro dos posts do X. As compras são reais: só conecte a carteira se quiser comprar.",
  },
  zh: {
    selo: "Chroma 独有",
    titulo: "在 X 里交易，无需离开 X。",
    sub: "直接在 X 帖子里买卖任何 Solana 代币。无需新标签页，无需复制合约。",
    experimentar: "在这里试试",
    fechar: "关闭演示",
    verNoX: "在 X 上查看 ↗",
    aviso: "这就是在 X 帖子里打开的真实组件。交易是真实的：只有想买时才连接钱包。",
  },
});

export function DestaqueTradeNoX() {
  const t = useTextos(TEXTOS);
  const [aberto, setAberto] = useState(false);

  return (
    <div className="promo-card promo-banner block w-full">
      <div className="promo-card-dentro">
        <div className="flex items-stretch">
          <span aria-hidden className="promo-barra" />
          <div className="min-w-0 flex-1 px-5 py-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-marca/15 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-marca">
              <span className="size-1.5 animate-pulse rounded-full bg-marca" />
              {t.selo}
            </span>
            <p className="mt-2.5 text-[22px] font-black leading-[1.1] text-zinc-50 sm:text-[24px]">{t.titulo}</p>
            <p className="mt-1.5 text-[12.5px] leading-snug text-zinc-400">{t.sub}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAberto((a) => !a)}
                className="fx-aperto inline-flex items-center gap-1.5 rounded-xl bg-marca/90 px-4 py-2 text-[13px] font-black text-[#031318] transition-colors hover:bg-marca"
              >
                {aberto ? t.fechar : `${t.experimentar} →`}
              </button>
              <a
                href={LINK_DO_X}
                target="_blank"
                rel="noopener noreferrer"
                className="fx-aperto inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-4 py-2 text-[13px] font-bold text-zinc-100 transition-colors hover:bg-white/5"
              >
                {t.verNoX}
              </a>
            </div>
          </div>
        </div>

        {aberto && (
          <div className="fx-surgir border-t border-white/[0.06] px-4 pb-4 pt-3">
            <div className="mx-auto max-w-[480px] overflow-hidden rounded-xl border border-white/10 bg-black">
              <iframe
                src={`/p/${MOEDA_DE_EXEMPLO}`}
                title={t.experimentar}
                className="block h-[600px] w-full"
              />
            </div>
            <p className="mx-auto mt-2 max-w-[480px] text-center text-[11px] text-zinc-500">{t.aviso}</p>
          </div>
        )}
      </div>
    </div>
  );
}
