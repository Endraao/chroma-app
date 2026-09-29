"use client";

import { useIdioma, useTextos } from "@/components/IdiomaProvider";
import { traducoes, traduzirDoServidor } from "@/lib/idiomas";

import { useState } from "react";

import { useWallet } from "@solana/wallet-adapter-react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/**
 * O formulário de contato e suporte.
 *
 * ---------------------------------------------------------------------------
 * POR QUE FORMULÁRIO, E NÃO UM E-MAIL NA PÁGINA
 * ---------------------------------------------------------------------------
 * Endereço de e-mail escrito num site é colhido por robô em questão de dias, e
 * caixa de suporte de plataforma de cripto é alvo de valor: é por onde chegam
 * as tentativas de se passar por usuário pra pedir "recuperação" de carteira.
 *
 * Com o formulário, o destino fica numa variável de ambiente no servidor e
 * nunca aparece no HTML. Quem escreve fala com a página; a caixa fica atrás
 * dela.
 *
 * ---------------------------------------------------------------------------
 * A CARTEIRA É OPCIONAL E VEM PREENCHIDA
 * ---------------------------------------------------------------------------
 * Quem chega com carteira conectada não devia ter que copiar o próprio
 * endereço da extensão pra colar aqui — e endereço digitado à mão é endereço
 * digitado errado, justamente no campo que a gente usaria pra achar a
 * operação de que a pessoa está falando.
 *
 * Só o endereço PÚBLICO, sempre. Nada neste formulário pede, aceita ou tem uso
 * pra chave privada.
 */

const ASSUNTOS = ["ajuda", "problema", "sugestao", "parceria", "juridico", "outro"] as const;

const LIMITE_TEXTO = 4000;

const TEXTOS = traducoes({
  en: {
    assuntos: { ajuda: "I need help", problema: "Report a problem", sugestao: "Suggestion", parceria: "Partnership", juridico: "Legal matter", outro: "Other" },
    naoEnviou: "Could not send your message right now. Please try again.", semConexao: "No connection to the server. Please try again.",
    enviada: "Message sent", outra: "Write another",
    recebemos: (e: React.ReactNode) => <>We got your message and will reply to {e}. If it is about a trade, keep the transaction ID: it helps us find what happened.</>,
    nome: "Your name", nomePh: "What should we call you", email: "Your email", emailDica: "This is where we reply", emailPh: "you@example.com",
    carteira: "Public wallet", carteiraDica: "Optional — helps us find your trades", carteiraPh: "Public address, never the private key",
    assunto: "Subject", mensagem: "Message", mensagemPh: "Describe what happened in as much detail as possible. If it is about a trade, include the transaction ID.",
    enviando: "Sending…", enviar: "Send message", nunca: "We never ask for your recovery phrase or private key.",
  },
  pt: {
    assuntos: { ajuda: "Preciso de ajuda", problema: "Relatar um problema", sugestao: "Sugestão", parceria: "Parceria", juridico: "Assunto jurídico", outro: "Outro" },
    naoEnviou: "Não foi possível enviar a sua mensagem agora. Tente novamente.", semConexao: "Sem conexão com o servidor. Tente novamente.",
    enviada: "Mensagem enviada", outra: "Escrever outra",
    recebemos: (e: React.ReactNode) => <>Recebemos a sua mensagem e vamos responder em {e}. Se for sobre uma operação, guarde o identificador da transação: ele ajuda a localizar o que aconteceu.</>,
    nome: "Seu nome", nomePh: "Como podemos te chamar", email: "Seu e-mail", emailDica: "É por aqui que respondemos", emailPh: "voce@exemplo.com",
    carteira: "Carteira pública", carteiraDica: "Opcional — ajuda a localizar suas operações", carteiraPh: "Endereço público, nunca a chave privada",
    assunto: "Assunto", mensagem: "Mensagem", mensagemPh: "Descreva o que aconteceu com o máximo de detalhes possível. Se for sobre uma operação, informe o identificador da transação.",
    enviando: "Enviando…", enviar: "Enviar mensagem", nunca: "Nunca pedimos frase de recuperação ou chave privada.",
  },
  zh: {
    assuntos: { ajuda: "我需要帮助", problema: "报告问题", sugestao: "建议", parceria: "合作", juridico: "法律事务", outro: "其他" },
    naoEnviou: "暂时无法发送你的消息，请重试。", semConexao: "无法连接服务器，请重试。",
    enviada: "消息已发送", outra: "再写一条",
    recebemos: (e: React.ReactNode) => <>我们已收到你的消息，将回复至 {e}。如果与交易有关，请保留交易 ID：它有助于我们查明情况。</>,
    nome: "你的名字", nomePh: "我们该怎么称呼你", email: "你的邮箱", emailDica: "我们会通过这里回复", emailPh: "you@example.com",
    carteira: "公开钱包地址", carteiraDica: "可选 —— 帮助我们查找你的交易", carteiraPh: "公开地址，绝不是私钥",
    assunto: "主题", mensagem: "消息", mensagemPh: "请尽可能详细地描述发生了什么。如果与交易有关，请提供交易 ID。",
    enviando: "发送中…", enviar: "发送消息", nunca: "我们绝不会索要你的助记词或私钥。",
  },
});

export function FormularioDeContato() {
  const t = useTextos(TEXTOS);
  const idioma = useIdioma();
  const { publicKey } = useWallet();

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");

  /**
   * `null` significa "a pessoa ainda não mexeu neste campo".
   *
   * Sem essa distinção seria preciso um efeito copiando a carteira conectada
   * pro estado assim que ela aparece — e efeito que chama `setState` no corpo
   * gera renderização em cascata, além de criar um caso chato: quem apagasse
   * o campo de propósito veria o endereço voltar sozinho.
   *
   * Com `null`, o valor exibido é DERIVADO: enquanto ninguém mexeu, mostra a
   * carteira conectada; a partir do primeiro toque, manda o que foi digitado,
   * inclusive vazio.
   */
  const [carteira, setCarteira] = useState<string | null>(null);
  const carteiraVisivel = carteira ?? publicKey?.toBase58() ?? "";
  const [assunto, setAssunto] = useState<string>("ajuda");
  const [texto, setTexto] = useState("");
  const [armadilha, setArmadilha] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando) return;

    setEnviando(true);
    setErro(null);

    try {
      const res = await fetch("/api/contato", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          email: email.trim(),
          carteira: carteiraVisivel.trim() || null,
          assunto,
          texto: texto.trim(),
          website: armadilha,
        }),
      });

      if (!res.ok) {
        const corpo = (await res.json().catch(() => null)) as { error?: string } | null;
        setErro(corpo?.error ? traduzirDoServidor(corpo.error, idioma) : t.naoEnviou);
        setEnviando(false);
        return;
      }

      setPronto(true);
    } catch {
      setErro(t.semConexao);
      setEnviando(false);
    }
  }

  if (pronto) {
    return (
      <div className="mt-8 rounded-xl border border-bull/25 bg-bull/[0.06] px-5 py-8 text-center">
        <div className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-bull/15 text-bull">
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="m5 13 5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-[15px] font-bold text-zinc-100">{t.enviada}</p>
        <p className="mx-auto mt-1.5 max-w-[420px] text-[13px] leading-relaxed text-zinc-400">
          {t.recebemos(<strong className="text-zinc-300">{email}</strong>)}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-5"
          onClick={() => {
            setPronto(false);
            setEnviando(false);
            setTexto("");
            setAssunto("ajuda");
          }}
        >
          {t.outra}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="mt-7 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo={t.nome} obrigatorio>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value.slice(0, 80))}
            required
            autoComplete="name"
            placeholder={t.nomePh}
            className={entrada}
          />
        </Campo>

        <Campo rotulo={t.email} obrigatorio dica={t.emailDica}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value.slice(0, 160))}
            required
            type="email"
            autoComplete="email"
            placeholder={t.emailPh}
            className={entrada}
          />
        </Campo>
      </div>

      <Campo
        rotulo={t.carteira}
        dica={t.carteiraDica}
      >
        <input
          value={carteiraVisivel}
          onChange={(e) => setCarteira(e.target.value.slice(0, 64))}
          spellCheck={false}
          placeholder={t.carteiraPh}
          className={cn(entrada, "tnum font-mono text-[12px]")}
        />
      </Campo>

      <Campo rotulo={t.assunto} obrigatorio>
        <div className="flex flex-wrap gap-1.5">
          {ASSUNTOS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAssunto(a)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors",
                assunto === a
                  ? "border-marca/50 bg-marca/12 text-marca"
                  : "border-ink-600 bg-ink-800 text-zinc-400 hover:border-marca/30 hover:text-zinc-200",
              )}
            >
              {t.assuntos[a]}
            </button>
          ))}
        </div>
      </Campo>

      <Campo rotulo={t.mensagem} obrigatorio>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value.slice(0, LIMITE_TEXTO))}
          required
          rows={7}
          placeholder={t.mensagemPh}
          className={cn(entrada, "resize-y leading-relaxed")}
        />
        <div className="mt-1 text-right text-[10px] tabular-nums text-zinc-600">
          {texto.length} / {LIMITE_TEXTO}
        </div>
      </Campo>

      {/*
        Armadilha pra robô: invisível, fora da ordem de tabulação e escondida
        de leitor de tela, pra que a defesa não vire barreira pra quem navega
        sem enxergar. Fora da tela por posição, e não por `display:none`, que
        robô bom já sabe ignorar.
      */}
      <input
        type="text"
        name="website"
        value={armadilha}
        onChange={(e) => setArmadilha(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="pointer-events-none absolute left-[-9999px] size-0 opacity-0"
      />

      {erro && (
        <p className="rounded-lg border border-bear/25 bg-bear/[0.07] px-3 py-2 text-[12px] text-bear">
          {erro}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button type="submit" variant="chroma" size="lg" disabled={enviando}>
          {enviando ? t.enviando : t.enviar}
        </Button>
        <p className="text-[11px] leading-relaxed text-zinc-600">
          {t.nunca}
        </p>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */

const entrada =
  "w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 text-[13px] text-zinc-100 " +
  "placeholder:text-zinc-600 transition-colors focus:border-marca/50 focus:outline-none";

function Campo({
  rotulo,
  dica,
  obrigatorio,
  children,
}: {
  rotulo: string;
  dica?: string;
  obrigatorio?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-2">
        <span className="text-[12px] font-bold text-zinc-300">
          {rotulo}
          {obrigatorio && <span className="ml-0.5 text-bear">*</span>}
        </span>
        {dica && <span className="text-[10.5px] text-zinc-600">{dica}</span>}
      </span>
      {children}
    </label>
  );
}
