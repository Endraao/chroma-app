"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";

import {
  cotarCompra,
  cotarVenda,
  dividirTaxa,
  ixComprar,
  ixVender,
} from "@/lib/chroma-program";
import type { DadosDaCurva } from "@/hooks/useCurva";
import { formatUnits, parseUnits } from "@/lib/utils";
import type { TradeSide } from "@/lib/types";

/**
 * Compra e venda direto na curva, sem passar por DEX.
 *
 * ---------------------------------------------------------------------------
 * A DIFERENÇA QUE IMPORTA EM RELAÇÃO AO CAMINHO DA JUPITER
 * ---------------------------------------------------------------------------
 * No caminho da Jupiter a taxa é cobrada ANTES do swap: o site anexa transfe-
 * rências à transação e cota a rota já com o valor líquido.
 *
 * Aqui não. O programa cobra e reparte a taxa DENTRO da mesma instrução, e faz
 * isso sobre o valor BRUTO. Se o site descontasse a taxa antes de mandar, ela
 * seria cobrada duas vezes — uma pelo site e outra pela rede — e ninguém
 * perceberia, porque as duas contas estão certas isoladamente.
 *
 * Por isso o que vai na instrução é o valor cheio que a pessoa digitou, e a
 * divisão exibida na tela é calculada com o MESMO código do programa
 * (`dividirTaxa`), não com a tabela de taxas do site.
 */

const DECIMAIS_SOL = 9;

export type FaseDoSwap = "idle" | "quoting" | "ready" | "executing" | "done" | "error";

interface Opcoes {
  tokenMint: string;
  tokenSymbol?: string;
  curva: DadosDaCurva;
  side: TradeSide;
  amount: string;
  slippageBps: number;
  affiliate: string | null;
  affiliateRef: string | null;
  /** false quando a moeda não é da curva: o hook não faz nada */
  enabled: boolean;
}

/** Endereço de afiliado pode vir com lixo na URL. */
function chaveSegura(valor: string | null): PublicKey | null {
  if (!valor) return null;
  try {
    return new PublicKey(valor);
  } catch {
    return null;
  }
}

export function useCurvaSwap({
  tokenMint,
  tokenSymbol,
  curva,
  side,
  amount,
  slippageBps,
  affiliate,
  affiliateRef,
  enabled,
}: Opcoes) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();

  const [tokenDecimals, setTokenDecimals] = useState<number | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [step, setStep] = useState("");
  const [signature, setSignature] = useState<string | null>(null);

  /*
   * Só a EXECUÇÃO vira estado. A fase da cotação é derivada do que já se sabe
   * na renderização — se há valor digitado e se a conta fechou.
   *
   * Guardar as duas em `useState` e sincronizar por efeito é o caminho curto
   * pra um bug clássico: o estado fica um render atrás do valor, e a tela diz
   * "cotando" com a cotação já pronta, ou pior, habilita o botão com um número
   * velho na mão.
   */
  const [execucao, setExecucao] = useState<{
    fase: "parada" | "executing" | "done" | "error";
    erro: string | null;
    /*
     * Qual entrada gerou este resultado.
     *
     * Sem isto, um "Confirmado!" ficaria na tela pra sempre: a fase derivada
     * leria `done` e nunca mais voltaria pra cotação, mesmo a pessoa digitando
     * outro valor. Amarrar o resultado à entrada que o produziu faz ele
     * envelhecer sozinho, sem efeito nenhum pra sincronizar.
     */
    para: string;
  }>({ fase: "parada", erro: null, para: "" });

  const isBuy = side === "buy";

  /* --- Decimais, lidos do próprio mint ----------------------------- */
  /*
   * Direto da conta, não pela rota de metadados do servidor. A moeda da curva
   * pode estar numa rede que só o navegador enxerga (a local, por exemplo), e
   * nesse caso o servidor responderia que o mint não existe.
   *
   * Layout do mint: autoridade opcional (4+32) + emissão (8) = 44, e o byte
   * seguinte são os decimais.
   */
  useEffect(() => {
    if (!enabled) return;

    let cancelado = false;
    (async () => {
      try {
        const conta = await connection.getAccountInfo(new PublicKey(tokenMint));
        if (cancelado || !conta) return;
        setTokenDecimals(conta.data[44]);
      } catch {
        if (!cancelado) setTokenDecimals(null);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [connection, tokenMint, enabled]);

  /* --- Saldo ------------------------------------------------------- */
  useEffect(() => {
    if (!enabled || !publicKey) {
      setBalance(null);
      return;
    }

    let cancelado = false;
    (async () => {
      try {
        if (isBuy) {
          const lamports = await connection.getBalance(publicKey);
          if (!cancelado) setBalance(lamports / 10 ** DECIMAIS_SOL);
        } else {
          const contas = await connection.getParsedTokenAccountsByOwner(publicKey, {
            mint: new PublicKey(tokenMint),
          });
          const total = contas.value.reduce(
            (acc, a) => acc + (a.account.data.parsed?.info?.tokenAmount?.uiAmount ?? 0),
            0,
          );
          if (!cancelado) setBalance(total);
        }
      } catch {
        if (!cancelado) setBalance(null);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [connection, publicKey, isBuy, tokenMint, enabled, signature]);

  /* --- Cotação ----------------------------------------------------- */
  /*
   * Sem debounce e sem chamada de rede: a conta é local, sobre um estado que
   * o `useCurva` mantém atualizado. Cotar aqui custa uma multiplicação.
   */
  const entradaDecimais = isBuy ? DECIMAIS_SOL : tokenDecimals;
  const brutoRaw =
    enabled && entradaDecimais !== null ? parseUnits(amount, entradaDecimais) : 0n;

  const cotacao = useMemo(() => {
    if (!enabled || brutoRaw <= 0n) return null;

    const { estado, config } = curva;
    const taxa = config.taxaTotalBps;

    const saida = isBuy
      ? cotarCompra(estado, brutoRaw, taxa)
      : cotarVenda(estado, brutoRaw, taxa);

    if (saida <= 0n) return null;

    /*
     * O mínimo aceitável. É o que impede que o preço mude entre montar e
     * processar — inclusive por sanduíche — e é conferido pelo programa.
     */
    const minimo = (saida * BigInt(10_000 - slippageBps)) / 10_000n;

    /*
     * Impacto: o quanto o preço médio da operação se afasta do preço à vista.
     * Numa curva ele cresce com o tamanho da ordem, e é a informação que diz
     * "você está movendo o mercado sozinho".
     */
    const precoAVista = Number(estado.solVirtual) / Number(estado.tokenVirtual);
    const precoDaOrdem = isBuy
      ? Number(brutoRaw) / Number(saida)
      : Number(saida) / Number(brutoRaw);

    const impacto =
      precoAVista > 0 ? Math.abs(precoDaOrdem / precoAVista - 1) * 100 : 0;

    return { saida, minimo, impacto };
  }, [enabled, brutoRaw, curva, isBuy, slippageBps]);

  const chaveDaEntrada = `${side}:${amount}`;

  /*
   * A execução manda enquanto está acontecendo — ninguém quer ver "pronto pra
   * negociar" no meio de uma transação —, e continua mandando depois, até a
   * pessoa mexer na entrada. Aí ela envelhece e a cotação volta a decidir.
   */
  const execucaoVale =
    execucao.fase === "executing" || execucao.para === chaveDaEntrada;

  const faseDaExecucao = execucaoVale ? execucao.fase : "parada";

  const phase: FaseDoSwap =
    faseDaExecucao !== "parada"
      ? faseDaExecucao
      : brutoRaw <= 0n
        ? "idle"
        : cotacao
          ? "ready"
          : "error";

  const error =
    faseDaExecucao === "error"
      ? execucao.erro
      : !enabled || brutoRaw <= 0n || cotacao
        ? null
        : "valor fora do que a curva comporta";

  /* --- Divisão da taxa, com a conta do programa -------------------- */
  const fees = useMemo(() => {
    /*
     * A base é sempre em SOL: na compra é o que entra, na venda é o bruto que
     * sai. Na venda, portanto, a taxa NÃO incide sobre o valor digitado (que
     * está em tokens) — incide sobre o SOL que a curva devolveria.
     */
    const base = isBuy ? brutoRaw : brutoDaVenda(curva, brutoRaw, enabled);

    const d = dividirTaxa(
      curva.config,
      base,
      curva.estado.volumeAcumulado,
      Boolean(chaveSegura(affiliate)),
    );

    return {
      totalFee: d.total,
      platformFee: d.plataforma,
      affiliateFee: d.afiliado,
      creatorFee: d.criador,
      netAmount: base - d.total,
    };
  }, [curva, brutoRaw, isBuy, affiliate, enabled]);

  /* --- Valores pra interface --------------------------------------- */
  const saidaDecimais = isBuy ? tokenDecimals : DECIMAIS_SOL;

  const outAmount =
    cotacao && saidaDecimais !== null ? formatUnits(cotacao.saida, saidaDecimais) : 0;
  const minReceived =
    cotacao && saidaDecimais !== null ? formatUnits(cotacao.minimo, saidaDecimais) : 0;

  /* --- Execução ---------------------------------------------------- */
  const execute = useCallback(async () => {
    if (!cotacao || !publicKey || !enabled) return;

    setExecucao({ fase: "executing", erro: null, para: chaveDaEntrada });
    setSignature(null);

    try {
      const afiliado = chaveSegura(affiliate);

      /*
       * O programa recusa indicação de si mesmo, e com razão: senão qualquer
       * um usaria o próprio link e pagaria menos taxa que todo mundo. Filtrar
       * aqui evita que a transação seja recusada por um motivo que a pessoa
       * não tem como entender na tela.
       */
      const afiliadoValido =
        afiliado && !afiliado.equals(publicKey) ? afiliado : null;

      const contas = {
        trader: publicKey,
        mint: new PublicKey(tokenMint),
        criador: curva.estado.criador,
        carteiraDaPlataforma: curva.config.carteiraDaPlataforma,
        afiliado: afiliadoValido,
      };

      setStep("Aprove na sua carteira…");

      const instrucao = isBuy
        ? ixComprar(contas, brutoRaw, cotacao.minimo)
        : ixVender(contas, brutoRaw, cotacao.minimo);

      const assinatura = await sendTransaction(
        new Transaction().add(instrucao),
        connection,
      );

      setStep("Confirmando na rede…");

      const bloco = await connection.getLatestBlockhash();
      const resultado = await connection.confirmTransaction(
        { signature: assinatura, ...bloco },
        "confirmed",
      );
      if (resultado.value.err) throw new Error("a rede recusou a transação");

      setSignature(assinatura);
      setExecucao({ fase: "done", erro: null, para: chaveDaEntrada });
      setStep("");

      // Registra a conversão pro painel do promotor. Não bloqueia o sucesso.
      if (afiliadoValido) {
        void fetch("/api/affiliate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            event: "trade",
            wallet: afiliadoValido.toBase58(),
            ref: affiliateRef,
            txHash: assinatura,
            volumeNative: formatUnits(
              isBuy ? brutoRaw : cotacao.saida,
              DECIMAIS_SOL,
            ),
            // O que o programa de fato repassou, não uma estimativa do site.
            commissionNative: formatUnits(fees.affiliateFee, DECIMAIS_SOL),
            tokenAddress: tokenMint,
            tokenSymbol,
            chain: "solana",
          }),
        }).catch(() => {});
      }
    } catch (e) {
      setStep("");
      const mensagem = e instanceof Error ? e.message : String(e);
      // Cancelar na carteira é escolha, não erro: volta ao normal, sem vermelho.
      const desistiu = /reject|denied|cancel/i.test(mensagem);
      setExecucao(
        desistiu
          ? { fase: "parada", erro: null, para: chaveDaEntrada }
          : { fase: "error", erro: mensagem, para: chaveDaEntrada },
      );
    }
  }, [
    cotacao,
    publicKey,
    enabled,
    affiliate,
    affiliateRef,
    tokenMint,
    tokenSymbol,
    curva,
    isBuy,
    brutoRaw,
    sendTransaction,
    connection,
    fees.affiliateFee,
    chaveDaEntrada,
  ]);

  const podeOperar = isBuy ? curva.podeComprar : curva.podeVender;

  return {
    tokenDecimals,
    quote: cotacao,
    outAmount,
    minReceived,
    priceImpactPct: cotacao?.impacto ?? 0,
    route: "Curva Chroma",
    fees,
    balance,
    phase,
    step,
    error,
    signature,
    execute,
    canSwap:
      enabled &&
      connected &&
      podeOperar &&
      Boolean(cotacao) &&
      phase === "ready" &&
      Boolean(sendTransaction),
    /*
     * A taxa da curva é SEMPRE em SOL, nos dois lados. Na venda o valor
     * digitado está em tokens, mas a taxa incide sobre o SOL que sai — por
     * isso a unidade da taxa não acompanha a unidade da entrada.
     */
    feeDecimals: DECIMAIS_SOL,
    /** Por que o botão está travado, quando está. */
    motivoTravado: !podeOperar
      ? isBuy && curva.config.pausado
        ? "As compras estão pausadas. A venda continua liberada."
        : "Esta curva já encerrou."
      : null,
  };
}

/**
 * Quanto SOL bruto a curva devolveria por esses tokens.
 *
 * Só serve pra base da taxa exibida — a cotação em si usa `cotarVenda`, que já
 * desconta. Sem isto, a tela mostraria a taxa calculada sobre uma quantidade
 * de TOKENS, o que não significa nada.
 */
function brutoDaVenda(curva: DadosDaCurva, tokens: bigint, enabled: boolean): bigint {
  if (!enabled || tokens <= 0n) return 0n;

  const { solVirtual, tokenVirtual } = curva.estado;
  const k = solVirtual * tokenVirtual;
  const novoToken = tokenVirtual + tokens;
  const novoSol = (k + novoToken - 1n) / novoToken;

  return solVirtual > novoSol ? solVirtual - novoSol : 0n;
}
