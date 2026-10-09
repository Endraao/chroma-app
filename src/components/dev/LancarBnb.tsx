"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  erc20Abi,
  formatEther,
  maxUint256,
  parseEther,
  parseEventLogs,
  type Abi,
  type EIP1193Provider,
  type Hex,
} from "viem";
import { bsc } from "viem/chains";

import { NegociarBnb } from "@/components/dev/NegociarBnb";
import artefato from "@/lib/chroma-bnb-artefato.json";
import artefatoTroca from "@/lib/chroma-bnb-troca-artefato.json";

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
  imagem?: string;
  /** Lançador e negociação desta moeda (cada lançador tem os seus). */
  lancador?: string;
  troca?: string;
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

export function LancarBnb({
  chave,
  lancadorSalvo,
  trocaSalva,
}: {
  chave: string;
  lancadorSalvo: string | null;
  trocaSalva: string | null;
}) {
  // Contrato de compra e venda (ChromaBnbTroca) — publicado uma vez, como o lançador.
  const [trocaEnd, setTrocaEnd] = useState<`0x${string}` | null>(trocaSalva as `0x${string}` | null);
  const [negociando, setNegociando] = useState<string | null>(null);
  const [conta, setConta] = useState<`0x${string}` | null>(null);
  const [saldo, setSaldo] = useState<bigint | null>(null);
  const [lancador, setLancador] = useState<`0x${string}` | null>(lancadorSalvo as `0x${string}` | null);
  const [estado, setEstado] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [nome, setNome] = useState("");
  const [simbolo, setSimbolo] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [site, setSite] = useState("");
  const [xLink, setXLink] = useState("");
  const [telegram, setTelegram] = useState("");
  const [compra, setCompra] = useState("0.01");
  const [lancadas, setLancadas] = useState<Lancada[]>([]);

  // Moedas antigas (antes de existir mais de um lançador) ficam com o de agora.
  useEffect(() => {
    const lista = lerGuardadas().map((l) =>
      l.lancador ? l : { ...l, lancador: lancadorSalvo ?? undefined, troca: trocaSalva ?? undefined },
    );
    try {
      localStorage.setItem(GUARDADAS, JSON.stringify(lista));
    } catch {}
    setLancadas(lista);
  }, [lancadorSalvo, trocaSalva]);
  // Teste de 09/10/2026: lançador novo com outra taxa anti-sniper.
  const [taxaTeste, setTaxaTeste] = useState("25");
  const [janelaTeste, setJanelaTeste] = useState("30");

  // Valor em dólar da compra inicial (pedido do dono, 09/10/2026).
  const [precoBnb, setPrecoBnb] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/bnb/preco")
      .then((r) => r.json())
      .then((j) => setPrecoBnb(typeof j?.usd === "number" ? j.usd : null))
      .catch(() => {});
  }, []);
  const compraBnb = Number(compra.trim().replace(",", ".")) || 0;

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

  const publicarTroca = () =>
    rodar(async () => {
      if (!lancador) return;
      const { carteira, leitura, endereco } = await clientes();
      setEstado("Aprove a publicação da negociação na carteira…");
      const hash = await carteira.deployContract({
        abi: artefatoTroca.abi as Abi,
        bytecode: artefatoTroca.bytecode as Hex,
        args: [lancador],
        account: endereco,
      });
      setEstado("Publicando… (alguns segundos)");
      const recibo = await leitura.waitForTransactionReceipt({ hash });
      if (!recibo.contractAddress) throw new Error("A publicação não devolveu endereço.");
      const r = await fetch("/api/bnb/lancador", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chave, endereco: recibo.contractAddress, tipo: "troca" }),
      });
      const j = await r.json();
      setTrocaEnd((j?.endereco ?? recibo.contractAddress) as `0x${string}`);
      setEstado("Negociação publicada! Clique em Negociar na moeda.");
    });

  const publicar = () =>
    rodar(async () => {
      const { carteira, leitura, endereco } = await clientes();
      setEstado("Aprove a publicação do lançador na carteira…");
      const hash = await carteira.deployContract({
        abi: ABI,
        bytecode: artefato.bytecode as Hex,
        args: [
          COFRE,
          GERENTE,
          FDV_INICIAL,
          Math.round(Math.min(Math.max(Number(taxaTeste) || 50, 1), 99) * 10_000),
          BigInt(Math.max(Math.round(Number(janelaTeste) || 300), 1)),
        ],
        account: endereco,
      });
      setEstado("Publicando… (alguns segundos)");
      const recibo = await leitura.waitForTransactionReceipt({ hash });
      if (!recibo.contractAddress) throw new Error("A publicação não devolveu endereço.");
      const r = await fetch("/api/bnb/lancador", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Já havia lançador: este SUBSTITUI (as moedas antigas guardam o delas).
        body: JSON.stringify({ chave, endereco: recibo.contractAddress, substituir: Boolean(lancador) }),
      });
      const j = await r.json();
      setLancador((j?.endereco ?? recibo.contractAddress) as `0x${string}`);
      setTrocaEnd(null);
      setEstado("Lançador publicado! Já dá pra lançar moedas.");
    });

  const lancar = () =>
    rodar(async () => {
      if (!lancador) return;
      const { carteira, leitura, endereco } = await clientes();
      /*
       * Imagem + site + X + Telegram viram o arquivo de dados da moeda (mesmo
       * padrão dos lançamentos da Solana, via /api/token-media). O endereço
       * desse arquivo vai no lançamento e fica gravado na rede, no evento.
       */
      let uri = "";
      let imagemUrl: string | undefined;
      if (arquivo) {
        setEstado("Enviando a imagem…");
        const form = new FormData();
        form.set("coin", arquivo);
        form.set("name", nome.trim());
        form.set("symbol", simbolo.trim().toUpperCase());
        if (site.trim()) form.set("website", site.trim());
        if (xLink.trim()) form.set("twitter", xLink.trim());
        if (telegram.trim()) form.set("telegram", telegram.trim());
        form.set("creator", endereco);
        const r = await fetch("/api/token-media", { method: "POST", body: form });
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error ?? "Não deu pra enviar a imagem.");
        uri = j.metadataUrl;
        imagemUrl = j.imageUrl;
      }
      setEstado("Aprove o lançamento na carteira…");
      const hash = await carteira.writeContract({
        address: lancador,
        abi: ABI,
        functionName: "lancar",
        args: [nome.trim(), simbolo.trim().toUpperCase(), uri],
        value: compra.trim() ? parseEther(compra.trim().replace(",", ".")) : 0n,
        account: endereco,
      });
      setEstado("Lançando… (alguns segundos)");
      const recibo = await leitura.waitForTransactionReceipt({ hash });
      const [ev] = parseEventLogs({ abi: ABI, logs: recibo.logs, eventName: "Lancou" }) as unknown as {
        args: { moeda: string };
      }[];
      if (!ev) throw new Error("Lançado, mas não achei a moeda no recibo. Veja no BscScan: " + hash);
      const nova: Lancada = {
        moeda: ev.args.moeda,
        nome: nome.trim(),
        simbolo: simbolo.trim().toUpperCase(),
        em: Date.now(),
        imagem: imagemUrl,
        lancador,
        troca: trocaEnd ?? undefined,
      };
      const lista = [nova, ...lerGuardadas()];
      try {
        localStorage.setItem(GUARDADAS, JSON.stringify(lista));
      } catch {}
      setLancadas(lista);
      setNome("");
      setSimbolo("");
      setArquivo(null);
      setSite("");
      setXLink("");
      setTelegram("");
      setSaldo(await leitura.getBalance({ address: endereco }));
      setEstado(`Lançada! $${nova.simbolo}: no começo vale a taxa anti-sniper do lançador, caindo até 1%.`);
    });

  /*
   * Quanto cada moeda tem pra coletar, em dólar (pedido do dono, 09/10/2026):
   * /api/bnb/taxas simula o coletar sem mudar nada na rede. Atualiza a cada 30 s.
   */
  const [taxas, setTaxas] = useState<Record<string, { usd: number | null; tokens: string; bnb: string }>>({});
  useEffect(() => {
    if (!lancadas.length) return;
    let vivo = true;
    const ler = () =>
      lancadas.forEach((l) =>
        fetch(`/api/bnb/taxas?moeda=${l.moeda}&lancador=${l.lancador ?? ""}&troca=${trocaDe(l) ?? ""}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => j && vivo && setTaxas((t) => ({ ...t, [l.moeda.toLowerCase()]: j })))
          .catch(() => {}),
      );
    ler();
    const id = setInterval(ler, 30_000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [lancadas]);

  /*
   * A taxa da pool sai na moeda que entra: compra → BNB, venda → a moeda.
   * "Coletar em BNB" coleta e vende na hora as moedas recebidas (pela
   * negociação), pra quem cria receber tudo em BNB.
   */
  const coletar = (l: Lancada, emBnb = false) =>
    rodar(async () => {
      const moeda = l.moeda;
      const doLancador = (l.lancador ?? lancador) as `0x${string}` | null;
      const trocaDaMoeda = trocaDe(l);
      if (!doLancador) return;
      const { carteira, leitura, endereco } = await clientes();
      const antes = emBnb
        ? await leitura.readContract({ address: moeda as `0x${string}`, abi: erc20Abi, functionName: "balanceOf", args: [endereco] })
        : 0n;
      setEstado("Aprove a coleta das taxas na carteira…");
      const hash = await carteira.writeContract({
        address: doLancador,
        abi: ABI,
        functionName: "coletar",
        args: [moeda],
        account: endereco,
      });
      await leitura.waitForTransactionReceipt({ hash });
      if (emBnb && trocaDaMoeda) {
        const depois = await leitura.readContract({ address: moeda as `0x${string}`, abi: erc20Abi, functionName: "balanceOf", args: [endereco] });
        const recebidas = depois - antes;
        if (recebidas > 0n) {
          const permitido = await leitura.readContract({ address: moeda as `0x${string}`, abi: erc20Abi, functionName: "allowance", args: [endereco, trocaDaMoeda] });
          if (permitido < recebidas) {
            setEstado("Aprove a moeda na carteira (só na primeira vez)…");
            const h = await carteira.writeContract({ address: moeda as `0x${string}`, abi: erc20Abi, functionName: "approve", args: [trocaDaMoeda, maxUint256], account: endereco });
            await leitura.waitForTransactionReceipt({ hash: h });
          }
          const { result: cotado } = await leitura.simulateContract({ address: trocaDaMoeda, abi: artefatoTroca.abi as Abi, functionName: "cotar", args: [moeda, false, recebidas], account: endereco });
          setEstado("Aprove a venda das moedas recebidas…");
          const h2 = await carteira.writeContract({
            address: trocaDaMoeda,
            abi: artefatoTroca.abi as Abi,
            functionName: "vender",
            args: [moeda, recebidas, ((cotado as bigint) * 95n) / 100n],
            account: endereco,
          });
          await leitura.waitForTransactionReceipt({ hash: h2 });
        }
      }
      setSaldo(await leitura.getBalance({ address: endereco }));
      setTaxas((t) => ({ ...t, [moeda.toLowerCase()]: { usd: 0, tokens: "0", bnb: "0" } }));
      setEstado(emBnb ? "Taxas coletadas e convertidas em BNB." : "Taxas enviadas pra carteira de quem criou a moeda.");
    });

  /** A negociação da moeda: a gravada nela, ou a de agora se a moeda é do lançador atual. */
  function trocaDe(l: Lancada): `0x${string}` | null {
    if (l.troca) return l.troca as `0x${string}`;
    return l.lancador && lancador && l.lancador.toLowerCase() === lancador.toLowerCase() ? trocaEnd : null;
  }

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
          A moeda nasce direto numa pool da PancakeSwap (bots e GMGN veem no primeiro segundo). Taxa anti-sniper alta no lançamento, caindo até 1% (configurada no lançador); depois 1% pra sempre. Toda a taxa é de quem cria.
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
            Imagem da moeda (PNG, JPG, WEBP ou GIF)
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
              className={`${campo} file:mr-3 file:rounded-md file:border-0 file:bg-marca file:px-3 file:py-1 file:font-bold file:text-black`}
            />
          </label>
          {arquivo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={URL.createObjectURL(arquivo)} alt="" className="size-16 rounded-lg object-cover" />
          )}
          <label className="block text-[12px] font-semibold text-zinc-400">
            Site (opcional)
            <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://…" className={campo} />
          </label>
          <label className="block text-[12px] font-semibold text-zinc-400">
            X / Twitter (opcional)
            <input value={xLink} onChange={(e) => setXLink(e.target.value)} placeholder="https://x.com/…" className={campo} />
          </label>
          <label className="block text-[12px] font-semibold text-zinc-400">
            Telegram (opcional)
            <input value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="https://t.me/…" className={campo} />
          </label>
          <p className="text-[11px] leading-snug text-zinc-500">
            A imagem e os links ficam registrados na rede junto com a moeda. GMGN e DexScreener só mostram imagem e links
            de moedas fora da four.meme com o perfil pago da DexScreener.
          </p>
          <label className="block text-[12px] font-semibold text-zinc-400">
            Sua compra inicial (BNB) — entra antes de qualquer bot, com taxa de 1%
            <input value={compra} onChange={(e) => setCompra(e.target.value)} inputMode="decimal" className={campo} />
            {precoBnb && compraBnb > 0 && (
              <span className="mt-1 block text-[12px] font-normal text-zinc-300">
                ≈ US$ {(compraBnb * precoBnb).toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </span>
            )}
          </label>
          <button type="button" onClick={lancar} disabled={!okLancar} className={`${botao} w-full`}>
            {ocupado ? "Lançando…" : "Lançar moeda"}
          </button>
          {/* O aviso fica colado no botão: lá embaixo ninguém via (09/10/2026). */}
          {estado && <p className="text-[13px] leading-relaxed text-zinc-200">{estado}</p>}
          <p className="text-[11px] text-zinc-500">
            Lançador: <span className="font-mono">{lancador}</span>
          </p>
          <details className="rounded-lg border border-white/[0.06] p-2.5 text-[12px] text-zinc-400">
            <summary className="cursor-pointer font-bold text-zinc-300">Trocar a taxa anti-sniper (lançador novo)</summary>
            <p className="mt-1.5">
              A taxa fica gravada no lançador. Pra mudar, publica-se outro (centavos de BNB). As moedas já lançadas continuam
              no lançador delas.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label>
                Taxa inicial (%)
                <input value={taxaTeste} onChange={(e) => setTaxaTeste(e.target.value)} inputMode="decimal" className={campo} />
              </label>
              <label>
                Cai até 1% em (segundos)
                <input value={janelaTeste} onChange={(e) => setJanelaTeste(e.target.value)} inputMode="numeric" className={campo} />
              </label>
            </div>
            <button type="button" onClick={publicar} disabled={ocupado} className={`${botao} mt-2 w-full`}>
              Publicar lançador novo ({taxaTeste}% → 1% em {janelaTeste}s)
            </button>
          </details>
        </section>
      )}

      {!lancador && estado && <p className="text-[13px] leading-relaxed text-zinc-200">{estado}</p>}

      {lancadas.length > 0 && (
        <section className="space-y-2 rounded-xl border border-white/[0.06] bg-ink-900/60 p-4">
          <p className="text-[14px] font-bold text-zinc-100">Suas moedas na BNB</p>
          {lancadas.map((l) => (
            <div key={l.moeda} className="space-y-1 border-t border-white/[0.06] pt-2 text-[12px]">
              <p className="flex items-center gap-2 font-bold text-zinc-100">
                {l.imagem && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.imagem} alt="" className="size-6 rounded-md object-cover" />
                )}
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
                {/* Sempre em BNB (pedido do dono): as moedas da taxa são vendidas na hora. */}
                <button type="button" onClick={() => coletar(l, Boolean(trocaDe(l)))} disabled={ocupado} className="font-bold text-marca">
                  Coletar taxas
                  {taxas[l.moeda.toLowerCase()]?.usd != null && (
                    <span className="font-normal text-zinc-300"> (≈ US$ {taxas[l.moeda.toLowerCase()].usd!.toFixed(2)})</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setNegociando((m) => (m === l.moeda ? null : l.moeda))}
                  className="font-bold text-bull"
                >
                  {negociando === l.moeda ? "Fechar" : "Negociar"}
                </button>
              </p>
              {negociando === l.moeda &&
                (trocaDe(l) ? (
                  <NegociarBnb
                    moeda={l.moeda as `0x${string}`}
                    simbolo={l.simbolo}
                    troca={trocaDe(l)!}
                    clientes={clientes}
                    precoBnb={precoBnb}
                  />
                ) : (
                  <div className="mt-2 space-y-1.5 rounded-xl border border-white/[0.08] bg-ink-950 p-3">
                    <p className="text-[12px] text-zinc-400">
                      Pra comprar e vender por aqui, publique a negociação uma vez (centavos de BNB).
                    </p>
                    <button type="button" onClick={publicarTroca} disabled={ocupado} className={`${botao} w-full`}>
                      Publicar negociação
                    </button>
                    {estado && <p className="text-[12.5px] text-zinc-200">{estado}</p>}
                  </div>
                ))}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
