"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

import { SOL_MINT, type JupiterQuote } from "@/lib/jupiter";
import { executeSolanaSwap } from "@/lib/solana-swap";
import { computeFeesRaw } from "@/lib/fees";
import { formatUnits, parseUnits } from "@/lib/utils";
import type { TradeSide } from "@/lib/types";

const SOL_DECIMALS = 9;
/** Espera o usuário parar de digitar antes de cotar — senão é uma chamada por tecla. */
const QUOTE_DEBOUNCE_MS = 450;

/** Decimais e program id do mint mudam raramente: uma consulta por sessão basta. */
const metaCache = new Map<string, { decimals: number; tokenProgram: string }>();

interface Options {
  tokenMint: string;
  /** só pra registrar de qual moeda veio a comissão, no painel do promotor */
  tokenSymbol?: string;
  side: TradeSide;
  /** o que o usuário digitou, como string */
  amount: string;
  slippageBps: number;
  affiliate: string | null;
  /** o que estava no link (apelido) — junta clique e trade da mesma pessoa */
  affiliateRef: string | null;
  /*
   * false quando a moeda está na curva da Chroma e quem negocia é o nosso
   * programa. Nesse caso a Jupiter não tem rota nenhuma — a moeda não está em
   * DEX alguma ainda — e cotar seria gastar requisição pra receber erro.
   */
  enabled?: boolean;
}

export type SwapPhase = "idle" | "quoting" | "ready" | "executing" | "done" | "error";

export function useSolanaSwap({
  tokenMint,
  tokenSymbol,
  side,
  amount,
  slippageBps,
  affiliate,
  affiliateRef,
  enabled = true,
}: Options) {
  const { connection } = useConnection();
  const { publicKey, signTransaction, connected } = useWallet();

  const [tokenDecimals, setTokenDecimals] = useState<number | null>(null);
  const [tokenProgram, setTokenProgram] = useState<string | null>(null);
  const [quote, setQuote] = useState<JupiterQuote | null>(null);
  const [phase, setPhase] = useState<SwapPhase>("idle");
  const [step, setStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  const isBuy = side === "buy";
  const inputMint = isBuy ? SOL_MINT : tokenMint;
  const outputMint = isBuy ? tokenMint : SOL_MINT;
  const inputDecimals = isBuy ? SOL_DECIMALS : tokenDecimals;
  const outputDecimals = isBuy ? tokenDecimals : SOL_DECIMALS;

  /* --- Decimais e token program ------------------------------------ */
  useEffect(() => {
    if (!tokenMint || !enabled) return;

    const hit = metaCache.get(tokenMint);
    if (hit) {
      setTokenDecimals(hit.decimals);
      setTokenProgram(hit.tokenProgram);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        /*
         * Via servidor, não via RPC: o endpoint público da Solana responde 403
         * para chamadas vindas do browser, então `getMint()` daqui não funciona.
         */
        const res = await fetch(`/api/token-meta?mint=${tokenMint}`);
        if (!res.ok) throw new Error(`token-meta respondeu ${res.status}`);
        const meta = (await res.json()) as { decimals: number; tokenProgram: string };
        if (cancelled) return;

        metaCache.set(tokenMint, meta);
        setTokenDecimals(meta.decimals);
        setTokenProgram(meta.tokenProgram);
      } catch (err) {
        if (cancelled) return;
        // Endereço EVM (a página é multi-chain) ou token que a Jupiter não indexa.
        console.warn("[swap] metadados do token indisponíveis:", err);
        setTokenDecimals(null);
        setTokenProgram(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tokenMint, enabled]);

  /* --- Saldo da carteira ------------------------------------------ */
  useEffect(() => {
    if (!publicKey || !enabled) {
      setBalance(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        if (isBuy) {
          const lamports = await connection.getBalance(publicKey);
          if (!cancelled) setBalance(lamports / 10 ** SOL_DECIMALS);
        } else {
          if (tokenDecimals === null) return;
          const accounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
            mint: new PublicKey(tokenMint),
          });
          const total = accounts.value.reduce(
            (acc, a) => acc + (a.account.data.parsed?.info?.tokenAmount?.uiAmount ?? 0),
            0,
          );
          if (!cancelled) setBalance(total);
        }
      } catch {
        if (!cancelled) setBalance(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [publicKey, connection, isBuy, tokenMint, tokenDecimals, signature, enabled]);

  /* --- Contas da taxa --------------------------------------------- */
  /*
   * Sem `useMemo` nas duas linhas abaixo, de propósito.
   *
   * São aritmética pura e barata sobre uma string curta. O compilador do
   * React 19 memoriza sozinho; a memoização manual escrita à mão fazia ele
   * desistir de otimizar o ARQUIVO INTEIRO — ele não consegue provar que
   * preservaria o comportamento quando há BigInt envolvido, e prefere pular.
   * Tirar as duas custa nada e devolve a otimização automática do resto.
   */
  const grossRaw = inputDecimals === null ? 0n : parseUnits(amount, inputDecimals);

  // A rota de swap implementada hoje é só a da Solana.
  const fees = computeFeesRaw(grossRaw, affiliate, "solana");

  /* --- Cotação (com debounce) -------------------------------------- */
  const requestRef = useRef(0);

  useEffect(() => {
    if (!enabled || !tokenMint || inputDecimals === null || fees.netAmount <= 0n) {
      setQuote(null);
      setPhase("idle");
      return;
    }

    const id = ++requestRef.current;
    setPhase("quoting");
    setError(null);

    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          inputMint,
          outputMint,
          amount: fees.netAmount.toString(),
          slippageBps: String(slippageBps),
        });
        const res = await fetch(`/api/swap?${params}`, { cache: "no-store" });
        const data = await res.json();
        if (id !== requestRef.current) return; // chegou uma cotação mais nova

        if (!res.ok) throw new Error(data?.error ?? "sem rota disponível");
        setQuote(data as JupiterQuote);
        setPhase("ready");
      } catch (err) {
        if (id !== requestRef.current) return;
        setQuote(null);
        setPhase("error");
        setError(err instanceof Error ? err.message : "falha ao cotar");
      }
    }, QUOTE_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [tokenMint, inputMint, outputMint, fees.netAmount, slippageBps, inputDecimals, enabled]);

  /* --- Valores derivados pra interface ----------------------------- */
  const outAmount = useMemo(() => {
    if (!quote || outputDecimals === null) return 0;
    return formatUnits(BigInt(quote.outAmount), outputDecimals);
  }, [quote, outputDecimals]);

  const minReceived = useMemo(() => {
    if (!quote || outputDecimals === null) return 0;
    return formatUnits(BigInt(quote.otherAmountThreshold), outputDecimals);
  }, [quote, outputDecimals]);

  const priceImpactPct = quote ? Number(quote.priceImpactPct) * 100 : 0;
  const route = quote?.routePlan?.map((r) => r.swapInfo.label).filter(Boolean).join(" → ") ?? "";

  /* --- Execução ---------------------------------------------------- */
  const execute = useCallback(async () => {
    if (!quote || !publicKey || !signTransaction) return;

    setPhase("executing");
    setError(null);
    setSignature(null);

    try {
      const result = await executeSolanaSwap({
        connection,
        publicKey,
        signTransaction,
        quote,
        grossRaw,
        inputMint,
        tokenProgram,
        affiliate,
        onStep: setStep,
      });

      setSignature(result.signature);
      setPhase("done");
      setStep("");

      // Registra a conversão pro painel do afiliado (não bloqueia o sucesso).
      if (affiliate && inputDecimals !== null) {
        void fetch("/api/affiliate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            event: "trade",
            wallet: affiliate,
            ref: affiliateRef,
            txHash: result.signature,
            volumeNative: formatUnits(grossRaw, inputDecimals),
            // O valor que o promotor de fato recebeu, não uma estimativa.
            commissionNative: formatUnits(result.affiliatePaidRaw, inputDecimals),
            tokenAddress: tokenMint,
            tokenSymbol,
            // Este hook só monta swap na Solana; a comissão sai em SOL.
            chain: "solana",
          }),
        }).catch(() => {});
      }
    } catch (err) {
      setPhase("error");
      setStep("");
      const message = err instanceof Error ? err.message : String(err);
      // Cancelar no Phantom não é erro: é o usuário mudando de ideia.
      setError(/user rejected|rejected the request|cancel/i.test(message) ? null : message);
    }
  }, [quote, publicKey, signTransaction, connection, grossRaw, inputMint, tokenProgram, affiliate, affiliateRef, inputDecimals, tokenMint, tokenSymbol]);

  return {
    /** null = não foi possível ler o mint (endereço não-Solana, ou RPC recusou) */
    tokenDecimals,
    quote,
    outAmount,
    minReceived,
    priceImpactPct,
    route,
    fees,
    balance,
    phase,
    step,
    error,
    signature,
    execute,
    canSwap:
      enabled && connected && Boolean(quote) && phase === "ready" && Boolean(signTransaction),
    /*
     * Em que unidade a taxa está. Aqui é sempre a moeda de ENTRADA, porque a
     * taxa é descontada antes do swap. No caminho da curva não é assim, e a
     * tela precisa saber a diferença pra não formatar SOL com os decimais do
     * token.
     */
    feeDecimals: inputDecimals,
    motivoTravado: null as string | null,
  };
}
