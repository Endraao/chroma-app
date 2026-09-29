import type { Metadata } from "next";

import { FormularioDeContato } from "@/components/ui/FormularioDeContato";
import { idiomaAtual } from "@/lib/idioma-servidor";
import { traducoes } from "@/lib/idiomas";

const TEXTOS = traducoes({
  en: { titulo: "Contact & Support", intro: "Need help, found a problem or want to suggest something? Write below. The message goes straight to our team and the reply arrives at the email you provide." },
  pt: { titulo: "Contato & Suporte", intro: "Precisa de ajuda, encontrou um problema ou quer sugerir alguma coisa? Escreva abaixo. A mensagem vai direto para a nossa equipe e a resposta chega no e-mail que você informar." },
  zh: { titulo: "联系与支持", intro: "需要帮助、发现问题或有建议？请在下方填写。消息会直接发送给我们的团队，回复将发送到你填写的邮箱。" },
});

const METADADOS = {
  "en": [
    "Contact & Support — Chroma",
    "Get help, report a problem or send a suggestion to the Chroma team."
  ],
  "pt": [
    "Contato & Suporte — Chroma",
    "Peça ajuda, relate um problema ou mande uma sugestão para a equipe da Chroma."
  ],
  "zh": [
    "联系与支持 — Chroma",
    "获取帮助、报告问题或向 Chroma 团队提出建议。"
  ]
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const [title, description] = METADADOS[await idiomaAtual()];
  return { title, description };
}

/**
 * A página é servidor, o formulário é cliente.
 *
 * Assim o texto de apoio e os metadados são renderizados no servidor — chegam
 * prontos e aparecem na busca — e só o formulário carrega JavaScript. Fazer a
 * página inteira ser `"use client"` mandaria a página de suporte inteira pro
 * navegador pra ganhar um `useState`.
 */
export default async function ContatoPage() {
  const t = TEXTOS[await idiomaAtual()];
  return (
    <div className="mx-auto w-full max-w-[680px] pb-24 pt-4">
      <header className="border-b border-ink-700 pb-5">
        <h1 className="text-2xl font-black tracking-tight text-zinc-50">{t.titulo}</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-zinc-400">
          {t.intro}
        </p>
      </header>

      <FormularioDeContato />
    </div>
  );
}
