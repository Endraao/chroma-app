"use client";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";

const TEXTOS = traducoes({
  en: {
    titulo: "Creator rewards go to holders",
    texto: "The creator chose to share the creator fee of every trade with everyone holding this coin. The distribution is done automatically on-chain, in proportion to how much each wallet holds.",
  },
  pt: {
    titulo: "Recompensas do criador vão para os detentores",
    texto: "O criador escolheu dividir a taxa de criador de cada operação com todos que seguram esta moeda. A distribuição é feita automaticamente na própria rede, na proporção de quanto cada carteira tem.",
  },
  zh: {
    titulo: "创作者奖励分配给持有人",
    texto: "创作者选择将每笔交易的创作者费用分给所有持有该代币的人。分配在链上自动完成，按每个钱包的持有比例分配。",
  },
});

/** Aviso nas moedas lançadas com a taxa de criador indo pros holders. */
export function AvisoRecompensas() {
  const t = useTextos(TEXTOS);
  return (
    <div className="rounded-xl border border-bull/30 bg-bull/[0.07] p-3">
      <p className="flex items-center gap-2 text-[13px] font-bold text-bull">
        <span aria-hidden>🎁</span>
        {t.titulo}
      </p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-zinc-400">{t.texto}</p>
    </div>
  );
}
