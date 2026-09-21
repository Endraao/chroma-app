import Link from "next/link";

import { cn, formatPct, formatUsd, timeAgo } from "@/lib/utils";
import { CHAINS } from "@/lib/web3";
import type { ChainId, TokenSummary } from "@/lib/types";

/**
 * A moeda em UMA LINHA: arte pequena, nome, valor e variação.
 *
 * ---------------------------------------------------------------------------
 * POR QUE EXISTE, SE JÁ TEM O TokenCard
 * ---------------------------------------------------------------------------
 * O card grande é pra ESCOLHER — a arte ocupa o quadrado inteiro porque numa
 * meme coin é ela que faz a pessoa clicar. Mas uma tela com três grades do
 * mesmo card vira uma parede: tudo com o mesmo peso, nada em primeiro plano.
 *
 * Esta linha é pra VARRER. Cabe oito numa coluna lateral, dá pra ler de cima a
 * baixo em um segundo e é o formato certo pras duas pontas da página — o que
 * está quente agora (barra da esquerda) e o que acabou de nascer (rodapé).
 *
 * ---------------------------------------------------------------------------
 * O ESPECTRO COMO POSIÇÃO
 * ---------------------------------------------------------------------------
 * Quando vem com `posicao`, o número do ranking recebe uma cor do espectro da
 * marca, na ordem. Lida de cima a baixo, a lista inteira vira a faixa de luz
 * que sai de um prisma — o conceito da marca virando informação, e não
 * enfeite: a cor DIZ em que lugar a moeda está.
 */

/** Violeta → âmbar, a mesma ordem do gradiente da marca. */
const ESPECTRO = [
  "#a78bfa",
  "#818cf8",
  "#38bdf8",
  "#22d3ee",
  "#2dd4bf",
  "#34d399",
  "#a3e635",
  "#fbbf24",
];

/*
 * O ponto da rede, no modo compacto.
 *
 * Escrito por extenso em vez de derivado do `accent` porque o Tailwind lê as
 * classes no código-fonte: uma classe montada com string em tempo de execução
 * simplesmente não é gerada, e o ponto sairia sem cor.
 */
const PONTO_DA_REDE: Record<ChainId, string> = {
  solana: "bg-chroma-violet",
  robinhood: "bg-chroma-mint",
};

/** Qual número acompanha o nome na segunda linha. */
type Metrica = "liquidez" | "volume" | "idade";

export function LinhaDeMoeda({
  token,
  posicao,
  metrica = "liquidez",
  compacto = false,
}: {
  token: TokenSummary;
  /** 1-based. Só nas listas ranqueadas. */
  posicao?: number;
  /**
   * Mostre o número pelo qual a lista foi ordenada. Uma lista ranqueada por
   * volume que exibe liquidez obriga a pessoa a acreditar na ordem sem poder
   * conferir — e ranking que não mostra o próprio critério é só uma opinião.
   */
  metrica?: Metrica;
  /** na barra lateral o espaço é curto: a rede vira um ponto colorido */
  compacto?: boolean;
}) {
  const up = token.change24h >= 0;
  const meta = CHAINS[token.chain];

  const numero =
    metrica === "volume"
      ? `vol ${formatUsd(token.volume24hUsd)}`
      : metrica === "idade"
        ? timeAgo(token.createdAt)
        : `liq ${formatUsd(token.liquidityUsd)}`;

  return (
    <Link
      href={`/token/${token.address}`}
      className="faceta group relative flex items-center gap-2.5 overflow-hidden rounded border border-transparent px-2 py-2 transition-colors hover:border-ink-700 hover:bg-ink-900"
    >
      {posicao !== undefined && (
        <span
          className="tnum w-4 shrink-0 text-right text-[11px] font-bold"
          style={{ color: ESPECTRO[(posicao - 1) % ESPECTRO.length] }}
        >
          {posicao}
        </span>
      )}

      <span className="relative size-8 shrink-0 overflow-hidden rounded bg-ink-800">
        {token.imageUrl ? (
          <img src={token.imageUrl} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <span className="grid size-full place-items-center text-[10px] font-bold text-zinc-600">
            {token.symbol.slice(0, 2)}
          </span>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="truncate text-[12px] font-bold leading-tight text-zinc-100">
            {token.name}
          </span>
          {!compacto && (
            <span className="shrink-0 text-[10px] font-semibold text-zinc-600">
              {token.symbol}
            </span>
          )}
        </span>

        <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-zinc-600">
          {compacto ? (
            <span
              title={meta.label}
              className={cn("size-1.5 shrink-0 rounded-full", PONTO_DA_REDE[token.chain])}
            />
          ) : (
            <>
              <span className={cn("shrink-0 font-medium", meta.accent)}>{meta.label}</span>
              <span>·</span>
            </>
          )}
          <span className="tnum truncate">{numero}</span>
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className="tnum block text-[12px] font-bold leading-tight text-zinc-200">
          {formatUsd(token.marketCapUsd)}
        </span>
        <span
          className={cn(
            "tnum mt-0.5 block text-[10px] font-semibold",
            up ? "text-bull" : "text-bear",
          )}
        >
          {formatPct(token.change24h)}
        </span>
      </span>
    </Link>
  );
}
