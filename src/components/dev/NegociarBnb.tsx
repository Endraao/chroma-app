"use client";

import { useEffect, useRef, useState } from "react";
import { erc20Abi, formatEther, maxUint256, parseEther, type Abi, type PublicClient, type WalletClient } from "viem";

import artefato from "@/lib/chroma-bnb-troca-artefato.json";

/**
 * Janela de compra e venda de uma moeda do lançador da BNB (página escondida,
 * pedido do dono, 09/10/2026). Usa o contrato ChromaBnbTroca: troca direto na
 * pool da PancakeSwap Infinity, cotação por simulação (`cotar`), proteção de
 * preço pelo slippage. Na venda, pede a aprovação da moeda uma vez.
 */
const ABI = artefato.abi as Abi;
const ATALHOS_BNB = ["0.01", "0.05", "0.1", "0.5"];
const SLIPPAGES = [100, 500, 1000];

type Clientes = () => Promise<{ carteira: WalletClient; leitura: PublicClient; endereco: `0x${string}` }>;

export function NegociarBnb({
  moeda,
  simbolo,
  troca,
  clientes,
  precoBnb,
}: {
  moeda: `0x${string}`;
  simbolo: string;
  troca: `0x${string}`;
  clientes: Clientes;
  precoBnb: number | null;
}) {
  const [lado, setLado] = useState<"compra" | "venda">("compra");
  const [valor, setValor] = useState("");
  const [slippage, setSlippage] = useState(500);
  const [saldoBnb, setSaldoBnb] = useState<bigint | null>(null);
  const [saldoMoeda, setSaldoMoeda] = useState<bigint | null>(null);
  const [cotado, setCotado] = useState<bigint | null>(null);
  const [estado, setEstado] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const pedido = useRef(0);

  const quantia = (() => {
    try {
      const v = valor.trim().replace(",", ".");
      return v && Number(v) > 0 ? parseEther(v) : 0n;
    } catch {
      return 0n;
    }
  })();

  const atualizarSaldos = async () => {
    const { leitura, endereco } = await clientes();
    const [bnb, tokens] = await Promise.all([
      leitura.getBalance({ address: endereco }),
      leitura.readContract({ address: moeda, abi: erc20Abi, functionName: "balanceOf", args: [endereco] }),
    ]);
    setSaldoBnb(bnb);
    setSaldoMoeda(tokens);
  };

  useEffect(() => {
    void atualizarSaldos().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moeda]);

  // Cotação ao digitar (com uma pequena espera).
  useEffect(() => {
    if (!quantia) return void setCotado(null);
    const id = ++pedido.current;
    const t = setTimeout(async () => {
      try {
        const { leitura, endereco } = await clientes();
        const { result } = await leitura.simulateContract({
          address: troca,
          abi: ABI,
          functionName: "cotar",
          args: [moeda, lado === "compra", quantia],
          account: endereco,
        });
        if (id === pedido.current) setCotado(result as bigint);
      } catch {
        if (id === pedido.current) setCotado(null);
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantia, lado, moeda]);

  const executar = async () => {
    if (!quantia || !cotado) return;
    setOcupado(true);
    setEstado("");
    try {
      const { carteira, leitura, endereco } = await clientes();
      const minimo = (cotado * BigInt(10_000 - slippage)) / 10_000n;
      if (lado === "venda") {
        const permitido = await leitura.readContract({
          address: moeda,
          abi: erc20Abi,
          functionName: "allowance",
          args: [endereco, troca],
        });
        if (permitido < quantia) {
          setEstado("Aprove a moeda na carteira (só na primeira venda)…");
          const h = await carteira.writeContract({
            address: moeda,
            abi: erc20Abi,
            functionName: "approve",
            args: [troca, maxUint256],
            account: endereco,
            chain: leitura.chain,
          });
          await leitura.waitForTransactionReceipt({ hash: h });
        }
      }
      setEstado("Aprove na carteira…");
      const hash = await carteira.writeContract({
        address: troca,
        abi: ABI,
        functionName: lado === "compra" ? "comprar" : "vender",
        args: lado === "compra" ? [moeda, minimo] : [moeda, quantia, minimo],
        value: lado === "compra" ? quantia : undefined,
        account: endereco,
        chain: leitura.chain,
      });
      setEstado("Confirmando na rede…");
      await leitura.waitForTransactionReceipt({ hash });
      setEstado(lado === "compra" ? "Compra feita!" : "Venda feita!");
      setValor("");
      await atualizarSaldos();
    } catch (e) {
      console.error("[negociar BNB]", e);
      const m = e instanceof Error ? ((e as { shortMessage?: string }).shortMessage ?? e.message) : String(e);
      setEstado(
        /reject|denied|cancel/i.test(m)
          ? "Cancelado na carteira."
          : /insufficient/i.test(m)
            ? "Saldo insuficiente."
            : /RecebeuMenosQueOMinimo/i.test(m)
              ? "O preço mudou além do slippage. Tente de novo."
              : m.slice(0, 160),
      );
    } finally {
      setOcupado(false);
    }
  };

  const fmt = (v: bigint, casas = 4) => Number(formatEther(v)).toLocaleString("en-US", { maximumFractionDigits: casas });
  const usd = (bnb: bigint) =>
    precoBnb ? ` ≈ US$ ${(Number(formatEther(bnb)) * precoBnb).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "";
  const saldo = lado === "compra" ? saldoBnb : saldoMoeda;
  const unidade = lado === "compra" ? "BNB" : simbolo;
  const aba = (ativo: boolean, cor: string) =>
    `flex-1 rounded-lg py-2 text-[14px] font-black ${ativo ? `${cor} text-black` : "text-zinc-400"}`;

  return (
    <div className="mt-2 space-y-2.5 rounded-xl border border-white/[0.08] bg-ink-950 p-3">
      <div className="flex gap-1.5">
        <button type="button" onClick={() => setLado("compra")} className={aba(lado === "compra", "bg-bull")}>
          Buy
        </button>
        <button type="button" onClick={() => setLado("venda")} className={aba(lado === "venda", "bg-bear")}>
          Sell
        </button>
      </div>
      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <span>{lado === "compra" ? "VOCÊ PAGA (BNB)" : `VOCÊ VENDE (${simbolo})`}</span>
        {saldo !== null && (
          <button type="button" onClick={() => setValor(formatEther(lado === "compra" ? (saldo > parseEther("0.002") ? saldo - parseEther("0.002") : 0n) : saldo))} className="font-mono">
            Saldo: {fmt(saldo)} {unidade} <span className="font-bold text-marca">Máx</span>
          </button>
        )}
      </div>
      <input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        inputMode="decimal"
        placeholder="0.0"
        className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2.5 font-mono text-[18px] text-zinc-100 outline-none focus:border-marca/60"
      />
      {lado === "compra" && quantia > 0n && <p className="-mt-1 text-[12px] text-zinc-400">{usd(quantia).replace(" ≈ ", "≈ ")}</p>}
      {lado === "compra" ? (
        <div className="grid grid-cols-4 gap-1.5">
          {ATALHOS_BNB.map((v) => (
            <button key={v} type="button" onClick={() => setValor(v)} className="rounded-lg border border-bull/30 py-1.5 text-[12px] font-bold text-bull">
              {v}
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-1.5">
          {[25, 50, 75, 100].map((p) => (
            <button
              key={p}
              type="button"
              disabled={!saldoMoeda}
              onClick={() => saldoMoeda && setValor(formatEther((saldoMoeda * BigInt(p)) / 100n))}
              className="rounded-lg border border-bear/30 py-1.5 text-[12px] font-bold text-bear disabled:opacity-40"
            >
              {p}%
            </button>
          ))}
        </div>
      )}
      <div className="space-y-1 text-[12px] text-zinc-400">
        <p className="flex justify-between">
          <span>Você recebe (estimado)</span>
          <span className="font-mono text-zinc-100">
            {cotado ? `${fmt(cotado, lado === "compra" ? 0 : 5)} ${lado === "compra" ? simbolo : "BNB"}` : "—"}
            {cotado && lado === "venda" ? usd(cotado) : ""}
          </span>
        </p>
        <p className="flex items-center justify-between">
          <span>Slippage</span>
          <span className="flex gap-1">
            {SLIPPAGES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSlippage(s)}
                className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${slippage === s ? "border border-marca text-marca" : "border border-ink-700 text-zinc-500"}`}
              >
                {s / 100}%
              </button>
            ))}
          </span>
        </p>
        <p className="flex justify-between">
          <span>Taxa da pool</span>
          <span>1% (até 50% nos 5 primeiros minutos)</span>
        </p>
      </div>
      <button
        type="button"
        onClick={executar}
        disabled={!quantia || !cotado || ocupado}
        className={`h-11 w-full rounded-lg text-[15px] font-black text-black disabled:opacity-40 ${lado === "compra" ? "bg-bull" : "bg-bear"}`}
      >
        {ocupado ? "Aguarde…" : lado === "compra" ? `Comprar ${simbolo}` : `Vender ${simbolo}`}
      </button>
      {estado && <p className="text-[12.5px] leading-relaxed text-zinc-200">{estado}</p>}
    </div>
  );
}
