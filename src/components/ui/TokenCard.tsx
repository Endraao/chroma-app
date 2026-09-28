 
import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { Sparkline } from "@/components/ui/Sparkline";
import { CHAINS } from "@/lib/web3";
import { cn, formatPct, formatPrice, formatUsd, shortenAddress, timeAgo, miniatura } from "@/lib/utils";
import type { TokenSummary } from "@/lib/types";

/**
 * Card da vitrine.
 *
 * A imagem manda. Numa meme coin é ela que faz a pessoa clicar — os números
 * vêm depois, pra decidir. Por isso a arte ocupa o card inteiro em formato
 * quadrado, com o mini-gráfico sobreposto na base, e o texto fica embaixo.
 */
export function TokenCard({ token }: { token: TokenSummary }) {
  const up = token.change24h >= 0;
  const meta = CHAINS[token.chain];
  const inCurve = token.bondingProgress !== null;

  return (
    <Link href={`/token/${token.address}`} className="group block">
      {/* Arte */}
      <div className="relative aspect-square overflow-hidden rounded border border-ink-700 bg-ink-900 transition-colors group-hover:border-marca/50">
        {token.imageUrl ? (
          /*
           * next/image exigiria whitelist de domínio pra cada CDN de token, e
           * esses ícones vêm de dezenas de origens diferentes. <img> simples,
           * com o fundo escuro atrás caso a imagem falhe.
           */
          <img
            src={miniatura(token.imageUrl, 128)}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="grid size-full place-items-center bg-ink-800 text-2xl font-bold text-zinc-600">
            {token.symbol.slice(0, 2)}
          </div>
        )}

        {/* Mini-gráfico, com um degradê por baixo pra linha não sumir na arte */}
        <div className="absolute inset-x-0 bottom-0">
          <div className="h-10 bg-gradient-to-t from-black/75 to-transparent" />
          <div className="-mt-7">
            <Sparkline changes={token.priceChanges} up={up} />
          </div>
        </div>

        {/* Variação 24h, canto superior */}
        <span
          className={cn(
            "tnum absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[11px] font-bold",
            up ? "bg-black/70 text-bull" : "bg-black/70 text-bear",
          )}
        >
          {formatPct(token.change24h)}
        </span>

        {inCurve && (
          <span className="absolute right-2 top-2">
            <Badge tone="chroma">{token.bondingProgress}%</Badge>
          </span>
        )}
      </div>

      {/* Dados */}
      <div className="px-0.5 pt-2.5">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-[13px] font-bold leading-tight text-zinc-100 group-hover:text-white">
            {token.name}
          </span>
          <span className="shrink-0 text-[12px] font-semibold text-zinc-600">${token.symbol}</span>
        </div>

        <div className="tnum mt-1 flex items-baseline gap-1.5">
          <span className="text-[14px] font-bold text-zinc-100">{formatUsd(token.marketCapUsd)}</span>
          <span className="text-[10px] font-semibold uppercase text-zinc-600">mcap</span>
        </div>

        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-600">
          <span className={cn("shrink-0 font-medium", meta.accent)}>{meta.label}</span>
          <span>·</span>
          <span className="tnum shrink-0">{timeAgo(token.createdAt)}</span>
          {token.holders > 0 && (
            <>
              <span>·</span>
              <span className="tnum shrink-0">{token.holders.toLocaleString("pt-BR")} holders</span>
            </>
          )}
        </div>

        {/*
          * Descrição que só repete o nome não é descrição.
          *
          * Muita moeda vem da Dexscreener com o nome copiado no campo de
          * descrição, e o card mostrava "Hold & Pray" duas vezes, uma embaixo
          * da outra. Isso gasta a linha mais valiosa do card pra não dizer
          * nada — nesse caso o endereço informa mais.
          */}
        {descricaoUtil(token.description, token.name, token.symbol) ? (
          <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-zinc-500">
            {token.description}
          </p>
        ) : (
          <p className="tnum mt-1.5 text-[11px] leading-snug text-zinc-700">
            {shortenAddress(token.address, 6)}
          </p>
        )}

        <div className="tnum mt-1.5 flex items-center justify-between text-[10px] text-zinc-700">
          <span>${formatPrice(token.priceUsd)}</span>
          <span>liq {formatUsd(token.liquidityUsd)}</span>
        </div>
      </div>
    </Link>
  );
}

/**
 * A descrição acrescenta alguma coisa ao que já está no card?
 *
 * Compara sem acento, sem caixa e sem pontuação, porque a repetição costuma
 * vir com alguma variação: "Hold & Pray" contra "hold and pray", "$ZORANA"
 * contra "ZORANA". Comparar texto cru deixaria quase tudo passar.
 */
function descricaoUtil(
  descricao: string | undefined,
  nome: string,
  simbolo: string,
): boolean {
  if (!descricao?.trim()) return false;

  const normalizar = (t: string) =>
    t
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/and/g, "&")
      .replace(/[^a-z0-9&]/g, "");

  const d = normalizar(descricao);
  return d.length > 0 && d !== normalizar(nome) && d !== normalizar(simbolo);
}
