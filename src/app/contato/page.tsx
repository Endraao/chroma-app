import type { Metadata } from "next";

import { FormularioDeContato } from "@/components/ui/FormularioDeContato";

export const metadata: Metadata = {
  title: "Contato & Suporte — Chroma",
  description: "Peça ajuda, relate um problema ou mande uma sugestão para a equipe da Chroma.",
};

/**
 * A página é servidor, o formulário é cliente.
 *
 * Assim o texto de apoio e os metadados são renderizados no servidor — chegam
 * prontos e aparecem na busca — e só o formulário carrega JavaScript. Fazer a
 * página inteira ser `"use client"` mandaria a página de suporte inteira pro
 * navegador pra ganhar um `useState`.
 */
export default function ContatoPage() {
  return (
    <div className="mx-auto w-full max-w-[680px] pb-24 pt-4">
      <header className="border-b border-ink-700 pb-5">
        <h1 className="text-2xl font-black tracking-tight text-zinc-50">Contato &amp; Suporte</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-zinc-400">
          Precisa de ajuda, encontrou um problema ou quer sugerir alguma coisa? Escreva abaixo. A
          mensagem vai direto para a nossa equipe e a resposta chega no e-mail que você informar.
        </p>
      </header>

      <FormularioDeContato />
    </div>
  );
}
