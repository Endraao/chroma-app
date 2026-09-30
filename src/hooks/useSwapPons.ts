"use client";

import { useCallback, useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { erc20Abi, formatEther, formatUnits, maxUint256, parseAbi, parseEther, parseUnits, type Address } from "viem";

import { esperarRecibo, useCarteiraRobinhood } from "@/hooks/useCarteiraRobinhood";
import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";
import { ABI_CHROMA_PONS, CHROMA_PONS, FABRICA_DA_PONS } from "@/lib/chroma-pons";
import { registrarIndicacaoEvm } from "@/lib/registrar-indicacao";
import type { TradeSide } from "@/lib/types";
import { robinhoodChain } from "@/lib/web3";
import type { FaseDoSwapEvm } from "@/hooks/useCurvaSwapEvm";

const MENSAGENS = traducoes({
  en: {
    aprove: "Approve in your wallet…", autorize: "Allow selling this coin (first time only)… (1 of 2)", venda: "Approve the sale in your wallet…",
    confirmando: "Confirming on the network…", recusou: "the network rejected the transaction",
  },
  pt: {
    aprove: "Aprove na sua carteira…", autorize: "Libere a venda desta moeda (só na primeira vez)… (1 de 2)", venda: "Aprove a venda na sua carteira…",
    confirmando: "Confirmando na rede…", recusou: "a rede recusou a transação",
  },
  zh: {
    aprove: "请在钱包中确认…", autorize: "允许卖出该代币（仅首次）…（1/2）", venda: "请在钱包中确认卖出…",
    confirmando: "网络确认中…", recusou: "网络拒绝了该交易",
  },
});

const ABI_FABRICA = parseAbi([
  "function getLaunchedToken(address token) view returns ((address token, address curve, address deployer, address creatorFeeRecipient, address pairToken, uint256 graduationThreshold, uint24 poolFee, int24 tickSpacing, uint16 creatorTaxBps, bool buybackEnabled, uint8 phase, uint256 sweptQuote, uint256 sweptTokens, uint256 sweptAt, bool exists))",
]);
const ABI_CURVA = parseAbi([
  "function getReserves() view returns (uint256, uint256)",
  "function feeBps() view returns (uint256)",
  "function creatorTaxBps() view returns (uint256)",
  "function graduated() view returns (bool)",
  "function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) payable returns (uint256)",
]);

interface EstadoDaPons {
  curva: Address;
  reservaEth: bigint;
  reservaToken: bigint;
  taxaDaCurvaBps: bigint;
  taxaChromaBps: bigint;
  taxaAfiliadoBps: bigint;
  /** até quando (segundos) a compra pela Chroma espera — janela contra robôs */
  liberaEm: number;
}

/**
 * A moeda está na curva da Pons? Lido do navegador pra o painel decidir o
 * motor de negociação sem esperar o servidor. `null` enquanto lê ou se não é.
 */
export function useCurvaPons(moeda: string | null | undefined) {
  const publicClient = usePublicClient({ chainId: robinhoodChain.id });
  const [estado, setEstado] = useState<EstadoDaPons | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!moeda || !publicClient || !/^0x[0-9a-fA-F]{40}$/.test(moeda)) {
      setEstado(null);
      setCarregando(false);
      return;
    }
    let cancelado = false;
    let curva: Address | null = null;
    const ler = async () => {
      try {
        if (!curva) {
          const l = await publicClient.readContract({
            address: FABRICA_DA_PONS,
            abi: ABI_FABRICA,
            functionName: "getLaunchedToken",
            args: [moeda as Address],
          });
          if (!l.exists || l.phase !== 0 || l.pairToken !== "0x0000000000000000000000000000000000000000") {
            if (!cancelado) {
              setEstado(null);
              setCarregando(false);
            }
            return;
          }
          curva = l.curve;
        }
        const [reservas, taxa, imposto, graduada, taxaChroma, taxaAfiliado, lancadaEm, janela] = await Promise.all([
          publicClient.readContract({ address: curva, abi: ABI_CURVA, functionName: "getReserves" }),
          publicClient.readContract({ address: curva, abi: ABI_CURVA, functionName: "feeBps" }),
          publicClient.readContract({ address: curva, abi: ABI_CURVA, functionName: "creatorTaxBps" }),
          publicClient.readContract({ address: curva, abi: ABI_CURVA, functionName: "graduated" }),
          publicClient.readContract({ address: CHROMA_PONS, abi: ABI_CHROMA_PONS, functionName: "taxaTotalBps" }),
          publicClient.readContract({ address: CHROMA_PONS, abi: ABI_CHROMA_PONS, functionName: "taxaAfiliadoBps" }),
          publicClient.readContract({ address: CHROMA_PONS, abi: ABI_CHROMA_PONS, functionName: "lancadaEm", args: [moeda] }),
          publicClient.readContract({ address: CHROMA_PONS, abi: ABI_CHROMA_PONS, functionName: "janelaContraRobos" }),
        ]);
        if (cancelado) return;
        if (graduada) {
          setEstado(null);
        } else {
          const lancada = Number(lancadaEm as bigint);
          setEstado({
            curva,
            reservaEth: reservas[0],
            reservaToken: reservas[1],
            taxaDaCurvaBps: taxa + imposto,
            taxaChromaBps: BigInt(taxaChroma as number),
            taxaAfiliadoBps: BigInt(taxaAfiliado as number),
            liberaEm: lancada > 0 ? lancada + Number(janela as bigint) : 0,
          });
        }
        setCarregando(false);
      } catch (e) {
        console.warn("[pons] leitura falhou:", e);
        if (!cancelado) setCarregando(false);
      }
    };
    void ler();
    const id = window.setInterval(ler, 5_000);
    return () => {
      cancelado = true;
      window.clearInterval(id);
    };
  }, [moeda, publicClient]);

  return { pons: estado, carregando };
}

/**
 * Compra e venda na curva da Pons pelo contrato ChromaPons (taxa da Chroma e
 * comissão de indicação na mesma transação). Mesma interface de
 * `useSwapExternoEvm`, pra a tela não saber qual motor está por trás.
 *
 * Moeda lançada pela Chroma há menos de 1 minuto: o contrato recusa compras
 * por ele (janela contra robôs); aí a compra vai DIRETO na curva, sem a taxa
 * da Chroma — é só o primeiro minuto, e a pessoa não fica sem comprar.
 */
export function useSwapPons({
  moeda,
  pons,
  side,
  valor,
  slippageBps,
  afiliado,
  habilitado,
}: {
  moeda: string;
  pons: EstadoDaPons | null;
  side: TradeSide;
  valor: string;
  slippageBps: number;
  afiliado: string | null;
  habilitado: boolean;
}) {
  const m = useTextos(MENSAGENS);
  const { address, obterCarteira } = useCarteiraRobinhood();
  const publicClient = usePublicClient({ chainId: robinhoodChain.id });

  const [fase, setFase] = useState<FaseDoSwapEvm>("parado");
  const [passo, setPasso] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  const ehCompra = side === "buy";
  let bruto = 0n;
  try {
    bruto = valor ? (ehCompra ? parseEther(valor) : parseUnits(valor, 18)) : 0n;
  } catch {
    bruto = 0n;
  }

  const agora = Math.floor(Date.now() / 1000);
  const direto = ehCompra && Boolean(pons && pons.liberaEm > agora);
  const indicador = afiliado && address && afiliado.toLowerCase() !== address.toLowerCase() ? (afiliado as Address) : null;

  let cotacao: bigint | null = null;
  if (habilitado && pons && bruto > 0n && pons.reservaToken > 0n) {
    const { reservaEth: q, reservaToken: t, taxaDaCurvaBps: taxaCurva, taxaChromaBps } = pons;
    if (ehCompra) {
      const liquido = direto ? bruto : bruto - (bruto * taxaChromaBps) / 10_000n;
      const entra = liquido - (liquido * taxaCurva) / 10_000n;
      cotacao = (entra * t) / (q + entra);
    } else {
      const brutoEth = (bruto * q) / (t + bruto);
      const saiDaCurva = brutoEth - (brutoEth * taxaCurva) / 10_000n;
      cotacao = saiDaCurva - (saiDaCurva * taxaChromaBps) / 10_000n;
    }
  }
  const minimo = cotacao === null ? null : (cotacao * BigInt(10_000 - slippageBps)) / 10_000n;

  const executar = useCallback(async () => {
    if (!address || !publicClient || !pons || minimo === null || bruto <= 0n) return;
    setErro(null);
    setHash(null);
    try {
      const carteira = await obterCarteira();
      let transacao: `0x${string}`;

      if (ehCompra) {
        setFase("assinando");
        setPasso(m.aprove);
        transacao = direto
          ? await carteira.writeContract({
              address: pons.curva,
              abi: ABI_CURVA,
              functionName: "buy",
              args: [bruto, minimo, address],
              value: bruto,
              chain: robinhoodChain,
              account: address,
            })
          : await carteira.writeContract({
              address: CHROMA_PONS,
              abi: ABI_CHROMA_PONS,
              functionName: "comprar",
              args: [moeda as Address, minimo, indicador ?? "0x0000000000000000000000000000000000000000"],
              value: bruto,
              chain: robinhoodChain,
              account: address,
            });
      } else {
        /*
         * Liberação UMA vez por moeda (pedido do dono: a venda pedia duas
         * confirmações toda vez). Seguro: o ChromaPons só puxa moeda de quem
         * está chamando a venda naquela transação (transferFrom(msg.sender)),
         * então ninguém mais consegue usar esta liberação.
         */
        const liberado = await publicClient.readContract({
          address: moeda as Address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, CHROMA_PONS],
        });
        if (liberado < bruto) {
          setFase("aprovando");
          setPasso(m.autorize);
          const h = await carteira.writeContract({
            address: moeda as Address,
            abi: erc20Abi,
            functionName: "approve",
            args: [CHROMA_PONS, maxUint256],
            chain: robinhoodChain,
            account: address,
          });
          await esperarRecibo(publicClient, h);
        }
        setFase("assinando");
        setPasso(m.venda);
        transacao = await carteira.writeContract({
          address: CHROMA_PONS,
          abi: ABI_CHROMA_PONS,
          functionName: "vender",
          args: [moeda as Address, bruto, minimo, indicador ?? "0x0000000000000000000000000000000000000000"],
          chain: robinhoodChain,
          account: address,
        });
      }

      setFase("confirmando");
      setPasso(m.confirmando);
      const recibo = await esperarRecibo(publicClient, transacao);
      if (recibo.status !== "success") throw new Error(m.recusou);
      if (indicador && !direto) {
        const volume = ehCompra
          ? bruto
          : cotacao !== null
            ? (cotacao * 10_000n) / (10_000n - pons.taxaChromaBps)
            : 0n;
        registrarIndicacaoEvm({
          afiliado: indicador,
          txHash: transacao,
          volumeEth: formatEther(volume),
          comissaoEth: formatEther((volume * pons.taxaAfiliadoBps) / 10_000n),
          moeda,
        });
      }
      setHash(transacao);
      setFase("pronto");
      setPasso("");
    } catch (e) {
      setPasso("");
      const mensagem = e instanceof Error ? e.message : String(e);
      if (/reject|denied|cancel|User rejected/i.test(mensagem)) {
        setFase("parado");
        return;
      }
      setErro(mensagem.split(/\r?\n/)[0]);
      setFase("erro");
    }
  }, [address, publicClient, pons, minimo, bruto, obterCarteira, ehCompra, direto, m, indicador, moeda, cotacao]);

  return {
    executar,
    fase,
    passo,
    erro,
    hash,
    saida: cotacao === null ? null : ehCompra ? formatUnits(cotacao, 18) : formatEther(cotacao),
    minimoGarantido: minimo === null ? null : ehCompra ? formatUnits(minimo, 18) : formatEther(minimo),
    ocupado: fase === "aprovando" || fase === "assinando" || fase === "confirmando",
    pronto: Boolean(address && cotacao !== null),
    /** taxa da Chroma aplicada nesta ordem, em bps (zero no primeiro minuto) */
    taxaBps: pons ? (direto ? 0 : Number(pons.taxaChromaBps)) : 0,
  };
}
