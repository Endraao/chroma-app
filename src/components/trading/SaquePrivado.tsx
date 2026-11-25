"use client";

import { useEffect, useRef, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";
import {
  MINIMO_LAMPORTS,
  depositarParaDepois,
  enviarEmPrivado,
  exportarNotaPendente,
  retomarSaquePrivado,
  sacarComBackup,
  saquePendente,
  taxaDaCloak,
  valorNoCofre,
  type EtapaDoSaque,
} from "@/lib/saque-privado";

const TEXTOS = traducoes({
  en: {
    abrir: "🔒 Withdraw privately",
    explica: "Send your SOL to another wallet of yours without a trace: nobody can link your creator wallet to the wallet that received it.",
    destino: "To which wallet? (another wallet of yours)",
    valor: "How much to send (SOL)",
    chega: (v: string, t: string) => `Cloak fee: ${t} SOL · ${v} SOL arrives in the other wallet`,
    minimo: "The minimum is 0.01 SOL.",
    invalido: "That's not a valid Solana wallet address.",
    botao: "Send now",
    sacando: "Claiming your fees… approve in your wallet.",
    taxa: "Charging the 1% fee… approve in your wallet.",
    deposito: (p?: number) => `Putting your SOL in Cloak's vault${p ? ` (${p}%)` : ""}… approve in your wallet.`,
    prova: (p?: number) => `Creating the privacy proof${p ? ` (${p}%)` : ""}… takes up to 1 minute, don't close the page.`,
    saque: "Sending to your other wallet… approve the message in your wallet.",
    feito: "Done! The SOL arrived in the other wallet, with no trace.",
    falhou: "It didn't go through.",
    pendente: "A private send was left halfway. Click to finish:",
    retomar: "Finish send",
    ver: "view",
    entrada: "Deposit receipt",
    saida: "withdrawal receipt",
    semMensagem: "Your wallet can't sign messages. Use Phantom or Solflare.",
    naoAconteceu: "All good: nothing left your wallet. You can send again.",
    ganhos: "Your earnings",
    saldo: "Balance",
    usarGanhos: "Use my earnings",
    max: "Max",
    tituloLivre: "🔒 Private send",
    explicaLivre: "Send SOL from your wallet to any wallet without a trace: the SOL goes through Cloak's privacy pool, and nobody can link the sender to the receiver.",
    destinoLivre: "To which wallet?",
    // --- deposit now / withdraw later + fee + backup ---
    taxaLinha: (t: string) => `Platform fee (1%): ${t} SOL`,
    depositarDepois: "Deposit now, withdraw later (more private)",
    depositadoStatus: "Deposited in the vault. Withdraw whenever you want — waiting hours or days makes it more private.",
    guardadoTitulo: "🔒 You have a deposit waiting in the vault",
    guardadoTexto: "Finish it whenever you want — the longer you wait (and the more people use the vault meanwhile), the harder it is to link the deposit to the withdrawal.",
    sacarAgora: "Withdraw now",
    backupBtn: "Save secret (backup .txt)",
    backupFeito: "Backup saved. Keep it safe.",
    backupAviso: "⚠️ This file IS your money: anyone who has it can withdraw. Keep it like a password and don't share it.",
    resgatarLink: "🔑 Recover with a backup",
    resgatarTexto: "Lost this browser's data or on another computer? Paste the secret from your backup .txt and the destination wallet.",
    segredoLabel: "Backup secret",
    resgatarBtn: "Recover funds",
  },
  pt: {
    abrir: "🔒 Sacar em privado",
    explica: "Mande seu SOL pra outra carteira sua sem deixar rastro: ninguém consegue ligar a sua carteira de criador à carteira que recebeu.",
    destino: "Pra qual carteira? (outra carteira sua)",
    valor: "Quanto enviar (SOL)",
    chega: (v: string, t: string) => `Taxa da Cloak: ${t} SOL · chega ${v} SOL na outra carteira`,
    minimo: "O mínimo é 0,01 SOL.",
    invalido: "Esse endereço não é uma carteira Solana válida.",
    botao: "Enviar agora",
    sacando: "Sacando suas taxas… aprove na carteira.",
    taxa: "Cobrando a taxa de 1%… aprove na carteira.",
    deposito: (p?: number) => `Guardando seu SOL no cofre da Cloak${p ? ` (${p}%)` : ""}… aprove na carteira.`,
    prova: (p?: number) => `Criando a prova de privacidade${p ? ` (${p}%)` : ""}… leva até 1 minuto, não feche a página.`,
    saque: "Enviando pra sua outra carteira… aprove a mensagem na carteira.",
    feito: "Pronto! O SOL chegou na outra carteira, sem rastro.",
    falhou: "Não deu certo.",
    pendente: "Um envio privado ficou pela metade. Clique pra terminar:",
    retomar: "Terminar envio",
    ver: "ver",
    entrada: "Comprovante de entrada",
    saida: "comprovante de saída",
    semMensagem: "Sua carteira não assina mensagens. Use Phantom ou Solflare.",
    naoAconteceu: "Tudo certo: nada saiu da sua carteira. Pode enviar de novo.",
    ganhos: "Seus ganhos",
    saldo: "Saldo",
    usarGanhos: "Usar meus ganhos",
    max: "Máx",
    tituloLivre: "🔒 Envio privado",
    explicaLivre: "Mande SOL da sua carteira pra qualquer carteira sem deixar rastro: o SOL passa pelo cofre de privacidade da Cloak, e ninguém consegue ligar quem enviou a quem recebeu.",
    destinoLivre: "Pra qual carteira?",
    // --- depositar agora / sacar depois + taxa + backup ---
    taxaLinha: (t: string) => `Taxa da plataforma (1%): ${t} SOL`,
    depositarDepois: "Depositar agora e sacar depois (mais privado)",
    depositadoStatus: "Depositado no cofre. Saque quando quiser — esperar horas ou dias deixa mais privado.",
    guardadoTitulo: "🔒 Você tem um depósito guardado no cofre",
    guardadoTexto: "Termine quando quiser — quanto mais tempo você espera (e mais gente usa o cofre nesse meio), mais difícil ligar a entrada à saída.",
    sacarAgora: "Sacar agora",
    backupBtn: "Salvar segredo (backup .txt)",
    backupFeito: "Backup salvo. Guarde num lugar seguro.",
    backupAviso: "⚠️ Esse arquivo É o seu dinheiro: quem tiver ele saca. Guarde como uma senha e não mostre pra ninguém.",
    resgatarLink: "🔑 Resgatar com um backup",
    resgatarTexto: "Perdeu os dados deste navegador ou está em outro computador? Cole o segredo do seu backup .txt e a carteira de destino.",
    segredoLabel: "Segredo do backup",
    resgatarBtn: "Resgatar fundos",
  },
  zh: {
    abrir: "🔒 隐私提现",
    explica: "你的收益经过 Cloak 的隐私池，到达你选择的任意钱包。别人能看到资金离开你的创作者钱包，但看不到它去了哪里。",
    destino: "目标钱包",
    valor: "金额（SOL）",
    chega: (v: string, t: string) => `到账：${v} SOL · Cloak 费用 ${t} SOL`,
    minimo: "最低 0.01 SOL。",
    invalido: "请输入有效的 Solana 地址。",
    botao: "立即发送",
    sacando: "正在领取手续费——请在钱包中确认…",
    taxa: "正在收取 1% 手续费——请在钱包中确认…",
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
    naoAconteceu: "存入未发生——你的钱包没有任何资金转出。现在可以重试。",
    ganhos: "你的收益",
    saldo: "余额",
    usarGanhos: "使用我的收益",
    max: "最大",
    tituloLivre: "🔒 隐私转账",
    explicaLivre: "把你钱包里的 SOL 无痕发送到任意钱包：SOL 经过 Cloak 的隐私池，没人能把发送方和接收方联系起来。",
    destinoLivre: "发送到哪个钱包？",
    // --- 先存后取 + 手续费 + 备份 ---
    taxaLinha: (t: string) => `平台手续费（1%）：${t} SOL`,
    depositarDepois: "先存入，稍后提现（更私密）",
    depositadoStatus: "已存入隐私池。随时可以提现——等待数小时或数天会更私密。",
    guardadoTitulo: "🔒 你在隐私池里有一笔待提现的存款",
    guardadoTexto: "随时可以完成——等待越久（期间使用隐私池的人越多），越难把存入和取出联系起来。",
    sacarAgora: "立即提现",
    backupBtn: "保存密钥（备份 .txt）",
    backupFeito: "备份已保存，请妥善保管。",
    backupAviso: "⚠️ 这个文件就是你的钱：任何拿到它的人都能提现。请像密码一样保管，不要分享。",
    resgatarLink: "🔑 用备份恢复",
    resgatarTexto: "清除了此浏览器的数据或在另一台电脑上？粘贴你备份 .txt 中的密钥和目标钱包。",
    segredoLabel: "备份密钥",
    resgatarBtn: "恢复资金",
  },
});

const sol = (l: bigint) => (Number(l) / 1e9).toFixed(4);

// Fica na carteira no "Máx": taxas das transações e aluguel das contas da Cloak.
const RESERVA_SOL = 0.01;

// Pela ponte do site (/api/rpc/solana), que segura as rajadas da Cloak.
const RPC_DA_PONTE = () => `${window.location.origin}/api/rpc/solana`;

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
 * "Sacar em privado" (ver lib/saque-privado.ts). No modo "criador" fica dentro do
 * card de ganhos do criador: saca as taxas (se houver) e manda o valor escolhido,
 * passando pela Cloak, pra carteira de destino. No modo "livre" (página /privado,
 * 28/10/2026, pedido do dono) qualquer carteira conectada manda SOL do próprio saldo.
 *
 * Dá pra enviar DE UMA VEZ ou DEPOSITAR AGORA E SACAR DEPOIS (mais privado, 25/11).
 * A plataforma cobra 1% (ver taxaPlataforma). O segredo do depósito pode ser
 * salvo num .txt de backup e usado pra resgatar os fundos em qualquer navegador.
 */
export function SaquePrivado({
  taxasSol = 0,
  sacarTaxas = async () => {},
  modo = "criador",
}: {
  taxasSol?: number;
  sacarTaxas?: () => Promise<void>;
  modo?: "criador" | "livre";
}) {
  const livre = modo === "livre";
  const t = useTextos(TEXTOS);
  const { connection } = useConnection();
  const { publicKey, signTransaction, signMessage } = useWallet();
  const [saldo, setSaldo] = useState<number | null>(null);
  const [aberto, setAberto] = useState(livre);
  const [destino, setDestino] = useState("");
  const [valor, setValor] = useState(() => Math.max(taxasSol, 0.02).toFixed(4));
  const [estado, setEstado] = useState<"" | "sacando" | EtapaDoSaque | "depositado" | "feito" | "falhou">("");
  const [pct, setPct] = useState<number | undefined>();
  const [erro, setErro] = useState("");
  const [provas, setProvas] = useState<{ deposito?: string; saque?: string } | null>(null);
  const [pendente, setPendente] = useState<{ destino: string; intencional: boolean } | null>(null);
  const [backupFeito, setBackupFeito] = useState(false);
  const [resgate, setResgate] = useState(false);
  const [segredo, setSegredo] = useState("");
  const [destinoResgate, setDestinoResgate] = useState("");
  const backupRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    if (publicKey) setPendente(saquePendente(publicKey.toBase58()));
  }, [publicKey, estado]);

  useEffect(() => {
    if (!publicKey || !aberto) return;
    connection.getBalance(publicKey).then((l) => setSaldo(l / 1e9)).catch(() => {});
  }, [connection, publicKey, aberto, estado]);

  if (!publicKey || !signTransaction) return null;

  const lamports = paraLamports(valor);
  // A taxa de 1% é cobrada (ver lib/saque-privado) mas NÃO aparece aqui a pedido
  // do dono; o valor que "chega" já é o líquido verdadeiro.
  const noCofre = lamports ? valorNoCofre(lamports) : 0n;
  const cloak = noCofre > 0n ? taxaDaCloak(noCofre) : 0n;
  const chegou = noCofre - cloak;
  const okValor = lamports !== null && noCofre >= MINIMO_LAMPORTS;
  const okDestino = enderecoValido(destino);
  const ocupado = estado === "sacando" || estado === "taxa" || estado === "deposito" || estado === "prova" || estado === "saque";
  // As taxas a receber entram na carteira antes do envio, então somam no máximo.
  const maximo = saldo === null ? 0 : Math.max(saldo + taxasSol - RESERVA_SOL, 0);
  const atalho =
    "rounded-md border border-violet-400/40 px-2 py-0.5 text-[11px] font-bold text-violet-200 hover:bg-violet-400/[0.12] disabled:opacity-40";

  const carteira = () => {
    if (!signMessage) throw new Error(t.semMensagem);
    return { publicKey, signTransaction, signMessage };
  };
  const aoMudar = (e: EtapaDoSaque, p?: number) => {
    setEstado(e);
    setPct(p === undefined ? undefined : Math.round(p));
  };
  const rodar = async (tarefa: () => Promise<{ deposito?: string; saque?: string }>, estadoFinal: "feito" | "depositado" = "feito") => {
    setErro("");
    setProvas(null);
    setBackupFeito(false);
    try {
      setProvas(await tarefa());
      setEstado(estadoFinal);
    } catch (e) {
      setEstado("falhou");
      console.error("[saque privado]", e);
      let msg = e instanceof Error ? e.message : String(e);
      // Em produção o kit da Solana esconde a mensagem do nó num pacote
      // codificado ("npx @solana/errors decode … '<base64>'"): abre aqui.
      const pacote = msg.match(/decode -- \S+ '([A-Za-z0-9+/=]+)'/)?.[1];
      if (pacote) {
        try {
          const ctx = new URLSearchParams(atob(pacote));
          const doNo = ctx.get("__serverMessage") || ctx.get("message") || ctx.get("statusCode");
          if (doNo) msg = `${ctx.get("__code") ?? ""} ${doNo}`.trim();
        } catch {}
      }
      setErro(msg === "DEPOSITO_NAO_ACONTECEU" ? t.naoAconteceu : msg.length > 220 ? msg.slice(0, 220) + "…" : msg);
    }
  };

  const sacar = () =>
    rodar(async () => {
      const c = carteira();
      if (taxasSol > 0.000001) {
        setEstado("sacando");
        await sacarTaxas();
      }
      return enviarEmPrivado({ rpcUrl: RPC_DA_PONTE(), carteira: c, destino: destino.trim(), lamports: lamports!, aoMudar });
    });
  const depositarDepois = () =>
    rodar(async () => {
      const c = carteira();
      if (taxasSol > 0.000001) {
        setEstado("sacando");
        await sacarTaxas();
      }
      return depositarParaDepois({ rpcUrl: RPC_DA_PONTE(), carteira: c, destino: destino.trim(), lamports: lamports!, aoMudar });
    }, "depositado");
  const retomar = () => rodar(() => retomarSaquePrivado({ rpcUrl: RPC_DA_PONTE(), carteira: carteira(), aoMudar }));
  const resgatar = () =>
    rodar(() => sacarComBackup({ rpcUrl: RPC_DA_PONTE(), carteira: carteira(), segredo: segredo.trim(), destino: destinoResgate.trim(), aoMudar }));

  const baixarBackup = () => {
    const nota = exportarNotaPendente(publicKey.toBase58());
    if (!nota) return;
    const conteudo =
      `CHROMA — SEGREDO DO SAQUE PRIVADO (backup)\n` +
      `Guarde este arquivo como uma senha. Quem tiver este segredo saca os fundos.\n` +
      `Carteira de origem: ${publicKey.toBase58()}\n` +
      (pendente ? `Destino combinado: ${pendente.destino}\n` : "") +
      `Data: ${new Date().toISOString()}\n\n` +
      `SEGREDO:\n${nota}\n`;
    const url = URL.createObjectURL(new Blob([conteudo], { type: "text/plain" }));
    const a = backupRef.current;
    if (a) {
      a.href = url;
      a.download = `chroma-saque-segredo-${publicKey.toBase58().slice(0, 6)}.txt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setBackupFeito(true);
    }
  };

  const status =
    estado === "sacando"
      ? t.sacando
      : estado === "taxa"
        ? t.taxa
        : estado === "deposito"
          ? t.deposito(pct)
          : estado === "prova"
            ? t.prova(pct)
            : estado === "saque"
              ? t.saque
              : estado === "depositado"
                ? t.depositadoStatus
                : estado === "feito"
                  ? t.feito
                  : estado === "falhou"
                    ? erro === t.naoAconteceu
                      ? erro
                      : `${t.falhou}${erro ? ` (${erro})` : ""}`
                    : "";

  const link = (sig: string) => (
    <a href={`https://solscan.io/tx/${sig}`} target="_blank" rel="noreferrer" className="text-marca underline">
      {t.ver}
    </a>
  );

  // Link de download escondido, reusado pelo backup.
  const ancoraBackup = <a ref={backupRef} className="hidden" aria-hidden />;

  // Bloco "resgatar com um backup" (resgate de emergência, em qualquer navegador).
  const blocoResgate = (
    <div className="mt-3 border-t border-white/[0.06] pt-3">
      {!resgate ? (
        <button type="button" onClick={() => setResgate(true)} className="text-[11.5px] font-semibold text-violet-300 hover:text-violet-200">
          {t.resgatarLink}
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-[11.5px] leading-relaxed text-zinc-400">{t.resgatarTexto}</p>
          <label className="block text-[11px] font-semibold text-zinc-400">
            {t.segredoLabel}
            <textarea
              value={segredo}
              onChange={(e) => setSegredo(e.target.value)}
              rows={3}
              spellCheck={false}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 font-mono text-[11px] text-zinc-100 outline-none focus:border-violet-400/60"
            />
          </label>
          <label className="block text-[11px] font-semibold text-zinc-400">
            {t.destinoLivre}
            <input
              value={destinoResgate}
              onChange={(e) => setDestinoResgate(e.target.value)}
              placeholder="7xKX…"
              spellCheck={false}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 font-mono text-[12px] text-zinc-100 outline-none focus:border-violet-400/60"
            />
          </label>
          <button
            type="button"
            disabled={!segredo.trim() || !enderecoValido(destinoResgate) || ocupado}
            onClick={resgatar}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-violet-500 text-[14px] font-black text-white transition-colors hover:bg-violet-400 disabled:opacity-40"
          >
            {t.resgatarBtn}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className={livre ? "" : "mt-3 border-t border-white/[0.06] pt-3"}>
      {pendente && !ocupado && estado !== "feito" ? (
        pendente.intencional ? (
          <div className="space-y-2">
            <p className="text-[13px] font-bold text-violet-200">{t.guardadoTitulo}</p>
            <p className="text-[11.5px] leading-relaxed text-zinc-400">{t.guardadoTexto}</p>
            <button type="button" onClick={retomar} className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-violet-500 text-[14px] font-black text-white transition-colors hover:bg-violet-400">
              {t.sacarAgora}
            </button>
            <button type="button" onClick={baixarBackup} className="w-full rounded-lg border border-violet-400/40 bg-violet-400/[0.06] py-2 text-[12px] font-bold text-violet-200 hover:bg-violet-400/[0.12]">
              {t.backupBtn}
            </button>
            {backupFeito && <p className="text-[11px] text-ok">{t.backupFeito}</p>}
            <p className="text-[11px] leading-relaxed text-warn">{t.backupAviso}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[12px] text-warn">{t.pendente}</p>
            <button type="button" onClick={retomar} className="botao-negocio compra inline-flex h-10 w-full items-center justify-center text-[14px]">
              {t.retomar}
            </button>
          </div>
        )
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
          <p className={livre ? "text-[15px] font-black text-violet-200" : "text-[12px] font-bold text-violet-200"}>{livre ? t.tituloLivre : t.abrir}</p>
          <p className="text-[11.5px] leading-relaxed text-zinc-400">{livre ? t.explicaLivre : t.explica}</p>
          <label className="block text-[11px] font-semibold text-zinc-400">
            {livre ? t.destinoLivre : t.destino}
            <input
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              placeholder="7xKX…"
              spellCheck={false}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 font-mono text-[12px] text-zinc-100 outline-none focus:border-violet-400/60"
            />
          </label>
          {destino && !okDestino && <p className="text-[11px] text-bear">{t.invalido}</p>}
          <div className="tnum flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-white/[0.03] px-3 py-2 text-[11.5px] text-zinc-400">
            {!livre && (
              <span>
                {t.ganhos}: <b className="text-zinc-100">{taxasSol.toFixed(4)} SOL</b>
              </span>
            )}
            <span>
              {t.saldo}: <b className="text-zinc-100">{saldo === null ? "…" : `${saldo.toFixed(4)} SOL`}</b>
            </span>
            <span className="ml-auto flex gap-1.5">
              {!livre && (
                <button type="button" disabled={taxasSol <= 0 || ocupado} onClick={() => setValor(taxasSol.toFixed(4))} className={atalho}>
                  {t.usarGanhos}
                </button>
              )}
              <button type="button" disabled={maximo <= 0 || ocupado} onClick={() => setValor(String(Math.floor(maximo * 1e4) / 1e4))} className={atalho}>
                {t.max}
              </button>
            </span>
          </div>
          <label className="block text-[11px] font-semibold text-zinc-400">
            {t.valor}
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode="decimal"
              className="tnum mt-1 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-[13px] text-zinc-100 outline-none focus:border-violet-400/60"
            />
          </label>
          {okValor ? (
            <p className="tnum text-[11px] text-zinc-400">{t.chega(sol(chegou), sol(cloak))}</p>
          ) : (
            <p className="text-[11px] text-bear">{t.minimo}</p>
          )}
          <button
            type="button"
            disabled={!okValor || !okDestino || ocupado}
            onClick={sacar}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-violet-500 text-[14px] font-black text-white transition-colors hover:bg-violet-400 disabled:opacity-40"
          >
            {t.botao}
          </button>
          <button
            type="button"
            disabled={!okValor || !okDestino || ocupado}
            onClick={depositarDepois}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-violet-400/50 bg-violet-400/[0.06] text-[13px] font-bold text-violet-200 transition-colors hover:bg-violet-400/[0.12] disabled:opacity-40"
          >
            {t.depositarDepois}
          </button>
        </div>
      )}

      {status && <p className={`mt-2 text-[11.5px] leading-relaxed ${estado === "falhou" ? "text-bear" : "text-zinc-300"}`}>{status}</p>}
      {provas && (provas.deposito || provas.saque) && (
        <p className="mt-1 text-[11px] text-zinc-500">
          {provas.deposito && (
            <>
              {t.entrada}: {link(provas.deposito)}
              {provas.saque ? " · " : ""}
            </>
          )}
          {provas.saque && (
            <>
              {t.saida}: {link(provas.saque)}
            </>
          )}
        </p>
      )}
      {ancoraBackup}
      {!livre && blocoResgate}
    </div>
  );
}
