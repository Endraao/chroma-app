"use client";

import { useEffect, useRef, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";

import { SOLANA_RPC } from "@/lib/web3";

/**
 * Preço ao vivo lido DIRETO DA POOL, por WebSocket.
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO BASTAVA PEDIR MAIS RÁPIDO
 * ---------------------------------------------------------------------------
 * O gráfico antes buscava `/api/price` de 3 em 3 segundos. Diminuir esse
 * intervalo não faria o gráfico se mexer mais: a fonte (Dexscreener) só
 * recalcula de tempos em tempos, então a maioria dos pedidos voltaria com o
 * MESMO número. Seria mais tráfego pelo mesmo resultado parado.
 *
 * O que faz o gráfico tremer nos terminais bons é serem alimentados por
 * NEGÓCIO, não por relógio: cada swap move o preço na hora. Aqui isso é feito
 * assinando as duas contas-cofre da pool no RPC. Todo swap muda o saldo delas,
 * o nó empurra o novo saldo, e o preço sai da razão entre as reservas —
 * `preço = reserva de cotação / reserva do token`. Sem indexador próprio e sem
 * uma chamada de RPC por negócio: o dado chega sozinho.
 *
 * Com `commitment: "processed"` a atualização vem no slot em que a transação
 * foi processada, antes de confirmar. É o certo aqui: gráfico é para olhar, e
 * uma vela que se corrige sozinha é melhor do que meio segundo de atraso.
 *
 * LIMITE CONHECIDO: funciona nas pools cujas contas-cofre pertencem à própria
 * conta da pool — Orca, Meteora, PumpSwap, Raydium CLMM. A AMM v4 antiga da
 * Raydium guarda os cofres sob uma autoridade global, então eles não aparecem
 * por dono e o hook desliga sozinho. Quem chama continua com o preço por
 * pesquisa; a interface diz qual dos dois está valendo em vez de fingir.
 */

const WSOL = "So11111111111111111111111111111111111111112";

/*
 * Os DOIS programas de token da Solana.
 *
 * Isto não é zelo: numa pool da pump.fun o cofre do SOL é do programa antigo e
 * o cofre do token é Token-2022. Consultando só um deles voltava uma conta —
 * o hook desistia e o gráfico caía no modo lento sem dizer por quê. Os dois
 * compartilham o mesmo layout nos primeiros 165 bytes, então o resto do código
 * não muda.
 */
const PROGRAMAS_DE_TOKEN = [
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
];
const ESTAVEIS = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
]);

/**
 * Moedas de cotação aceitas.
 *
 * A pool pode ter outras contas de token no nome dela — taxa do criador, sobra
 * de alguma coisa. Pegar "as duas maiores" já trouxe uma conta avulsa de 2000
 * unidades numa pool de verdade, e a razão entre ela e o token daria um preço
 * inventado com cara de real. Exigir que um lado seja o token e o outro seja
 * uma cotação conhecida elimina esse chute: aí a razão É o preço à vista, por
 * construção do produto constante.
 */
const COTACOES = new Set([WSOL, ...ESTAVEIS]);

export interface TickDaPool {
  /** preço em dólar, vindo da razão entre as reservas */
  precoUsd: number;
  /**
   * Tamanho do negócio em dólar.
   *
   * Sai da variação da reserva de cotação: o que entrou ou saiu da pool nesta
   * mudança É o volume negociado. Não precisa de fonte nova nem de mais uma
   * chamada — o número já está no que o nó acabou de mandar.
   */
  volumeUsd: number;
  /** quando chegou — usado pelo gráfico pra abrir vela nova na hora certa */
  em: number;
}

export type EstadoDoTicker = "desligado" | "conectando" | "ao-vivo" | "indisponivel";

interface Reserva {
  mint: string;
  quantidade: number;
}

/**
 * @param pool endereço do par (vem da Dexscreener)
 * @param tokenMint o token que está sendo negociado
 * @param ligado desligue quando a aba não estiver visível, pra não gastar conexão à toa
 */
export function usePoolTicker({
  pool,
  tokenMint,
  ligado = true,
}: {
  pool: string | null | undefined;
  tokenMint: string;
  ligado?: boolean;
}): { tick: TickDaPool | null; estado: EstadoDoTicker } {
  const [tick, setTick] = useState<TickDaPool | null>(null);
  const [estado, setEstado] = useState<EstadoDoTicker>("desligado");

  /** Reservas atuais por conta-cofre. Em ref: muda muito e não precisa redesenhar. */
  const reservasRef = useRef<Map<string, Reserva>>(new Map());
  /** Preço em dólar da moeda de cotação (SOL, ou 1 se for estável). */
  const precoDaCotacaoRef = useRef<number>(0);

  useEffect(() => {
    if (!ligado || !pool || !tokenMint) {
      setEstado("desligado");
      return;
    }

    let cancelado = false;
    const inscricoes: number[] = [];
    const conexao = new Connection(SOLANA_RPC, { commitment: "processed" });
    // Preso numa variável: na limpeza, o ref já pode apontar pra outra pool.
    const reservas = reservasRef.current;

    setEstado("conectando");

    /** Última reserva de cotação vista, pra medir o tamanho do negócio. */
    let cotacaoAnterior: number | null = null;

    /** Recalcula e publica sempre que uma reserva muda. */
    const publicar = () => {
      const reservas = [...reservasRef.current.values()];
      if (reservas.length < 2) return;

      const base = reservas.find((r) => r.mint === tokenMint);
      const cotacao = reservas.find((r) => r.mint !== tokenMint);
      if (!base || !cotacao || base.quantidade <= 0) return;

      const precoEmCotacao = cotacao.quantidade / base.quantidade;
      const precoUsd = precoEmCotacao * precoDaCotacaoRef.current;
      if (!Number.isFinite(precoUsd) || precoUsd <= 0) return;

      const variacao =
        cotacaoAnterior === null ? 0 : Math.abs(cotacao.quantidade - cotacaoAnterior);
      cotacaoAnterior = cotacao.quantidade;

      setTick({
        precoUsd,
        volumeUsd: variacao * precoDaCotacaoRef.current,
        em: Date.now(),
      });
    };

    (async () => {
      try {
        /*
         * Acha os cofres pelo dono. É genérico o bastante pra cobrir as DEXes
         * que usam PDA da própria pool como dono das contas de token; quando
         * não acha dois, desiste e avisa em vez de adivinhar layout de conta.
         */
        const dono = new PublicKey(pool);
        const respostas = await Promise.all(
          PROGRAMAS_DE_TOKEN.map((programa) =>
            conexao
              .getParsedTokenAccountsByOwner(dono, { programId: new PublicKey(programa) })
              .catch(() => ({ value: [] as never[] })),
          ),
        );
        if (cancelado) return;

        const todas = respostas
          .flatMap((r) => r.value)
          .map((c) => ({
            conta: c.pubkey.toBase58(),
            mint: String(c.account.data.parsed?.info?.mint ?? ""),
            quantidade: Number(c.account.data.parsed?.info?.tokenAmount?.uiAmount ?? 0),
            // Já vem na leitura inicial: não precisa ler o mint depois.
            casas: Number(c.account.data.parsed?.info?.tokenAmount?.decimals ?? 0),
          }))
          .filter((c) => c.mint && c.quantidade > 0);

        // Um lado tem que ser o token; o outro, uma cotação conhecida.
        const maior = (a: { quantidade: number }, b: { quantidade: number }) =>
          b.quantidade - a.quantidade;

        const cofreDoToken = todas.filter((c) => c.mint === tokenMint).sort(maior)[0];
        const cofreDaCotacao = todas
          .filter((c) => c.mint !== tokenMint && COTACOES.has(c.mint))
          .sort(maior)[0];

        if (!cofreDoToken || !cofreDaCotacao) {
          setEstado("indisponivel");
          return;
        }

        const cofres = [cofreDoToken, cofreDaCotacao];
        const mintDaCotacao = cofreDaCotacao.mint;

        /*
         * O preço sai em unidades da moeda de cotação; falta converter pra
         * dólar. Estável vale 1; SOL e o resto vêm do nosso próprio endpoint,
         * que já tem cache — e essa cotação se move devagar, então não precisa
         * de tempo real.
         */
        if (ESTAVEIS.has(mintDaCotacao)) {
          precoDaCotacaoRef.current = 1;
        } else {
          const res = await fetch(`/api/price?address=${mintDaCotacao === WSOL ? WSOL : mintDaCotacao}`);
          const { priceUsd } = (await res.json()) as { priceUsd: number };
          if (cancelado) return;
          if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
            setEstado("indisponivel");
            return;
          }
          precoDaCotacaoRef.current = priceUsd;
        }

        for (const cofre of cofres) {
          reservasRef.current.set(cofre.conta, {
            mint: cofre.mint,
            quantidade: cofre.quantidade,
          });
        }
        publicar();

        for (const cofre of cofres) {
          const id = conexao.onAccountChange(
            new PublicKey(cofre.conta),
            (info) => {
              /*
               * O saldo de uma conta de token são 8 bytes little-endian no
               * offset 64 do layout SPL. Ler os bytes direto evita pedir
               * `jsonParsed` a cada notificação — e é o caminho quente: numa
               * moeda movimentada isto roda várias vezes por segundo.
               */
              const anterior = reservasRef.current.get(cofre.conta);
              if (!anterior || info.data.length < 72) return;

              reservasRef.current.set(cofre.conta, {
                mint: anterior.mint,
                quantidade: Number(saldoDoCofre(info.data)) / 10 ** cofre.casas,
              });
              publicar();
            },
            "processed",
          );
          inscricoes.push(id);
        }

        if (!cancelado) setEstado("ao-vivo");
      } catch (erro) {
        if (cancelado) return;
        console.warn("[ticker] pool não assinável, seguindo por pesquisa:", erro);
        setEstado("indisponivel");
      }
    })();

    return () => {
      cancelado = true;
      for (const id of inscricoes) {
        void conexao.removeAccountChangeListener(id).catch(() => {});
      }
      reservas.clear();
    };
  }, [pool, tokenMint, ligado]);

  return { tick, estado };
}

/**
 * Saldo de uma conta de token SPL: 8 bytes little-endian no offset 64.
 *
 * Lido com DataView em vez de `Buffer.readBigUInt64LE` porque no navegador o
 * `Buffer` é um polyfill, e nem toda versão dele traz os métodos de 64 bits.
 * DataView é da própria plataforma e sempre está lá.
 */
function saldoDoCofre(dados: Uint8Array): bigint {
  const visao = new DataView(dados.buffer, dados.byteOffset, dados.byteLength);
  return visao.getBigUint64(64, true);
}
