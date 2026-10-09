"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

import { SOL_MINT, cotar, type JupiterQuote } from "@/lib/jupiter";
import { COTACAO_VENCIDA, executeSolanaSwap } from "@/lib/solana-swap";
import { reivindicarPontos } from "@/lib/reivindicar-pontos";
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
  /** moeda da Curva da Chroma: taxa do site reduzida (ver fees.ts) */
  naCurvaDaChroma?: boolean;
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
  naCurvaDaChroma = false,
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
  const fees = computeFeesRaw(grossRaw, affiliate, "solana", naCurvaDaChroma);

  /*
   * Quanto de fato vai pra rota.
   *
   * COMPRA: o bruto menos a taxa. Ela é cobrada em SOL na entrada, então o que
   * sobra é o que compra token.
   *
   * VENDA: o bruto INTEIRO. A taxa passou a ser cobrada em SOL na saída (ver
   * `buildFeeInstructions`), então todo token que a pessoa mandou é vendido.
   * Descontar aqui também seria cobrar duas vezes — uma em token e outra em
   * SOL.
   */
  const ehVenda = inputMint !== SOL_MINT;
  const valorDaRota = ehVenda ? grossRaw : fees.netAmount;

  /* --- Cotação (com debounce) -------------------------------------- */
  const requestRef = useRef(0);

  useEffect(() => {
    if (!enabled || !tokenMint || inputDecimals === null || valorDaRota <= 0n) {
      setQuote(null);
      setPhase("idle");
      return;
    }

    const id = ++requestRef.current;
    setPhase("quoting");
    setError(null);

    const timer = window.setTimeout(async () => {
      try {
        const data = await cotar({ inputMint, outputMint, amount: valorDaRota.toString(), slippageBps });
        if (id !== requestRef.current) return; // chegou uma cotação mais nova
        setQuote(data);
        setPhase("ready");
      } catch (err) {
        if (id !== requestRef.current) return;
        setQuote(null);
        setPhase("error");
        setError(err instanceof Error ? err.message : "falha ao cotar");
      }
    }, QUOTE_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [tokenMint, inputMint, outputMint, valorDaRota, slippageBps, inputDecimals, enabled]);

  /* --- Valores derivados pra interface ----------------------------- */
  /*
   * Na venda, a tela mostra o que sobra DEPOIS da nossa taxa.
   *
   * A cotação da Jupiter é do swap puro; a taxa sai do SOL recebido, na mesma
   * transação. Mostrar o número dela seria prometer um valor que nunca chega
   * na carteira — e a diferença só apareceria no extrato, depois de assinado.
   *
   * Na compra não tem o que descontar: a taxa já saiu da entrada, e o que a
   * Jupiter cotou é exatamente o que chega.
   */
  const taxaNaSaida = useMemo(() => {
    if (!quote || !ehVenda) return 0n;
    return computeFeesRaw(BigInt(quote.otherAmountThreshold), affiliate, "solana", naCurvaDaChroma).totalFee;
  }, [quote, ehVenda, affiliate, naCurvaDaChroma]);

  const outAmount = useMemo(() => {
    if (!quote || outputDecimals === null) return 0;
    const bruto = BigInt(quote.outAmount);
    const liquido = bruto > taxaNaSaida ? bruto - taxaNaSaida : 0n;
    return formatUnits(liquido, outputDecimals);
  }, [quote, outputDecimals, taxaNaSaida]);

  const minReceived = useMemo(() => {
    if (!quote || outputDecimals === null) return 0;
    const bruto = BigInt(quote.otherAmountThreshold);
    const liquido = bruto > taxaNaSaida ? bruto - taxaNaSaida : 0n;
    return formatUnits(liquido, outputDecimals);
  }, [quote, outputDecimals, taxaNaSaida]);

  const priceImpactPct = quote ? Number(quote.priceImpactPct) * 100 : 0;
  const route = quote?.routePlan?.map((r) => r.swapInfo.label).filter(Boolean).join(" → ") ?? "";

  /* --- Execução ---------------------------------------------------- */
  const execute = useCallback(async () => {
    if (!quote || !publicKey || !signTransaction) return;

    setPhase("executing");
    setError(null);
    setSignature(null);

    try {
      /*
       * Até 3 tentativas: se a simulação acusar que o preço andou além do
       * slippage, recota na hora e monta de novo — a carteira só abre com uma
       * transação que passa (ver conferirAntesDeAssinar).
       */
      let cotacao = quote;
      let result: Awaited<ReturnType<typeof executeSolanaSwap>> | null = null;
      for (let tentativa = 0; tentativa < 3 && !result; tentativa++) {
        try {
          result = await executeSolanaSwap({
            connection,
            publicKey,
            signTransaction,
            quote: cotacao,
            grossRaw,
            inputMint,
            affiliate,
            naCurvaDaChroma,
            onStep: setStep,
          });
        } catch (e) {
          if (!(e instanceof Error) || e.message !== COTACAO_VENCIDA || tentativa === 2) {
            throw e instanceof Error && e.message === COTACAO_VENCIDA
              ? new Error("O preço mudou rápido demais. Tente de novo ou aumente o slippage.")
              : e;
          }
          setStep("O preço mudou — atualizando a cotação…");
          cotacao = await cotar({ inputMint, outputMint, amount: valorDaRota.toString(), slippageBps });
          setQuote(cotacao);
        }
      }
      if (!result) throw new Error("falha ao montar a ordem");

      setSignature(result.signature);
      setPhase("done");
      setStep("");

      /*
       * Registra a conversão pro painel do afiliado (não bloqueia o sucesso).
       *
       * Volume e comissão vão em LAMPORTS nos dois sentidos, lidos do que a
       * transação de fato pagou. Antes usavam os decimais da ENTRADA, e numa
       * venda a entrada é a meme coin: uma comissão de 3.000 unidades de uma
       * moeda de um centavo virava "3.000 SOL" no painel, e o volume do dia
       * somava quantidade de token com quantidade de SOL no mesmo total.
       */
      if (affiliate) {
        void fetch("/api/affiliate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            event: "trade",
            wallet: affiliate,
            txHash: result.signature,
            volumeNative: formatUnits(result.volumeLamports, SOL_DECIMALS),
            // O valor que o promotor de fato recebeu, não uma estimativa.
            commissionNative: formatUnits(result.affiliatePaidRaw, SOL_DECIMALS),
            tokenAddress: tokenMint,
            tokenSymbol,
            // Este hook só monta swap na Solana; a comissão sai em SOL.
            chain: "solana",
          }),
        }).catch(() => {});
      }

      /*
       * Pontos do airdrop.
       *
       * Repara no que NÃO vai nesta chamada: volume, valor, quantidade de
       * pontos. Só a assinatura e o endereço. O servidor vai à blockchain
       * conferir que a transação existe, que foi esta carteira que assinou e
       * que ela passou pela Chroma — e só então calcula quanto vale.
       *
       * O registro de afiliado logo acima aceita números vindos da tela porque
       * lá eles só desenham um painel. Aqui virariam fatia de um token com
       * valor de mercado, e a primeira pessoa a abrir o console do navegador
       * levaria o airdrop inteiro.
       */
      if (publicKey) {
        void reivindicarPontos(result.signature, publicKey.toBase58());
      }
    } catch (err) {
      setPhase("error");
      setStep("");
      const message = err instanceof Error ? err.message : String(err);
      // Cancelar no Phantom não é erro: é o usuário mudando de ideia.
      // Carteira sem SOL nenhum não paga a taxa de rede: a Solana responde
      // com uma frase técnica que ninguém entende.
      const semSol = /no record of a prior credit|insufficient (funds|lamports)/i.test(message);
      setError(
        /user rejected|rejected the request|cancel/i.test(message)
          ? null
          : semSol
            ? "Sua carteira não tem SOL para pagar a taxa de rede. Coloque um pouco de SOL (0,01 já basta) e tente de novo."
            : message,
      );
    }
  }, [quote, publicKey, signTransaction, connection, grossRaw, inputMint, outputMint, valorDaRota, slippageBps, naCurvaDaChroma, affiliate, affiliateRef, tokenMint, tokenSymbol]);

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
