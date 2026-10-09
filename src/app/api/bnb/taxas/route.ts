import { NextResponse } from "next/server";
import { createPublicClient, decodeFunctionResult, encodeFunctionData, formatEther, http, type Abi } from "viem";
import { bsc } from "viem/chains";

import { lerDoCacheDoBanco } from "@/lib/db";
import leitor from "@/lib/leitor-de-taxas-artefato.json";
import troca from "@/lib/chroma-bnb-troca-artefato.json";

/**
 * GET /api/bnb/taxas?moeda=0x… → quanto o criador tem pra coletar agora
 * (09/10/2026). Simula o `coletar` numa chamada eth_call com o código do
 * LeitorDeTaxas (contracts/src/LeitorDeTaxas.sol) posto num endereço falso —
 * nada é publicado nem muda na rede. As moedas são cotadas em BNB pelo
 * contrato de negociação e tudo vira dólar pelo preço do BNB.
 */
const EVM = /^0x[0-9a-fA-F]{40}$/;
const LEITOR = "0x000000000000000000000000000000000000c0DE" as const;
const cliente = createPublicClient({ chain: bsc, transport: http("https://bsc-rpc.publicnode.com") });

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const moeda = q.get("moeda") ?? "";
  // Cada moeda é do lançador (e da negociação) dela; sem os parâmetros, os atuais.
  const lancadorDaMoeda = q.get("lancador") ?? "";
  const trocaDaMoeda = q.get("troca") ?? "";
  if (!EVM.test(moeda)) return NextResponse.json({ erro: "moeda inválida" }, { status: 400 });
  try {
    const [lancador, trocaEnd] = await Promise.all([
      lerDoCacheDoBanco<{ endereco: `0x${string}` }>("lancador-bnb"),
      lerDoCacheDoBanco<{ endereco: `0x${string}` }>("troca-bnb"),
    ]);
    const lancadorEnd = (EVM.test(lancadorDaMoeda) ? lancadorDaMoeda : lancador?.endereco) as `0x${string}` | undefined;
    const trocaUsada = (EVM.test(trocaDaMoeda) ? trocaDaMoeda : trocaEnd?.endereco) as `0x${string}` | undefined;
    if (!lancadorEnd) return NextResponse.json({ erro: "sem lançador" }, { status: 404 });

    const r = await cliente.call({
      to: LEITOR,
      data: encodeFunctionData({ abi: leitor.abi as Abi, functionName: "ler", args: [lancadorEnd, moeda] }),
      stateOverride: [{ address: LEITOR, code: leitor.deployedBytecode as `0x${string}` }],
    });
    const [bnb, tokens] = decodeFunctionResult({ abi: leitor.abi as Abi, functionName: "ler", data: r.data! }) as [bigint, bigint];

    let tokensEmBnb = 0n;
    if (tokens > 0n && trocaUsada) {
      const c = await cliente
        .call({
          to: trocaUsada,
          data: encodeFunctionData({ abi: troca.abi as Abi, functionName: "cotar", args: [moeda, false, tokens] }),
        })
        .catch(() => null);
      if (c?.data) tokensEmBnb = decodeFunctionResult({ abi: troca.abi as Abi, functionName: "cotar", data: c.data }) as bigint;
    }

    const preco = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd", {
      signal: AbortSignal.timeout(5000),
    })
      .then((x) => x.json())
      .then((j) => Number(j?.binancecoin?.usd) || null)
      .catch(() => null);

    const totalBnb = Number(formatEther(bnb + tokensEmBnb));
    return NextResponse.json({
      bnb: formatEther(bnb),
      tokens: formatEther(tokens),
      tokensEmBnb: formatEther(tokensEmBnb),
      usd: preco ? totalBnb * preco : null,
    });
  } catch (e) {
    console.warn("[api/bnb/taxas]", e);
    return NextResponse.json({ erro: "não deu pra ler agora" }, { status: 502 });
  }
}
