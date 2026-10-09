"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatEther,
  parseEther,
  parseEventLogs,
  type Abi,
  type EIP1193Provider,
  type Hex,
} from "viem";
import { bsc } from "viem/chains";

import artefato from "@/lib/chroma-bnb-artefato.json";

/**
 * Tela da página escondida /l/[chave]: publica o ChromaBnb (uma vez) e lança
 * moedas na BNB Chain. Fala direto com a carteira do navegador (MetaMask),
 * sem o wagmi do site — que só conhece a Robinhood Chain e não deve mudar.
 */
const ABI = artefato.abi as Abi;
const COFRE = "0x238a358808379702088667322f80aC48bAd5e6c4";
const GERENTE = "0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b";
const FDV_INICIAL = parseEther("4.35"); // igual à four.meme (~US$ 3,2 mil em 09/10/2026)
const GUARDADAS = "chroma-bnb-lancadas";

interface Lancada {
  moeda: string;
  nome: string;
  simbolo: string;
  em: number;
}

function provedor(): EIP1193Provider | null {
  return typeof window === "undefined" ? null : ((window as unknown as { ethereum?: EIP1193Provider }).ethereum ?? null);
}

function lerGuardadas(): Lancada[] {
  try {
    return JSON.parse(localStorage.getItem(GUARDADAS) ?? "[]");
  } catch {
    return [];
  }
}

function msgCurta(e: unknown) {
  const m = e instanceof Error ? ((e as { shortMessage?: string }).shortMessage ?? e.message) : String(e);
  if (/reject|denied|cancel/i.test(m)) return "Cancelado na carteira.";
  if (/insufficient/i.test(m)) return "Saldo de BNB insuficiente.";
  return m.length > 200 ? m.slice(0, 200) + "…" : m;
}

export function LancarBnb({ chave, lancadorSalvo }: { chave: string; lancadorSalvo: string | null }) {
  const [conta, setConta] = useState<`0x${string}` | null>(null);
  const [saldo, setSaldo] = useState<bigint | null>(null);
  const [lancador, setLancador] = useState<`0x${string}` | null>(lancadorSalvo as `0x${string}` | null);
  const [estado, setEstado] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [nome, setNome] = useState("");
  const [simbolo, setSimbolo] = useState("");
  const [imagem, setImagem] = useState("");
  const [compra, setCompra] = useState("0.01");
  const [lancadas, setLancadas] = useState<Lancada[]>([]);

  useEffect(() => setLancadas(lerGuardadas()), []);

  const clientes = useCallback(async () => {
    const p = provedor();
    if (!p) throw new Error("Nenhuma carteira EVM no navegador. Instale a MetaMask.");
    const carteira = createWalletClient({ chain: bsc, transport: custom(p) });
    const [endereco] = await carteira.requestAddresses();
    try {
      await carteira.switchChain({ id: bsc.id });
    } catch {
      await carteira.addChain({ chain: bsc });
      await carteira.switchChain({ id: bsc.id });
    }
    const leitura = createPublicClient({ chain: bsc, transport: custom(p) });
    setConta(endereco);
    setSaldo(await leitura.getBalance({ address: endereco }));
    return { carteira, leitura, endereco };
  }, []);

  const rodar = async (tarefa: () => Promise<void>) => {
    setOcupado(true);
    setEstado("");
    try {
      await tarefa();
    } catch (e) {
      console.error("[lançar BNB]", e);
      setEstado(msgCurta(e));
    } finally {
      setOcupado(false);
    }
  };

  const conectar = () => rodar(async () => void (await clientes()));

  const publicar = () =>
    rodar(async () => {
      const { carteira, leitura, endereco } = await clientes();
      setEstado("Aprove a publicação do lançador na carteira…");
      const hash = await carteira.deployContract({
        abi: ABI,
        bytecode: artefato.bytecode as Hex,
        args: [COFRE, GERENTE, FDV_INICIAL],
        account: endereco,
      });
      setEstado("Publicando… (alguns segundos)");
      const recibo = await leitura.waitForTransactionReceipt({ hash });
      if (!recibo.contractAddress) throw new Error("A publicação não devolveu endereço.");
      const r = await fetch("/api/bnb/lancador", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chave, endereco: recibo.contractAddress }),
      });
      const j = await r.json();
      setLancador((j?.endereco ?? recibo.contractAddress) as `0x${string}`);
      setEstado("Lançador publicado! Já dá pra lançar moedas.");
    });

  const lancar = () =>
    rodar(async () => {
      if (!lancador) return;
      const { carteira, leitura, endereco } = await clientes();
      setEstado("Aprove o lançamento na carteira…");
      const hash = await carteira.writeContract({
        address: lancador,
        abi: ABI,
        functionName: "lancar",
        args: [nome.trim(), simbolo.trim().toUpperCase(), imagem.trim()],
        value: compra.trim() ? parseEther(compra.trim().replace(",", ".")) : 0n,
        account: endereco,
      });
      setEstado("Lançando… (alguns segundos)");
      const recibo = await leitura.waitForTransactionReceipt({ hash });
      const [ev] = parseEventLogs({ abi: ABI, logs: recibo.logs, eventName: "Lancou" }) as unknown as {
        args: { moeda: string };
      }[];
      if (!ev) throw new Error("Lançado, mas não achei a moeda no recibo. Veja no BscScan: " + hash);
      const nova = { moeda: ev.args.moeda, nome: nome.trim(), simbolo: simbolo.trim().toUpperCase(), em: Date.now() };
      const lista = [nova, ...lerGuardadas()];
      try {
        localStorage.setItem(GUARDADAS, JSON.stringify(lista));
      } catch {}
      setLancadas(lista);
      setNome("");
      setSimbolo("");
      setImagem("");
      setSaldo(await leitura.getBalance({ address: endereco }));
      setEstado(`Lançada! $${nova.simbolo}: os primeiros 5 minutos têm a taxa anti-sniper (50% caindo até 1%).`);
    });

  const coletar = (moeda: string) =>
    rodar(async () => {
      if (!lancador) return;
      const { carteira, leitura, endereco } = await clientes();
      setEstado("Aprove a coleta das taxas na carteira…");
      const hash = await carteira.writeContract({
        address: lancador,
        abi: ABI,
        functionName: "coletar",
        args: [moeda],
        account: endereco,
      });
      await leitura.waitForTransactionReceipt({ hash });
      setSaldo(await leitura.getBalance({ address: endereco }));
      setEstado("Taxas enviadas pra carteira de quem criou a moeda.");
    });

  const okLancar = Boolean(lancador && nome.trim() && simbolo.trim() && !ocupado);
  const campo =
    "mt-1 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-[14px] text-zinc-100 outline-none focus:border-marca/60";
  const botao =
    "inline-flex h-10 items-center justify-center rounded-lg bg-marca px-4 text-[14px] font-black text-black disabled:opacity-40";

  return (
    <main className="mx-auto max-w-xl space-y-5 px-4 py-8">
      <div>
        <h1 className="text-2xl font-black text-zinc-50">Lançar na BNB</h1>
        <p className="mt-1 text-[13px] text-zinc-400">
          A moeda nasce direto numa pool da PancakeSwap (bots e GMGN veem no primeiro segundo). Taxa anti-sniper de 50%
          caindo até 1% em 5 minutos; depois 1% pra sempre. Toda a taxa é de quem cria.
        </p>
      </div>

      <section className="rounded-xl border border-white/[0.06] bg-ink-900/60 p-4">
        {conta ? (
          <p className="text-[13px] text-zinc-300">
            Carteira: <span className="font-mono">{conta.slice(0, 6)}…{conta.slice(-4)}</span>
            {saldo !== null && <> · {Number(formatEther(saldo)).toFixed(4)} BNB</>}
          </p>
        ) : (
          <button type="button" onClick={conectar} disabled={ocupado} className={botao}>
            Conectar MetaMask
          </button>
        )}
      </section>

      {!lancador ? (
        <section className="space-y-2 rounded-xl border border-white/[0.06] bg-ink-900/60 p-4">
          <p className="text-[14px] font-bold text-zinc-100">1. Publicar o lançador (uma vez só)</p>
          <p className="text-[12px] text-zinc-400">
            Publica o contrato da Chroma na BNB. Custa menos de US$ 1 em BNB. Depois disso, esta etapa some.
          </p>
          <button type="button" onClick={publicar} disabled={ocupado} className={botao}>
            Publicar lançador
          </button>
        </section>
      ) : (
        <section className="space-y-3 rounded-xl border border-white/[0.06] bg-ink-900/60 p-4">
          <p className="text-[14px] font-bold text-zinc-100">Nova moeda</p>
          <label className="block text-[12px] font-semibold text-zinc-400">
            Nome
            <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={64} className={campo} />
          </label>
          <label className="block text-[12px] font-semibold text-zinc-400">
            Símbolo
            <input value={simbolo} onChange={(e) => setSimbolo(e.target.value)} maxLength={16} className={campo} />
          </label>
          <label className="block text-[12px] font-semibold text-zinc-400">
            Link da imagem (opcional)
            <input value={imagem} onChange={(e) => setImagem(e.target.value)} placeholder="https://…" className={campo} />
          </label>
          <label className="block text-[12px] font-semibold text-zinc-400">
            Sua compra inicial (BNB) — entra antes de qualquer bot, com taxa de 1%
            <input value={compra} onChange={(e) => setCompra(e.target.value)} inputMode="decimal" className={campo} />
          </label>
          <button type="button" onClick={lancar} disabled={!okLancar} className={`${botao} w-full`}>
            Lançar moeda
          </button>
          <p className="text-[11px] text-zinc-500">
            Lançador: <span className="font-mono">{lancador}</span>
          </p>
        </section>
      )}

      {estado && <p className="text-[13px] leading-relaxed text-zinc-200">{estado}</p>}

      {lancadas.length > 0 && (
        <section className="space-y-2 rounded-xl border border-white/[0.06] bg-ink-900/60 p-4">
          <p className="text-[14px] font-bold text-zinc-100">Suas moedas na BNB</p>
          {lancadas.map((l) => (
            <div key={l.moeda} className="space-y-1 border-t border-white/[0.06] pt-2 text-[12px]">
              <p className="font-bold text-zinc-100">
                ${l.simbolo} <span className="font-normal text-zinc-400">{l.nome}</span>
              </p>
              <p className="break-all font-mono text-zinc-400">{l.moeda}</p>
              <p className="flex flex-wrap gap-x-3 gap-y-1">
                <a className="text-marca underline" href={`https://gmgn.ai/bsc/token/${l.moeda}`} target="_blank" rel="noreferrer">
                  GMGN
                </a>
                <a className="text-marca underline" href={`https://dexscreener.com/bsc/${l.moeda}`} target="_blank" rel="noreferrer">
                  DexScreener
                </a>
                <a className="text-marca underline" href={`https://bscscan.com/token/${l.moeda}`} target="_blank" rel="noreferrer">
                  BscScan
                </a>
                <a
                  className="text-marca underline"
                  href={`https://pancakeswap.finance/swap?chain=bsc&outputCurrency=${l.moeda}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  PancakeSwap
                </a>
                <button type="button" onClick={() => coletar(l.moeda)} disabled={ocupado} className="font-bold text-marca">
                  Coletar taxas
                </button>
              </p>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
