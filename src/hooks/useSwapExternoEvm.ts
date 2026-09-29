"use client";

import { useCallback, useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { erc20Abi, formatEther, formatUnits, maxUint256, parseEther, parseUnits, type Address } from "viem";

import { esperarRecibo, useCarteiraRobinhood } from "@/hooks/useCarteiraRobinhood";
import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";
import { AFFILIATE_FEE_BPS, computeFeesRaw, swapFeeBps } from "@/lib/fees";
import type { TradeSide } from "@/lib/types";
import {
  ABI_PERMIT2,
  PERMIT2,
  ROTEADOR,
  moedasPorEth,
  montarCompra,
  montarVenda,
  porcoesSequenciais,
  type PoolDaMoeda,
} from "@/lib/uniswap-evm";
import { PLATFORM_FEE_WALLET_EVM, robinhoodChain } from "@/lib/web3";
import { registrarIndicacaoEvm } from "@/lib/registrar-indicacao";
import type { FaseDoSwapEvm } from "@/hooks/useCurvaSwapEvm";

const MENSAGENS = traducoes({
  en: {
    aprove: "Approve in your wallet…", autorize: "Allow selling this coin… (1 of 3)", autorize2: "Allow the swap router… (2 of 3)",
    venda: "Approve the sale in your wallet…", confirmando: "Confirming on the network…", recusou: "the network rejected the transaction",
  },
  pt: {
    aprove: "Aprove na sua carteira…", autorize: "Libere a venda desta moeda… (1 de 3)", autorize2: "Libere o roteador de swap… (2 de 3)",
    venda: "Aprove a venda na sua carteira…", confirmando: "Confirmando na rede…", recusou: "a rede recusou a transação",
  },
  zh: {
    aprove: "请在钱包中确认…", autorize: "允许卖出该代币…（1/3）", autorize2: "授权兑换路由…（2/3）",
    venda: "请在钱包中确认卖出…", confirmando: "网络确认中…", recusou: "网络拒绝了该交易",
  },
});

/**
 * Compra e venda de moeda EXTERNA da Robinhood pela Uniswap v4, com a taxa da
 * Chroma dentro da mesma transação. Mesma interface de `useCurvaSwapEvm`,
 * pra tela não precisar saber qual dos dois está por trás.
 */
export function useSwapExternoEvm({
  moeda,
  pool,
  decimais,
  side,
  valor,
  slippageBps,
  afiliado,
  habilitado,
}: {
  moeda: string;
  pool: PoolDaMoeda | null;
  decimais: number;
  side: TradeSide;
  valor: string;
  slippageBps: number;
  afiliado: string | null;
  habilitado: boolean;
}) {
  const m = useTextos(MENSAGENS);
  const { address, obterCarteira } = useCarteiraRobinhood();
  const publicClient = usePublicClient({ chainId: robinhoodChain.id });

  const [porEth, setPorEth] = useState<number | null>(null);
  const [fase, setFase] = useState<FaseDoSwapEvm>("parado");
  const [passo, setPasso] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  const ehCompra = side === "buy";
  let bruto = 0n;
  try {
    bruto = valor ? (ehCompra ? parseEther(valor) : parseUnits(valor, decimais)) : 0n;
  } catch {
    bruto = 0n;
  }

  /* Preço da pool, renovado a cada 10 s enquanto a tela está aberta. */
  useEffect(() => {
    if (!habilitado || !publicClient || !pool) return;
    let cancelado = false;
    const ler = () =>
      moedasPorEth(publicClient as never, pool)
        .then((p) => !cancelado && setPorEth(p))
        .catch(() => {});
    void ler();
    const id = window.setInterval(ler, 10_000);
    return () => {
      cancelado = true;
      window.clearInterval(id);
    };
  }, [habilitado, publicClient, pool]);

  const indicador = afiliado && address && afiliado.toLowerCase() !== address.toLowerCase() ? (afiliado as Address) : null;
  const taxas = computeFeesRaw(bruto, indicador, "robinhood");

  // Estimativa pelo preço à vista, já sem a taxa da Chroma.
  let cotacao: bigint | null = null;
  if (porEth !== null && bruto > 0n) {
    cotacao = ehCompra
      ? BigInt(Math.floor(Number(taxas.netAmount) * porEth))
      : BigInt(Math.floor((Number(bruto) / porEth) * (1 - swapFeeBps("robinhood") / 10_000)));
  }
  const minimo = cotacao === null ? null : (cotacao * BigInt(10_000 - slippageBps)) / 10_000n;

  const executar = useCallback(async () => {
    if (!address || !publicClient || !pool || minimo === null || bruto <= 0n) return;
    setErro(null);
    setHash(null);
    try {
      const carteira = await obterCarteira();
      const plataforma = PLATFORM_FEE_WALLET_EVM as Address;
      let transacao: `0x${string}`;

      if (ehCompra) {
        setFase("assinando");
        setPasso(m.aprove);
        const { data, value } = montarCompra({
          pool,
          comprador: address,
          bruto,
          minimoDeMoedas: minimo,
          taxas: [
            ...(indicador ? [{ para: indicador, valor: taxas.affiliateFee }] : []),
            { para: plataforma, valor: taxas.platformFee },
          ],
        });
        transacao = await carteira.sendTransaction({ to: ROTEADOR, data, value, chain: robinhoodChain, account: address });
      } else {
        /* Permit2: a moeda libera o Permit2, e o Permit2 libera o roteador — como na Uniswap. */
        const liberado = await publicClient.readContract({ address: moeda as Address, abi: erc20Abi, functionName: "allowance", args: [address, PERMIT2] });
        if (liberado < bruto) {
          setFase("aprovando");
          setPasso(m.autorize);
          const h = await carteira.writeContract({ address: moeda as Address, abi: erc20Abi, functionName: "approve", args: [PERMIT2, maxUint256], chain: robinhoodChain, account: address });
          await esperarRecibo(publicClient, h);
        }
        const [quanto, validade] = await publicClient.readContract({ address: PERMIT2, abi: ABI_PERMIT2, functionName: "allowance", args: [address, moeda as Address, ROTEADOR] });
        if (quanto < bruto || validade < Math.floor(Date.now() / 1000) + 600) {
          setFase("aprovando");
          setPasso(m.autorize2);
          const h = await carteira.writeContract({
            address: PERMIT2,
            abi: ABI_PERMIT2,
            functionName: "approve",
            args: [moeda as Address, ROTEADOR, (1n << 160n) - 1n, Number((1n << 48n) - 1n)],
            chain: robinhoodChain,
            account: address,
          });
          await esperarRecibo(publicClient, h);
        }
        setFase("assinando");
        setPasso(m.venda);
        const bps = swapFeeBps("robinhood");
        const data = montarVenda({
          pool,
          moeda: moeda as Address,
          vendedor: address,
          moedas: bruto,
          minimoLiquido: minimo,
          porcoes: porcoesSequenciais([
            ...(indicador ? [{ para: indicador, bps: AFFILIATE_FEE_BPS }] : []),
            { para: plataforma, bps: indicador ? bps - AFFILIATE_FEE_BPS : bps },
          ]),
        });
        transacao = await carteira.sendTransaction({ to: ROTEADOR, data, chain: robinhoodChain, account: address });
      }

      setFase("confirmando");
      setPasso(m.confirmando);
      const recibo = await esperarRecibo(publicClient, transacao);
      if (recibo.status !== "success") throw new Error(m.recusou);
      if (indicador) {
        // Compra: comissão exata (sai do ETH enviado). Venda: sobre o ETH estimado.
        const volume = ehCompra ? bruto : cotacao !== null ? (cotacao * 10_000n) / BigInt(10_000 - swapFeeBps("robinhood")) : 0n;
        registrarIndicacaoEvm({
          afiliado: indicador,
          txHash: transacao,
          volumeEth: formatEther(volume),
          comissaoEth: formatEther(ehCompra ? taxas.affiliateFee : (volume * BigInt(AFFILIATE_FEE_BPS)) / 10_000n),
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
  }, [address, publicClient, pool, minimo, bruto, obterCarteira, ehCompra, m, indicador, taxas.affiliateFee, taxas.platformFee, moeda, cotacao]);

  return {
    executar,
    fase,
    passo,
    erro,
    hash,
    saida: cotacao === null ? null : ehCompra ? formatUnits(cotacao, decimais) : formatEther(cotacao),
    minimoGarantido: minimo === null ? null : ehCompra ? formatUnits(minimo, decimais) : formatEther(minimo),
    ocupado: fase === "aprovando" || fase === "assinando" || fase === "confirmando",
    pronto: Boolean(address && cotacao !== null),
  };
}
