import {
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  pad,
  parseAbi,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

/**
 * Compra e venda de moedas EXTERNAS da Robinhood Chain (as que não nasceram
 * na curva da Chroma), direto na Uniswap v4 da rede.
 *
 * ---------------------------------------------------------------------------
 * DE ONDE VEIO O FORMATO
 * ---------------------------------------------------------------------------
 * Não há documentação deste fork. O formato foi copiado de swaps reais: a
 * maioria dos swaps da rede passa por `ROTEADOR` (`execute(commands, inputs,
 * deadline)`, igual ao UniversalRouter da Uniswap). A única diferença do
 * padrão é um campo a mais no swap, `minHopPriceX36`, que as transações reais
 * mandam zerado — e é o que fazemos também.
 *
 * As pools são pareadas com ETH puro ou com WETH; as duas são suportadas. Na
 * de WETH, a compra embrulha o ETH antes e a venda desembrulha depois — a
 * pessoa sempre paga e recebe ETH.
 *
 * ---------------------------------------------------------------------------
 * COMO A TAXA É COBRADA (sem contrato próprio)
 * ---------------------------------------------------------------------------
 * Compra: o ETH vai pro roteador, `TRANSFER` manda a taxa pra Chroma (e pro
 *   afiliado), e o resto entra no swap. A moeda cai direto na carteira.
 * Venda: o ETH do swap fica no roteador, `PAY_PORTION` separa a taxa, e
 *   `SWEEP` manda o resto pra pessoa — falhando se for menos que o mínimo.
 * Tudo numa transação só: ou sai inteiro, ou não sai nada.
 *
 * Simulado contra a mainnet em scripts/sim-uniswap-evm.mts.
 */

export const ROTEADOR = "0x8876789976decbfcbbbe364623c63652db8c0904" as Address;
export const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address;
export const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951" as Address;
export const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73" as Address;

const ETH = "0x0000000000000000000000000000000000000000" as Address;
/** Destino especial do roteador: "fica comigo" (ActionConstants / Constants). */
const O_PROPRIO_ROTEADOR = "0x0000000000000000000000000000000000000002" as Address;

const CMD = { SWEEP: 0x04, TRANSFER: 0x05, PAY_PORTION: 0x06, WRAP_ETH: 0x0b, UNWRAP_WETH: 0x0c, V4_SWAP: 0x10 } as const;
const ACAO = { SWAP_EXACT_IN_SINGLE: 0x06, SETTLE: 0x0b, SETTLE_ALL: 0x0c, TAKE: 0x0e } as const;

const TOPICO_INITIALIZE = keccak256(
  new TextEncoder().encode("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)"),
);

export interface ChaveDaPool {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

export interface PoolDaMoeda {
  id: Hex;
  chave: ChaveDaPool;
  /** o lado "dinheiro" da pool: ETH puro ou WETH */
  base: Address;
  /** a moeda é o currency0? (define a direção do swap) */
  moedaEhZero: boolean;
}

export const ABI_ROTEADOR = parseAbi(["function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"]);
export const ABI_PERMIT2 = parseAbi([
  "function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
]);
const ABI_EXTSLOAD = parseAbi(["function extsload(bytes32 slot) view returns (bytes32)"]);

const minusculo = (a: string) => a.toLowerCase() as Address;
const POOLS_ACHADAS = new Map<string, PoolDaMoeda>();

async function buscarLogs(cliente: PublicClient, topics: (Hex | null)[]) {
  // O RPC da Robinhood aceita no máximo 10 milhões de blocos por consulta:
  // procura em janelas, das mais recentes pras mais antigas.
  const JANELA = 9_900_000n;
  let fim = await cliente.getBlockNumber();
  for (;;) {
    const inicio = fim > JANELA ? fim - JANELA : 0n;
    const logs = (await cliente.request({
      method: "eth_getLogs",
      params: [{ address: POOL_MANAGER, fromBlock: `0x${inicio.toString(16)}`, toBlock: `0x${fim.toString(16)}`, topics }],
    })) as { topics: Hex[]; data: Hex }[];
    if (logs.length || inicio === 0n) return logs;
    fim = inicio - 1n;
  }
}

/**
 * Acha a pool da moeda contra ETH ou WETH. Com `idDaPool` (o par que a
 * DexScreener/GeckoTerminal informam) vai direto; sem ele, procura pelos
 * eventos de criação de pool.
 */
export async function acharPool(
  cliente: PublicClient,
  moeda: Address,
  idDaPool?: string | null,
): Promise<PoolDaMoeda | null> {
  const chaveDoCache = `${minusculo(moeda)}:${idDaPool ?? ""}`;
  const guardada = POOLS_ACHADAS.get(chaveDoCache);
  if (guardada) return guardada;

  const tentativas: (Hex | null)[][] = [];
  if (idDaPool && /^0x[0-9a-fA-F]{64}$/.test(idDaPool)) tentativas.push([TOPICO_INITIALIZE, idDaPool as Hex]);
  for (const base of [ETH, WETH]) {
    const [a, b] = BigInt(base) < BigInt(moeda) ? [base, moeda] : [moeda, base];
    tentativas.push([TOPICO_INITIALIZE, null, pad(minusculo(a)), pad(minusculo(b))]);
  }

  // Um mesmo par pode ter várias pools (taxas e hooks diferentes, muitas
  // vazias). Fica com a de MAIS liquidez — a primeira criada costuma ser lixo.
  const candidatas: PoolDaMoeda[] = [];
  for (const topics of tentativas) {
    for (const log of await buscarLogs(cliente, topics)) {
      const currency0 = minusculo("0x" + log.topics[2].slice(26));
      const currency1 = minusculo("0x" + log.topics[3].slice(26));
      const moedaEhZero = currency0 === minusculo(moeda);
      const base = moedaEhZero ? currency1 : currency0;
      if (!moedaEhZero && currency1 !== minusculo(moeda)) continue;
      if (base !== ETH && base !== minusculo(WETH)) continue;
      const [fee, tickSpacing, hooks] = decodificarDados(log.data);
      const achada: PoolDaMoeda = {
        id: log.topics[1],
        chave: { currency0, currency1, fee, tickSpacing, hooks },
        base,
        moedaEhZero,
      };
      candidatas.push(achada);
    }
    if (candidatas.length && topics.length === 2) break; // veio pelo id: é essa
  }
  if (!candidatas.length) return null;

  const liquidez = await Promise.all(candidatas.map((p) => liquidezDaPool(cliente, p.id).catch(() => 0n)));
  let melhor = 0;
  liquidez.forEach((l, i) => {
    if (l > liquidez[melhor]) melhor = i;
  });
  if (liquidez[melhor] === 0n) return null;
  POOLS_ACHADAS.set(chaveDoCache, candidatas[melhor]);
  return candidatas[melhor];
}

function slotDoEstado(id: Hex): bigint {
  return BigInt(keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [id, pad("0x06")])));
}

/** Liquidez ativa da pool (Pool.State: slot0, feeGrowth0, feeGrowth1, liquidity). */
async function liquidezDaPool(cliente: PublicClient, id: Hex): Promise<bigint> {
  const bruto = await cliente.readContract({
    address: POOL_MANAGER,
    abi: ABI_EXTSLOAD,
    functionName: "extsload",
    args: [pad(`0x${(slotDoEstado(id) + 3n).toString(16)}`)],
  });
  return BigInt(bruto) & ((1n << 128n) - 1n);
}

function decodificarDados(data: Hex): [number, number, Address] {
  const p = data.slice(2).match(/.{64}/g) ?? [];
  const fee = Number(BigInt("0x" + p[0]));
  let tick = BigInt("0x" + p[1]);
  if (tick >= 1n << 255n) tick -= 1n << 256n;
  return [fee, Number(tick), ("0x" + p[2].slice(24)) as Address];
}

/**
 * Preço à vista: quantas unidades (base) da moeda 1 wei de ETH compra, lido do
 * estado da pool no PoolManager (slot0). É estimativa — hooks podem cobrar
 * taxa própria —, por isso o mínimo aceito sempre leva a folga do slippage.
 */
export async function moedasPorEth(cliente: PublicClient, pool: PoolDaMoeda): Promise<number> {
  const POOLS_SLOT = pad("0x06");
  const slot = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [pool.id, POOLS_SLOT]));
  const bruto = await cliente.readContract({
    address: POOL_MANAGER,
    abi: ABI_EXTSLOAD,
    functionName: "extsload",
    args: [slot],
  });
  const sqrtPriceX96 = BigInt(bruto) & ((1n << 160n) - 1n);
  const raiz = Number(sqrtPriceX96) / 2 ** 96;
  const umPorZero = raiz * raiz; // currency1 por currency0
  return pool.moedaEhZero ? 1 / umPorZero : umPorZero;
}

const TIPO_SWAP = [
  {
    type: "tuple",
    components: [
      {
        name: "poolKey",
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
        ],
      },
      { name: "zeroForOne", type: "bool" },
      { name: "amountIn", type: "uint128" },
      { name: "amountOutMinimum", type: "uint128" },
      { name: "minHopPriceX36", type: "uint256" },
      { name: "hookData", type: "bytes" },
    ],
  },
] as const;

const bytesDe = (xs: number[]) => ("0x" + xs.map((x) => x.toString(16).padStart(2, "0")).join("")) as Hex;
const dupla = (a: Address, b: bigint) => encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [a, b]);
const tripla = (a: Address, b: Address, c: bigint) =>
  encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], [a, b, c]);

/**
 * O V4_SWAP: troca `entra` de `moedaEntra` e manda o que sair pra `recebedor`.
 * `roteadorPaga`: a entrada já está no roteador (WETH embrulhado agora), em
 * vez de vir da carteira da pessoa.
 */
export function entradaDoSwap(
  pool: PoolDaMoeda,
  moedaEntra: Address,
  entra: bigint,
  minimo: bigint,
  recebedor: Address,
  roteadorPaga: boolean,
): Hex {
  const { chave } = pool;
  const zeroForOne = minusculo(moedaEntra) === chave.currency0;
  const moedaSai = zeroForOne ? chave.currency1 : chave.currency0;
  const acoes = bytesDe([ACAO.SWAP_EXACT_IN_SINGLE, roteadorPaga ? ACAO.SETTLE : ACAO.SETTLE_ALL, ACAO.TAKE]);
  const params: Hex[] = [
    encodeAbiParameters(TIPO_SWAP, [
      { poolKey: chave, zeroForOne, amountIn: entra, amountOutMinimum: minimo, minHopPriceX36: 0n, hookData: "0x" },
    ]),
    roteadorPaga
      ? encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "bool" }], [moedaEntra, 0n, false])
      : dupla(moedaEntra, entra),
    tripla(moedaSai, recebedor, 0n),
  ];
  return encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], [acoes, params]);
}

export function montar(comandos: number[], entradas: Hex[]): Hex {
  const prazo = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  return encodeFunctionData({ abi: ABI_ROTEADOR, functionName: "execute", args: [bytesDe(comandos), entradas, prazo] });
}

/** Compra: `bruto` em wei; taxas saem antes do swap. */
export function montarCompra({
  pool,
  comprador,
  bruto,
  minimoDeMoedas,
  taxas,
}: {
  pool: PoolDaMoeda;
  comprador: Address;
  bruto: bigint;
  minimoDeMoedas: bigint;
  taxas: { para: Address; valor: bigint }[];
}): { data: Hex; value: bigint } {
  const pagas = taxas.filter((x) => x.valor > 0n);
  const liquido = bruto - pagas.reduce((s, x) => s + x.valor, 0n);
  const comWeth = pool.base !== ETH;
  const comandos: number[] = [...pagas.map(() => CMD.TRANSFER)];
  const entradas: Hex[] = [...pagas.map((x) => tripla(ETH, x.para, x.valor))];
  if (comWeth) {
    comandos.push(CMD.WRAP_ETH);
    entradas.push(dupla(O_PROPRIO_ROTEADOR, liquido));
  }
  comandos.push(CMD.V4_SWAP, CMD.SWEEP);
  entradas.push(
    entradaDoSwap(pool, pool.base, liquido, minimoDeMoedas, comprador, comWeth),
    tripla(ETH, comprador, 0n), // devolve qualquer sobra de ETH
  );
  return { data: montar(comandos, entradas), value: bruto };
}

/**
 * Venda: `moedas` em unidades base. `porcoes` em bps do ETH recebido, na
 * ordem em que são pagas (ver `porcoesSequenciais`).
 */
export function montarVenda({
  pool,
  moeda,
  vendedor,
  moedas,
  minimoLiquido,
  porcoes,
}: {
  pool: PoolDaMoeda;
  moeda: Address;
  vendedor: Address;
  moedas: bigint;
  minimoLiquido: bigint;
  porcoes: { para: Address; bps: bigint }[];
}): Hex {
  const pagas = porcoes.filter((x) => x.bps > 0n);
  const comWeth = pool.base !== ETH;
  const comandos: number[] = [CMD.V4_SWAP];
  const entradas: Hex[] = [entradaDoSwap(pool, moeda, moedas, 0n, O_PROPRIO_ROTEADOR, false)];
  if (comWeth) {
    comandos.push(CMD.UNWRAP_WETH);
    entradas.push(dupla(O_PROPRIO_ROTEADOR, 0n));
  }
  comandos.push(...pagas.map(() => CMD.PAY_PORTION), CMD.SWEEP);
  entradas.push(...pagas.map((x) => tripla(ETH, x.para, x.bps)), tripla(ETH, vendedor, minimoLiquido));
  return montar(comandos, entradas);
}

/**
 * Converte a divisão da taxa (sobre o total) em porções sequenciais do
 * PAY_PORTION: a segunda incide sobre o que sobrou depois da primeira.
 */
export function porcoesSequenciais(taxas: { para: Address; bps: number }[]): { para: Address; bps: bigint }[] {
  let restante = 10_000;
  return taxas
    .filter((x) => x.bps > 0)
    .map((x) => {
      const bps = BigInt(Math.floor((x.bps * 10_000) / restante));
      restante -= x.bps;
      return { para: x.para, bps };
    });
}
