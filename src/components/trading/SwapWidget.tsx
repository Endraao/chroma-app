"use client";

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
import { CHAINS, robinhoodChain } from "@/lib/web3";
import { cn, formatPrice, shortenAddress } from "@/lib/utils";
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
const ATALHOS_EM_DOLAR = [25, 100, 250];
/** Porcentagens do saldo — de SOL na compra, do token na venda. */
const ATALHOS_EM_PORCENTAGEM = [25, 50, 100];

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

export function SwapWidget({
  symbol,
  chain,
  tokenAddress,
  priceUsd,
}: {
  symbol: string;
  chain: ChainId;
  tokenAddress: string;
  /** preço ao vivo, vindo do gráfico — a ponte entre token e dólar */
  priceUsd: number;
}) {
  const meta = CHAINS[chain];

  return meta.kind === "solana" ? (
    <SolanaSwap symbol={symbol} chain={chain} tokenAddress={tokenAddress} priceUsd={priceUsd} />
  ) : (
    <EvmSwap symbol={symbol} chain={chain} tokenAddress={tokenAddress} />
  );
}

/* ------------------------------------------------------------------ */
/* Solana — implementado de ponta a ponta                              */
/* ------------------------------------------------------------------ */

function SolanaSwap({
  symbol,
  chain,
  tokenAddress,
  priceUsd,
}: {
  symbol: string;
  chain: ChainId;
  tokenAddress: string;
  priceUsd: number;
}) {
  const [side, setSide] = useState<TradeSide>("buy");
  const [digitado, setDigitado] = useState("");
  const [slippage, setSlippage] = useState(SLIPPAGE_PADRAO);

  const { affiliate, affiliateRef } = useAffiliateTracking(chain);
  const { connected, publicKey } = useWallet();
  const precoDoSol = usePrecoDoSol();

  const comprando = side === "buy";

  /*
   * A unidade do campo grande.
   *
   * Comprando, a pessoa pensa em dólar — mas a transação é em SOL, e sem a
   * cotação não dá pra converter. Nesse caso o campo passa a pedir SOL e diz
   * isso na tela, em vez de inventar um câmbio.
   */
  const emDolar = comprando && precoDoSol !== null;
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
    digitadoNum > 0 ? String(emDolar ? digitadoNum / precoDoSol : digitadoNum) : "";

  const swap = useTradeSolana({
    tokenMint: tokenAddress,
    tokenSymbol: symbol,
    side,
    amount,
    slippageBps: slippage * 100,
    affiliate,
    affiliateRef,
  });

  /* Trocar de lado zera o campo: 50 dólares e 50 milhões de tokens não são a
     mesma ordem, e reaproveitar o número faria alguém vender sem querer. */
  function trocarLado(s: TradeSide) {
    if (s === side) return;
    setSide(s);
    setDigitado("");
  }

  function atalhoEmDolar(usd: number) {
    if (comprando) {
      if (emDolar) setDigitado(String(usd));
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
      setDigitado(emDolar ? arredondar(parte * precoDoSol, 2) : arredondar(parte, 4));
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
  const atalhoDolarLigado = comprando ? emDolar : priceUsd > 0;
  const atalhoPctLigado = swap.balance !== null && swap.balance > 0;

  /*
   * O impacto no preço só aparece quando é ALTO.
   *
   * Mostrado sempre, com 0,03% na maioria das ordens, vira um número que a
   * pessoa aprende a ignorar — e aí não serve pra nada no dia em que estiver
   * em 18%. Calado abaixo de 2%, ele volta a ser um aviso.
   */
  const impactoPerigoso = swap.quote !== null && swap.priceImpactPct >= 2;

  return (
    <Card className="overflow-hidden">
      <AbasDeLado side={side} onChange={trocarLado} />

      <div className="px-4 pb-4">
        {/* ------------- o valor, que é a única pergunta ---------------- */}
        <CampoDeValor
          valor={digitado}
          onChange={setDigitado}
          emDolar={emDolar}
          comprando={comprando}
          emSol={emDolar ? digitadoNum / precoDoSol : digitadoNum}
          equivalenteUsd={comprando ? digitadoNum * (precoDoSol ?? 0) : digitadoNum * priceUsd}
          simbolo={symbol}
        />

        {/* ------------- saldo à esquerda, ajustes à direita ------------ */}
        <div className="mt-2 flex items-center justify-between">
          {/*
            O saldo é um BOTÃO, não um texto.

            Vender tudo é o gesto mais comum de quem está saindo de uma posição,
            e antes ele só existia escondido no atalho de 100% — que numa fileira
            de seis botões iguais ninguém lê como "vender tudo". Clicar no
            próprio saldo é o caminho curto que todo terminal tem.

            Na compra ele também vale, e aí desconta a reserva de taxa de rede:
            gastar o saldo inteiro deixaria a carteira sem como pagar a própria
            transação, que falha DEPOIS de assinada.
          */}
          {swap.balance !== null ? (
            <button
              onClick={() => atalhoEmPorcentagem(100)}
              disabled={swap.balance <= 0}
              className="group text-[11px] text-zinc-600 transition-colors hover:text-zinc-400 disabled:cursor-not-allowed"
              title={
                comprando
                  ? `Usa o saldo menos ${RESERVA_DE_REDE_SOL} SOL, pra sobrar taxa de rede`
                  : `Vender todos os seus ${symbol}`
              }
            >
              saldo{" "}
              <span className="tnum text-zinc-500 group-hover:text-zinc-300">
                {formatPrice(swap.balance, comprando ? 4 : 2)} {comprando ? "SOL" : symbol}
              </span>
              {swap.balance > 0 && (
                <span className="ml-1.5 rounded border border-marca/30 px-1 py-px text-[10px] font-bold uppercase text-marca group-hover:border-marca/60">
                  máx
                </span>
              )}
            </button>
          ) : (
            <span />
          )}

          <Engrenagem
            slippage={slippage}
            setSlippage={setSlippage}
            minimoGarantido={
              swap.quote
                ? `${formatPrice(swap.minReceived, 6)} ${comprando ? symbol : "SOL"}`
                : null
            }
            rota={swap.naCurva ? "curva da Chroma" : swap.route || null}
          />
        </div>

        <div className="space-y-2 pt-3">
          {/* ------------- avisos que mudam a decisão ------------------- */}
          {impactoPerigoso && (
            <p className="rounded-lg border border-warn/25 bg-warn/[0.06] px-3 py-2 text-[11px] leading-snug text-warn">
              Esta ordem move o preço em{" "}
              <strong className="font-semibold">{swap.priceImpactPct.toFixed(1)}%</strong>. É
              grande demais para a liquidez disponível: você compra a um preço pior e quem vender
              depois recebe menos.
            </p>
          )}

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

          {/* ------------- o botão -------------------------------------- */}
          <RequireChainWallet chain="solana">
            <Button
              variant={comprando ? "buy" : "sell"}
              size="lg"
              className="h-12 w-full text-[15px]"
              disabled={!swap.canSwap || swap.phase === "executing"}
              onClick={swap.execute}
            >
              {swap.phase === "executing"
                ? swap.step || "Processando…"
                : semValor
                  ? "Informe um valor"
                  : swap.phase === "quoting"
                    ? "Cotando…"
                    : swap.phase === "error"
                      ? "Tentar de novo"
                      : `${comprando ? "Comprar" : "Vender"} ${symbol}`}
            </Button>
          </RequireChainWallet>

          {/* ------------- atalhos -------------------------------------- */}
          <div className="grid grid-cols-3 gap-2">
            {ATALHOS_EM_DOLAR.map((v) => (
              <Atalho
                key={v}
                rotulo={`$${v}`}
                tom={comprando ? "buy" : "sell"}
                ligado={atalhoDolarLigado}
                onClick={() => atalhoEmDolar(v)}
                titulo={
                  atalhoDolarLigado ? undefined : "Precisa da cotação do SOL, que não carregou"
                }
              />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {ATALHOS_EM_PORCENTAGEM.map((v) => (
              <Atalho
                key={v}
                rotulo={`${v}%`}
                tom={comprando ? "buy" : "sell"}
                ligado={atalhoPctLigado}
                onClick={() => atalhoEmPorcentagem(v)}
                titulo={
                  !atalhoPctLigado
                    ? "Conecte a carteira pra usar porcentagem do saldo"
                    : comprando && v === 100
                      ? `Usa o saldo menos ${RESERVA_DE_REDE_SOL} SOL, pra sobrar taxa de rede`
                      : undefined
                }
              />
            ))}
          </div>

          {connected && publicKey && (
            <p className="pt-0.5 text-center text-[11px] text-zinc-600">
              {shortenAddress(publicKey.toBase58(), 6)} ·{" "}
              {swap.carregandoRota
                ? "procurando rota…"
                : swap.naCurva
                  ? "direto na curva da Chroma"
                  : "rota via Jupiter"}
            </p>
          )}
        </div>
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
            <>≈ {formatPrice(emSol, 4)} SOL</>
          ) : (
            <span className="text-warn/80">
              cotação do SOL indisponível no momento — o valor acima está em SOL
            </span>
          )
        ) : (
          <>≈ ${formatPrice(equivalenteUsd, 2)}</>
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
            {s === "buy" ? "Comprar" : "Vender"}
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
        aria-label="Ajustes da ordem"
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
            <span className="text-[12px] font-semibold text-zinc-200">Slippage máximo</span>
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
            O quanto o preço pode piorar entre você assinar e a ordem ser executada. Acima desse
            limite a transação é <strong className="font-semibold text-zinc-400">cancelada</strong>{" "}
            em vez de sair a qualquer preço. É o que protege você de perder valor numa oscilação
            brusca.
          </p>

          {(minimoGarantido || rota) && (
            <div className="mt-3 space-y-1 border-t border-ink-700 pt-2.5 text-[11px]">
              {minimoGarantido && (
                <div className="flex items-center justify-between gap-2">
                  <span className="shrink-0 text-zinc-500">Mínimo garantido</span>
                  <span className="tnum truncate font-semibold text-zinc-300">
                    {minimoGarantido}
                  </span>
                </div>
              )}
              {rota && (
                <div className="flex items-center justify-between gap-2">
                  <span className="shrink-0 text-zinc-500">Rota</span>
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
}: {
  symbol: string;
  chain: ChainId;
  tokenAddress: string;
}) {
  const meta = CHAINS[chain];
  const { curva, podeComprar, podeVender, carregando } = useCurvaEvm(tokenAddress);
  const { affiliate } = useAffiliateTracking(chain);
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: robinhoodChain.id });
  const [saldoEth, setSaldoEth] = useState<number | null>(null);
  const [saldoToken, setSaldoToken] = useState<number | null>(null);

  const [side, setSide] = useState<TradeSide>("buy");
  const [digitado, setDigitado] = useState("");
  const [slippageBps] = useState(300);

  const swap = useCurvaSwapEvm({
    moeda: tokenAddress,
    curva,
    side,
    valor: digitado,
    slippageBps,
    /* Sem isto a comissão do promotor nunca saía na Robinhood. */
    afiliado: affiliate,
    habilitado: Boolean(curva),
  });

  const ehCompra = side === "buy";
  const podeOperar = ehCompra ? podeComprar : podeVender;

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

  const saldo = ehCompra ? saldoEth : saldoToken;

  /** Na compra, 100% deixa ETH pro gás; na venda, vende tudo (cortado pra baixo). */
  function usarPorcentagem(pct: number) {
    if (saldo === null) return;
    const base = ehCompra ? Math.max(0, saldo - RESERVA_DE_REDE_ETH) : saldo;
    setDigitado(cortar((base * pct) / 100, ehCompra ? 6 : 2));
  }

  /* Moeda que não é da curva: o caminho por DEX ainda não existe aqui. */
  if (!carregando && !curva) {
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
              Esta moeda não pode ser negociada aqui ainda
            </div>
            Ela não foi lançada na Chroma, e a negociação de moedas externas na {meta.label} está em
            desenvolvimento. As moedas criadas na Chroma já negociam normalmente.
          </div>
          <RequireChainWallet chain={chain}>
            <a
              href={`${meta.explorer}${tokenAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Button variant="outline" size="lg" className="w-full">
                Ver no explorer ↗
              </Button>
            </a>
          </RequireChainWallet>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <AbasDeLado side={side} onChange={setSide} disabled={swap.ocupado} />

      <div className="space-y-3 px-4 pb-4 pt-1">
        <input
          inputMode="decimal"
          value={digitado}
          onChange={(e) => setDigitado(saneia(e.target.value))}
          placeholder={ehCompra ? `0.0 ${meta.nativeSymbol}` : `0.0 ${symbol}`}
          className="w-full bg-transparent text-center text-3xl font-bold text-zinc-100 outline-none placeholder:text-zinc-700"
        />

        {swap.saida && (
          <p className="tnum text-center text-[12px] text-zinc-500">
            ≈ {swap.saida} {ehCompra ? symbol : meta.nativeSymbol}
          </p>
        )}

        {address && (
          <>
            <p className="tnum text-center text-[12px] text-zinc-500">
              Saldo:{" "}
              {saldo === null
                ? "…"
                : `${saldo.toLocaleString("pt-BR", { maximumFractionDigits: ehCompra ? 5 : 2 })} ${ehCompra ? meta.nativeSymbol : symbol}`}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {[25, 50, 75, 100].map((v) => (
                <Atalho
                  key={v}
                  rotulo={v === 100 ? "Máx" : `${v}%`}
                  tom={ehCompra ? "buy" : "sell"}
                  ligado={saldo !== null && saldo > 0}
                  onClick={() => usarPorcentagem(v)}
                />
              ))}
            </div>
          </>
        )}

        {curva?.concluida && !curva.migrada && (
          <p className="rounded-lg border border-warn/25 bg-warn/[0.06] px-3 py-2 text-[11px] leading-snug text-warn">
            A curva encheu. A negociação recomeça quando a liquidez migrar para a pool.
          </p>
        )}

        <RequireChainWallet chain={chain}>
          <Button
            variant={ehCompra ? "buy" : "sell"}
            size="lg"
            className="w-full"
            disabled={!podeOperar || !swap.pronto || swap.ocupado}
            onClick={swap.executar}
          >
            {swap.ocupado
              ? swap.passo || "Processando…"
              : !podeOperar
                ? "Indisponível agora"
                : `${ehCompra ? "Comprar" : "Vender"} ${symbol}`}
          </Button>
        </RequireChainWallet>

        {swap.passo && !swap.ocupado && (
          <p className="text-center text-[11px] text-zinc-500">{swap.passo}</p>
        )}

        {!ehCompra && (
          <p className="text-[11px] leading-relaxed text-zinc-600">
            Vender pede duas assinaturas: uma autorizando a curva a retirar os tokens e outra da
            venda em si. A autorização é pelo valor exato, não infinita.
          </p>
        )}

        {swap.erro && <p className="text-[11px] leading-relaxed text-bear">{swap.erro}</p>}

        {swap.hash && (
          <a
            /*
             * `meta.explorer` aponta pra página de TOKEN; transação fica noutro
             * caminho no mesmo explorer. Trocar o sufixo aqui evita um link que
             * abre "token não encontrado" com um hash de transação na URL.
             */
            href={`${meta.explorer.replace(/\/token\/$/, "/tx/")}${swap.hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-[11px] font-semibold text-marca hover:underline"
          >
            ver a transação
          </a>
        )}
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
