"use client";

import { useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { RequireChainWallet } from "@/components/web3/RequireChainWallet";
import { useAffiliateTracking } from "@/hooks/useAffiliateTracking";
import { useTradeSolana } from "@/hooks/useTradeSolana";
import { CHAINS } from "@/lib/web3";
import { cn, formatPrice, formatUnits, shortenAddress } from "@/lib/utils";
import type { ChainId, TradeSide } from "@/lib/types";

const SLIPPAGES = [1, 3, 5, 10];
const BUY_PRESETS = [0.1, 0.5, 1, 5];
const SELL_PRESETS = [25, 50, 75, 100];

export function SwapWidget({
  symbol,
  chain,
  tokenAddress,
}: {
  symbol: string;
  chain: ChainId;
  tokenAddress: string;
}) {
  const [side, setSide] = useState<TradeSide>("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(3);

  const { affiliate, affiliateLabel, affiliateRef } = useAffiliateTracking(chain);
  const meta = CHAINS[chain];
  const isSolana = meta.kind === "solana";

  return isSolana ? (
    <SolanaSwap
      symbol={symbol}
      chain={chain}
      tokenAddress={tokenAddress}
      side={side}
      setSide={setSide}
      amount={amount}
      setAmount={setAmount}
      slippage={slippage}
      setSlippage={setSlippage}
      affiliate={affiliate}
      affiliateRef={affiliateRef}
      affiliateLabel={affiliateLabel}
    />
  ) : (
    <EvmSwapPlaceholder symbol={symbol} chain={chain} />
  );
}

/* ------------------------------------------------------------------ */
/* Solana — implementado de ponta a ponta                              */
/* ------------------------------------------------------------------ */

interface SolanaSwapProps {
  symbol: string;
  chain: ChainId;
  tokenAddress: string;
  side: TradeSide;
  setSide: (s: TradeSide) => void;
  amount: string;
  setAmount: (v: string) => void;
  slippage: number;
  setSlippage: (v: number) => void;
  affiliate: string | null;
  affiliateRef: string | null;
  affiliateLabel: string | null;
}

function SolanaSwap(props: SolanaSwapProps) {
  const {
    symbol,
    tokenAddress,
    side,
    setSide,
    amount,
    setAmount,
    slippage,
    setSlippage,
    affiliate,
    affiliateRef,
    affiliateLabel,
  } = props;
  const { connected, publicKey } = useWallet();

  const swap = useTradeSolana({
    tokenMint: tokenAddress,
    tokenSymbol: symbol,
    side,
    amount,
    slippageBps: slippage * 100,
    affiliate,
    affiliateRef,
  });

  const isBuy = side === "buy";
  const inputSymbol = isBuy ? "SOL" : symbol;
  const outputSymbol = isBuy ? symbol : "SOL";
  const inputDecimals = isBuy ? 9 : swap.tokenDecimals;

  /*
   * A unidade da taxa vem do hook, não da moeda de entrada.
   *
   * Pela Jupiter a taxa sai da entrada, então as duas coincidem. Pela curva
   * ela é sempre em SOL — inclusive na venda, onde a entrada está em tokens.
   * Formatar SOL com os decimais do token daria um número de outro planeta.
   */
  const feeSymbol = swap.naCurva ? "SOL" : inputSymbol;

  const fee = useMemo(() => {
    if (swap.feeDecimals === null) return { total: 0, platform: 0, affiliate: 0 };
    return {
      total: formatUnits(swap.fees.totalFee, swap.feeDecimals),
      platform: formatUnits(swap.fees.platformFee, swap.feeDecimals),
      affiliate: formatUnits(swap.fees.affiliateFee, swap.feeDecimals),
    };
  }, [swap.fees, swap.feeDecimals]);

  function applyPreset(value: number) {
    if (isBuy) {
      setAmount(String(value));
      return;
    }
    // Na venda os presets são percentuais do saldo.
    if (swap.balance === null) return;
    const portion = (swap.balance * value) / 100;
    setAmount(portion > 0 ? portion.toFixed(Math.min(9, swap.tokenDecimals ?? 6)) : "");
  }

  const presets = isBuy ? BUY_PRESETS : SELL_PRESETS;
  const impactTone =
    swap.priceImpactPct > 5 ? "text-bear" : swap.priceImpactPct > 1 ? "text-warn" : "text-zinc-400";

  return (
    <Card className="overflow-hidden">
      <SideTabs side={side} onChange={setSide} />

      <div className="space-y-3 px-4 pb-4">
        {/* Entrada */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition-colors focus-within:border-marca/40">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>Você paga</span>
            <span className="flex items-center gap-1.5">
              {swap.balance !== null && (
                <button
                  onClick={() =>
                    setAmount(
                      isBuy
                        ? Math.max(0, swap.balance! - 0.02).toFixed(4) // deixa SOL pra taxa de rede
                        : String(swap.balance),
                    )
                  }
                  className="rounded px-1 text-marca transition-colors hover:text-chroma-cyan"
                  title={isBuy ? "Usa o saldo menos 0,02 SOL pra taxa de rede" : "Vende tudo"}
                >
                  máx
                </button>
              )}
              <span className="tnum font-semibold text-zinc-400">
                {swap.balance !== null ? `${formatPrice(swap.balance, 4)} ` : ""}
                {inputSymbol}
              </span>
            </span>
          </div>

          <input
            inputMode="decimal"
            value={amount}
            placeholder="0.00"
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            className="tnum w-full bg-transparent py-1 text-2xl font-semibold text-zinc-100 outline-none placeholder:text-zinc-700"
          />

          <div className="flex gap-1.5">
            {presets.map((p) => (
              <button
                key={p}
                onClick={() => applyPreset(p)}
                className="flex-1 rounded-lg border border-white/[0.06] py-1 text-[11px] font-semibold text-zinc-400 transition-colors hover:border-marca/40 hover:text-marca"
              >
                {isBuy ? `${p} SOL` : `${p}%`}
              </button>
            ))}
          </div>
        </div>

        {/* Saída */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>Você recebe</span>
            <span className="font-semibold text-zinc-400">{outputSymbol}</span>
          </div>
          <div className="tnum py-1 text-2xl font-semibold text-zinc-100">
            {swap.phase === "quoting" ? (
              <span className="text-zinc-700">cotando…</span>
            ) : swap.outAmount > 0 ? (
              formatPrice(swap.outAmount, 6)
            ) : (
              "0.00"
            )}
          </div>
          {swap.quote && (
            <div className="tnum space-y-0.5 text-[11px] text-zinc-600">
              <div>
                Mínimo garantido: {formatPrice(swap.minReceived, 6)} {outputSymbol}
              </div>
              <div className="flex items-center justify-between">
                <span>
                  Impacto no preço: <span className={impactTone}>{swap.priceImpactPct.toFixed(2)}%</span>
                </span>
                {swap.route && <span className="truncate pl-2 text-right">{swap.route}</span>}
              </div>
            </div>
          )}
        </div>

        {/* Slippage */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-zinc-500">Slippage</span>
          <div className="flex gap-1">
            {SLIPPAGES.map((s) => (
              <button
                key={s}
                onClick={() => setSlippage(s)}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] font-semibold transition-colors",
                  slippage === s ? "bg-marca/20 text-marca" : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                {s}%
              </button>
            ))}
          </div>
        </div>

        {/*
          * A divisão da taxa NÃO aparece na hora de negociar.
          *
          * Eram três linhas — Chroma, plataforma, afiliado — ocupando o lugar
          * mais nobre do painel pra responder uma pergunta que quase ninguém
          * faz naquele instante. Quem quer saber quanto a plataforma cobra
          * abre a aba Taxas, onde está tudo aberto, e decide com calma.
          *
          * O que fica aqui é o que muda a DECISÃO do trade: o mínimo
          * garantido e o impacto no preço.
          */}

        {swap.motivoTravado && (
          <p className="rounded-lg border border-warn/25 bg-warn/[0.06] px-3 py-2 text-[11px] leading-snug text-warn">
            {swap.motivoTravado}
          </p>
        )}

        {swap.error && (
          <p className="rounded-lg border border-bear/25 bg-bear/[0.06] px-3 py-2 text-[11px] leading-snug text-bear">
            {swap.error}
          </p>
        )}

        {swap.signature && (
          <div className="rounded-lg border border-bull/25 bg-bull/[0.06] px-3 py-2 text-[11px] text-bull">
            Confirmado!{" "}
            <a
              href={`https://solscan.io/tx/${swap.signature}`}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              ver no Solscan ↗
            </a>
          </div>
        )}

        <RequireChainWallet chain="solana">
          <Button
            variant={isBuy ? "buy" : "sell"}
            size="lg"
            className="w-full"
            disabled={!swap.canSwap || swap.phase === "executing"}
            onClick={swap.execute}
          >
            {swap.phase === "executing"
              ? swap.step || "Processando…"
              : !amount || Number(amount) <= 0
                ? "Informe um valor"
                : swap.phase === "quoting"
                  ? "Cotando…"
                  : swap.phase === "error"
                    ? "Tentar de novo"
                    : `${isBuy ? "Comprar" : "Vender"} ${symbol}`}
          </Button>
        </RequireChainWallet>

        {connected && publicKey && (
          <p className="text-center text-[11px] text-zinc-600">
            {shortenAddress(publicKey.toBase58(), 6)} ·{" "}
            {swap.carregandoRota ? "procurando rota…" : swap.naCurva ? "direto na curva da Chroma" : "rota via Jupiter"}
          </p>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* EVM — ainda não implementado, e a tela diz isso                     */
/* ------------------------------------------------------------------ */

function EvmSwapPlaceholder({ symbol, chain }: { symbol: string; chain: ChainId }) {
  const meta = CHAINS[chain];

  return (
    <Card className="overflow-hidden">
      <SideTabs side="buy" onChange={() => {}} disabled />

      <div className="space-y-3 px-4 pb-4 pt-1">
        <div className="rounded-xl border border-warn/25 bg-warn/[0.06] p-3 text-[12px] leading-relaxed text-warn">
          <div className="mb-1 font-semibold">Swap em {meta.label} ainda não está ligado.</div>
          Em EVM não dá pra anexar a transferência do afiliado na mesma transação como na Solana — precisa de um
          contrato router da Chroma, ou do parâmetro de afiliado de um agregador. Está no README, em &quot;Como a
          taxa vira transação&quot;.
        </div>


        <RequireChainWallet chain={chain}>
          <Button variant="outline" size="lg" className="w-full" disabled>
            {symbol} — em breve
          </Button>
        </RequireChainWallet>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function SideTabs({
  side,
  onChange,
  disabled,
}: {
  side: TradeSide;
  onChange: (s: TradeSide) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 p-1">
      {(["buy", "sell"] as TradeSide[]).map((s) => (
        <button
          key={s}
          disabled={disabled}
          onClick={() => onChange(s)}
          className={cn(
            "rounded-xl py-2.5 text-sm font-bold transition-all duration-200 disabled:opacity-40",
            side === s
              ? s === "buy"
                ? "bg-bull/15 text-bull shadow-glow-bull"
                : "bg-bear/15 text-bear shadow-glow-bear"
              : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300",
          )}
        >
          {s === "buy" ? "Comprar" : "Vender"}
        </button>
      ))}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={cn("text-zinc-500", strong && "font-semibold text-zinc-400")}>{label}</span>
      <span className={cn("tnum text-zinc-300", strong && "font-semibold", muted && "text-zinc-600")}>{value}</span>
    </div>
  );
}
