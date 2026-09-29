// Simula (eth_call, nada é enviado) compra e venda de moeda externa pela Uniswap v4 da Robinhood.
// Uso: npx tsx scripts/sim-uniswap-evm.mts
import { createPublicClient, http, erc20Abi, parseEther, decodeFunctionData, parseAbi, type Address } from "viem";
import { acharPool, moedasPorEth, montarCompra, montarVenda, porcoesSequenciais, ROTEADOR, PERMIT2, ABI_PERMIT2 } from "../src/lib/uniswap-evm.ts";

const c = createPublicClient({ transport: http("https://rpc.mainnet.chain.robinhood.com") });
const CHROMA = "0xc00D47A88A1e737fcBc496ceabD7a96397429e6e" as Address;
const AFIL = "0x1111111111111111111111111111111111111111" as Address;
let falhas = 0;

async function compra(moeda: Address, idPool?: string) {
  const pool = await acharPool(c as never, moeda, idPool);
  if (!pool) { falhas++; return console.log("FALHA sem pool", moeda); }
  const porEth = await moedasPorEth(c as never, pool);
  const bruto = parseEther("0.001");
  const liquido = bruto - (bruto * 75n) / 10_000n;
  const esperado = BigInt(Math.floor(Number(liquido) * porEth));
  const quem = "0x9999999999999999999999999999999999999999" as Address;
  const antes = await c.readContract({ address: moeda, abi: erc20Abi, functionName: "balanceOf", args: [quem] });
  const { data, value } = montarCompra({
    pool, comprador: quem, bruto, minimoDeMoedas: (esperado * 90n) / 100n,
    taxas: [{ para: AFIL, valor: (bruto * 30n) / 10_000n }, { para: CHROMA, valor: (bruto * 45n) / 10_000n }],
  });
  try {
    await c.call({ account: quem, to: ROTEADOR, data, value, stateOverride: [{ address: quem, balance: parseEther("10") }] });
    console.log("ok   compra", moeda, "base", pool.base === "0x0000000000000000000000000000000000000000" ? "ETH" : "WETH", "esperado", esperado, "antes", antes);
  } catch (e) { falhas++; console.log("FALHA compra", moeda, (e as Error).message.split("\n").slice(0, 2).join(" | ")); }
}

/** Acha alguém que vendeu esta moeda recentemente pelo roteador e ainda tem saldo + permissões. */
async function vendedorReal(moeda: Address): Promise<Address | null> {
  const fim = await c.getBlockNumber();
  const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const logs = await c.getLogs({ address: moeda, fromBlock: fim - 400_000n, toBlock: fim }).catch(() => []);
  const candidatos = [...new Set(logs.filter((l) => l.topics[0] === TRANSFER).map((l) => ("0x" + l.topics[1]!.slice(26)) as Address))].reverse();
  for (const quem of candidatos.slice(0, 60)) {
    const saldo = await c.readContract({ address: moeda, abi: erc20Abi, functionName: "balanceOf", args: [quem] });
    if (saldo === 0n) continue;
    const [p2] = await c.readContract({ address: PERMIT2, abi: ABI_PERMIT2, functionName: "allowance", args: [quem, moeda, ROTEADOR] });
    const al = await c.readContract({ address: moeda, abi: erc20Abi, functionName: "allowance", args: [quem, PERMIT2] });
    if (p2 >= saldo && al >= saldo) return quem;
  }
  return null;
}

async function venda(moeda: Address) {
  const pool = await acharPool(c as never, moeda);
  if (!pool) { falhas++; return console.log("FALHA sem pool"); }
  const vendedor = await vendedorReal(moeda);
  if (!vendedor) return console.log("pulei venda (sem vendedor com permissão)", moeda);
  const saldo = await c.readContract({ address: moeda, abi: erc20Abi, functionName: "balanceOf", args: [vendedor] });
  const data = montarVenda({
    pool, moeda, vendedor, moedas: saldo / 10n, minimoLiquido: 1n,
    porcoes: porcoesSequenciais([{ para: AFIL, bps: 30 }, { para: CHROMA, bps: 45 }]),
  });
  try {
    await c.call({ account: vendedor, to: ROTEADOR, data });
    console.log("ok   venda", moeda, "vendedor", vendedor);
  } catch (e) { falhas++; console.log("FALHA venda", moeda, (e as Error).message.split("\n").slice(0, 2).join(" | ")); }
}

await compra("0x14c51bb55592372eac7141a1d0527d1dd7fbd42f", "0x2adc17c9e5c50f44fef7e209b8710e1ecd5624831beb52a528ffc9e51722bf02");
await compra("0x5d760aba8845d7611a44d9061cbc5d87d36bf91b");
await venda("0x5d760aba8845d7611a44d9061cbc5d87d36bf91b");
await venda("0x14c51bb55592372eac7141a1d0527d1dd7fbd42f");
console.log(falhas ? `\n✗ ${falhas} falha(s)` : "\n✓ tudo certo");
void decodeFunctionData; void parseAbi;
