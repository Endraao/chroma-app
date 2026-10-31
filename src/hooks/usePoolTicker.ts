"use client";

import { useEffect, useRef, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";

import { SOLANA_RPC, SOLANA_WS } from "@/lib/web3";
import { CONFIG_25 } from "@/lib/curva-taxas";

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
 * assinando as duas contas-cofre da pool no RPC. Todo swap muda o saldo delas
 * e o nó empurra o novo saldo — sem indexador próprio e sem uma chamada de RPC
 * por negócio: o dado chega sozinho.
 *
 * O preço sai da VARIAÇÃO dos dois cofres no mesmo slot, não do tamanho deles.
 * O porquê está no comentário longo dentro do efeito; em uma linha: o nível das
 * reservas só vira preço em AMM de produto constante, e a variação vira preço
 * em qualquer uma.
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

/**
 * Quanto esperar pelo outro lado do swap.
 *
 * Os dois cofres são notificados em mensagens separadas, com poucos
 * milissegundos entre elas. Curto demais e os lados nunca se encontram — o
 * preço simplesmente para de atualizar. Longo demais e duas negociações
 * seguidas se misturam numa conta só, o que dá um preço médio que não foi o de
 * nenhuma das duas.
 */
const JANELA_DO_SWAP_MS = 120;

/**
 * De quanto em quanto tempo a pool é relida: meio segundo (pedido do dono,
 * 16/10/2026 — com 1 s o gráfico ainda ficava atrás da Fomo). A chave do RPC é
 * dividida entre todos os visitantes; mais rápido que isso arrisca o limite.
 */
const LEITURA_MS = 500;

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
  /**
   * Preço à vista lido do estado da curva, não estimado pela variação dos
   * cofres — o gráfico pode confiar nele com uma faixa larga.
   */
  exato?: boolean;
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
    // Sem par ainda dá pra tentar a curva: o endereço dela sai do próprio token.
    if (!ligado || !tokenMint) {
      setEstado("desligado");
      return;
    }

    let cancelado = false;
    const inscricoes: number[] = [];
    const conexao = new Connection(SOLANA_RPC, { commitment: "processed", wsEndpoint: SOLANA_WS });
    // Preso numa variável: na limpeza, o ref já pode apontar pra outra pool.
    const reservas = reservasRef.current;

    setEstado("conectando");

    /*
     * -----------------------------------------------------------------
     * O PREÇO VEM DO NEGÓCIO, NÃO DO TAMANHO DAS RESERVAS
     * -----------------------------------------------------------------
     * A primeira versão fazia `reservaDaCotacao / reservaDoToken`. Essa é a
     * fórmula de uma AMM de PRODUTO CONSTANTE, e só dela.
     *
     * Em pool de liquidez concentrada — Meteora DLMM, Raydium CLMM, Orca
     * Whirlpool — o preço é o bin ativo, e os cofres guardam o que sobrou das
     * faixas, que não tem relação nenhuma com ele. Medido no EMBER, a razão
     * deu $0,04104 contra $0,01344 de verdade: TRÊS VEZES errado. Na tela isso
     * virava uma vela gigante saindo de $13M pra $44M de capitalização, e nada
     * acusava — o número era plausível, só não era o preço.
     *
     * O que vale em QUALQUER AMM é o negócio em si: todo swap tira de um cofre
     * e põe no outro, e a razão entre as duas VARIAÇÕES é o preço de execução.
     * Bin, tick, curva ou produto constante — a conta é a mesma, porque mede
     * só a troca que de fato aconteceu.
     *
     * O SINAL separa negócio de liquidez: num swap os dois cofres andam em
     * direções OPOSTAS. Depósito faz os dois subirem, saque faz os dois
     * descerem — aí a razão é a composição da pool, não um preço, e publicá-la
     * traria de volta exatamente o erro que estamos consertando.
     */
    let pendenteBase = 0;
    let pendenteCotacao = 0;
    let janela: number | null = null;
    /** O slot das variações que estão esperando par. */
    let slotPendente: number | null = null;
    /**
     * Pool da PumpSwap (produto constante, taxa guardada fora dos cofres): a
     * razão entre os SALDOS é o preço à vista exato. Sem isso o preço vinha da
     * variação, passava pela faixa de 3% contra a âncora do servidor e, em
     * moeda agitada, quase todo tique caía pra âncora — que muda a cada ~20 s.
     */
    let cofresDaPumpSwap: { token: string; cotacao: string } | null = null;

    /**
     * Fecha a janela e publica, se o que chegou for mesmo um negócio.
     *
     * A janela existe porque os dois lados do swap chegam em notificações
     * separadas. Sem esperar, cada uma seria lida como movimento de um lado só
     * — e nunca haveria par pra dividir.
     */
    const fecharJanela = () => {
      janela = null;

      const base = pendenteBase;
      const cotacao = pendenteCotacao;
      pendenteBase = 0;
      pendenteCotacao = 0;
      slotPendente = null;

      if (base === 0 || cotacao === 0) return;
      if (Math.sign(base) === Math.sign(cotacao)) return;

      let precoEmCotacao = Math.abs(cotacao) / Math.abs(base);
      if (cofresDaPumpSwap) {
        const t = reservasRef.current.get(cofresDaPumpSwap.token)?.quantidade ?? 0;
        const q = reservasRef.current.get(cofresDaPumpSwap.cotacao)?.quantidade ?? 0;
        if (t > 0 && q > 0) precoEmCotacao = q / t;
      }
      const precoUsd = precoEmCotacao * precoDaCotacaoRef.current;
      if (!Number.isFinite(precoUsd) || precoUsd <= 0) return;

      setTick({
        precoUsd,
        volumeUsd: Math.abs(cotacao) * precoDaCotacaoRef.current,
        em: Date.now(),
        exato: cofresDaPumpSwap !== null,
      });
    };

    /**
     * Registra a variação de um cofre, agrupando por SLOT.
     *
     * -----------------------------------------------------------------
     * POR QUE SLOT E NÃO TEMPO
     * -----------------------------------------------------------------
     * A primeira versão juntava o que chegasse dentro de 120ms. Funcionava em
     * moeda parada e falhava feio em moeda movimentada, que é onde importa: se
     * o lado A de um negócio chega em 0ms e o lado B em 130ms, a janela fecha
     * sozinha com só o A — e aí o B abre uma janela NOVA, que capta o lado A do
     * negócio SEGUINTE. Os dois lados emparelhados são de negócios diferentes,
     * e a divisão devolve um preço que não existiu.
     *
     * Na embercurve isso desenhou uma vela de $4,43M a $18,88M num minuto, numa
     * moeda que a fonte mostra andando entre $9,14M e $9,53M em vinte minutos.
     *
     * Slot conserta porque é a unidade real: as duas pernas do MESMO negócio
     * estão sempre no mesmo slot, e negócios diferentes quase nunca estão. O
     * relógio continua como rede de segurança, pra última perna não ficar
     * pendurada esperando um slot que não vem mais.
     */
    const acumular = (ehToken: boolean, variacao: number, slot: number) => {
      if (variacao === 0) return;

      if (slotPendente !== null && slot !== slotPendente) {
        if (janela !== null) window.clearTimeout(janela);
        fecharJanela();
      }

      slotPendente = slot;
      if (ehToken) pendenteBase += variacao;
      else pendenteCotacao += variacao;

      if (janela === null) janela = window.setTimeout(fecharJanela, JANELA_DO_SWAP_MS);
    };

    (async () => {
      try {
        /*
         * Moeda ainda na curva (pump.fun ou Chroma Curve): o preço à vista
         * está escrito na conta da curva. Os cofres dela não são da própria
         * conta, então o caminho dos cofres abaixo desistia e o gráfico
         * andava pela DexScreener, de 10 em 10 segundos (pedido do dono,
         * 16/10/2026: "parece uma coisa morta" do lado da pump.fun).
         */
        const curva = await acharCurva(conexao, pool, tokenMint);
        if (cancelado) return;
        if (curva) {
          const res = await fetch(`/api/price?address=${WSOL}`);
          const { priceUsd } = (await res.json()) as { priceUsd: number };
          if (cancelado) return;
          if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
            setEstado("indisponivel");
            return;
          }
          precoDaCotacaoRef.current = priceUsd;

          let anterior = lerCurva(curva.tipo, curva.dados);
          if (!anterior) {
            setEstado("indisponivel");
            return;
          }
          let lendo = false;
          let falhas = 0;
          const ler = async () => {
            if (lendo || cancelado || document.visibilityState !== "visible") return;
            lendo = true;
            try {
              const info = await conexao.getAccountInfo(curva.conta, "processed");
              if (cancelado || !info) return;
              falhas = 0;
              const agora = lerCurva(curva.tipo, info.data);
              if (!agora || (agora.precoSol === anterior?.precoSol && agora.solGuardado === anterior?.solGuardado)) return;
              const volumeSol = Math.abs(agora.solGuardado - (anterior?.solGuardado ?? agora.solGuardado));
              anterior = agora;
              setTick({
                precoUsd: agora.precoSol * precoDaCotacaoRef.current,
                volumeUsd: volumeSol * precoDaCotacaoRef.current,
                em: Date.now(),
                exato: true,
              });
            } catch {
              if (++falhas >= 3 && !cancelado) setEstado("indisponivel");
            } finally {
              lendo = false;
            }
          };
          inscricoes.push(window.setInterval(() => void ler(), LEITURA_MS));
          if (!cancelado) setEstado("ao-vivo");
          return;
        }
        if (!pool) {
          setEstado("indisponivel");
          return;
        }

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
        const outras = todas.filter((c) => c.mint !== tokenMint);
        /*
         * Cotação conhecida primeiro. Sem ela, aceita a outra ponta quando ela
         * é a ÚNICA conta além do token — é o par, não sobra avulsa (moeda da
         * pump.fun pareada com $TRUMP, 16/10/2026).
         */
        const cofreDaCotacao =
          outras.filter((c) => COTACOES.has(c.mint)).sort(maior)[0] ?? (outras.length === 1 ? outras[0] : undefined);

        if (!cofreDoToken || !cofreDaCotacao) {
          setEstado("indisponivel");
          return;
        }

        const dadosDaPool = await conexao.getAccountInfo(dono, "processed").catch(() => null);
        if (cancelado) return;
        if (dadosDaPool?.owner.equals(PUMP_AMM)) {
          cofresDaPumpSwap = { token: cofreDoToken.conta, cotacao: cofreDaCotacao.conta };
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

        /*
         * Nada é publicado na abertura, de propósito.
         *
         * O ticker só sabe dizer preço a partir de um NEGÓCIO, e na primeira
         * leitura ainda não houve nenhum — só o retrato das reservas, que é
         * justamente o número que não serve. O preço inicial da tela vem do
         * servidor, que calculou pelo modelo certo de cada pool; daqui em
         * diante o ticker só corrige quando alguém negocia de verdade.
         */

        /*
         * LEITURA A CADA 1 s, sem WebSocket (07/10/2026).
         *
         * Era uma assinatura por WebSocket. O plano do RPC Fast aceita UMA
         * assinatura ao mesmo tempo pro site inteiro — as dos visitantes eram
         * recusadas em silêncio e o gráfico ficava parado achando que estava
         * ao vivo. Agora: os dois cofres numa leitura só, a cada segundo; a
         * variação vira o mesmo "negócio" que a assinatura entregava.
         */
        const chaves = cofres.map((c) => new PublicKey(c.conta));
        let lendo = false;
        let falhas = 0;
        const ler = async () => {
          if (lendo || cancelado || document.visibilityState !== "visible") return;
          lendo = true;
          try {
            const r = await conexao.getMultipleAccountsInfoAndContext(chaves, "processed");
            if (cancelado) return;
            falhas = 0;
            r.value.forEach((info, i) => {
              const cofre = cofres[i];
              const anterior = reservasRef.current.get(cofre.conta);
              if (!info || !anterior || info.data.length < 72) return;
              const nova = Number(saldoDoCofre(info.data)) / 10 ** cofre.casas;
              const variacao = nova - anterior.quantidade;
              reservasRef.current.set(cofre.conta, { mint: anterior.mint, quantidade: nova });
              acumular(anterior.mint === tokenMint, variacao, r.context.slot);
            });
          } catch {
            // Três falhas seguidas: devolve pro modo de pesquisa do gráfico.
            if (++falhas >= 3 && !cancelado) setEstado("indisponivel");
          } finally {
            lendo = false;
          }
        };
        const relogio = window.setInterval(() => void ler(), LEITURA_MS);
        inscricoes.push(relogio);

        if (!cancelado) setEstado("ao-vivo");
      } catch (erro) {
        if (cancelado) return;
        console.warn("[ticker] pool não assinável, seguindo por pesquisa:", erro);
        setEstado("indisponivel");
      }
    })();

    return () => {
      cancelado = true;
      /* A janela pendente fica pra trás: ela publicaria o preço da pool velha
         em cima do gráfico da moeda nova. */
      if (janela !== null) window.clearTimeout(janela);
      for (const id of inscricoes) window.clearInterval(id);
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
const PUMP = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const DBC = new PublicKey("dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN");
const PUMP_AMM = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");
const CONFIGS_DBC = ["9aB2qqbbdkB7H96XYbxqvPJ3miUEAmecLm1pHk8kp1aS", "Di9WfmNMwTeM4ZYPFkdvGntu5swRKUathEKQPJ9UjfLs", "BbbaZGSkhjFMfFQNfUrgbDFX9pWATSZvWoVF9jkaFQXw", CONFIG_25].filter(Boolean);

type TipoDeCurva = "pump" | "dbc";

/**
 * A conta da curva da moeda, se ela ainda estiver numa. Tenta o par que veio
 * da DexScreener e, sem ele, os endereços derivados do token (moeda recém
 * lançada que a DexScreener ainda não indexou).
 */
async function acharCurva(
  conexao: Connection,
  pool: string | null | undefined,
  tokenMint: string,
): Promise<{ conta: PublicKey; tipo: TipoDeCurva; dados: Uint8Array } | null> {
  const mint = new PublicKey(tokenMint);
  const sol = new PublicKey(WSOL);
  const [pump] = PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mint.toBuffer()], PUMP);
  const solMaior = Buffer.compare(sol.toBuffer(), mint.toBuffer()) > 0;
  const dbc = CONFIGS_DBC.map(
    (config) =>
      PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), new PublicKey(config).toBuffer(), (solMaior ? sol : mint).toBuffer(), (solMaior ? mint : sol).toBuffer()],
        DBC,
      )[0],
  );
  // Com par conhecido, só ele: moeda que graduou tem o par na DEX, e a curva
  // antiga continuaria existindo com o último preço dela.
  const candidatas = pool ? [new PublicKey(pool)] : [pump, ...dbc];
  const infos = await conexao.getMultipleAccountsInfo(candidatas, "processed").catch(() => []);
  for (let i = 0; i < infos.length; i++) {
    const info = infos[i];
    if (!info) continue;
    const tipo: TipoDeCurva | null = info.owner.equals(PUMP) ? "pump" : info.owner.equals(DBC) ? "dbc" : null;
    if (tipo && lerCurva(tipo, info.data)) return { conta: candidatas[i], tipo, dados: info.data };
  }
  return null;
}

/**
 * Preço à vista (SOL por token) e SOL guardado, lidos dos bytes da conta.
 * Null quando a curva já completou — aí a moeda negocia numa pool de verdade.
 *
 * pump.fun: reservas virtuais em 8 (token) e 16 (SOL), SOL real em 32,
 * "completa" em 48. Chroma Curve (Meteora DBC): mint em 136, SOL guardado em
 * 240, raiz do preço (u128, Q64) em 280 — offsets conferidos contra o SDK.
 */
function lerCurva(tipo: TipoDeCurva, dados: Uint8Array): { precoSol: number; solGuardado: number } | null {
  const d = new DataView(dados.buffer, dados.byteOffset, dados.byteLength);
  if (tipo === "pump") {
    if (dados.length < 49 || dados[48] !== 0) return null;
    const token = Number(d.getBigUint64(8, true)) / 1e6;
    const sol = Number(d.getBigUint64(16, true)) / 1e9;
    if (!(token > 0)) return null;
    return { precoSol: sol / token, solGuardado: Number(d.getBigUint64(32, true)) / 1e9 };
  }
  if (dados.length < 296) return null;
  const raiz = (d.getBigUint64(280, true) + (d.getBigUint64(288, true) << 64n));
  const r = Number(raiz) / 2 ** 64;
  const precoSol = (r * r * 1e6) / 1e9;
  if (!(precoSol > 0)) return null;
  return { precoSol, solGuardado: Number(d.getBigUint64(240, true)) / 1e9 };
}

function saldoDoCofre(dados: Uint8Array): bigint {
  const visao = new DataView(dados.buffer, dados.byteOffset, dados.byteLength);
  return visao.getBigUint64(64, true);
}
