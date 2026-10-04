"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";
import {
  MINIMO_LAMPORTS,
  enviarEmPrivado,
  retomarSaquePrivado,
  saquePendente,
  taxaDaCloak,
  type EtapaDoSaque,
} from "@/lib/saque-privado";

const TEXTOS = traducoes({
  en: {
    abrir: "🔒 Withdraw privately",
    explica:
      "Your earnings pass through Cloak's shielded pool and land in any wallet you choose. Anyone can see money leave your creator wallet — but not where it went.",
    destino: "Destination wallet",
    valor: "Amount (SOL)",
    chega: (v: string, t: string) => `Arrives: ${v} SOL · Cloak fee ${t} SOL`,
    minimo: "Minimum 0.01 SOL.",
    invalido: "Enter a valid Solana address.",
    botao: "Withdraw privately",
    sacando: "Claiming your fees — approve in your wallet…",
    deposito: (p?: number) => `Shielding your SOL${p ? ` (${p}%)` : ""} — approve in your wallet…`,
    prova: (p?: number) => `Building the zero-knowledge proof${p ? ` (${p}%)` : ""}…`,
    saque: "Sending to the destination wallet — approve the message in your wallet…",
    feito: "Done! Sent privately.",
    falhou: "It didn't go through. Try again.",
    pendente: "A private withdrawal was left halfway. Finish it now:",
    retomar: "Finish private withdrawal",
    ver: "view",
    entrada: "Into the pool",
    saida: "Out to your wallet",
    semMensagem: "Your wallet can't sign messages. Use Phantom or Solflare.",
  },
  pt: {
    abrir: "🔒 Sacar em privado",
    explica:
      "Seus ganhos passam pelo cofre protegido da Cloak e chegam em qualquer carteira que você escolher. Todo mundo vê o dinheiro sair da sua carteira de criador — mas não pra onde ele foi.",
    destino: "Carteira de destino",
    valor: "Valor (SOL)",
    chega: (v: string, t: string) => `Chega: ${v} SOL · taxa da Cloak ${t} SOL`,
    minimo: "Mínimo de 0,01 SOL.",
    invalido: "Digite um endereço Solana válido.",
    botao: "Sacar em privado",
    sacando: "Sacando suas taxas — aprove na carteira…",
    deposito: (p?: number) => `Protegendo seu SOL${p ? ` (${p}%)` : ""} — aprove na carteira…`,
    prova: (p?: number) => `Gerando a prova de conhecimento zero${p ? ` (${p}%)` : ""}…`,
    saque: "Enviando pra carteira de destino — aprove a mensagem na carteira…",
    feito: "Pronto! Enviado em privado.",
    falhou: "Não deu certo. Tente de novo.",
    pendente: "Um saque privado ficou no meio. Termine agora:",
    retomar: "Terminar saque privado",
    ver: "ver",
    entrada: "Entrada no cofre",
    saida: "Saída pra sua carteira",
    semMensagem: "Sua carteira não assina mensagens. Use Phantom ou Solflare.",
  },
  zh: {
    abrir: "🔒 隐私提现",
    explica: "你的收益经过 Cloak 的隐私池，到达你选择的任意钱包。别人能看到资金离开你的创作者钱包，但看不到它去了哪里。",
    destino: "目标钱包",
    valor: "金额（SOL）",
    chega: (v: string, t: string) => `到账：${v} SOL · Cloak 费用 ${t} SOL`,
    minimo: "最低 0.01 SOL。",
    invalido: "请输入有效的 Solana 地址。",
    botao: "隐私提现",
    sacando: "正在领取手续费——请在钱包中确认…",
    deposito: (p?: number) => `正在保护你的 SOL${p ? `（${p}%）` : ""}——请在钱包中确认…`,
    prova: (p?: number) => `正在生成零知识证明${p ? `（${p}%）` : ""}…`,
    saque: "正在发送到目标钱包——请在钱包中签名消息…",
    feito: "完成！已隐私发送。",
    falhou: "未成功，请重试。",
    pendente: "有一笔隐私提现未完成。现在完成：",
    retomar: "完成隐私提现",
    ver: "查看",
    entrada: "存入隐私池",
    saida: "转出到你的钱包",
    semMensagem: "你的钱包不支持消息签名。请使用 Phantom 或 Solflare。",
  },
});

const sol = (l: bigint) => (Number(l) / 1e9).toFixed(4);

/** Lê "0,05" ou "0.05" direto em lamports, sem conta de ponto flutuante. */
function paraLamports(texto: string): bigint | null {
  const m = texto.trim().replace(",", ".").match(/^(\d*)(?:\.(\d{0,9}))?$/);
  if (!m || (!m[1] && !m[2])) return null;
  return BigInt(m[1] || "0") * 1_000_000_000n + BigInt((m[2] ?? "").padEnd(9, "0") || "0");
}

function enderecoValido(s: string) {
  try {
    return PublicKey.isOnCurve(new PublicKey(s.trim()).toBytes());
  } catch {
    return false;
  }
}

/**
 * "Sacar em privado" (ver lib/saque-privado.ts). Fica dentro do card de ganhos
 * do criador, que só aparece pra carteira que criou a moeda: saca as taxas (se
 * houver) e manda o valor escolhido, passando pela Cloak, pra carteira de destino.
 */
export function SaquePrivado({ taxasSol, sacarTaxas }: { taxasSol: number; sacarTaxas: () => Promise<void> }) {
  const t = useTextos(TEXTOS);
  const { connection } = useConnection();
  const { publicKey, signTransaction, signMessage } = useWallet();
  const [aberto, setAberto] = useState(false);
  const [destino, setDestino] = useState("");
  const [valor, setValor] = useState(() => Math.max(taxasSol, 0.01).toFixed(4));
  const [estado, setEstado] = useState<"" | "sacando" | EtapaDoSaque | "feito" | "falhou">("");
  const [pct, setPct] = useState<number | undefined>();
  const [erro, setErro] = useState("");
  const [provas, setProvas] = useState<{ deposito: string; saque: string } | null>(null);
  const [pendente, setPendente] = useState<{ destino: string } | null>(null);

  useEffect(() => {
    if (publicKey) setPendente(saquePendente(publicKey.toBase58()));
  }, [publicKey, estado]);

  if (!publicKey || !signTransaction) return null;

  const lamports = paraLamports(valor);
  const taxa = lamports ? taxaDaCloak(lamports) : 0n;
  const okValor = lamports !== null && lamports >= MINIMO_LAMPORTS;
  const okDestino = enderecoValido(destino);
  const ocupado = estado === "sacando" || estado === "deposito" || estado === "prova" || estado === "saque";

  const carteira = () => {
    if (!signMessage) throw new Error(t.semMensagem);
    return { publicKey, signTransaction, signMessage };
  };
  const aoMudar = (e: EtapaDoSaque, p?: number) => {
    setEstado(e);
    setPct(p === undefined ? undefined : Math.round(p));
  };
  const rodar = async (tarefa: () => Promise<{ deposito: string; saque: string }>) => {
    setErro("");
    setProvas(null);
    try {
      setProvas(await tarefa());
      setEstado("feito");
    } catch (e) {
      setEstado("falhou");
      setErro(e instanceof Error && e.message.length < 200 ? e.message : "");
    }
  };

  const sacar = () =>
    rodar(async () => {
      const c = carteira();
      if (taxasSol > 0.000001) {
        setEstado("sacando");
        await sacarTaxas();
      }
      return enviarEmPrivado({ rpcUrl: connection.rpcEndpoint, carteira: c, destino: destino.trim(), lamports: lamports!, aoMudar });
    });
  const retomar = () => rodar(() => retomarSaquePrivado({ rpcUrl: connection.rpcEndpoint, carteira: carteira(), aoMudar }));

  const status =
    estado === "sacando"
      ? t.sacando
      : estado === "deposito"
        ? t.deposito(pct)
        : estado === "prova"
          ? t.prova(pct)
          : estado === "saque"
            ? t.saque
            : estado === "feito"
              ? t.feito
              : estado === "falhou"
                ? `${t.falhou}${erro ? ` (${erro})` : ""}`
                : "";

  const link = (sig: string) => (
    <a href={`https://solscan.io/tx/${sig}`} target="_blank" rel="noreferrer" className="text-marca underline">
      {t.ver}
    </a>
  );

  return (
    <div className="mt-3 border-t border-white/[0.06] pt-3">
      {pendente && !ocupado && estado !== "feito" ? (
        <div className="space-y-2">
          <p className="text-[12px] text-warn">{t.pendente}</p>
          <button type="button" onClick={retomar} className="botao-negocio compra inline-flex h-10 w-full items-center justify-center text-[14px]">
            {t.retomar}
          </button>
        </div>
      ) : !aberto ? (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="w-full rounded-lg border border-violet-400/40 bg-violet-400/[0.06] py-2 text-[13px] font-bold text-violet-200 hover:bg-violet-400/[0.12]"
        >
          {t.abrir}
        </button>
      ) : (
        <div className="space-y-2.5">
          <p className="text-[12px] font-bold text-violet-200">{t.abrir}</p>
          <p className="text-[11.5px] leading-relaxed text-zinc-400">{t.explica}</p>
          <label className="block text-[11px] font-semibold text-zinc-400">
            {t.destino}
            <input
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              placeholder="7xKX…"
              spellCheck={false}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 font-mono text-[12px] text-zinc-100 outline-none focus:border-violet-400/60"
            />
          </label>
          {destino && !okDestino && <p className="text-[11px] text-bear">{t.invalido}</p>}
          <label className="block text-[11px] font-semibold text-zinc-400">
            {t.valor}
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode="decimal"
              className="tnum mt-1 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-[13px] text-zinc-100 outline-none focus:border-violet-400/60"
            />
          </label>
          <p className={`tnum text-[11px] ${okValor ? "text-zinc-400" : "text-bear"}`}>
            {okValor ? t.chega(sol(lamports! - taxa), sol(taxa)) : t.minimo}
          </p>
          <button
            type="button"
            disabled={!okValor || !okDestino || ocupado}
            onClick={sacar}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-violet-500 text-[14px] font-black text-white transition-colors hover:bg-violet-400 disabled:opacity-40"
          >
            {t.botao}
          </button>
        </div>
      )}

      {status && <p className={`mt-2 text-[11.5px] leading-relaxed ${estado === "falhou" ? "text-bear" : "text-zinc-300"}`}>{status}</p>}
      {provas && (
        <p className="mt-1 text-[11px] text-zinc-500">
          {provas.deposito && (
            <>
              {t.entrada}: {link(provas.deposito)} ·{" "}
            </>
          )}
          {t.saida}: {link(provas.saque)}
        </p>
      )}
    </div>
  );
}
