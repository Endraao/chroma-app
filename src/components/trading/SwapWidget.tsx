"use client";
import { Preco } from "@/components/ui/Preco";

import { useIdioma, useTextos } from "@/components/IdiomaProvider";
import { traducoes, traduzirDoServidor } from "@/lib/idiomas";
import { explicarErroDaCarteira } from "@/lib/erros-da-carteira";
import { feeLabelFor } from "@/lib/fees";
import { anotarOperacao, avisarNegocio } from "@/lib/posicoes-locais";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAccount, usePublicClient } from "wagmi";
import { erc20Abi, formatEther, formatUnits, type Address } from "viem";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { RequireChainWallet } from "@/components/web3/RequireChainWallet";
import { useAffiliateTracking } from "@/hooks/useAffiliateTracking";
import { usePrecoDoSol } from "@/hooks/usePrecoDoSol";
import { useTradeSolana } from "@/hooks/useTradeSolana";
import { useCurvaEvm } from "@/hooks/useCurvaEvm";
import { useCurvaSwapEvm } from "@/hooks/useCurvaSwapEvm";
import { usePrecoNativo } from "@/hooks/usePrecoNativo";
import { useSwapExternoEvm } from "@/hooks/useSwapExternoEvm";
import { useCurvaPons, useSwapPons } from "@/hooks/useSwapPons";
import type { Negociavel } from "@/lib/negociavel-evm";
import { esperarRecibo, useCarteiraRobinhood } from "@/hooks/useCarteiraRobinhood";
import { ABI_DA_CURVA, CHROMA_CURVE_EVM } from "@/lib/chroma-evm";
import { CHAINS, robinhoodChain } from "@/lib/web3";
import { cn, formatPrice, formatUsd, shortenAddress } from "@/lib/utils";
import type { ChainId, TradeSide } from "@/lib/types";

/**
 * O painel de compra e venda.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ELE MUDOU DE CARA
 * ---------------------------------------------------------------------------
 * A versão anterior era um formulário de DEX: campo "você paga", campo "você
 * recebe", linha de slippage, linha de impacto, linha de rota. Seis coisas pra
 * ler antes de apertar um botão.
 *
 * Numa meme coin a decisão não é essa. Quem chegou até aqui já decidiu que
 * quer entrar, e a única pergunta que sobrou é QUANTO. Então sobrou uma coisa
 * na tela: o valor, grande, no meio. O resto foi pra baixo da engrenagem.
 *
 * ---------------------------------------------------------------------------
 * O SLIPPAGE SAIU DA TELA, MAS NÃO DA TRANSAÇÃO
 * ---------------------------------------------------------------------------
 * Isto é importante e vale dizer com todas as letras: o controle não aparece
 * mais no painel, mas o LIMITE continua sendo enviado na ordem.
 *
 * Slippage é o que impede a sua compra de sair a qualquer preço. Sem limite
 * nenhum, um bot vê a sua transação esperando na fila, compra na frente pra
 * empurrar o preço, deixa você comprar caro e vende logo atrás — é o golpe
 * mais comum de DEX, e chama sandwich. Tirar o campo da tela é decisão de
 * interface; tirar o limite da ordem seria entregar quem usa o site.
 *
 * Então ele virou o que sempre foi na prática: uma configuração. Fica na
 * engrenagem, com padrão seguro, pra quem sabe o que faz mexer.
 */

/** Valores em dólar, do jeito que se pensa em tamanho de ordem. */
const ATALHOS_EM_DOLAR = [10, 100, 500, 1000];
/** Porcentagens do saldo — de SOL na compra, do token na venda. */
const ATALHOS_EM_PORCENTAGEM = [25, 50, 75, 100];

const SLIPPAGES = [1, 3, 5, 10];

/** ETH guardado pro gás quando a pessoa aperta "Máx" na compra da Robinhood. */
const RESERVA_DE_REDE_ETH = 0.0002;
const SLIPPAGE_PADRAO = 3;

/**
 * Quanto de SOL fica de lado quando a pessoa manda "100%".
 *
 * Sem isso, gastar o saldo inteiro deixa a carteira sem como pagar a taxa de
 * rede — e a transação falha DEPOIS de assinada, que é a pior hora possível.
 */
const RESERVA_DE_REDE_SOL = 0.02;

const TEXTOS = traducoes({
  en: {
    usaSaldoMenos: (r: number) => `Uses your balance minus ${r} SOL, to keep network fee`,
    venderTodos: (s: string) => `Sell all your ${s}`,
    saldo: "balance", max: "max", maxMaiusc: "Max", curvaDaChroma: "Chroma curve", curvaDaChromaMaiusc: "Chroma curve",
    impacto: (p: React.ReactNode) => <>This order moves the price by {p}. It is too large for the available liquidity: you buy at a worse price and whoever sells afterwards gets less.</>,
    semRota: "No route for this amount — it may be too small to trade.",
    compraFeita: "Buy completed", vendaFeita: "Sell completed", verNoExplorador: "view transaction ↗",
    confirmado: "Confirmed!", verSolscan: "view on Solscan ↗", processando: "Processing…", informeValor: "Enter an amount",
    cotando: "Quoting…", tentarDeNovo: "Try again", comprar: "Buy", vender: "Sell",
    precisaCotacao: "Needs the SOL price, which did not load", conecteParaPct: "Connect your wallet to use a percentage of your balance",
    procurandoRota: "finding route…", diretoNaCurva: "directly on the Chroma curve", viaJupiter: "routed via Jupiter",
    semCotacaoSol: "SOL price unavailable right now — the amount above is in SOL",
    ajustes: "Order settings", slippageMax: "Max slippage",
    explicaSlippage: (c: React.ReactNode) => <>How much the price may get worse between signing and execution. Beyond this limit the transaction is {c} instead of going through at any price. It protects you from losing value in a sudden swing.</>,
    cancelada: "cancelled", minimo: "Minimum received", rota: "Route",
    naoNegocia: "This coin only trades on the platform where it was created",
    naoNegociaTexto: (rede: string) => `Its pool on ${rede} does not accept outside routers (or it is still on its launchpad's curve), so it cannot be bought or sold through Chroma. Coins created on Chroma and coins with open Uniswap pools trade here normally.`,
    verificando: "Checking whether this coin can be traded here…",
    verExplorer: "View on explorer ↗", voceBaga: "You pay", saldoDois: "Balance:", voceRecebe: "You receive (estimated)",
    slippage: "Slippage", taxa12: "1.2% fee", taxaDe: (p: string) => `${p} fee`,
    curvaEncheu: "The curve is full. The liquidity still has to be moved to Uniswap — anyone can do it, it only costs the network fee. After that the coin trades anywhere.",
    levando: "Moving to Uniswap…", levar: "Move to Uniswap", indisponivel: "Unavailable right now", saldoInsuficiente: "Insufficient balance",
    duasAssinaturas: "Selling asks for two signatures: one allowing the curve to take the tokens and one for the sale itself. The approval is for the exact amount, never unlimited.",
    verTransacao: "view transaction",
  },
  pt: {
    usaSaldoMenos: (r: number) => `Usa o saldo menos ${r} SOL, pra sobrar taxa de rede`,
    venderTodos: (s: string) => `Vender todos os seus ${s}`,
    saldo: "saldo", max: "máx", maxMaiusc: "Máx", curvaDaChroma: "curva da Chroma", curvaDaChromaMaiusc: "Curva da Chroma",
    impacto: (p: React.ReactNode) => <>Esta ordem move o preço em {p}. É grande demais para a liquidez disponível: você compra a um preço pior e quem vender depois recebe menos.</>,
    semRota: "Não há rota para esse valor — ele pode ser pequeno demais para negociar.",
    compraFeita: "Compra feita", vendaFeita: "Venda feita", verNoExplorador: "ver transação ↗",
    confirmado: "Confirmado!", verSolscan: "ver no Solscan ↗", processando: "Processando…", informeValor: "Informe um valor",
    cotando: "Cotando…", tentarDeNovo: "Tentar de novo", comprar: "Comprar", vender: "Vender",
    precisaCotacao: "Precisa da cotação do SOL, que não carregou", conecteParaPct: "Conecte a carteira pra usar porcentagem do saldo",
    procurandoRota: "procurando rota…", diretoNaCurva: "direto na curva da Chroma", viaJupiter: "rota via Jupiter",
    semCotacaoSol: "cotação do SOL indisponível no momento — o valor acima está em SOL",
    ajustes: "Ajustes da ordem", slippageMax: "Slippage máximo",
    explicaSlippage: (c: React.ReactNode) => <>O quanto o preço pode piorar entre você assinar e a ordem ser executada. Acima desse limite a transação é {c} em vez de sair a qualquer preço. É o que protege você de perder valor numa oscilação brusca.</>,
    cancelada: "cancelada", minimo: "Mínimo garantido", rota: "Rota",
    naoNegocia: "Esta moeda só negocia na plataforma onde foi criada",
    naoNegociaTexto: (rede: string) => `A pool dela na ${rede} não aceita roteadores de fora (ou ela ainda está na curva da plataforma de origem), então não dá pra comprar nem vender pela Chroma. Moedas criadas na Chroma e moedas com pool aberta na Uniswap negociam aqui normalmente.`,
    verificando: "Verificando se esta moeda pode ser negociada aqui…",
    verExplorer: "Ver no explorer ↗", voceBaga: "Você paga", saldoDois: "Saldo:", voceRecebe: "Você recebe (estimado)",
    slippage: "Slippage", taxa12: "taxa 1.2%", taxaDe: (p: string) => `taxa ${p}`,
    curvaEncheu: "A curva encheu. Falta levar a liquidez pra Uniswap — qualquer pessoa pode fazer isso, custa só a taxa de rede. Depois disso a moeda negocia em qualquer lugar.",
    levando: "Levando pra Uniswap…", levar: "Levar pra Uniswap", indisponivel: "Indisponível agora", saldoInsuficiente: "Saldo insuficiente",
    duasAssinaturas: "Vender pede duas assinaturas: uma autorizando a curva a retirar os tokens e outra da venda em si. A autorização é pelo valor exato, não infinita.",
    verTransacao: "ver a transação",
  },
  zh: {
    usaSaldoMenos: (r: number) => `使用余额减去 ${r} SOL，保留网络手续费`,
    venderTodos: (s: string) => `卖出全部 ${s}`,
    saldo: "余额", max: "最大", maxMaiusc: "最大", curvaDaChroma: "Chroma 曲线", curvaDaChromaMaiusc: "Chroma 曲线",
    impacto: (p: React.ReactNode) => <>该订单会使价格变动 {p}。相对于现有流动性过大：你会以更差的价格买入，之后卖出的人获得更少。</>,
    semRota: "该金额没有可用路由——可能金额太小，无法交易。",
    compraFeita: "买入成功", vendaFeita: "卖出成功", verNoExplorador: "查看交易 ↗",
    confirmado: "已确认！", verSolscan: "在 Solscan 查看 ↗", processando: "处理中…", informeValor: "请输入金额",
    cotando: "报价中…", tentarDeNovo: "重试", comprar: "买入", vender: "卖出",
    precisaCotacao: "需要 SOL 报价，但未能加载", conecteParaPct: "连接钱包后可按余额百分比下单",
    procurandoRota: "正在寻找路由…", diretoNaCurva: "直接在 Chroma 曲线上成交", viaJupiter: "经由 Jupiter 路由",
    semCotacaoSol: "暂时无法获取 SOL 报价 —— 上方金额以 SOL 计",
    ajustes: "订单设置", slippageMax: "最大滑点",
    explicaSlippage: (c: React.ReactNode) => <>从签名到执行之间价格可以变差的幅度。超过这个限度，交易会被{c}，而不是以任意价格成交。这能保护你免受剧烈波动带来的损失。</>,
    cancelada: "取消", minimo: "最少获得", rota: "路由",
    naoNegocia: "该代币只能在其创建平台上交易",
    naoNegociaTexto: (rede: string) => `它在 ${rede} 上的池子不接受外部路由（或仍处于其发行平台的曲线阶段），因此无法通过 Chroma 买卖。在 Chroma 创建的代币以及拥有开放 Uniswap 池子的代币可在这里正常交易。`,
    verificando: "正在检查该代币能否在这里交易…",
    verExplorer: "在浏览器中查看 ↗", voceBaga: "你支付", saldoDois: "余额：", voceRecebe: "你将获得（预估）",
    slippage: "滑点", taxa12: "手续费 1.2%", taxaDe: (p: string) => `手续费 ${p}`,
    curvaEncheu: "曲线已满，还需把流动性迁移到 Uniswap —— 任何人都可以操作，只需支付网络手续费。之后代币可以在任何地方交易。",
    levando: "正在迁移到 Uniswap…", levar: "迁移到 Uniswap", indisponivel: "暂不可用", saldoInsuficiente: "余额不足",
    duasAssinaturas: "卖出需要两次签名：一次授权曲线转走代币，一次执行卖出本身。授权额度精确到本次数量，绝不无限授权。",
    verTransacao: "查看交易",
  },
});

export function SwapWidget({
  symbol,
  chain,
  tokenAddress,
  pool = null,
  priceUsd,
  naCurvaDaChroma = false,
  compacto = false,
  linkFora,
}: {
  symbol: string;
  chain: ChainId;
  tokenAddress: string;
  /** o par na DEX (id da pool v4 na Robinhood), quando conhecido */
  pool?: string | null;
  /** preço ao vivo, vindo do gráfico — a ponte entre token e dólar */
  priceUsd: number;
  /** moeda da Curva da Chroma: taxa do site reduzida (ver fees.ts) */
  naCurvaDaChroma?: boolean;
  /** Versão curta pra janela dentro do post do X: só valor, atalhos e o botão. */
  compacto?: boolean;
  /** Onde comprar se a carteira não aparecer dentro do post. */
  linkFora?: string;
}) {
  const meta = CHAINS[chain];

  return meta.kind === "solana" ? (
    <SolanaSwap symbol={symbol} chain={chain} tokenAddress={tokenAddress} priceUsd={priceUsd} naCurvaDaChroma={naCurvaDaChroma} compacto={compacto} linkFora={linkFora} />
  ) : (
    <EvmSwap symbol={symbol} chain={chain} tokenAddress={tokenAddress} pool={pool} />
  );
}

/* ------------------------------------------------------------------ */
/* Solana — implementado de ponta a ponta                              */
/* ------------------------------------------------------------------ */

function SolanaSwap({
  symbol,
  chain,
  tokenAddress,
  pool = null,
  priceUsd,
  naCurvaDaChroma = false,
  compacto = false,
  linkFora,
}: {
  symbol: string;
  chain: ChainId;
  tokenAddress: string;
  /** o par na DEX (id da pool v4 na Robinhood), quando conhecido */
  pool?: string | null;
  priceUsd: number;
  naCurvaDaChroma?: boolean;
  compacto?: boolean;
  linkFora?: string;
}) {
  const t = useTextos(TEXTOS);
  const [side, setSide] = useState<TradeSide>("buy");
  const [digitado, setDigitado] = useState("");
  const [slippage, setSlippage] = useState(SLIPPAGE_PADRAO);

  const { affiliate, affiliateRef } = useAffiliateTracking(chain);
  const { connected, publicKey } = useWallet();
  const precoDoSol = usePrecoDoSol();
  const idiomaSol = useIdioma();

  const comprando = side === "buy";

  /*
   * A unidade do campo grande.
   *
   * Comprando, a pessoa pensa em dólar — mas a transação é em SOL, e sem a
   * cotação não dá pra converter. Nesse caso o campo passa a pedir SOL e diz
   * isso na tela, em vez de inventar um câmbio.
   */
  // Compra em DÓLAR (pedido do dono: "coloco 5, quero 5 dólares"). Sem a
  // cotação do SOL volta a pedir SOL — nunca inventa câmbio.
  const emDolar = comprando && Boolean(precoDoSol && precoDoSol > 0);
  const digitadoNum = Number(digitado) || 0;

  /*
   * O valor que vai pra ordem, DERIVADO do campo — não é um segundo estado.
   *
   * Guardar os dois e sincronizar com efeito é como isso costuma ser feito, e
   * é justamente onde nasce o bug clássico do painel de swap: o número da tela
   * e o número da transação ficam um render fora de passo, e a pessoa assina
   * um valor diferente do que leu.
   */
  const amount =
    digitadoNum > 0 ? String(emDolar && precoDoSol ? digitadoNum / precoDoSol : digitadoNum) : "";

  const swap = useTradeSolana({
    naCurvaDaChroma,
    tokenMint: tokenAddress,
    tokenSymbol: symbol,
    side,
    amount,
    slippageBps: slippage * 100,
    affiliate,
    affiliateRef,
  });

  const [recibo, setRecibo] = useState<Recibo | null>(null);

  // Anota a operação pro painel "Sua posição" (preço médio em SOL) e mostra o recibo.
  useEffect(() => {
    if (!swap.signature || !publicKey) return;
    const tokens = comprando ? Number(swap.outAmount ?? 0) : Number(amount);
    const sol = comprando ? Number(amount) : Number(swap.outAmount ?? 0);
    anotarOperacao(publicKey.toBase58(), tokenAddress, side, tokens, sol);
    const usdDoNegocio = comprando && emDolar ? digitadoNum : sol * (precoDoSol ?? 0);
    avisarNegocio({ moeda: tokenAddress, carteira: publicKey.toBase58(), lado: side, tokens, usd: usdDoNegocio, hash: swap.signature });
    setRecibo({
      lado: side,
      usd: usdDoNegocio,
      tokens,
      simbolo: symbol,
      nativo: sol,
      simboloNativo: "SOL",
      link: `https://solscan.io/tx/${swap.signature}`,
    });
    setDigitado("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só no momento em que a operação confirma
  }, [swap.signature]);

  /* Trocar de lado zera o campo: 50 dólares e 50 milhões de tokens não são a
     mesma ordem, e reaproveitar o número faria alguém vender sem querer. */
  function trocarLado(s: TradeSide) {
    if (s === side) return;
    setSide(s);
    setDigitado("");
  }

  function atalhoEmDolar(usd: number) {
    if (comprando) {
      // Campo em dólar: vai direto. Em SOL: converte pelo preço do SOL.
      if (emDolar) setDigitado(String(usd));
      else if (precoDoSol && precoDoSol > 0) setDigitado(arredondar(usd / precoDoSol, 4));
      return;
    }
    if (priceUsd <= 0) return;
    setDigitado(arredondar(usd / priceUsd, swap.tokenDecimals ?? 6));
  }

  function atalhoEmPorcentagem(pct: number) {
    if (swap.balance === null) return;

    if (comprando) {
      /* No 100% sobra o troco da taxa de rede; nos parciais não precisa. */
      const disponivel =
        pct === 100 ? Math.max(0, swap.balance - RESERVA_DE_REDE_SOL) : swap.balance;
      const parte = (disponivel * pct) / 100;
      if (parte <= 0) return setDigitado("");
      setDigitado(emDolar && precoDoSol ? arredondar(parte * precoDoSol, 2) : arredondar(parte, 4));
      return;
    }

    const parte = (swap.balance * pct) / 100;
    /*
     * Corta pra BAIXO, não arredonda.
     *
     * Arredondar podia pedir mais do que a pessoa tem: um saldo de
     * 3,0030004999 com seis casas viraria 3,003001 — um milionésimo a mais que
     * o saldo. A transação seria assinada e recusada pela rede por saldo
     * insuficiente, e o motivo não apareceria em lugar nenhum da tela.
     *
     * No 100% isso é o caso normal, não o raro: é exatamente quando o número
     * encosta no limite.
     */
    setDigitado(parte > 0 ? cortar(parte, swap.tokenDecimals ?? 6) : "");
  }

  const semValor = digitadoNum <= 0;
  const atalhoDolarLigado = comprando ? emDolar || Boolean(precoDoSol && precoDoSol > 0) : priceUsd > 0;
  const atalhoPctLigado = swap.balance !== null && swap.balance > 0;

  /*
   * O impacto no preço só aparece quando é ALTO.
   *
   * Mostrado sempre, com 0,03% na maioria das ordens, vira um número que a
   * pessoa aprende a ignorar — e aí não serve pra nada no dia em que estiver
   * em 18%. Calado abaixo de 2%, ele volta a ser um aviso.
   */

  return (
    <Card className="overflow-hidden">
      <AbasDeLado side={side} onChange={trocarLado} />
      {/* Mesmo formato do painel da Robinhood: as duas redes com a mesma cara. */}
      <div className={cn("px-4 pt-1", compacto ? "space-y-2 pb-3" : "space-y-3 pb-4")}>
        <div className="flex items-baseline justify-between text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          <span>{t.voceBaga}</span>
          {swap.balance !== null && (
            <button
              type="button"
              onClick={() => atalhoEmPorcentagem(100)}
              disabled={swap.balance <= 0}
              title={comprando ? t.usaSaldoMenos(RESERVA_DE_REDE_SOL) : t.venderTodos(symbol)}
              className="tnum normal-case tracking-normal text-zinc-500 hover:text-zinc-200 disabled:cursor-not-allowed"
            >
              {t.saldoDois} <Preco valor={swap.balance} casas={comprando ? 4 : 2} /> {comprando ? "SOL" : symbol}
              <span className="ml-1 font-bold text-marca">{t.maxMaiusc}</span>
            </button>
          )}
        </div>

        <label className={cn("flex items-center gap-2 rounded-lg border border-ink-600 bg-ink-950/60 px-3 focus-within:border-marca/50", compacto ? "py-2" : "py-3")}>
          <input
            inputMode="decimal"
            value={digitado}
            onChange={(e) => setDigitado(saneia(e.target.value))}
            placeholder="0.0"
            className="tnum min-w-0 flex-1 bg-transparent text-2xl font-bold text-zinc-100 outline-none placeholder:text-zinc-700"
          />
          <span className="shrink-0 text-[13px] font-bold text-zinc-400">{comprando ? (emDolar ? "USD" : "SOL") : symbol}</span>
        </label>
        {emDolar && digitadoNum > 0 && (
          <p className="tnum -mt-1.5 px-1 text-[11px] text-zinc-500">
            ≈ <Preco valor={Number(amount)} casas={4} /> SOL
          </p>
        )}

        <div className="grid grid-cols-4 gap-2">
          {comprando
            ? ATALHOS_EM_DOLAR.map((v) => (
                <Atalho
                  key={v}
                  rotulo={`$${v}`}
                  tom="buy"
                  ligado={atalhoDolarLigado}
                  onClick={() => atalhoEmDolar(v)}
                  titulo={atalhoDolarLigado ? undefined : t.precisaCotacao}
                />
              ))
            : ATALHOS_EM_PORCENTAGEM.map((v) => (
                <Atalho
                  key={v}
                  rotulo={v === 100 ? t.maxMaiusc : `${v}%`}
                  tom="sell"
                  ligado={atalhoPctLigado}
                  onClick={() => atalhoEmPorcentagem(v)}
                  titulo={atalhoPctLigado ? undefined : t.conecteParaPct}
                />
              ))}
        </div>

        {compacto ? (
          <p className="tnum px-1 text-[12px] text-zinc-400">
            {t.voceRecebe}:{" "}
            <span className="font-bold text-zinc-200">
              {swap.quote && Number(swap.outAmount) > 0
                ? `${Number(swap.outAmount).toLocaleString(undefined, { maximumFractionDigits: comprando ? 0 : 6 })} ${comprando ? symbol : "SOL"}`
                : "—"}
            </span>
          </p>
        ) : (
        <>
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{t.voceRecebe}</p>
          <div className="tnum px-1 py-1 text-xl font-bold text-zinc-200">
            {swap.quote && Number(swap.outAmount) > 0
              ? `${Number(swap.outAmount).toLocaleString(undefined, { maximumFractionDigits: comprando ? 0 : 6 })} ${comprando ? symbol : "SOL"}`
              : "—"}
          </div>
        </div>

        <div className="space-y-1.5 text-[11.5px]">
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">{t.slippage}</span>
            <div className="flex gap-1">
              {[1, 3, 5].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setSlippage(pct)}
                  className={cn(
                    "tnum rounded border px-2 py-0.5 text-[11px] font-semibold",
                    slippage === pct ? "border-marca bg-marca/15 text-marca" : "border-ink-600 text-zinc-500 hover:text-zinc-200",
                  )}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">{t.minimo}</span>
            <span className="tnum text-zinc-300">
              {swap.quote ? `${Number(swap.minReceived).toLocaleString(undefined, { maximumFractionDigits: comprando ? 0 : 6 })} ${comprando ? symbol : "SOL"}` : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">{t.rota}</span>
            <span className="text-zinc-300">
              {swap.carregandoRota ? t.procurandoRota : swap.naCurva ? t.curvaDaChromaMaiusc : `${swap.quote && "routePlan" in swap.quote && swap.quote.routePlan.length && swap.quote.routePlan.every((r) => /^pump.?fun$/i.test(r.swapInfo.label ?? "")) ? "Chroma" : "Jupiter"}, ${t.taxaDe(naCurvaDaChroma ? "0,3%" : feeLabelFor("solana").swap)}`}
            </span>
          </div>
        </div>

        </>
        )}

        {swap.motivoTravado && (
          <p className="rounded-lg border border-warn/25 bg-warn/[0.06] px-3 py-2 text-[11px] leading-snug text-warn">{swap.motivoTravado}</p>
        )}

        <RequireChainWallet chain="solana" compacto={compacto} linkFora={linkFora} rotuloFora={`${comprando ? t.comprar : t.vender} ${symbol} ↗`}>
          <Button
            variant={comprando ? "buy" : "sell"}
            size="lg"
            className="w-full"
            disabled={!swap.canSwap || swap.phase === "executing"}
            onClick={swap.execute}
          >
            {swap.phase === "executing"
              ? traduzirDoServidor(swap.step, idiomaSol) || t.processando
              : semValor
                ? t.informeValor
                : swap.phase === "quoting"
                  ? t.cotando
                  : swap.phase === "error"
                    ? t.tentarDeNovo
                    : `${comprando ? t.comprar : t.vender} ${symbol}`}
          </Button>
        </RequireChainWallet>

        {swap.error && (
          <p className="text-[11px] leading-relaxed text-bear">
            {/* "No routes found" da Jupiter: quase sempre valor pequeno demais (poeira) ou moeda sem liquidez. */}
            {/NO_ROUTES_FOUND|No routes found|COULD_NOT_FIND_ANY_ROUTE/i.test(swap.error) ? t.semRota : explicarErroDaCarteira(traduzirDoServidor(swap.error, idiomaSol), idiomaSol)}
          </p>
        )}
        {recibo && <ReciboDaOperacao recibo={recibo} onFechar={() => setRecibo(null)} />}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Peças                                                               */
/* ------------------------------------------------------------------ */

/**
 * O valor, grande, no meio do painel.
 *
 * É um `<input>` de verdade, não um display: clicar em qualquer ponto do
 * número põe o cursor pra digitar. A largura acompanha o conteúdo pra ele
 * ficar centrado JUNTO com o cifrão — senão o cifrão fica solto na esquerda e
 * o número torto no meio.
 */
function CampoDeValor({
  valor,
  onChange,
  emDolar,
  comprando,
  emSol,
  equivalenteUsd,
  simbolo,
}: {
  valor: string;
  onChange: (v: string) => void;
  emDolar: boolean;
  comprando: boolean;
  emSol: number;
  equivalenteUsd: number;
  simbolo: string;
}) {
  const t = useTextos(TEXTOS);
  const campo = useRef<HTMLInputElement>(null);
  const largura = Math.max(1, (valor || "0").length);

  return (
    <div
      role="presentation"
      onClick={() => campo.current?.focus()}
      className="cursor-text pt-6 text-center"
    >
      <div className="flex items-end justify-center gap-1">
        {emDolar && <span className="pb-0.5 text-[28px] font-bold leading-none text-zinc-600">$</span>}
        <input
          ref={campo}
          inputMode="decimal"
          value={valor}
          placeholder="0"
          size={largura}
          onChange={(e) => onChange(saneia(e.target.value))}
          className="tnum min-w-0 bg-transparent text-center text-[40px] font-bold leading-none text-zinc-100 outline-none placeholder:text-zinc-600"
        />
        {!emDolar && (
          <span className="pb-1 text-[15px] font-bold leading-none text-zinc-600">
            {comprando ? "SOL" : simbolo}
          </span>
        )}
      </div>

      {/*
        A segunda unidade, embaixo e pequena.

        Fica visível mesmo em zero. É o que garante que ninguém digite achando
        que está mandando dólar quando está mandando SOL — ou o contrário, que
        é cem vezes pior.
      */}
      <p className="tnum mt-2 min-h-[16px] text-[12px] text-zinc-600">
        {comprando ? (
          emDolar ? (
            <>≈ <Preco valor={emSol} casas={4} /> SOL</>
          ) : (
            <span className="text-warn/80">{t.semCotacaoSol}</span>
          )
        ) : (
          <>≈ $<Preco valor={equivalenteUsd} casas={2} /></>
        )}
      </p>
    </div>
  );
}

/**
 * As abas de comprar e vender.
 *
 * A ativa é CHAPADA, não um contorno aceso: em que lado você está é a
 * informação mais cara do painel — apertar "vender" achando que está comprando
 * custa dinheiro, e contorno não é diferença suficiente pra isso.
 */
function AbasDeLado({
  side,
  onChange,
  disabled,
}: {
  side: TradeSide;
  onChange: (s: TradeSide) => void;
  disabled?: boolean;
}) {
  const t = useTextos(TEXTOS);
  return (
    <div className="grid grid-cols-2 gap-1.5 p-1.5">
      {(["buy", "sell"] as TradeSide[]).map((s) => {
        const ativo = side === s;
        return (
          <button
            key={s}
            disabled={disabled}
            onClick={() => onChange(s)}
            className={cn(
              "rounded-lg py-2.5 text-[14px] font-bold transition-colors disabled:opacity-40",
              ativo
                ? s === "buy"
                  ? "bg-bull text-ink-950"
                  : "bg-bear text-ink-950"
                : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300",
            )}
          >
            {s === "buy" ? t.comprar : t.vender}
          </button>
        );
      })}
    </div>
  );
}

function Atalho({
  rotulo,
  tom,
  ligado,
  onClick,
  titulo,
}: {
  rotulo: string;
  tom: "buy" | "sell";
  ligado: boolean;
  onClick: () => void;
  titulo?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!ligado}
      title={titulo}
      /* Sem isto o leitor de tela anuncia o `title` no lugar do rótulo, e o
         botão "25%" passa a se chamar "Conecte a carteira…". */
      aria-label={rotulo}
      className={cn(
        "rounded-lg border py-2 text-[13px] font-semibold transition-colors",
        !ligado
          ? "cursor-not-allowed border-ink-700 text-zinc-700"
          : tom === "buy"
            ? "border-bull/25 bg-bull/[0.08] text-bull hover:bg-bull/[0.16]"
            : "border-bear/25 bg-bear/[0.08] text-bear hover:bg-bear/[0.16]",
      )}
    >
      {rotulo}
    </button>
  );
}

/**
 * A engrenagem: onde o slippage foi morar.
 *
 * Junto com ele ficam o mínimo garantido e a rota — os dois números que
 * respondem "e se der errado?". Não somem do produto; só param de ocupar a
 * tela de quem só quer apertar comprar.
 */
function Engrenagem({
  slippage,
  setSlippage,
  minimoGarantido,
  rota,
}: {
  slippage: number;
  setSlippage: (v: number) => void;
  minimoGarantido: string | null;
  rota: string | null;
}) {
  const t = useTextos(TEXTOS);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  /* Fecha ao clicar fora — senão o menu fica pendurado sobre o painel. */
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  return (
    <div ref={caixa} className="relative">
      <button
        onClick={() => setAberto((v) => !v)}
        aria-label={t.ajustes}
        aria-expanded={aberto}
        className={cn(
          "grid size-7 place-items-center rounded-lg transition-colors",
          aberto ? "bg-white/[0.06] text-zinc-200" : "text-zinc-600 hover:text-zinc-300",
        )}
      >
        <IconeDeEngrenagem />
      </button>

      {aberto && (
        <div className="panel absolute right-0 top-9 z-30 w-[268px] p-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-zinc-200">{t.slippageMax}</span>
            <span className="tnum text-[12px] font-bold text-marca">{slippage}%</span>
          </div>

          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {SLIPPAGES.map((s) => (
              <button
                key={s}
                onClick={() => setSlippage(s)}
                className={cn(
                  "rounded-md py-1.5 text-[12px] font-semibold transition-colors",
                  slippage === s
                    ? "bg-marca/20 text-marca"
                    : "bg-white/[0.03] text-zinc-500 hover:text-zinc-300",
                )}
              >
                {s}%
              </button>
            ))}
          </div>

          <p className="mt-2.5 text-[11px] leading-snug text-zinc-500">
            {t.explicaSlippage(<strong className="font-semibold text-zinc-400">{t.cancelada}</strong>)}
          </p>

          {(minimoGarantido || rota) && (
            <div className="mt-3 space-y-1 border-t border-ink-700 pt-2.5 text-[11px]">
              {minimoGarantido && (
                <div className="flex items-center justify-between gap-2">
                  <span className="shrink-0 text-zinc-500">{t.minimo}</span>
                  <span className="tnum truncate font-semibold text-zinc-300">
                    {minimoGarantido}
                  </span>
                </div>
              )}
              {rota && (
                <div className="flex items-center justify-between gap-2">
                  <span className="shrink-0 text-zinc-500">{t.rota}</span>
                  <span className="truncate text-zinc-400">{rota}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IconeDeEngrenagem() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[17px]">
      <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M19.1 14.2a1.5 1.5 0 0 0 .3 1.65l.05.06a1.82 1.82 0 1 1-2.58 2.58l-.05-.06a1.5 1.5 0 0 0-1.66-.3 1.5 1.5 0 0 0-.91 1.38v.15a1.82 1.82 0 0 1-3.64 0v-.08a1.5 1.5 0 0 0-.98-1.37 1.5 1.5 0 0 0-1.65.3l-.06.06a1.82 1.82 0 1 1-2.58-2.58l.06-.06a1.5 1.5 0 0 0 .3-1.65 1.5 1.5 0 0 0-1.38-.92h-.15a1.82 1.82 0 1 1 0-3.64h.08a1.5 1.5 0 0 0 1.37-.98 1.5 1.5 0 0 0-.3-1.65l-.06-.06A1.82 1.82 0 1 1 7.84 4.4l.06.06a1.5 1.5 0 0 0 1.65.3h.07a1.5 1.5 0 0 0 .91-1.38v-.15a1.82 1.82 0 0 1 3.64 0v.08a1.5 1.5 0 0 0 .92 1.37 1.5 1.5 0 0 0 1.65-.3l.06-.06a1.82 1.82 0 1 1 2.58 2.58l-.06.06a1.5 1.5 0 0 0-.3 1.65v.07a1.5 1.5 0 0 0 1.38.91h.15a1.82 1.82 0 0 1 0 3.64h-.08a1.5 1.5 0 0 0-1.37.92Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* EVM — curva da Chroma na Robinhood Chain                            */
/* ------------------------------------------------------------------ */

/**
 * Compra e venda na curva da Robinhood.
 *
 * Só atende MOEDA DA CURVA. Token externo nesta rede continua sem caminho:
 * ele depende do `ChromaRouter` repassando para a Uniswap, que é outro
 * trabalho. Dizer "em breve" para esse caso é verdade; dizer para a moeda da
 * curva deixou de ser.
 */
function EvmSwap({
  symbol,
  chain,
  tokenAddress,
  pool,
}: {
  symbol: string;
  chain: ChainId;
  tokenAddress: string;
  pool: string | null;
}) {
  const t = useTextos(TEXTOS);
  const meta = CHAINS[chain];
  const { curva, podeComprar, podeVender, carregando } = useCurvaEvm(tokenAddress);
  // Moeda na curva da Pons (lançada pela Chroma ou não): negocia pelo ChromaPons.
  const { pons, carregando: carregandoPons } = useCurvaPons(tokenAddress);
  const { affiliate } = useAffiliateTracking(chain);
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: robinhoodChain.id });
  const [saldoEth, setSaldoEth] = useState<number | null>(null);
  const [saldoToken, setSaldoToken] = useState<number | null>(null);

  const [side, setSide] = useState<TradeSide>("buy");
  const [digitado, setDigitado] = useState("");
  const [slippageBps, setSlippageBps] = useState(300);
  // Atalhos da compra em dólar: convertidos pelo preço do ETH.
  const precoDoEth = usePrecoNativo("robinhood") ?? 0;
  // Compra em DÓLAR, como na Solana. Sem cotação do ETH, pede ETH.
  const compraEmDolar = side === "buy" && precoDoEth > 0;
  const valorNativo =
    compraEmDolar && Number(digitado) > 0 ? cortar(Number(digitado) / precoDoEth, 12) : digitado;

  const swapDaCurva = useCurvaSwapEvm({
    moeda: tokenAddress,
    curva,
    side,
    valor: valorNativo,
    slippageBps,
    /* Sem isto a comissão do promotor nunca saía na Robinhood. */
    afiliado: affiliate,
    habilitado: Boolean(curva),
  });

  /*
   * Moeda de fora da curva (ou que já migrou): negocia pela Uniswap v4, se a
   * pool aceitar o roteador público. O servidor confere simulando compra E
   * venda — ver src/lib/negociavel-evm.ts.
   */
  const precisaDeDex = !carregando && !carregandoPons && !pons && (!curva || curva.migrada);
  const [externo, setExterno] = useState<Negociavel | "verificando" | null>(null);
  useEffect(() => {
    if (!precisaDeDex) return;
    let cancelado = false;
    setExterno("verificando");
    fetch(`/api/negociavel?moeda=${tokenAddress}${pool ? `&pool=${pool}` : ""}`)
      .then((r) => r.json())
      .then((r: Negociavel) => !cancelado && setExterno(r))
      .catch(() => !cancelado && setExterno({ ok: false, motivo: "sem-pool" }));
    return () => {
      cancelado = true;
    };
  }, [precisaDeDex, tokenAddress, pool]);
  const liberado = typeof externo === "object" && externo?.ok ? externo : null;

  const swapExterno = useSwapExternoEvm({
    moeda: tokenAddress,
    pool: liberado?.pool ?? null,
    decimais: liberado?.decimais ?? 18,
    side,
    valor: valorNativo,
    slippageBps: Math.max(slippageBps, 500),
    afiliado: affiliate,
    habilitado: Boolean(liberado),
  });
  const swapPons = useSwapPons({
    moeda: tokenAddress,
    pons,
    side,
    valor: valorNativo,
    slippageBps,
    afiliado: affiliate,
    habilitado: Boolean(pons),
  });
  const swap = pons ? swapPons : liberado ? swapExterno : swapDaCurva;

  const ehCompra = side === "buy";
  const podeOperar = pons || liberado ? true : ehCompra ? podeComprar : podeVender;

  /*
   * Saldo de ETH e da moeda, relido a cada 15s e logo depois de cada negócio
   * (o hash muda). Sem isto a aba de vender não dizia quanto a pessoa tinha.
   */
  useEffect(() => {
    if (!address || !publicClient) {
      setSaldoEth(null);
      setSaldoToken(null);
      return;
    }
    let cancelado = false;
    const ler = async () => {
      try {
        const [eth, tokens] = await Promise.all([
          publicClient.getBalance({ address }),
          publicClient.readContract({
            address: tokenAddress as Address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address],
          }),
        ]);
        if (cancelado) return;
        setSaldoEth(Number(formatEther(eth)));
        setSaldoToken(Number(formatUnits(tokens, 18)));
      } catch {
        /* rede oscilou: mantém o último */
      }
    };
    void ler();
    const id = window.setInterval(ler, 15_000);
    return () => {
      cancelado = true;
      window.clearInterval(id);
    };
  }, [address, publicClient, tokenAddress, swap.hash]);

  const [recibo, setRecibo] = useState<Recibo | null>(null);

  // Anota a operação pro painel "Sua posição" (preço médio em ETH) e mostra o recibo.
  useEffect(() => {
    if (!swap.hash || !address) return;
    const tokens = ehCompra ? Number(swap.saida ?? 0) : Number(digitado);
    const eth = ehCompra ? Number(valorNativo) : Number(swap.saida ?? 0);
    anotarOperacao(address, tokenAddress, side, tokens, eth);
    const usdDoNegocio = ehCompra && compraEmDolar ? Number(digitado) : eth * precoDoEth;
    avisarNegocio({ moeda: tokenAddress, carteira: address, lado: side, tokens, usd: usdDoNegocio, hash: swap.hash });
    setRecibo({
      lado: side,
      usd: usdDoNegocio,
      tokens,
      simbolo: symbol,
      nativo: eth,
      simboloNativo: meta.nativeSymbol,
      link: `${meta.explorer.replace(/\/token\/$/, "/tx/")}${swap.hash}`,
    });
    setDigitado("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só no momento em que a operação confirma
  }, [swap.hash]);

  const saldo = ehCompra ? saldoEth : saldoToken;
  // Valor maior que o saldo: o botão já diz, em vez de a carteira recusar em inglês.
  const quantiaPedida = ehCompra ? Number(valorNativo) : Number(digitado);
  const semSaldo = saldo !== null && quantiaPedida > 0 && quantiaPedida > saldo;

  /*
   * MIGRAÇÃO NA ROBINHOOD.
   *
   * A função `migrar` do contrato é aberta a qualquer carteira, mas nada no
   * site a chamava: curva cheia ficava travada (compra e venda recusadas)
   * esperando alguém que não existia (28/09/2026). Agora o botão aparece pra
   * quem estiver na página.
   */
  const { obterCarteira } = useCarteiraRobinhood();
  const [migrando, setMigrando] = useState(false);
  const [erroDaMigracao, setErroDaMigracao] = useState<string | null>(null);
  const idioma = useIdioma();

  async function migrar() {
    if (!publicClient) return;
    setErroDaMigracao(null);
    setMigrando(true);
    try {
      const carteira = await obterCarteira();
      const hash = await carteira.writeContract({
        address: CHROMA_CURVE_EVM as Address,
        abi: ABI_DA_CURVA,
        functionName: "migrar",
        args: [tokenAddress as Address],
      });
      const recibo = await esperarRecibo(publicClient, hash);
      if (recibo.status !== "success") throw new Error("a rede recusou a migração");
      window.location.reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/reject|denied|cancel/i.test(msg)) setErroDaMigracao(msg.split(/\r?\n/)[0]);
    } finally {
      setMigrando(false);
    }
  }

  /** Na compra, 100% deixa ETH pro gás; na venda, vende tudo (cortado pra baixo). */
  function usarPorcentagem(pct: number) {
    if (saldo === null) return;
    const base = ehCompra ? Math.max(0, saldo - RESERVA_DE_REDE_ETH) : saldo;
    const parte = (base * pct) / 100;
    setDigitado(compraEmDolar ? cortar(parte * precoDoEth, 2) : cortar(parte, ehCompra ? 6 : 2));
  }

  /* Moeda que não é da curva: o caminho por DEX ainda não existe aqui. */
  if (precisaDeDex && (externo === "verificando" || externo === null)) {
    return (
      <Card className="overflow-hidden">
        <div className="h-[420px] animate-pulse bg-white/[0.02]" />
      </Card>
    );
  }

  if (precisaDeDex && !liberado) {
    return (
      <Card className="overflow-hidden">
        <AbasDeLado side="buy" onChange={() => {}} disabled />
        <div className="space-y-3 px-4 pb-4 pt-1">
          {/*
            O texto dizia "na Solana funciona normalmente", o que virou
            contradição quando a Robinhood passou a ser a rede principal: o
            site manda a pessoa pra rede que ele mesmo trata como secundária.

            Agora aponta pro que ela PODE fazer aqui — negociar as moedas
            lançadas na Chroma — em vez de mandar embora.
          */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-[12px] leading-relaxed text-zinc-400">
            <div className="mb-1 font-semibold text-zinc-200">
              {t.naoNegocia}
            </div>
            {t.naoNegociaTexto(meta.label)}
          </div>
          <RequireChainWallet chain={chain}>
            <a
              href={`${meta.explorer}${tokenAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Button variant="outline" size="lg" className="w-full">
                {t.verExplorer}
              </Button>
            </a>
          </RequireChainWallet>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <AbasDeLado side={side} onChange={(s) => {
          if (s === side) return;
          setSide(s);
          setDigitado(""); // dólar e tokens não são a mesma unidade
        }} disabled={swap.ocupado} />

      <div className="space-y-3 px-4 pb-4 pt-1">
        {/*
          Formato da referência do dono (página de moeda da PEAR, 28/09/2026):
          "você paga" com saldo, valores rápidos, "você recebe" estimado,
          slippage, mínimo garantido e rota — tudo visível antes de assinar.
        */}
        <div className="flex items-baseline justify-between text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          <span>{t.voceBaga}</span>
          {address && (
            <button
              type="button"
              onClick={() => usarPorcentagem(100)}
              className="tnum normal-case tracking-normal text-zinc-500 hover:text-zinc-200"
            >
              {t.saldoDois}{" "}
              {saldo === null
                ? "…"
                : `${saldo.toLocaleString(undefined, { maximumFractionDigits: ehCompra ? 5 : 2 })} ${ehCompra ? meta.nativeSymbol : symbol}`}
              <span className="ml-1 font-bold text-marca">{t.maxMaiusc}</span>
            </button>
          )}
        </div>

        <label className="flex items-center gap-2 rounded-lg border border-ink-600 bg-ink-950/60 px-3 py-3 focus-within:border-marca/50">
          <input
            inputMode="decimal"
            value={digitado}
            onChange={(e) => setDigitado(saneia(e.target.value))}
            placeholder="0.0"
            className="tnum min-w-0 flex-1 bg-transparent text-2xl font-bold text-zinc-100 outline-none placeholder:text-zinc-700"
          />
          <span className="shrink-0 text-[13px] font-bold text-zinc-400">
            {ehCompra ? (compraEmDolar ? "USD" : meta.nativeSymbol) : symbol}
          </span>
        </label>
        {compraEmDolar && Number(digitado) > 0 && (
          <p className="tnum -mt-1.5 px-1 text-[11px] text-zinc-500">
            ≈ <Preco valor={Number(valorNativo)} casas={6} /> {meta.nativeSymbol}
          </p>
        )}

        <div className="grid grid-cols-4 gap-2">
          {(ehCompra ? ATALHOS_EM_DOLAR : ATALHOS_EM_PORCENTAGEM).map((v) => (
            <Atalho
              key={v}
              rotulo={ehCompra ? `$${v}` : v === 100 ? t.maxMaiusc : `${v}%`}
              tom={ehCompra ? "buy" : "sell"}
              ligado={ehCompra ? precoDoEth > 0 : saldo !== null && saldo > 0}
              onClick={() => (ehCompra ? precoDoEth > 0 && setDigitado(String(v)) : usarPorcentagem(v))}
            />
          ))}
        </div>

        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            {t.voceRecebe}
          </p>
          <div className="tnum px-1 py-1 text-xl font-bold text-zinc-200">
            {swap.saida ? `${Number(swap.saida).toLocaleString("pt-BR", { maximumFractionDigits: ehCompra ? 0 : 6 })} ${ehCompra ? symbol : meta.nativeSymbol}` : "—"}
          </div>
        </div>

        <div className="space-y-1.5 text-[11.5px]">
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">{t.slippage}</span>
            <div className="flex gap-1">
              {[100, 300, 500].map((bps) => (
                <button
                  key={bps}
                  type="button"
                  onClick={() => setSlippageBps(bps)}
                  className={cn(
                    "tnum rounded border px-2 py-0.5 text-[11px] font-semibold",
                    slippageBps === bps
                      ? "border-marca bg-marca/15 text-marca"
                      : "border-ink-600 text-zinc-500 hover:text-zinc-200",
                  )}
                >
                  {bps / 100}%
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">{t.minimo}</span>
            <span className="tnum text-zinc-300">
              {swap.minimoGarantido
                ? `${Number(swap.minimoGarantido).toLocaleString("pt-BR", { maximumFractionDigits: ehCompra ? 0 : 6 })} ${ehCompra ? symbol : meta.nativeSymbol}`
                : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">{t.rota}</span>
            <span className="text-zinc-300">
              {pons
                ? `Chroma, ${t.taxaDe(`${(swapPons.taxaBps / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`)}`
                : liberado
                  ? `Uniswap v4, ${t.taxaDe(feeLabelFor("robinhood").swap)}`
                  : <>{t.curvaDaChromaMaiusc}, {t.taxa12}</>}
            </span>
          </div>
        </div>

        {curva?.concluida && !curva.migrada && (
          <div className="space-y-2 rounded-lg border border-warn/25 bg-warn/[0.06] px-3 py-2.5 text-[11px] leading-snug text-warn">
            <p>
              {t.curvaEncheu}
            </p>
            <RequireChainWallet chain={chain}>
              <Button
                variant="chroma"
                size="md"
                className="w-full"
                disabled={migrando}
                onClick={migrar}
              >
                {migrando ? t.levando : t.levar}
              </Button>
            </RequireChainWallet>
            {erroDaMigracao && <p className="text-bear">{traduzirDoServidor(erroDaMigracao, idioma)}</p>}
          </div>
        )}

        <RequireChainWallet chain={chain}>
          <Button
            variant={ehCompra ? "buy" : "sell"}
            size="lg"
            className="w-full"
            disabled={!podeOperar || !swap.pronto || swap.ocupado || semSaldo}
            onClick={swap.executar}
          >
            {swap.ocupado
              ? swap.passo || t.processando
              : !podeOperar
                ? t.indisponivel
                : semSaldo
                  ? t.saldoInsuficiente
                  : `${ehCompra ? t.comprar : t.vender} ${symbol}`}
          </Button>
        </RequireChainWallet>

        {swap.passo && !swap.ocupado && (
          <p className="text-center text-[11px] text-zinc-500">{swap.passo}</p>
        )}

        {!ehCompra && (
          <p className="text-[11px] leading-relaxed text-zinc-600">
            {t.duasAssinaturas}
          </p>
        )}

        {swap.erro && explicarErroDaCarteira(swap.erro, idioma) && (
          <p className="text-[11px] leading-relaxed text-bear">{explicarErroDaCarteira(swap.erro, idioma)}</p>
        )}

        {/* O link troca o sufixo /token/ do explorador por /tx/: o hash é de transação. */}
        {recibo && <ReciboDaOperacao recibo={recibo} onFechar={() => setRecibo(null)} />}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

/** Só dígito e um ponto — teclado de celular manda vírgula e letra. */
function saneia(bruto: string): string {
  const limpo = bruto.replace(",", ".").replace(/[^0-9.]/g, "");
  const partes = limpo.split(".");
  return partes.length <= 2 ? limpo : `${partes[0]}.${partes.slice(1).join("")}`;
}

/** Corta casas sem notação científica e sem zero à toa no fim. */
function arredondar(n: number, casas: number): string {
  return String(Number(n.toFixed(Math.min(9, Math.max(0, casas)))));
}

/**
 * Como `arredondar`, mas sempre pra baixo.
 *
 * Existe pros atalhos de porcentagem do saldo. Ver o comentário em
 * `atalhoEmPorcentagem`: pedir um milionésimo a mais do que se tem faz a rede
 * recusar a transação depois de assinada, sem explicar por quê.
 */
function cortar(n: number, casas: number): string {
  const c = Math.min(9, Math.max(0, casas));
  const fator = 10 ** c;
  return String(Math.floor(n * fator) / fator);
}

export interface Recibo {
  lado: TradeSide;
  usd: number;
  tokens: number;
  simbolo: string;
  nativo: number;
  simboloNativo: string;
  link: string;
}

/**
 * O aviso de que deu certo, com os números: quanto foi e quanto veio.
 * Antes só aparecia um link pro explorador — a pessoa ficava sem saber se
 * a compra tinha entrado e de quanto.
 */
function ReciboDaOperacao({ recibo, onFechar }: { recibo: Recibo; onFechar: () => void }) {
  const t = useTextos(TEXTOS);
  const compra = recibo.lado === "buy";
  // Compacto (pedido do dono): quantidade abreviada, uma linha só.
  const tokens = Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 }).format(recibo.tokens);

  /*
   * Some sozinho depois de 8 s (pedido do dono, 02/10/2026: "fica ali pra
   * sempre"). Com o mouse em cima, o tempo para — dá pra clicar no ↗ com calma.
   */
  const DURACAO = 8000;
  const fechar = useRef(onFechar);
  fechar.current = onFechar;
  const [pausado, setPausado] = useState(false);
  const restante = useRef(DURACAO);
  useEffect(() => {
    if (pausado) return;
    const inicio = Date.now();
    const id = setTimeout(() => fechar.current(), restante.current);
    return () => {
      clearTimeout(id);
      restante.current = Math.max(500, restante.current - (Date.now() - inicio));
    };
  }, [pausado]);

  /*
   * Cartão de confirmação (pedido do dono: "css bem elaborado" NA MENSAGEM).
   * Ícone com a cor do lado, título + valores, brilho que passa uma vez na
   * entrada e a barrinha do tempo que falta. Estilos em globals.css (.recibo).
   */
  const deOnde = compra
    ? recibo.usd > 0
      ? formatUsd(recibo.usd)
      : `${recibo.nativo.toFixed(4)} ${recibo.simboloNativo}`
    : `${tokens} ${recibo.simbolo}`;
  const praOnde = compra ? `${tokens} ${recibo.simbolo}` : `${recibo.nativo.toFixed(4)} ${recibo.simboloNativo}`;

  return (
    <div
      role="status"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      className={cn("recibo", compra ? "compra" : "venda")}
    >
      <span aria-hidden className="recibo-icone">
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.2 4.2L19 7" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="recibo-titulo">{compra ? t.compraFeita : t.vendaFeita}</p>
        <p className="tnum flex min-w-0 items-center gap-1.5 text-[12px] text-zinc-300">
          <span className="truncate">{deOnde}</span>
          <span aria-hidden className="recibo-seta">→</span>
          <span className="truncate font-semibold text-zinc-50">{praOnde}</span>
        </p>
      </div>
      <a href={recibo.link} target="_blank" rel="noreferrer" title={t.verNoExplorador} className="recibo-acao">
        ↗
      </a>
      <button onClick={onFechar} aria-label="×" className="recibo-acao">
        ×
      </button>
      {/* A barrinha do tempo que falta pra sumir. */}
      <span
        aria-hidden
        className="recibo-tempo"
        style={{ animationDuration: `${DURACAO}ms`, animationPlayState: pausado ? "paused" : "running" }}
      />
    </div>
  );
}
