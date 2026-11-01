"use client";

import { useCallback, useEffect, useState } from "react";
import { PublicKey, type Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { useTextos } from "@/components/IdiomaProvider";
import { Button } from "@/components/ui/Button";
import { RequireChainWallet } from "@/components/web3/RequireChainWallet";
import { contasDeToken, transacoesDeEnviarTudo, transacoesDeResgateAntesDeEnviar, type ContaDeToken } from "@/lib/enviar-tudo";
import { traducoes } from "@/lib/idiomas";

const TEXTOS = traducoes({
  en: {
    titulo: "Send all",
    sub: "Empties the wallet: sends ALL its SOL to another wallet, without leaving cents behind. Before sending, it automatically claims everything left behind: creator and curve fees (Chroma curve, Meteora pools, pump.fun) and the ~0.002 SOL stuck in each empty token account, like Sol Incinerator.",
    destino: "To which wallet?",
    saldo: "Balance",
    contas: (n: number, sol: string) => `${n} token account(s) to close: +${sol} SOL`,
    comToken: (n: number) => `${n} account(s) still hold coins and stay.`,
    queimar: (n: number) => `Burn the ${n} coin(s) left in the wallet and recover their SOL too (irreversible; NFTs and liquidity positions are never burned)`,
    botao: "Claim everything and send",
    procurando: "Looking for fees to claim…",
    resgatando: (n: number) => `${n} claim(s) found. Approve in your wallet…`,
    enviando: "Approve the send in your wallet…",
    invalida: "Paste a valid Solana wallet.",
    mesma: "The destination is the same wallet.",
    pronto: (sol: string) => `Done: ${sol} SOL sent. The wallet is empty.`,
    erro: "It didn't go through",
  },
  pt: {
    titulo: "Enviar tudo",
    sub: "Zera a carteira: manda TODO o SOL dela pra outra carteira, sem deixar centavos pra trás. Antes de enviar, resgata sozinho tudo que ficou pra trás: taxas de criador e de curva (Curva da Chroma, pools da Meteora, pump.fun) e os ~0,002 SOL presos em cada conta de token vazia, como o Sol Incinerator.",
    destino: "Pra qual carteira?",
    saldo: "Saldo",
    contas: (n: number, sol: string) => `${n} conta(s) de token pra fechar: +${sol} SOL`,
    comToken: (n: number) => `${n} conta(s) ainda têm moedas e ficam.`,
    queimar: (n: number) => `Queimar as ${n} moeda(s) que sobraram na carteira e recuperar o SOL delas também (não tem volta; NFTs e posições de liquidez nunca são queimadas)`,
    botao: "Resgatar tudo e enviar",
    procurando: "Procurando taxas pra resgatar…",
    resgatando: (n: number) => `${n} resgate(s) encontrado(s). Aprove na carteira…`,
    enviando: "Aprove o envio na carteira…",
    invalida: "Cole uma carteira Solana válida.",
    mesma: "O destino é a mesma carteira.",
    pronto: (sol: string) => `Pronto: ${sol} SOL enviados. A carteira ficou zerada.`,
    erro: "Não deu certo",
  },
  zh: {
    titulo: "全部转出",
    sub: "清空钱包：把全部 SOL 转到另一个钱包，不留零头。转出前会自动领取所有遗留：创建者和曲线手续费（Chroma 曲线、Meteora 池、pump.fun），以及每个空代币账户中约 0.002 SOL 的租金，类似 Sol Incinerator。",
    destino: "转到哪个钱包？",
    saldo: "余额",
    contas: (n: number, sol: string) => `${n} 个代币账户可关闭：+${sol} SOL`,
    comToken: (n: number) => `${n} 个账户仍有代币，会保留。`,
    queimar: (n: number) => `销毁钱包中剩余的 ${n} 种代币并回收其 SOL（不可撤销；NFT 和流动性仓位永不销毁）`,
    botao: "领取全部并转出",
    procurando: "正在查找可领取的手续费…",
    resgatando: (n: number) => `找到 ${n} 笔可领取。请在钱包中确认…`,
    enviando: "请在钱包中确认转出…",
    invalida: "请粘贴有效的 Solana 钱包地址。",
    mesma: "目标钱包与当前钱包相同。",
    pronto: (sol: string) => `完成：已转出 ${sol} SOL，钱包已清空。`,
    erro: "未成功",
  },
});

const sol = (lamports: number) => (lamports / 1e9).toFixed(6).replace(/\.?0+$/, "");

function Formulario() {
  const t = useTextos(TEXTOS);
  const { connection } = useConnection();
  const { publicKey, signAllTransactions } = useWallet();
  const [destino, setDestino] = useState("");
  const [saldo, setSaldo] = useState<number | null>(null);
  const [contas, setContas] = useState<ContaDeToken[]>([]);
  const [queimar, setQueimar] = useState(false);
  const [estado, setEstado] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const ler = useCallback(async () => {
    if (!publicKey) return;
    const [s, c] = await Promise.all([connection.getBalance(publicKey, "confirmed"), contasDeToken(connection, publicKey).catch(() => [])]);
    setSaldo(s);
    setContas(c);
  }, [connection, publicKey]);
  useEffect(() => {
    void ler();
  }, [ler]);

  const vaiFechar = (c: ContaDeToken) => c.fechavel || (queimar && c.queimavel);
  const fechaveis = contas.filter(vaiFechar);
  const aluguel = fechaveis.reduce((s, c) => s + c.lamports, 0);
  const queimaveis = contas.filter((c) => c.queimavel).length;
  const ficam = contas.length - fechaveis.length;

  /** Assina tudo de uma vez e envia na ordem, cada uma esperando a anterior confirmar. */
  async function assinarEEnviar(txs: Transaction[]) {
    if (!signAllTransactions) throw new Error("carteira sem suporte");
    const assinadas = await signAllTransactions(txs);
    for (const tx of assinadas) {
      const sig = await connection.sendRawTransaction(tx.serialize(), { preflightCommitment: "confirmed" });
      await connection.confirmTransaction(sig, "confirmed");
    }
  }

  async function enviar() {
    if (!publicKey) return;
    let para: PublicKey;
    try {
      para = new PublicKey(destino.trim());
    } catch {
      return setEstado(t.invalida);
    }
    if (para.equals(publicKey)) return setEstado(t.mesma);
    setOcupado(true);
    try {
      // 1. Resgata as taxas que ficaram pra trás (caem nesta carteira).
      setEstado(t.procurando);
      const resgates = await transacoesDeResgateAntesDeEnviar(connection, publicKey);
      if (resgates.length) {
        setEstado(t.resgatando(resgates.length));
        const { blockhash } = await connection.getLatestBlockhash("confirmed");
        for (const tx of resgates) tx.recentBlockhash = blockhash;
        await assinarEEnviar(resgates);
      }
      // 2. Fecha as contas de token (aluguel direto pro destino) e manda todo o SOL.
      setEstado(t.enviando);
      const atuais = await contasDeToken(connection, publicKey);
      const { txs, lamports } = await transacoesDeEnviarTudo(connection, publicKey, para, atuais, queimar);
      if (txs.length === 1) {
        const sim = await connection.simulateTransaction(txs[0]);
        if (sim.value.err) throw new Error(JSON.stringify(sim.value.err));
      }
      await assinarEEnviar(txs);
      setEstado(t.pronto(sol(lamports + atuais.filter(vaiFechar).reduce((s, c) => s + c.lamports, 0))));
      await ler();
    } catch (e) {
      setEstado(`${t.erro}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-[12px] font-semibold text-zinc-400">
        {t.destino}
        <input
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
          placeholder="Ex.: 2jbv…"
          className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2.5 font-mono text-[13px] text-zinc-100 outline-none"
        />
      </label>
      <div className="space-y-1 rounded-lg border border-white/[0.06] p-3 text-[13px] text-zinc-300">
        <p>
          {t.saldo}: <b>{saldo == null ? "…" : `${sol(saldo)} SOL`}</b>
        </p>
        {fechaveis.length > 0 && <p>{t.contas(fechaveis.length, sol(aluguel))}</p>}
        {ficam > 0 && <p className="text-zinc-500">{t.comToken(ficam)}</p>}
      </div>
      {queimaveis > 0 && (
        <label className="flex items-start gap-2 text-[12px] text-zinc-400">
          <input type="checkbox" checked={queimar} onChange={(e) => setQueimar(e.target.checked)} className="mt-0.5" />
          {t.queimar(queimaveis)}
        </label>
      )}
      <Button variant="chroma" size="lg" className="w-full" disabled={ocupado || !destino.trim() || saldo == null} onClick={enviar}>
        {t.botao}
      </Button>
      {estado && <p className="break-all text-[13px] text-zinc-300">{estado}</p>}
    </div>
  );
}

export function EnviarTudo() {
  const t = useTextos(TEXTOS);
  return (
    <main className="mx-auto max-w-xl space-y-5 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-[28px] font-black text-zinc-50">{t.titulo}</h1>
        <p className="text-[14px] leading-relaxed text-zinc-300">{t.sub}</p>
      </header>
      <section className="rounded-xl border border-white/[0.08] p-4">
        <RequireChainWallet chain="solana">
          <Formulario />
        </RequireChainWallet>
      </section>
    </main>
  );
}
