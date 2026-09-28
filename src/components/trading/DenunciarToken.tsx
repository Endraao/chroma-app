"use client";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";

import { useEffect, useRef, useState } from "react";

import { useWallet } from "@solana/wallet-adapter-react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { TokenSummary } from "@/lib/types";

/**
 * Denunciar uma moeda.
 *
 * ---------------------------------------------------------------------------
 * POR QUE UMA LAUNCHPAD PRECISA DISTO
 * ---------------------------------------------------------------------------
 * Aqui qualquer pessoa cria uma moeda com o nome e a arte que quiser, e é
 * assim que tem que ser — é o produto. O efeito colateral é que mais cedo ou
 * mais tarde alguém publica insulto racial, pornografia ou golpe explícito na
 * vitrine, com a nossa marca em volta.
 *
 * Esse risco é NOSSO, não de quem denuncia: hospedagem, provedor de dados e
 * lei brasileira cobram de quem publica, não de quem postou. E na prática a
 * diferença entre "não fizemos nada" e "temos canal e agimos quando avisados"
 * é este botão e a tabela atrás dele.
 *
 * ---------------------------------------------------------------------------
 * DISCRETO DE PROPÓSITO
 * ---------------------------------------------------------------------------
 * Ícone pequeno junto do endereço, não botão vermelho no topo. Canal de
 * denúncia proeminente demais vira arma: concorrente denunciando moeda alheia
 * em massa pra sujar a fila. Quem precisa, acha.
 */

const MOTIVOS = [
  { chave: "conteudo-odioso", rotulo: "Conteúdo de ódio", nota: "Racismo, homofobia, nazismo" },
  { chave: "conteudo-sexual", rotulo: "Conteúdo sexual", nota: "Pornografia ou nudez" },
  { chave: "golpe", rotulo: "Golpe", nota: "Fraude, rug pull, honeypot" },
  { chave: "falsificacao", rotulo: "Falsificação", nota: "Se passa por marca ou pessoa" },
  { chave: "violencia", rotulo: "Violência", nota: "Ameaça ou apologia" },
  { chave: "outro", rotulo: "Outro motivo", nota: "Descreva abaixo" },
] as const;

type Estado = "form" | "enviando" | "pronto";

type Motivos = Record<string, { rotulo: string; nota: string }>;

const TEXTOS = traducoes({
  en: {
    naoRegistrou: "could not register right now", semConexao: "No connection to the server. Try again.",
    denunciarMoeda: "Report this coin", registrada: "Report received", obrigado: "Our team will review it. Thanks for letting us know.",
    denunciar: "Report", oQue: "What is wrong with this coin?", detalhe: "Details, if you want (optional)",
    enviando: "Sending…", enviar: "Send report", falsas: "Mass false reports are also considered abuse and are logged.",
    motivos: {
      "conteudo-odioso": { rotulo: "Hate content", nota: "Racism, homophobia, nazism" },
      "conteudo-sexual": { rotulo: "Sexual content", nota: "Pornography or nudity" },
      golpe: { rotulo: "Scam", nota: "Fraud, rug pull, honeypot" },
      falsificacao: { rotulo: "Impersonation", nota: "Poses as a brand or person" },
      violencia: { rotulo: "Violence", nota: "Threats or glorification" },
      outro: { rotulo: "Other reason", nota: "Describe below" },
    } as Motivos,
  },
  pt: {
    naoRegistrou: "não foi possível registrar agora", semConexao: "Sem conexão com o servidor. Tente novamente.",
    denunciarMoeda: "Denunciar esta moeda", registrada: "Denúncia registrada", obrigado: "Nossa equipe vai analisar. Obrigado por avisar.",
    denunciar: "Denunciar", oQue: "O que há de errado com esta moeda?", detalhe: "Detalhe, se quiser (opcional)",
    enviando: "Enviando…", enviar: "Enviar denúncia", falsas: "Denúncias falsas em massa também são consideradas abuso e ficam registradas.",
    motivos: {
      "conteudo-odioso": { rotulo: "Conteúdo de ódio", nota: "Racismo, homofobia, nazismo" },
      "conteudo-sexual": { rotulo: "Conteúdo sexual", nota: "Pornografia ou nudez" },
      golpe: { rotulo: "Golpe", nota: "Fraude, rug pull, honeypot" },
      falsificacao: { rotulo: "Falsificação", nota: "Se passa por marca ou pessoa" },
      violencia: { rotulo: "Violência", nota: "Ameaça ou apologia" },
      outro: { rotulo: "Outro motivo", nota: "Descreva abaixo" },
    } as Motivos,
  },
  zh: {
    naoRegistrou: "暂时无法提交", semConexao: "无法连接服务器，请重试。",
    denunciarMoeda: "举报该代币", registrada: "举报已提交", obrigado: "我们的团队会进行审核，感谢你的提醒。",
    denunciar: "举报", oQue: "这个代币有什么问题？", detalhe: "补充说明（可选）",
    enviando: "提交中…", enviar: "提交举报", falsas: "大量虚假举报同样被视为滥用，并会被记录。",
    motivos: {
      "conteudo-odioso": { rotulo: "仇恨内容", nota: "种族歧视、恐同、纳粹" },
      "conteudo-sexual": { rotulo: "色情内容", nota: "色情或裸露" },
      golpe: { rotulo: "诈骗", nota: "欺诈、跑路、貔貅盘" },
      falsificacao: { rotulo: "冒充", nota: "冒充品牌或个人" },
      violencia: { rotulo: "暴力", nota: "威胁或美化暴力" },
      outro: { rotulo: "其他原因", nota: "请在下方说明" },
    } as Motivos,
  },
});

export function DenunciarToken({ token }: { token: TokenSummary }) {
  const t = useTextos(TEXTOS);
  const { publicKey } = useWallet();

  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState("");
  const [estado, setEstado] = useState<Estado>("form");
  const [erro, setErro] = useState<string | null>(null);
  /* A armadilha de robô: escondida, nunca preenchida por gente. */
  const [armadilha, setArmadilha] = useState("");

  const caixaRef = useRef<HTMLDivElement>(null);

  /* Fecha ao clicar fora ou apertar Esc — mesmo comportamento do compartilhar. */
  useEffect(() => {
    if (!aberto) return;
    const naTecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    const noClique = (e: MouseEvent) => {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    };
    window.addEventListener("keydown", naTecla);
    window.addEventListener("mousedown", noClique);
    return () => {
      window.removeEventListener("keydown", naTecla);
      window.removeEventListener("mousedown", noClique);
    };
  }, [aberto]);

  /*
   * Volta ao estado inicial ao fechar, mas só depois da animação de saída.
   * Limpar na hora faz o painel piscar "formulário vazio" enquanto some.
   */
  useEffect(() => {
    if (aberto) return;
    const id = window.setTimeout(() => {
      setEstado("form");
      setMotivo(null);
      setDetalhe("");
      setErro(null);
    }, 200);
    return () => window.clearTimeout(id);
  }, [aberto]);

  async function enviar() {
    if (!motivo || estado === "enviando") return;

    setEstado("enviando");
    setErro(null);

    try {
      const res = await fetch("/api/denuncia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token.address,
          rede: token.chain,
          simbolo: token.symbol,
          motivo,
          detalhe: detalhe.trim() || null,
          /* Some junto se a pessoa tiver carteira conectada; não é exigido. */
          carteira: publicKey?.toBase58() ?? null,
          website: armadilha,
        }),
      });

      if (!res.ok) {
        const corpo = (await res.json().catch(() => null)) as { error?: string } | null;
        setErro(corpo?.error ?? t.naoRegistrou);
        setEstado("form");
        return;
      }

      setEstado("pronto");
      window.setTimeout(() => setAberto(false), 2200);
    } catch {
      setErro(t.semConexao);
      setEstado("form");
    }
  }

  return (
    <div className="relative" ref={caixaRef}>
      <button
        onClick={() => setAberto((v) => !v)}
        title={t.denunciarMoeda}
        aria-label={t.denunciarMoeda}
        className={cn(
          "grid size-[22px] place-items-center rounded-md border border-white/[0.06] transition-colors",
          aberto ? "border-bear/40 text-bear" : "text-zinc-600 hover:border-bear/40 hover:text-bear",
        )}
      >
        <IconeBandeira />
      </button>

      {aberto && (
        <div className="panel absolute right-0 z-40 mt-2 w-[300px] p-3 text-left">
          {estado === "pronto" ? (
            <div className="py-3 text-center">
              <div className="mx-auto mb-2 grid size-9 place-items-center rounded-full bg-bull/12 text-bull">
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="m5 13 5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-[13px] font-bold text-zinc-100">{t.registrada}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                {t.obrigado}
              </p>
            </div>
          ) : (
            <>
              <p className="text-[13px] font-bold text-zinc-100">{t.denunciar} ${token.symbol}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
                {t.oQue}
              </p>

              <div className="mt-2.5 space-y-1">
                {MOTIVOS.map((m) => (
                  <button
                    key={m.chave}
                    onClick={() => setMotivo(m.chave)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                      motivo === m.chave ? "bg-bear/10" : "hover:bg-white/5",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-full border",
                        motivo === m.chave ? "border-bear bg-bear" : "border-white/15",
                      )}
                    >
                      {motivo === m.chave && <span className="size-1.5 rounded-full bg-white" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-[12px] font-semibold",
                          motivo === m.chave ? "text-bear" : "text-zinc-200",
                        )}
                      >
                        {t.motivos[m.chave].rotulo}
                      </span>
                      <span className="block truncate text-[10px] text-zinc-600">{t.motivos[m.chave].nota}</span>
                    </span>
                  </button>
                ))}
              </div>

              <textarea
                value={detalhe}
                onChange={(e) => setDetalhe(e.target.value.slice(0, 1500))}
                placeholder={t.detalhe}
                rows={2}
                className="mt-2 w-full resize-none rounded-lg border border-ink-600 bg-ink-800 px-2.5 py-2 text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:border-bear/40 focus:outline-none"
              />

              {/*
                Campo-armadilha. `aria-hidden` e `tabIndex={-1}` mantêm ele
                fora do alcance de quem navega por teclado ou leitor de tela —
                senão a defesa contra robô viraria uma barreira pra pessoa
                cega. Escondido por posição, não por `display:none`, porque
                robô bom ignora campo com display none.
              */}
              <input
                type="text"
                value={armadilha}
                onChange={(e) => setArmadilha(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="pointer-events-none absolute left-[-9999px] size-0 opacity-0"
              />

              {erro && <p className="mt-2 text-[11px] text-bear">{erro}</p>}

              <Button
                variant="sell"
                size="sm"
                onClick={enviar}
                disabled={!motivo || estado === "enviando"}
                className="mt-2.5 w-full"
              >
                {estado === "enviando" ? t.enviando : t.enviar}
              </Button>

              <p className="mt-2 text-[10px] leading-relaxed text-zinc-600">
                {t.falsas}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function IconeBandeira() {
  return (
    <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M4 21V4m0 0h11l-1.5 4L15 12H4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
