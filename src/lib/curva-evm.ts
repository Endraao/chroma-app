import "server-only";

import { createPublicClient, decodeEventLog, erc20Abi, http, parseAbiItem, type Address } from "viem";

import { cached } from "@/lib/cache";
import {
  ABI_DA_CURVA,
  CHROMA_CURVE_EVM,
  curvaEvmDisponivel,
  ehCurvaDaChroma,
  lerCurvaEvm,
  progressoDaCurvaEvm,
  type EstadoDaCurvaEvm,
} from "@/lib/chroma-evm";
import { precosNativos } from "@/lib/precos-nativos";
import { robinhoodChain } from "@/lib/web3";
import type { NegocioDoPool } from "@/lib/market";
import type { Candle, TokenSummary } from "@/lib/types";

/**
 * Moeda da curva da Chroma na Robinhood Chain, lida direto do contrato.
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO A DEXSCREENER / GECKOTERMINAL
 * ---------------------------------------------------------------------------
 * Moeda na curva não tem pool em DEX nenhuma — ela negocia contra o contrato.
 * As fontes de mercado não enxergam isso, e a página da primeira moeda lançada
 * (SundayCat, 27/09/2026) abriu como "Token sem liquidez", com símbolo tirado
 * do endereço, gráfico vazio e alerta de "difícil sair". Tudo errado, e tudo
 * porque a pergunta foi feita pra quem não tinha como responder.
 *
 * Aqui a resposta vem de quem sabe: o estado da curva, o nome gravado no
 * token e os eventos `Negocio` do próprio contrato.
 */

/**
 * Bloco em que a `ChromaCurve` foi publicada (27/09/2026). Nenhum negócio
 * existe antes dele, e a rede aceita consultar dezenas de milhões de blocos
 * de uma vez — testado —, então não há por que paginar por enquanto.
 */
const BLOCO_DA_PUBLICACAO = 74_206_844n;

/** Casas do token e do ETH: as duas são 18 nesta rede. */
const ESCALA = 1e18;

const EVENTO_NEGOCIO = parseAbiItem(
  "event Negocio(address indexed moeda, address indexed trader, bool compra, uint256 eth, uint256 tokens, uint256 taxaCriador, uint256 taxaAfiliado, uint256 taxaPlataforma, address afiliado)",
);

const EVENTO_TRANSFER = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

/**
 * Quantas carteiras têm saldo da moeda, pelos eventos Transfer do token.
 * A própria curva (que guarda o que não foi vendido) não conta.
 */
async function contarHolders(moeda: string): Promise<number> {
  return cached(`holders-evm:${moeda.toLowerCase()}`, 30_000, async () => {
    const logs = await cliente.getLogs({
      address: moeda as Address,
      event: EVENTO_TRANSFER,
      fromBlock: BLOCO_DA_PUBLICACAO,
      toBlock: "latest",
    });
    const saldos = new Map<string, bigint>();
    for (const l of logs) {
      const { from, to, value } = l.args;
      if (from) saldos.set(from.toLowerCase(), (saldos.get(from.toLowerCase()) ?? 0n) - value!);
      if (to) saldos.set(to.toLowerCase(), (saldos.get(to.toLowerCase()) ?? 0n) + value!);
    }
    const ignorar = new Set([
      "0x0000000000000000000000000000000000000000",
      String(CHROMA_CURVE_EVM).toLowerCase(),
    ]);
    let total = 0;
    for (const [carteira, saldo] of saldos) if (saldo > 0n && !ignorar.has(carteira)) total++;
    return total;
  });
}

const cliente = createPublicClient({
  chain: robinhoodChain,
  transport: http(process.env.ROBINHOOD_RPC || robinhoodChain.rpcUrls.default.http[0]),
});

export interface MoedaDaCurvaEvm {
  curva: EstadoDaCurvaEvm;
  nome: string;
  simbolo: string;
  emissao: number;
  tokenAVenda: bigint;
}

/**
 * Estado da moeda, ou null se o endereço não é moeda da curva da Chroma.
 *
 * Nome e símbolo vêm do TOKEN, e não do que o navegador mandou no registro:
 * é o que está gravado na rede e o que qualquer carteira vai mostrar.
 */
export async function lerMoedaDaCurvaEvm(moeda: string): Promise<MoedaDaCurvaEvm | null> {
  if (!curvaEvmDisponivel() || !/^0x[0-9a-fA-F]{40}$/.test(moeda)) return null;

  return cached(`curva-evm:${moeda.toLowerCase()}`, 10_000, async () => {
    const curvaBruta = await cliente.readContract({
      address: CHROMA_CURVE_EVM as Address,
      abi: ABI_DA_CURVA,
      functionName: "curvas",
      args: [moeda as Address],
    });
    const curva = lerCurvaEvm(curvaBruta);
    if (!ehCurvaDaChroma(curva)) return null;

    const [nome, simbolo, fornecimento, tokenAVenda] = await Promise.all([
      cliente.readContract({ address: moeda as Address, abi: erc20Abi, functionName: "name" }),
      cliente.readContract({ address: moeda as Address, abi: erc20Abi, functionName: "symbol" }),
      cliente.readContract({ address: moeda as Address, abi: erc20Abi, functionName: "totalSupply" }),
      cached("curva-evm:tokenAVenda", 3_600_000, () =>
        cliente.readContract({
          address: CHROMA_CURVE_EVM as Address,
          abi: ABI_DA_CURVA,
          functionName: "tokenAVenda",
        }),
      ),
    ]);

    return {
      curva,
      nome,
      simbolo,
      emissao: Number(fornecimento) / ESCALA,
      tokenAVenda: tokenAVenda as bigint,
    };
  });
}

/** Preço em ETH de UM token, pelas reservas virtuais (o preço marginal de agora). */
export function precoEmEth(curva: EstadoDaCurvaEvm): number {
  if (curva.tokenVirtual === 0n) return 0;
  return Number(curva.ethVirtual) / Number(curva.tokenVirtual);
}

/**
 * A moeda no formato que o resto do site entende.
 *
 * `extra` é o que só o nosso catálogo sabe (imagem, descrição, data de
 * criação); sem ele a página abre do mesmo jeito, só sem a arte.
 */
export async function resumoDaMoedaEvm(
  moeda: string,
  extra?: { imagem?: string | null; descricao?: string | null; criadaEm?: number },
): Promise<TokenSummary | null> {
  const dados = await lerMoedaDaCurvaEvm(moeda);
  /* Migrada: o preço da curva congelou; quem sabe agora é o mercado. */
  if (!dados || dados.curva.migrada) return null;

  const [precos, holders] = await Promise.all([
    precosNativos().catch(() => null),
    contarHolders(moeda).catch(() => 0),
  ]);
  const precoEth = precos?.robinhood ?? 0;
  const { curva } = dados;
  const precoUsd = precoEmEth(curva) * precoEth;

  /*
   * Moeda com menos de 24h: variação contra o preço de NASCIMENTO (produto
   * constante da curva, voltando os tokens já vendidos) — igual à Solana.
   * Com mais de 24h, sem preço de ontem guardado, fica zero.
   */
  const criadaEm = extra?.criadaEm ?? 0;
  let variacao = 0;
  if (criadaEm > 0 && Date.now() - criadaEm < 24 * 3600_000) {
    const vendidos = dados.tokenAVenda > curva.tokenReal ? dados.tokenAVenda - curva.tokenReal : BigInt(0);
    const tv0 = Number(curva.tokenVirtual + vendidos);
    const p0 = tv0 > 0 ? (Number(curva.ethVirtual) * Number(curva.tokenVirtual)) / (tv0 * tv0) : 0;
    const agora = precoEmEth(curva);
    if (p0 > 0 && agora > 0) variacao = (agora / p0 - 1) * 100;
  }

  return {
    address: moeda,
    chain: "robinhood",
    name: dados.nome,
    symbol: dados.simbolo,
    imageUrl: extra?.imagem ?? undefined,
    description: extra?.descricao ?? "Moeda lançada na curva da Chroma.",
    priceUsd: precoUsd,
    change24h: variacao,
    marketCapUsd: precoUsd * dados.emissao,
    /* A liquidez da curva é o ETH de verdade que está dentro dela. */
    liquidityUsd: (Number(curva.ethReal) / ESCALA) * precoEth,
    /* Acumulado desde o lançamento, não 24h: a curva não guarda por dia. */
    volume24hUsd: (Number(curva.volumeAcumulado) / ESCALA) * precoEth,
    holders,
    createdAt: extra?.criadaEm ?? Date.now(),
    bondingProgress: progressoDaCurvaEvm(curva, dados.tokenAVenda),
    creator: curva.criador,
  };
}

interface NegocioDaCurva {
  /** segundos desde epoch */
  time: number;
  carteira: string;
  compra: boolean;
  /** tokens que trocaram de mão, em unidades inteiras */
  tokens: number;
  txHash: string;
  /** ETH por token, sem taxa */
  precoEth: number;
  /** ETH que passou pela curva, sem taxa */
  eth: number;
}

/**
 * Todos os negócios da moeda na curva, em ordem.
 *
 * O preço de cada um é o de EXECUÇÃO sem taxa: na compra o evento traz o ETH
 * bruto (taxas dentro), na venda traz o líquido (taxas fora). Somar ou
 * subtrair as três fatias leva os dois ao mesmo ponto — o ETH que de fato
 * trocou de mão com a curva.
 */
async function negociosDaCurvaEvm(moeda: string): Promise<NegocioDaCurva[]> {
  return cached(`negocios-evm:${moeda.toLowerCase()}`, 10_000, async () => {
    const logs = await cliente.getLogs({
      address: CHROMA_CURVE_EVM as Address,
      event: EVENTO_NEGOCIO,
      args: { moeda: moeda as Address },
      fromBlock: BLOCO_DA_PUBLICACAO,
      toBlock: "latest",
    });

    /* Um bloco por negócio distinto; a rede devolve o carimbo de tempo dele. */
    const blocos = [...new Set(logs.map((l) => l.blockNumber))];
    const tempos = new Map<bigint, number>();
    await Promise.all(
      blocos.map(async (b) => {
        const bloco = await cliente.getBlock({ blockNumber: b });
        tempos.set(b, Number(bloco.timestamp));
      }),
    );

    return logs.map((l) => {
      const a = l.args;
      const taxas = a.taxaCriador! + a.taxaAfiliado! + a.taxaPlataforma!;
      const ethLimpo = a.compra ? a.eth! - taxas : a.eth! + taxas;
      const tokens = Number(a.tokens!);
      return {
        time: tempos.get(l.blockNumber) ?? 0,
        carteira: a.trader!,
        compra: a.compra!,
        tokens: tokens / ESCALA,
        txHash: l.transactionHash,
        precoEth: tokens > 0 ? Number(ethLimpo) / tokens : 0,
        eth: Number(ethLimpo) / ESCALA,
      };
    });
  });
}

/**
 * Velas em dólar a partir dos negócios.
 *
 * A abertura de cada vela é o fechamento da anterior — sem isso, uma vela
 * isolada aparece como traço solto e o gráfico parece quebrado. Intervalo sem
 * negócio não vira vela: numa moeda recém-nascida, inventar velas planas
 * esconderia que ninguém negociou.
 *
 * O preço do ETH é o de AGORA para toda a série. Numa moeda de horas isso é
 * irrelevante; se um dia importar, guarda-se o preço do ETH por bloco.
 */
export async function velasDaCurvaEvm(moeda: string, segundos: number): Promise<Candle[]> {
  const [negocios, precos] = await Promise.all([
    negociosDaCurvaEvm(moeda),
    precosNativos().catch(() => null),
  ]);
  const precoEth = precos?.robinhood ?? 0;
  if (!negocios.length || precoEth <= 0) return [];

  const velas: Candle[] = [];
  let anterior: number | null = null;

  for (const n of negocios) {
    const preco = n.precoEth * precoEth;
    const inicio = Math.floor(n.time / segundos) * segundos;
    const atual = velas[velas.length - 1];

    if (atual && atual.time === inicio) {
      atual.high = Math.max(atual.high, preco);
      atual.low = Math.min(atual.low, preco);
      atual.close = preco;
      atual.volume += n.eth * precoEth;
    } else {
      const abertura = anterior ?? preco;
      velas.push({
        time: inicio,
        open: abertura,
        high: Math.max(abertura, preco),
        low: Math.min(abertura, preco),
        close: preco,
        volume: n.eth * precoEth,
      });
    }
    anterior = preco;
  }

  return velas;
}

/**
 * Quanto a carteira tem de cada moeda, em unidades inteiras (18 casas → número).
 *
 * Uma leitura por moeda, em paralelo. A lista é o catálogo da Chroma (dezenas,
 * não milhares), então dispensa multicall — que nem está declarado na config
 * desta rede.
 */
export async function saldosNaCarteiraEvm(
  carteira: string,
  moedas: string[],
): Promise<Map<string, number>> {
  const saldos = new Map<string, number>();
  if (!/^0x[0-9a-fA-F]{40}$/.test(carteira)) return saldos;

  await Promise.all(
    moedas.map(async (moeda) => {
      try {
        const bruto = await cliente.readContract({
          address: moeda as Address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [carteira as Address],
        });
        if (bruto > 0n) saldos.set(moeda.toLowerCase(), Number(bruto) / ESCALA);
      } catch {
        /* moeda ilegível agora: fica fora da lista, não derruba as outras */
      }
    }),
  );
  return saldos;
}

/**
 * Os negócios da curva no formato da tabela de traders (o mesmo da
 * GeckoTerminal), pra que traders, PnL e "meus swaps" funcionem igual nas
 * moedas da curva. Dólar ao preço do ETH de agora — ver `velasDaCurvaEvm`.
 */
export async function negociosDaCurvaComoPool(moeda: string): Promise<NegocioDoPool[]> {
  const [negocios, precos] = await Promise.all([
    negociosDaCurvaEvm(moeda),
    precosNativos().catch(() => null),
  ]);
  const precoEth = precos?.robinhood ?? 0;
  return negocios.map((n) => ({
    carteira: n.carteira.toLowerCase(),
    lado: n.compra ? "compra" : "venda",
    tokens: n.tokens,
    usd: n.eth * precoEth,
    em: n.time * 1000,
    txHash: n.txHash,
  }));
}

/**
 * O que uma transação fez na curva da Chroma, lido do RECIBO na rede.
 *
 * Usado pelo airdrop: o navegador só manda o hash; quem diz se houve negócio,
 * de quem e de quanto é a rede. Devolve null se a transação não existe,
 * falhou, não foi assinada por `carteira` ou não negociou na nossa curva.
 */
export async function negocioNaTransacaoEvm(
  hash: string,
  carteira: string,
): Promise<{ ethLimpo: number } | null> {
  if (!curvaEvmDisponivel() || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return null;

  const recibo = await cliente.getTransactionReceipt({ hash: hash as `0x${string}` }).catch(() => null);
  if (!recibo || recibo.status !== "success") return null;
  if (recibo.from.toLowerCase() !== carteira.toLowerCase()) return null;

  let total = 0n;
  for (const log of recibo.logs) {
    if (log.address.toLowerCase() !== String(CHROMA_CURVE_EVM).toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: [EVENTO_NEGOCIO], data: log.data, topics: log.topics });
      const a = ev.args;
      if (a.trader.toLowerCase() !== carteira.toLowerCase()) continue;
      const taxas = a.taxaCriador + a.taxaAfiliado + a.taxaPlataforma;
      total += a.compra ? a.eth - taxas : a.eth + taxas;
    } catch {
      /* outro evento da curva (Lancada, CurvaEncheu): não é negócio */
    }
  }
  return total > 0n ? { ethLimpo: Number(total) / ESCALA } : null;
}
