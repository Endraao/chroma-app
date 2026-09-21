"use client";

import { useAffiliateTracking } from "@/hooks/useAffiliateTracking";
import { feeLabel } from "@/lib/fees";

/**
 * Transparência: se a pessoa chegou por um link de indicação, ela precisa
 * saber disso antes de operar. Esconder a atribuição é o que deixa esse
 * tipo de mecânica com cara de golpe.
 */
export function AffiliateBanner() {
  const { hasAffiliate, affiliateLabel, clear } = useAffiliateTracking();
  if (!hasAffiliate) return null;

  return (
    <div className="border-b border-marca/20 bg-marca/[0.07]">
      <div className="mx-auto flex w-full max-w-[1600px] items-center gap-2 px-4 py-1.5 text-[12px] lg:px-6">
        <span className="size-1.5 rounded-full bg-marca" />
        <span className="text-zinc-400">
          Você chegou pelo link de{" "}
          <span className="font-semibold text-marca">{affiliateLabel}</span> — {feeLabel.affiliate}{" "}
          da taxa vai para esta carteira.
        </span>
        <button onClick={clear} className="ml-auto text-zinc-600 transition-colors hover:text-zinc-300">
          remover
        </button>
      </div>
    </div>
  );
}
