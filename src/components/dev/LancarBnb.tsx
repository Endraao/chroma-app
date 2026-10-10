"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  erc20Abi,
  formatEther,
  getContractAddress,
  keccak256,
  toBytes,
  toHex,
  zeroAddress,
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
import flapAbi from "@/lib/flap-portal-abi.json";

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

/* Flap (BNB): Portal e o modelo do Tax Token V3 — docs.flap.sh, conferidos na rede em 09/10/2026. */
const FLAP_PORTAL = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
const FLAP_IMPL_TAXA_V3 = "0x024f18294970B5c76c0691b87f138A0317156422";
/** Comissão de integradora da Chroma (carteira EVM da plataforma). */
const COMISSAO_CHROMA = (process.env.NEXT_PUBLIC_PLATFORM_FEE_WALLET_EVM || zeroAddress) as `0x${string}`;

/**
 * A Flap exige que o endereço da moeda com taxa termine em 7777 (CREATE2 do
 * clone do modelo, a partir do Portal). Sorteia sementes até achar — em
 * pedaços, pra página não travar (leva uns segundos).
 */
async function acharSalt7777(): Promise<{ salt: Hex; moeda: `0x${string}` }> {
  const codigo = `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${FLAP_IMPL_TAXA_V3.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3` as Hex;
  const hashDoCodigo = keccak256(codigo);
  let salt = keccak256(toHex(crypto.getRandomValues(new Uint8Array(32))));
  for (let i = 1; ; i++) {
    const moeda = getContractAddress({ from: FLAP_PORTAL, salt: toBytes(salt), bytecodeHash: hashDoCodigo, opcode: "CREATE2" });
    if (moeda.endsWith("7777")) return { salt, moeda };
    salt = keccak256(salt);
    if (i % 2000 === 0) await new Promise((r) => setTimeout(r, 0));
  }
}

interface Lancada {
  moeda: string;
  nome: string;
  simbolo: string;
  em: number;
  imagem?: string;
  /** Lançador e negociação desta moeda (cada lançador tem os seus). */
  lancador?: string;
  troca?: string;
  /** Lançada pela Flap (tax token): a taxa cai sozinha na carteira, em BNB. */
  flap?: boolean;
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
  const [descricao, setDescricao] = useState("");
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

  /*
   * LANÇAR PELA FLAP (decisão do dono, 09/10/2026): é onde os snipers e bots
   * da BNB olham. Tax Token V3: 10% na compra e na venda, por 100 anos, tudo
   * pra carteira de quem cria (em BNB); a Chroma recebe a comissão de
   * integradora (commissionReceiver). Parâmetros simulados na rede antes.
   */
  const lancar = () =>
    rodar(async () => {
      if (!arquivo) throw new Error("Escolha a imagem da moeda.");
      const { carteira, leitura, endereco } = await clientes();
      setEstado("Enviando a imagem e os links pro IPFS da Flap…");
      const form = new FormData();
      form.set("chave", chave);
      form.set("imagem", arquivo);
      if (descricao.trim()) form.set("descricao", descricao.trim());
      if (site.trim()) form.set("site", site.trim());
      if (xLink.trim()) form.set("x", xLink.trim());
      if (telegram.trim()) form.set("telegram", telegram.trim());
      const r = await fetch("/api/bnb/flap-meta", { method: "POST", body: form });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.cid) throw new Error(j?.erro ?? "Não deu pra enviar a imagem pra Flap.");

      setEstado("Preparando o endereço da moeda (final 7777)… pode levar uns segundos.");
      const { salt, moeda } = await acharSalt7777();

      const valor = compra.trim() ? parseEther(compra.trim().replace(",", ".")) : 0n;
      setEstado("Aprove o lançamento na carteira…");
      const hash = await carteira.writeContract({
        address: FLAP_PORTAL,
        abi: flapAbi as Abi,
        functionName: "newTokenV6",
        args: [
          {
            name: nome.trim(),
            symbol: simbolo.trim().toUpperCase(),
            meta: j.cid,
            dexThresh: 1, // FOUR_FIFTHS (o único aceito hoje)
            salt,
            migratorType: 1, // V2_MIGRATOR (obrigatório pra tax token)
            quoteToken: zeroAddress, // BNB
            quoteAmt: valor,
            beneficiary: endereco,
            permitData: "0x",
            extensionID: `0x${"00".repeat(32)}`,
            extensionData: "0x",
            dexId: 0,
            lpFeeProfile: 0,
            buyTaxRate: 1000, // 10%
            sellTaxRate: 1000, // 10%
            taxDuration: 100n * 365n * 24n * 3600n, // "pra sempre" (máx. 100 anos)
            antiFarmerDuration: 3600n,
            mktBps: 10000, // toda a taxa pra quem cria
            deflationBps: 0,
            dividendBps: 0,
            lpBps: 0,
            minimumShareBalance: 0n,
            dividendToken: zeroAddress,
            commissionReceiver: COMISSAO_CHROMA,
            tokenVersion: 6, // TOKEN_TAXED_V3
          },
        ],
        value: valor,
        account: endereco,
      });
      setEstado("Lançando… (alguns segundos)");
      const recibo = await leitura.waitForTransactionReceipt({ hash });
      if (recibo.status !== "success") throw new Error("A transação falhou. Veja no BscScan: " + hash);
      const nova: Lancada = {
        moeda,
        nome: nome.trim(),
        simbolo: simbolo.trim().toUpperCase(),
        em: Date.now(),
        imagem: arquivo ? URL.createObjectURL(arquivo) : undefined,
        flap: true,
      };
      const lista = [nova, ...lerGuardadas()];
      try {
        localStorage.setItem(GUARDADAS, JSON.stringify(lista.map((x) => (x === nova ? { ...x, imagem: undefined } : x))));
      } catch {}
      setLancadas(lista);
      setNome("");
      setSimbolo("");
      setArquivo(null);
      setDescricao("");
      setSite("");
      setXLink("");
      setTelegram("");
      setSaldo(await leitura.getBalance({ address: endereco }));
      setEstado(`Lançada na Flap! $${nova.simbolo} — 10% de taxa em toda compra e venda, pra sua carteira em BNB.`);
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
      lancadas.filter((l) => !l.flap).forEach((l) =>
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

  const okLancar = Boolean(nome.trim() && simbolo.trim() && arquivo && !ocupado);
  const campo =
    "mt-1 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-[14px] text-zinc-100 outline-none focus:border-marca/60";
  const botao =
    "inline-flex h-10 items-center justify-center rounded-lg bg-marca px-4 text-[14px] font-black text-black disabled:opacity-40";

  return (
    <main className="mx-auto max-w-xl space-y-5 px-4 py-8">
      <div>
        <h1 className="text-2xl font-black text-zinc-50">Lançar na BNB</h1>
        <p className="mt-1 text-[13px] text-zinc-400">
          Lança pela Flap (onde os snipers e bots da BNB olham), com taxa de 10% em toda compra e venda, pra sempre, paga em BNB pra quem cria. As moedas antigas (lançador próprio) continuam na lista com Coletar e Negociar.
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

      {(
        <section className="space-y-3 rounded-xl border border-white/[0.06] bg-ink-900/60 p-4">
          <p className="text-[14px] font-bold text-zinc-100">Nova moeda (pela Flap)</p>
          <p className="text-[12px] leading-snug text-zinc-400">
            Taxa de <b className="text-zinc-200">10% em toda compra e venda, pra sempre</b>, direto pra sua carteira em BNB. A
            moeda nasce na curva da Flap — snipers, bots e GMGN veem na hora — e vai pra PancakeSwap quando forma.
          </p>
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
            Descrição (opcional)
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={300} className={campo} />
          </label>
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
            A imagem e os links vão pro IPFS da Flap — aparecem na Flap e nos terminais que leem a Flap.
          </p>
          <label className="block text-[12px] font-semibold text-zinc-400">
            Sua compra inicial (BNB) — entra na própria transação do lançamento
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
        </section>
      )}

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
              {l.flap ? (
                <>
                  <p className="flex flex-wrap gap-x-3 gap-y-1">
                    <a className="text-marca underline" href={`https://flap.sh/bnb/${l.moeda}`} target="_blank" rel="noreferrer">
                      Flap
                    </a>
                    <a className="text-marca underline" href={`https://gmgn.ai/bsc/token/${l.moeda}`} target="_blank" rel="noreferrer">
                      GMGN
                    </a>
                    <a className="text-marca underline" href={`https://bscscan.com/token/${l.moeda}`} target="_blank" rel="noreferrer">
                      BscScan
                    </a>
                  </p>
                  <p className="text-[11.5px] text-zinc-500">Taxa de 10% em toda compra e venda: cai sozinha na sua carteira, em BNB.</p>
                </>
              ) : (
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
              )}
              {!l.flap && negociando === l.moeda &&
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
