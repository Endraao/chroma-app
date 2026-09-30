import "server-only";

import { createPublicClient, decodeEventLog, http, parseAbi, parseAbiItem, type Address } from "viem";

import { cached } from "@/lib/cache";
import { CHROMA_PONS, FABRICA_DA_PONS } from "@/lib/chroma-pons";
import { precosNativos } from "@/lib/precos-nativos";
import { robinhoodChain } from "@/lib/web3";
import type { NegocioDoPool } from "@/lib/market";
import type { Candle, TokenSummary } from "@/lib/types";

/**
 * Moeda lançada na curva da Pons (Robinhood Chain), lida direto dos contratos.
 *
 * Mesmo motivo da curva própria (ver `curva-evm.ts`): antes de graduar a moeda
 * não tem pool em DEX nenhuma, e as fontes de mercado não a enxergam. Quem
 * sabe o preço, o progresso e os negócios é a própria curva.
 *
 * A Chroma lança e negocia nela pelo contrato ChromaPons (`chroma-pons.ts`).
 */

const cliente = createPublicClient({
  chain: robinhoodChain,
  transport: http(process.env.ROBINHOOD_RPC || robinhoodChain.rpcUrls.default.http[0]),
});

const ESCALA = 1e18;
/** Quantos blocos pra trás procurar negócios (a rede aceita até 10 milhões). */
const JANELA_DE_BLOCOS = 9_000_000n;

const ABI_FABRICA = parseAbi([
  "function getLaunchedToken(address token) view returns ((address token, address curve, address deployer, address creatorFeeRecipient, address pairToken, uint256 graduationThreshold, uint24 poolFee, int24 tickSpacing, uint16 creatorTaxBps, bool buybackEnabled, uint8 phase, uint256 sweptQuote, uint256 sweptTokens, uint256 sweptAt, bool exists))",
]);

const ABI_CURVA = parseAbi([
  "function getReserves() view returns (uint256 quoteReserve, uint256 tokenReserve)",
  "function realQuoteReserve() view returns (uint256)",
  "function phantomQuote() view returns (uint256)",
  "function feeBps() view returns (uint256)",
  "function creatorTaxBps() view returns (uint256)",
  "function graduated() view returns (bool)",
]);

const ABI_TOKEN = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function logo() view returns (string)",
  "function description() view returns (string)",
]);

const EVENTO_COMPRA = parseAbiItem(
  "event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)",
);
const EVENTO_VENDA = parseAbiItem(
  "event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)",
);
const EVENTO_NEGOCIADO = parseAbiItem(
  "event Negociado(address indexed trader, address indexed moeda, bool compra, uint256 entrada, uint256 saida, uint256 taxa)",
);

export interface MoedaDaPons {
  moeda: string;
  curva: string;
  /** quem recebe a taxa de criador (quem lançou, nas moedas da Chroma) */
  criador: string;
  /** reservas negociáveis, com o ETH virtual — em wei */
  reservaEth: bigint;
  reservaToken: bigint;
  /** ETH de verdade dentro da curva, em wei */
  ethReal: bigint;
  ethVirtualInicial: bigint;
  limiar: bigint;
  taxaBps: number;
  nome: string;
  simbolo: string;
  emissao: number;
  logo: string;
  descricao: string;
}

/** A moeda, se for da Pons E ainda estiver na curva. `null` em qualquer outro caso. */
export async function lerMoedaDaPons(moeda: string): Promise<MoedaDaPons | null> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(moeda)) return null;
  return cached(`pons:${moeda.toLowerCase()}`, 4_000, async () => {
    const l = await cliente
      .readContract({ address: FABRICA_DA_PONS, abi: ABI_FABRICA, functionName: "getLaunchedToken", args: [moeda as Address] })
      .catch(() => null);
    if (!l || !l.exists || l.phase !== 0 || l.pairToken !== "0x0000000000000000000000000000000000000000") return null;
    const curva = l.curve;
    const [reservas, real, fantasma, taxa, imposto, graduada, nome, simbolo, fornecimento, logo, descricao] = await Promise.all([
      cliente.readContract({ address: curva, abi: ABI_CURVA, functionName: "getReserves" }),
      cliente.readContract({ address: curva, abi: ABI_CURVA, functionName: "realQuoteReserve" }),
      cliente.readContract({ address: curva, abi: ABI_CURVA, functionName: "phantomQuote" }),
      cliente.readContract({ address: curva, abi: ABI_CURVA, functionName: "feeBps" }),
      cliente.readContract({ address: curva, abi: ABI_CURVA, functionName: "creatorTaxBps" }),
      cliente.readContract({ address: curva, abi: ABI_CURVA, functionName: "graduated" }),
      cliente.readContract({ address: moeda as Address, abi: ABI_TOKEN, functionName: "name" }),
      cliente.readContract({ address: moeda as Address, abi: ABI_TOKEN, functionName: "symbol" }),
      cliente.readContract({ address: moeda as Address, abi: ABI_TOKEN, functionName: "totalSupply" }),
      cliente.readContract({ address: moeda as Address, abi: ABI_TOKEN, functionName: "logo" }).catch(() => ""),
      cliente.readContract({ address: moeda as Address, abi: ABI_TOKEN, functionName: "description" }).catch(() => ""),
    ]);
    if (graduada) return null;
    return {
      moeda: moeda.toLowerCase(),
      curva,
      criador: l.creatorFeeRecipient,
      reservaEth: reservas[0],
      reservaToken: reservas[1],
      ethReal: real,
      ethVirtualInicial: fantasma,
      limiar: l.graduationThreshold,
      taxaBps: Number(taxa + imposto),
      nome,
      simbolo,
      emissao: Number(fornecimento) / ESCALA,
      logo,
      descricao,
    };
  }).catch(() => null);
}

/** Preço em ETH por token (as duas pontas têm 18 casas). */
export function precoNaPons(m: MoedaDaPons): number {
  return m.reservaToken > 0n ? Number(m.reservaEth) / Number(m.reservaToken) : 0;
}

/**
 * Preço de nascimento: o produto da curva é constante e ela nasce com só o
 * ETH virtual, então reserva_token_inicial = k / ETH_virtual e o preço é
 * ETH_virtual² / k.
 */
export function precoInicialNaPons(m: MoedaDaPons): number {
  const k = Number(m.reservaEth) * Number(m.reservaToken);
  const v = Number(m.ethVirtualInicial);
  return k > 0 ? (v * v) / k : 0;
}

export function progressoNaPons(m: MoedaDaPons): number {
  if (m.limiar === 0n) return 0;
  return Math.min(100, (Number(m.ethReal) / Number(m.limiar)) * 100);
}

export async function resumoDaMoedaPons(
  m: MoedaDaPons,
  extra?: { imagem?: string | null; descricao?: string | null; criadaEm?: number },
): Promise<TokenSummary> {
  const precoEth = (await precosNativos().catch(() => null))?.robinhood ?? 0;
  const agora = precoNaPons(m);
  const precoUsd = agora * precoEth;
  const criadaEm = extra?.criadaEm ?? 0;
  const p0 = precoInicialNaPons(m);
  const nova = criadaEm > 0 && Date.now() - criadaEm < 24 * 3600_000;
  const negocios = await negociosDaPons(m).catch(() => []);
  const volumeEth = negocios.reduce((s, n) => s + n.eth, 0);
  return {
    address: m.moeda,
    chain: "robinhood",
    name: m.nome,
    symbol: m.simbolo,
    imageUrl: extra?.imagem ?? (m.logo || undefined),
    description: extra?.descricao ?? (m.descricao || undefined),
    priceUsd: precoUsd,
    change24h: nova && p0 > 0 ? (agora / p0 - 1) * 100 : 0,
    marketCapUsd: precoUsd * m.emissao,
    liquidityUsd: (Number(m.ethReal) / ESCALA) * precoEth,
    volume24hUsd: volumeEth * precoEth,
    holders: new Set(negocios.filter((n) => n.compra).map((n) => n.carteira)).size,
    createdAt: criadaEm || Date.now(),
    bondingProgress: progressoNaPons(m),
    creator: m.criador,
    dexId: "pons",
  };
}

interface NegocioDaPons {
  time: number;
  carteira: string;
  compra: boolean;
  tokens: number;
  txHash: string;
  /** ETH por token, sem taxa */
  precoEth: number;
  /** ETH que passou pela curva, sem taxa */
  eth: number;
}

/**
 * Os negócios da curva, em ordem. Preço de EXECUÇÃO sem taxa (compra: o ETH
 * gasto menos taxa e imposto; venda: o recebido mais eles).
 *
 * Quem negociou: na compra é o `recipient`. Na venda pela Chroma o vendedor
 * que a curva vê é o NOSSO contrato — a pessoa de verdade vem do evento
 * `Negociado` dele, na mesma transação.
 */
async function negociosDaPons(m: MoedaDaPons): Promise<NegocioDaPons[]> {
  return cached(`negocios-pons:${m.moeda}`, 4_000, async () => {
    const ultimo = await cliente.getBlockNumber();
    const desde = ultimo > JANELA_DE_BLOCOS ? ultimo - JANELA_DE_BLOCOS : 0n;
    const [compras, vendas, nossos] = await Promise.all([
      cliente.getLogs({ address: m.curva as Address, event: EVENTO_COMPRA, fromBlock: desde, toBlock: ultimo }),
      cliente.getLogs({ address: m.curva as Address, event: EVENTO_VENDA, fromBlock: desde, toBlock: ultimo }),
      cliente.getLogs({
        address: CHROMA_PONS,
        event: EVENTO_NEGOCIADO,
        args: { moeda: m.moeda as Address },
        fromBlock: desde,
        toBlock: ultimo,
      }),
    ]);
    const traderDaTx = new Map(nossos.map((l) => [l.transactionHash, l.args.trader!]));

    const blocos = [...new Set([...compras, ...vendas].map((l) => l.blockNumber))];
    const tempos = new Map<bigint, number>();
    await Promise.all(
      blocos.map(async (b) => tempos.set(b, Number((await cliente.getBlock({ blockNumber: b })).timestamp))),
    );

    const lista: (NegocioDaPons & { ordem: bigint })[] = [];
    for (const l of compras) {
      const a = l.args;
      const liquido = a.quoteIn! - a.fee! - a.tax!;
      const tokens = Number(a.tokensOut!);
      lista.push({
        ordem: l.blockNumber * 100_000n + BigInt(l.logIndex),
        time: tempos.get(l.blockNumber) ?? 0,
        carteira: a.recipient!.toLowerCase(),
        compra: true,
        tokens: tokens / ESCALA,
        txHash: l.transactionHash,
        precoEth: tokens > 0 ? Number(liquido) / tokens : 0,
        eth: Number(liquido) / ESCALA,
      });
    }
    for (const l of vendas) {
      const a = l.args;
      const bruto = a.quoteOut! + a.fee! + a.tax!;
      const tokens = Number(a.tokensIn!);
      const pelaChroma = a.seller!.toLowerCase() === CHROMA_PONS.toLowerCase();
      lista.push({
        ordem: l.blockNumber * 100_000n + BigInt(l.logIndex),
        time: tempos.get(l.blockNumber) ?? 0,
        carteira: (pelaChroma ? (traderDaTx.get(l.transactionHash) ?? a.seller!) : a.seller!).toLowerCase(),
        compra: false,
        tokens: tokens / ESCALA,
        txHash: l.transactionHash,
        precoEth: tokens > 0 ? Number(bruto) / tokens : 0,
        eth: Number(bruto) / ESCALA,
      });
    }
    lista.sort((a, b) => (a.ordem < b.ordem ? -1 : a.ordem > b.ordem ? 1 : 0));
    return lista.map(({ ordem: _o, ...n }) => n);
  });
}

/** Velas em dólar a partir dos negócios (mesma regra de `velasDaCurvaEvm`). */
export async function velasDaPons(m: MoedaDaPons, segundos: number): Promise<Candle[]> {
  const [negocios, precos] = await Promise.all([negociosDaPons(m), precosNativos().catch(() => null)]);
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
      velas.push({ time: inicio, open: abertura, high: Math.max(abertura, preco), low: Math.min(abertura, preco), close: preco, volume: n.eth * precoEth });
    }
    anterior = preco;
  }
  return velas;
}

/** Os negócios no formato da tabela de traders. */
export async function negociosDaPonsComoPool(m: MoedaDaPons): Promise<NegocioDoPool[]> {
  const [negocios, precos] = await Promise.all([negociosDaPons(m), precosNativos().catch(() => null)]);
  const precoEth = precos?.robinhood ?? 0;
  return negocios.map((n) => ({
    carteira: n.carteira,
    lado: n.compra ? "compra" : "venda",
    tokens: n.tokens,
    usd: n.eth * precoEth,
    em: n.time * 1000,
    txHash: n.txHash,
  }));
}

/**
 * O lançamento feito pelo ChromaPons nesta transação, lido do RECIBO.
 * É a prova que o cadastro exige: foi o nosso contrato (e portanto a taxa da
 * Chroma foi paga), e quem lançou é quem assinou.
 */
export async function lancamentoPonsNaTransacao(
  hash: string,
): Promise<{ moeda: string; criador: string } | null> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return null;
  const recibo = await cliente.getTransactionReceipt({ hash: hash as `0x${string}` }).catch(() => null);
  if (!recibo || recibo.status !== "success") return null;
  if (recibo.to?.toLowerCase() !== CHROMA_PONS.toLowerCase()) return null;
  const evento = parseAbiItem(
    "event Lancada(address indexed moeda, address indexed curva, address indexed criador, uint256 compra, uint256 tokens)",
  );
  for (const log of recibo.logs) {
    if (log.address.toLowerCase() !== CHROMA_PONS.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: [evento], data: log.data, topics: log.topics });
      if (ev.args.criador.toLowerCase() !== recibo.from.toLowerCase()) return null;
      return { moeda: ev.args.moeda.toLowerCase(), criador: ev.args.criador.toLowerCase() };
    } catch {
      /* outro evento */
    }
  }
  return null;
}

