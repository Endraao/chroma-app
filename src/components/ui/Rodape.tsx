import Link from "next/link";

import { textos, type Idioma } from "@/lib/idiomas";

/**
 * O rodapé do site.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ELE PASSOU A EXISTIR
 * ---------------------------------------------------------------------------
 * Não foi por estética. Um site que hospeda moeda criada por qualquer pessoa,
 * cobra taxa e guarda carteira precisa ter, em todas as páginas e ao alcance
 * de um clique: termos de uso, política de privacidade e um canal de contato.
 *
 * Isso é exigência da LGPD, é o que provedores de dados e de hospedagem
 * cobram de quem publica, e é o que separa "o usuário foi avisado" de "o site
 * prometeu" quando alguém perde dinheiro e reclama.
 *
 * ---------------------------------------------------------------------------
 * O AVISO DE RISCO FICA AQUI, ESCRITO
 * ---------------------------------------------------------------------------
 * Não escondido atrás de link. É a única frase do site que precisa ser lida
 * por quem nunca vai abrir os termos — que é quase todo mundo.
 */
export function Rodape({ idioma }: { idioma: Idioma }) {
  const t = textos(idioma);

  return (
    <footer className="mt-10 border-t border-ink-700/60 px-4 py-7 lg:px-6">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-[560px]">
          {/*
            A marca também aqui, em holográfico — mas pequena e apagada.
            No rodapé ela ASSINA a página; competir com o aviso de risco logo
            abaixo seria inverter a importância dos dois.
          */}
          <p className="holo-texto inline-block text-[12px] font-black tracking-tight">CHROMA</p>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-zinc-600">{t.rodapeAviso}</p>
        </div>

        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px]">
          <Elo href="/airdrop">{t.rodapeAirdrop}</Elo>
          <Elo href="/termos">{t.rodapeTermos}</Elo>
          <Elo href="/privacidade">{t.rodapePrivacidade}</Elo>
          <Elo href="/fees">{t.rodapeTaxas}</Elo>
          <Elo href="/contato">{t.rodapeContato}</Elo>
        </nav>
      </div>
    </footer>
  );
}

function Elo({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-zinc-500 transition-colors hover:text-marca">
      {children}
    </Link>
  );
}
