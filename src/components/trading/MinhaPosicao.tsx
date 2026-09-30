"use client";
import { Preco } from "@/components/ui/Preco";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { usePublicClient } from "wagmi";
import { erc20Abi, formatUnits, type Address } from "viem";
import { usePrecoNativo } from "@/hooks/usePrecoNativo";
import { posicaoLocal } from "@/lib/posicoes-locais";
import { useAccount } from "wagmi";

import { Card, CardBody } from "@/components/ui/Card";
import { CHAINS, robinhoodChain } from "@/lib/web3";
import { cn, formatPrice, formatUsd } from "@/lib/utils";
import type { ChainId } from "@/lib/types";

/**
 * Quanto EU tenho desta moeda, e se estou ganhando ou perdendo.
 *
 * ---------------------------------------------------------------------------
 * O CÁLCULO NÃO É REFEITO AQUI
 * ---------------------------------------------------------------------------
 * `agregarTraders` já apura posição, preço médio e lucro de todas as carteiras
 * que apareceram nos negócios do par — é o que alimenta a tabela de traders.
 * Este painel só procura a carteira conectada nessa lista.
 *
 * Refazer a conta daria um segundo número para a mesma pergunta, e dois
 * números que discordam numa tela de dinheiro é pior do que um número só.
 *
 * ---------------------------------------------------------------------------
 * QUANDO NÃO DÁ PRA SABER, A TELA DIZ QUE NÃO DÁ
 * ---------------------------------------------------------------------------
 * A janela de negócios é finita. Quem comprou antes dela aparece vendendo sem
 * ter comprado, e aí o preço médio é desconhecido — `vindoDeAntes`.
 *
 * Nesse caso o painel mostra a posição e omite o lucro, em vez de inventar um
 * custo. Um lucro calculado sobre preço médio errado é o tipo de número que
 * faz alguém segurar uma perda achando que está no azul.
 */

interface Trader {
  carteira: string;
  saldo: number;
  precoMedioUsd: number | null;
  naoRealizadoUsd: number | null;
  realizadoUsd: number | null;
  lucroUsd: number | null;
  vindoDeAntes: boolean;
  compras: number;
  vendas: number;
}

interface Quadro {
  lista: Trader[];
  precoUsd: number;
}

const TEXTOS = traducoes({
  en: {
    suaPosicao: "Your position", compras: (n: number) => `${n} ${n === 1 ? "buy" : "buys"}`, vendas: (n: number) => `${n} ${n === 1 ? "sell" : "sells"}`,
    jaTinha: "You held this coin before the trades we can read, so your average price cannot be calculated.",
    precoMedio: "Average price", agora: "now", realizado: "Realized on sells", calculado: "Calculated from this pair's recent trades. Not financial advice.",
  },
  pt: {
    suaPosicao: "Sua posição", compras: (n: number) => `${n} ${n === 1 ? "compra" : "compras"}`, vendas: (n: number) => `${n} ${n === 1 ? "venda" : "vendas"}`,
    jaTinha: "Você já tinha esta moeda antes dos negócios que conseguimos ler, então não dá pra calcular o seu preço médio.",
    precoMedio: "Preço médio", agora: "agora", realizado: "Já realizado nas vendas", calculado: "Calculado sobre os negócios recentes deste par. Não é aconselhamento.",
  },
  zh: {
    suaPosicao: "你的持仓", compras: (n: number) => `${n} 次买入`, vendas: (n: number) => `${n} 次卖出`,
    jaTinha: "你在我们能读取的交易之前就已持有该代币，因此无法计算你的均价。",
    precoMedio: "均价", agora: "当前", realizado: "卖出已实现", calculado: "根据该交易对的近期交易计算，不构成投资建议。",
  },
});

export function MinhaPosicao({
  address,
  symbol,
  chain,
  precoUsd = 0,
}: {
  address: string;
  symbol: string;
  chain: ChainId;
  /** preço ao vivo da página (o mesmo do gráfico) */
  precoUsd?: number;
}) {
  const t = useTextos(TEXTOS);
  const { publicKey } = useWallet();
  const { address: enderecoEvm } = useAccount();

  const minhaCarteira =
    CHAINS[chain].kind === "solana" ? publicKey?.toBase58() : enderecoEvm;

  const [doHistorico, setEu] = useState<Trader | null>(null);
  const [precoDoQuadro, setPreco] = useState(0);
  const precoNativo = usePrecoNativo(chain);
  const [saldoNaRede, setSaldoNaRede] = useState<number | null>(null);
  const { connection } = useConnection();
  const publicClient = usePublicClient({ chainId: robinhoodChain.id });

  /* O saldo de verdade, lido da rede — não depende do histórico público. */
  useEffect(() => {
    if (!minhaCarteira) {
      setSaldoNaRede(null);
      return;
    }
    let cancelado = false;
    const ler = async () => {
      try {
        let saldo = 0;
        if (CHAINS[chain].kind === "solana") {
          const contas = await connection.getParsedTokenAccountsByOwner(new PublicKey(minhaCarteira), { mint: new PublicKey(address) });
          saldo = contas.value.reduce((acc, c) => acc + Number(c.account.data.parsed.info.tokenAmount.uiAmount ?? 0), 0);
        } else if (publicClient) {
          const [bruto, dec] = await Promise.all([
            publicClient.readContract({ address: address as Address, abi: erc20Abi, functionName: "balanceOf", args: [minhaCarteira as Address] }),
            publicClient.readContract({ address: address as Address, abi: erc20Abi, functionName: "decimals" }).catch(() => 18),
          ]);
          saldo = Number(formatUnits(bruto, Number(dec)));
        }
        if (!cancelado) setSaldoNaRede(saldo);
      } catch {
        /* rede instável: fica com o histórico */
      }
    };
    void ler();
    const id = window.setInterval(ler, 15_000);
    return () => {
      cancelado = true;
      window.clearInterval(id);
    };
  }, [minhaCarteira, address, chain, connection, publicClient]);

  useEffect(() => {
    if (!minhaCarteira) {
      setEu(null);
      return;
    }

    let cancelado = false;

    const ler = async () => {
      try {
        const res = await fetch(`/api/traders?address=${address}`, { cache: "no-store" });
        if (!res.ok) return;
        const quadro = (await res.json()) as Quadro;
        if (cancelado) return;

        const meu =
          quadro.lista?.find(
            (t) => t.carteira?.toLowerCase() === minhaCarteira.toLowerCase(),
          ) ?? null;

        setEu(meu);
        setPreco(quadro.precoUsd ?? 0);
      } catch {
        /* falha de leitura não apaga o que já está na tela */
      }
    };

    void ler();
    /*
     * Meio minuto. O painel acompanha o mercado, mas não precisa correr: a
     * fonte de negócios tem cache de 30s e pedir mais vezes devolveria o mesmo.
     */
    const timer = window.setInterval(ler, 30_000);

    return () => {
      cancelado = true;
      window.clearInterval(timer);
    };
  }, [address, minhaCarteira]);

  /* Sem carteira, ou sem posição nesta moeda: o painel não existe. */
  const saldoAtual = saldoNaRede ?? doHistorico?.saldo ?? 0;
  if (!minhaCarteira || saldoAtual <= 0) return null;
  const preco = precoUsd > 0 ? precoUsd : precoDoQuadro;

  // Preço médio: primeiro o anotado nas operações feitas aqui; senão, o do histórico público.
  const local = posicaoLocal(minhaCarteira, address);
  const medioLocal =
    local && local.tokens > 0 && precoNativo ? (local.custoNativo / local.tokens) * precoNativo : null;
  const medio = medioLocal ?? (doHistorico && !doHistorico.vindoDeAntes ? doHistorico.precoMedioUsd : null);
  const eu: Trader = {
    carteira: minhaCarteira,
    saldo: saldoAtual,
    precoMedioUsd: medio,
    naoRealizadoUsd: medio !== null ? saldoAtual * (preco - medio) : null,
    realizadoUsd: doHistorico?.realizadoUsd ?? null,
    lucroUsd: null,
    vindoDeAntes: medio === null,
    compras: local?.compras ?? doHistorico?.compras ?? 0,
    vendas: local?.vendas ?? doHistorico?.vendas ?? 0,
  };

  const valorAtual = eu.saldo * preco;

  /*
   * O lucro no papel é o que interessa aqui: é o que a pessoa ganha ou perde
   * se vender AGORA. O realizado entra à parte, porque já saiu da mesa.
   */
  const noPapel = eu.vindoDeAntes ? null : eu.naoRealizadoUsd;
  const custo = eu.vindoDeAntes ? null : eu.precoMedioUsd;

  const pct =
    noPapel !== null && custo !== null && custo > 0 && eu.saldo > 0
      ? (noPapel / (custo * eu.saldo)) * 100
      : null;

  const positivo = (noPapel ?? 0) >= 0;

  return (
    <Card className="overflow-hidden">
      <CardBody className="space-y-2.5 p-3.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            {t.suaPosicao}
          </span>
          <span className="tnum text-[11px] text-zinc-600">
            {t.compras(eu.compras)}
            {eu.vendas > 0 && ` · ${t.vendas(eu.vendas)}`}
          </span>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="tnum text-xl font-black tracking-tight text-zinc-50">
              {formatUsd(valorAtual)}
            </div>
            <div className="tnum mt-0.5 text-[11px] text-zinc-500">
              {compacto(eu.saldo)} {symbol}
            </div>
          </div>

          {noPapel !== null ? (
            <div className="text-right">
              <div
                className={cn(
                  "tnum text-lg font-black tracking-tight",
                  positivo ? "text-bull" : "text-bear",
                )}
              >
                {positivo ? "+" : "−"}
                {formatUsd(Math.abs(noPapel))}
              </div>
              {pct !== null && (
                <div
                  className={cn(
                    "tnum text-[11px] font-semibold",
                    positivo ? "text-bull/80" : "text-bear/80",
                  )}
                >
                  {positivo ? "+" : "−"}
                  {Math.abs(pct).toFixed(1)}%
                </div>
              )}
            </div>
          ) : // Preço médio ainda desconhecido (histórico carregando ou moeda
          // recebida de fora): mostra só o valor, sem aviso — o lucro entra
          // sozinho quando der pra calcular.
          null}
        </div>

        {custo !== null && (
          <div className="flex items-center justify-between border-t border-white/[0.06] pt-2 text-[11px]">
            <span className="text-zinc-600">{t.precoMedio}</span>
            <span className="tnum text-zinc-400">
              $<Preco valor={custo} />
              <span className="ml-2 text-zinc-600">{t.agora} $<Preco valor={preco} /></span>
            </span>
          </div>
        )}

        {/*
          O lucro já REALIZADO fica separado do lucro no papel.
          Somar os dois num número só esconde a diferença entre dinheiro que
          entrou na carteira e dinheiro que só existe enquanto o preço aguentar.
        */}
        {eu.realizadoUsd !== null && eu.vendas > 0 && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-600">{t.realizado}</span>
            <span
              className={cn("tnum font-semibold", eu.realizadoUsd >= 0 ? "text-bull" : "text-bear")}
            >
              {eu.realizadoUsd >= 0 ? "+" : "−"}
              {formatUsd(Math.abs(eu.realizadoUsd))}
            </span>
          </div>
        )}

        <p className="text-[10px] leading-relaxed text-zinc-700">
          {t.calculado}
        </p>
      </CardBody>
    </Card>
  );
}

/** 793.100.000 vira "793,1M": o número inteiro não cabe e não informa. */
function compacto(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", ",")}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2).replace(".", ",")}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2).replace(".", ",")}K`;
  return n.toFixed(n >= 1 ? 2 : 6).replace(".", ",");
}
