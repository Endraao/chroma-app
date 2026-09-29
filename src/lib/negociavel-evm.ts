import {
  encodeAbiParameters,
  erc20Abi,
  keccak256,
  pad,
  parseEther,
  toHex,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

import {
  acharPool,
  moedasPorEth,
  montarCompra,
  montarVenda,
  porcoesSequenciais,
  PERMIT2,
  ROTEADOR,
  type PoolDaMoeda,
} from "@/lib/uniswap-evm";

/**
 * A moeda externa pode ser negociada pela Chroma? Responde SIMULANDO uma
 * compra e uma venda de verdade contra a rede (eth_call — nada é enviado).
 *
 * Por que simular em vez de só achar a pool: várias plataformas da Robinhood
 * põem um hook na pool que só aceita o roteador delas. A compra pode até
 * passar e a venda não — e quem comprou pela Chroma ficaria sem conseguir
 * vender aqui. Só liberamos quando as DUAS passam.
 *
 * A venda é simulada com uma carteira de mentira que recebe saldo e
 * permissões por "state override" (só dentro da simulação). Pra isso é
 * preciso achar em que posição de memória o token guarda saldo e allowance,
 * testando as posições mais comuns.
 */

const QUEM = "0x9999999999999999999999999999999999999999" as Address;
const TAXA = "0xc00D47A88A1e737fcBc496ceabD7a96397429e6e" as Address;
const MAX = `0x${"f".repeat(64)}` as Hex;

const mapa = (chave: Hex, slot: bigint) =>
  keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [chave, pad(toHex(slot))]));
const mapaDuplo = (a: Hex, b: Hex, slot: bigint) =>
  keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [a, mapa(b, slot)]));

export type Negociavel =
  | { ok: true; pool: PoolDaMoeda; decimais: number }
  | { ok: false; motivo: "sem-pool" | "compra-bloqueada" | "venda-bloqueada" | "token-estranho" };

/** Onde os padrões comuns guardam saldos: OpenZeppelin (0/1), Solmate (3/4), proxies (51/52, 101). */
const POSICOES_COMUNS = [0n, 1n, 2n, 3n, 4n, 5n, 6n, 51n, 52n, 101n];

async function acharSlots(c: PublicClient, moeda: Address) {
  for (const s of POSICOES_COMUNS) {
    const saldo = mapa(pad(QUEM), s);
    const lido = await c
      .readContract({
        address: moeda,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [QUEM],
        stateOverride: [{ address: moeda, stateDiff: [{ slot: saldo, value: pad(toHex(123456789n)) }] }],
      } as never)
      .catch(() => 0n);
    if (lido !== 123456789n) continue;
    // allowance costuma morar logo depois do saldo; se não, procura
    for (const a of [s + 1n, ...POSICOES_COMUNS.filter((x) => x !== s + 1n)]) {
      const permissao = mapaDuplo(pad(PERMIT2), pad(QUEM), a);
      const lida = await c
        .readContract({
          address: moeda,
          abi: erc20Abi,
          functionName: "allowance",
          args: [QUEM, PERMIT2],
          stateOverride: [{ address: moeda, stateDiff: [{ slot: permissao, value: MAX }] }],
        } as never)
        .catch(() => 0n);
      if (lida === BigInt(MAX)) return { saldo, permissao };
    }
    return null;
  }
  return null;
}

/** Alguém que recebeu a moeda há pouco, ainda tem saldo e já liberou o Permit2. */
async function donoComPermissao(c: PublicClient, moeda: Address): Promise<{ quem: Address; saldo: bigint } | null> {
  const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const fim = await c.getBlockNumber();
  const logs = (await c
    .request({
      method: "eth_getLogs",
      params: [{ address: moeda, topics: [TRANSFER], fromBlock: `0x${(fim - 200_000n).toString(16)}`, toBlock: "latest" }],
    })
    .catch(() => [])) as { topics: Hex[] }[];
  const vistos = new Set<string>();
  for (const l of logs.reverse()) {
    const quem = ("0x" + (l.topics[2] ?? "").slice(26)) as Address;
    if (quem.length !== 42 || vistos.has(quem)) continue;
    vistos.add(quem);
    if (vistos.size > 15) break;
    const [saldo, liberado] = await Promise.all([
      c.readContract({ address: moeda, abi: erc20Abi, functionName: "balanceOf", args: [quem] }).catch(() => 0n),
      c.readContract({ address: moeda, abi: erc20Abi, functionName: "allowance", args: [quem, PERMIT2] }).catch(() => 0n),
    ]);
    if (saldo > 0n && liberado >= saldo) return { quem, saldo };
  }
  return null;
}

export async function verificarNegociavel(
  c: PublicClient,
  moeda: Address,
  idDaPool?: string | null,
  criadaEm?: number,
): Promise<Negociavel> {
  const pool = await acharPool(c, moeda, idDaPool, criadaEm);
  if (!pool) return { ok: false, motivo: "sem-pool" };

  const decimais = await c.readContract({ address: moeda, abi: erc20Abi, functionName: "decimals" }).catch(() => 18);
  const porEth = await moedasPorEth(c, pool);

  /* compra de 0,001 ETH */
  const bruto = parseEther("0.001");
  const compra = montarCompra({
    pool,
    comprador: QUEM,
    bruto,
    minimoDeMoedas: 1n,
    taxas: [{ para: TAXA, valor: (bruto * 75n) / 10_000n }],
  });
  try {
    await c.call({ account: QUEM, to: ROTEADOR, data: compra.data, value: compra.value, stateOverride: [{ address: QUEM, balance: parseEther("10") }] });
  } catch {
    return { ok: false, motivo: "compra-bloqueada" };
  }

  /* venda do equivalente a ~0,001 ETH */
  const moedas = BigInt(Math.max(1, Math.floor(porEth * 1e15)));
  const slots = await acharSlots(c, moeda);
  if (!slots) {
    // Memória do token fora dos padrões: simula com um dono REAL que já
    // liberou o Permit2 — aí só a permissão do Permit2 precisa ser forjada.
    const dono = await donoComPermissao(c, moeda);
    if (!dono) return { ok: false, motivo: "token-estranho" };
    const qtd = dono.saldo < moedas ? dono.saldo : moedas;
    const slotP2 = keccak256(
      encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [pad(ROTEADOR), mapaDuplo(pad(moeda), pad(dono.quem), 1n)]),
    );
    const dados = montarVenda({ pool, moeda, vendedor: dono.quem, moedas: qtd, minimoLiquido: 1n, porcoes: porcoesSequenciais([{ para: TAXA, bps: 75 }]) });
    try {
      await c.call({
        account: dono.quem,
        to: ROTEADOR,
        data: dados,
        stateOverride: [{ address: PERMIT2, stateDiff: [{ slot: slotP2, value: pad(toHex((((1n << 48n) - 1n) << 160n) | ((1n << 160n) - 1n))) }] }],
      });
      return { ok: true, pool, decimais: Number(decimais) };
    } catch {
      return { ok: false, motivo: "venda-bloqueada" };
    }
  }
  const permit2Slot = keccak256(
    encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [pad(ROTEADOR), mapaDuplo(pad(moeda), pad(QUEM), 1n)]),
  );
  const empacotado = pad(toHex((((1n << 48n) - 1n) << 160n) | ((1n << 160n) - 1n)));
  const venda = montarVenda({
    pool,
    moeda,
    vendedor: QUEM,
    moedas,
    minimoLiquido: 1n,
    porcoes: porcoesSequenciais([{ para: TAXA, bps: 75 }]),
  });
  try {
    await c.call({
      account: QUEM,
      to: ROTEADOR,
      data: venda,
      stateOverride: [
        { address: moeda, stateDiff: [{ slot: slots.saldo, value: pad(toHex(moedas * 10n)) }, { slot: slots.permissao, value: MAX }] },
        { address: PERMIT2, stateDiff: [{ slot: permit2Slot, value: empacotado }] },
      ],
    });
  } catch {
    return { ok: false, motivo: "venda-bloqueada" };
  }

  return { ok: true, pool, decimais: Number(decimais) };
}
