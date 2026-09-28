"use client";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";

import { useAffiliateTracking } from "@/hooks/useAffiliateTracking";
import { feeLabel } from "@/lib/fees";

/**
 * Transparência: se a pessoa chegou por um link de indicação, ela precisa
 * saber disso antes de operar. Esconder a atribuição é o que deixa esse
 * tipo de mecânica com cara de golpe.
 */
const TEXTOS = traducoes({
  en: { chegou: (quem: React.ReactNode, pct: string) => <>You arrived through {quem}&apos;s link — {pct} of the fee goes to this wallet.</>, remover: "remove" },
  pt: { chegou: (quem: React.ReactNode, pct: string) => <>Você chegou pelo link de {quem} — {pct} da taxa vai para esta carteira.</>, remover: "remover" },
  zh: { chegou: (quem: React.ReactNode, pct: string) => <>你通过 {quem} 的链接到达 —— 手续费的 {pct} 将支付给该钱包。</>, remover: "移除" },
});

export function AffiliateBanner() {
  const t = useTextos(TEXTOS);
  const { hasAffiliate, affiliateLabel, clear } = useAffiliateTracking();
  if (!hasAffiliate) return null;

  return (
    <div className="border-b border-marca/20 bg-marca/[0.07]">
      <div className="mx-auto flex w-full max-w-[1600px] items-center gap-2 px-4 py-1.5 text-[12px] lg:px-6">
        <span className="size-1.5 rounded-full bg-marca" />
        <span className="text-zinc-400">
          {t.chegou(<span className="font-semibold text-marca">{affiliateLabel}</span>, feeLabel.affiliate)}
        </span>
        <button onClick={clear} className="ml-auto text-zinc-600 transition-colors hover:text-zinc-300">
          {t.remover}
        </button>
      </div>
    </div>
  );
}
