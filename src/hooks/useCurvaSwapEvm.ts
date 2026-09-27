"use client";

import { useCallback, useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { erc20Abi, parseEther, parseUnits, formatEther, formatUnits, type Address } from "viem";

import { ABI_DA_CURVA, CHROMA_CURVE_EVM, ENDERECO_ZERO } from "@/lib/chroma-evm";
import type { EstadoDaCurvaEvm } from "@/lib/chroma-evm";
import type { TradeSide } from "@/lib/types";
import { esperarRecibo, useCarteiraRobinhood } from "@/hooks/useCarteiraRobinhood";
import { robinhoodChain } from "@/lib/web3";

/**
 * Comprar e vender direto na curva da Robinhood Chain.
 *
 * ---------------------------------------------------------------------------
 * A COTAÇÃO VEM DO CONTRATO, NÃO DE CONTA REFEITA AQUI
 * ---------------------------------------------------------------------------
 * `cotarCompra` e `cotarVenda` rodam a MESMA aritmética que a transação vai
 * rodar, com as mesmas reservas e o mesmo arredondamento. Refazer a fórmula em
 * JavaScript daria um número parecido e não igual — e a diferença apareceria
 * como transação recusada pela proteção de preço, sem explicação na tela.
 *
 * ---------------------------------------------------------------------------
 * VENDER EXIGE APROVAÇÃO ANTES, COMPRAR NÃO
 * ---------------------------------------------------------------------------
 * Comprar manda ETH junto com a chamada: o contrato recebe o valor e pronto.
 * Vender é o contrário — a curva precisa retirar tokens da carteira de quem
 * vende, e em ERC-20 isso exige autorização prévia.
 *
 * São duas assinaturas, e a tela avisa antes. Descobrir a segunda assinatura
 * no meio da venda parece defeito.
 *
 * A aprovação é pelo valor EXATO da venda, não infinita. Aprovação infinita é
 * cômoda e deixa de pé uma permissão que só é revogada por ação explícita
 * depois — e o painel de segurança deste site marca token que faz isso.
 */

const DECIMAIS_DO_TOKEN = 18;

export type FaseDoSwapEvm = "parado" | "aprovando" | "assinando" | "confirmando" | "pronto" | "erro";

interface Opcoes {
  moeda: string;
  curva: EstadoDaCurvaEvm | null;
  side: TradeSide;
  /** o que a pessoa digitou: ETH na compra, tokens na venda */
  valor: string;
  slippageBps: number;
  afiliado: string | null;
  habilitado: boolean;
}

export function useCurvaSwapEvm({
  moeda,
  curva,
  side,
  valor,
  slippageBps,
  afiliado,
  habilitado,
}: Opcoes) {
  const { address, obterCarteira } = useCarteiraRobinhood();
  const publicClient = usePublicClient({ chainId: robinhoodChain.id });

  const [cotacao, setCotacao] = useState<bigint | null>(null);
  const [fase, setFase] = useState<FaseDoSwapEvm>("parado");
  const [passo, setPasso] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  const ehCompra = side === "buy";

  /** O valor digitado em unidades da rede. Texto inválido vira zero. */
  let bruto = 0n;
  try {
    bruto = valor
      ? ehCompra
        ? parseEther(valor)
        : parseUnits(valor, DECIMAIS_DO_TOKEN)
      : 0n;
  } catch {
    bruto = 0n;
  }

  /* --- cotação ----------------------------------------------------- */
  useEffect(() => {
    if (!habilitado || !publicClient || !curva || bruto <= 0n) {
      setCotacao(null);
      return;
    }

    let cancelado = false;

    (async () => {
      try {
        const saida = await publicClient.readContract({
          address: CHROMA_CURVE_EVM as Address,
          abi: ABI_DA_CURVA,
          functionName: ehCompra ? "cotarCompra" : "cotarVenda",
          args: [moeda as Address, bruto],
        });
        if (!cancelado) setCotacao(saida as bigint);
      } catch {
        if (!cancelado) setCotacao(null);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [habilitado, publicClient, curva, bruto, ehCompra, moeda]);

  /*
   * O mínimo aceito, já com a folga de slippage.
   *
   * É o que protege de o preço andar entre assinar e executar. Passando disso
   * o contrato reverte, em vez de entregar menos do que foi mostrado.
   */
  const minimo =
    cotacao === null ? null : (cotacao * BigInt(10_000 - slippageBps)) / 10_000n;

  const executar = useCallback(async () => {
    if (!address || !publicClient || cotacao === null || minimo === null) return;

    setErro(null);
    setHash(null);

    try {
      const contrato = { address: CHROMA_CURVE_EVM as Address, abi: ABI_DA_CURVA } as const;
      /* Troca a MetaMask pra Robinhood se ela estiver em outra rede. */
      const walletClient = await obterCarteira();

      /*
       * Indicação de si mesmo é recusada pelo contrato, e com razão: senão
       * qualquer um usaria o próprio link e pagaria menos taxa que todo mundo.
       * Filtrar aqui evita a transação ser recusada por um motivo que a pessoa
       * não tem como entender na tela.
       */
      const indicador =
        afiliado && afiliado.toLowerCase() !== address.toLowerCase()
          ? (afiliado as Address)
          : (ENDERECO_ZERO as Address);

      let transacao: `0x${string}`;

      if (ehCompra) {
        setFase("assinando");
        setPasso("Aprove na sua carteira…");
        transacao = await walletClient.writeContract({
          ...contrato,
          functionName: "comprar",
          args: [moeda as Address, minimo, indicador],
          value: bruto,
        });
      } else {
        /* A curva só consegue retirar os tokens se houver autorização. */
        const permitido = await publicClient.readContract({
          address: moeda as Address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, CHROMA_CURVE_EVM as Address],
        });

        if ((permitido as bigint) < bruto) {
          setFase("aprovando");
          setPasso("Autorize a venda na carteira… (1 de 2)");
          const aprovacao = await walletClient.writeContract({
            address: moeda as Address,
            abi: erc20Abi,
            functionName: "approve",
            args: [CHROMA_CURVE_EVM as Address, bruto],
          });
          await esperarRecibo(publicClient, aprovacao);
        }

        setFase("assinando");
        setPasso("Aprove na sua carteira… (2 de 2)");
        transacao = await walletClient.writeContract({
          ...contrato,
          functionName: "vender",
          args: [moeda as Address, bruto, minimo, indicador],
        });
      }

      setFase("confirmando");
      setPasso("Confirmando na rede…");

      const recibo = await esperarRecibo(publicClient, transacao);
      if (recibo.status !== "success") throw new Error("a rede recusou a transação");

      setHash(transacao);
      setFase("pronto");
      setPasso("");
    } catch (e) {
      setPasso("");
      const mensagem = e instanceof Error ? e.message : String(e);

      // Recusar na carteira é escolha da pessoa, não erro pra pintar de vermelho.
      if (/reject|denied|cancel|User rejected/i.test(mensagem)) {
        setFase("parado");
        return;
      }
      setErro(mensagem);
      setFase("erro");
    }
  }, [address, obterCarteira, publicClient, cotacao, minimo, ehCompra, moeda, bruto, afiliado]);

  return {
    executar,
    fase,
    passo,
    erro,
    hash,
    /** o que sai da operação, já formatado na unidade certa */
    saida: cotacao === null ? null : ehCompra ? formatUnits(cotacao, DECIMAIS_DO_TOKEN) : formatEther(cotacao),
    minimoGarantido:
      minimo === null ? null : ehCompra ? formatUnits(minimo, DECIMAIS_DO_TOKEN) : formatEther(minimo),
    ocupado: fase === "aprovando" || fase === "assinando" || fase === "confirmando",
    pronto: Boolean(address && cotacao !== null),
  };
}
