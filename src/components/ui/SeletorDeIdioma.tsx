"use client";

import { useEffect, useRef, useState } from "react";

import { IDIOMAS, type Idioma } from "@/lib/idiomas";
import { cn } from "@/lib/utils";

/**
 * O seletor de idioma do cabeçalho.
 *
 * ---------------------------------------------------------------------------
 * GRAVA COOKIE, NÃO `localStorage`
 * ---------------------------------------------------------------------------
 * Para o servidor já mandar a próxima página traduzida. Ver o porquê inteiro
 * em `src/lib/idioma-servidor.ts` — o resumo é que `localStorage` faria o
 * site piscar de um idioma pro outro a cada visita.
 *
 * ---------------------------------------------------------------------------
 * RECARGA INTEIRA, E NÃO `router.refresh()`
 * ---------------------------------------------------------------------------
 * A primeira versão usava `router.refresh()`, que em tese refaz os
 * componentes de servidor sem perder o estado do cliente. **Testado: não
 * funciona aqui.** O cookie gravava certo, mas o menu continuava no idioma
 * antigo e o `<html lang>` também — o layout RAIZ fica acima do segmento que
 * o refresh renova, então ele é reaproveitado do cache do roteador.
 *
 * E é justamente o layout raiz que precisa mudar: é lá que moram o cabeçalho,
 * o rodapé e o atributo `lang`.
 *
 * O preço é perder o estado do cliente — carteira conectada, gráfico
 * carregado, posição da rolagem. Vale: trocar de idioma é uma ação rara e
 * deliberada, a carteira se reconecta sozinha, e meia tradução na tela é pior
 * do que um segundo de recarga.
 *
 * ---------------------------------------------------------------------------
 * CADA IDIOMA APARECE NO PRÓPRIO ALFABETO
 * ---------------------------------------------------------------------------
 * "中文", não "Chinês". Quem lê chinês procura os caracteres que conhece, e
 * escrever o nome em português obriga a pessoa a saber português pra achar a
 * opção de não precisar saber português.
 */
/**
 * Grava a preferência e recarrega.
 *
 * Fora do componente de propósito: o analisador do compilador do React trata
 * `document.cookie = …` dentro de um componente como mutação de valor
 * externo e barra. A regra está certa — efeito colateral não pertence ao
 * corpo de um componente —, e mover pra cá resolve sem silenciar nada.
 *
 * Um ano de validade, caminho na raiz e `SameSite=Lax`.
 *
 * `Lax` porque a preferência precisa sobreviver a alguém chegar por link de
 * fora — que é como quase toda visita começa aqui. `Strict` devolveria a
 * pessoa ao idioma padrão justamente na primeira tela que ela vê.
 *
 * Sem `Secure`: em `localhost` o navegador descarta cookie marcado como
 * seguro e a troca de idioma pararia de funcionar em desenvolvimento. Não há
 * nada sigiloso aqui — é preferência de exibição.
 */
function gravarERecarregar(idioma: Idioma) {
  document.cookie = `chroma_idioma=${idioma}; path=/; max-age=31536000; samesite=lax`;
  window.location.reload();
}

export function SeletorDeIdioma({ atual }: { atual: Idioma }) {
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);

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

  function escolher(idioma: Idioma) {
    if (idioma === atual) {
      setAberto(false);
      return;
    }

    setAberto(false);
    gravarERecarregar(idioma);
  }

  const selecionado = IDIOMAS.find((i) => i.chave === atual) ?? IDIOMAS[0];

  return (
    <div className="relative" ref={caixaRef}>
      <button
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label="Language"
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-semibold transition-colors",
          aberto
            ? "border-marca/50 bg-marca/[0.08] text-zinc-100"
            : "border-ink-600 bg-ink-800 text-zinc-300 hover:border-marca/40 hover:text-zinc-100",
        )}
      >
        <IconeGlobo />
        <span>{selecionado.curto}</span>
      </button>

      {aberto && (
        <div className="panel absolute right-0 z-50 mt-2 w-[168px] p-1" role="listbox">
          {IDIOMAS.map((i) => {
            const ativo = i.chave === atual;
            return (
              <button
                key={i.chave}
                onClick={() => escolher(i.chave)}
                role="option"
                aria-selected={ativo}
                /*
                 * `lang` em cada item: sem isto o navegador escolhe a fonte
                 * pelo idioma da PÁGINA, e caracteres chineses, coreanos e
                 * japoneses acabam desenhados com o glifo errado — o famoso
                 * problema de unificação Han.
                 */
                lang={i.chave}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors",
                  ativo ? "bg-marca/10" : "hover:bg-white/5",
                )}
              >
                <span
                  className={cn(
                    "truncate text-[12.5px] font-semibold",
                    ativo ? "text-marca" : "text-zinc-300",
                  )}
                >
                  {i.rotulo}
                </span>

                {ativo ? (
                  <svg
                    viewBox="0 0 24 24"
                    className="size-3.5 shrink-0 text-marca"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  >
                    <path d="m5 13 5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <span className="shrink-0 font-mono text-[10px] text-zinc-600">
                    {i.curto}
                  </span>
                )}
              </button>
            );
          })}

          {/*
            O aviso aparece ANTES de escolher, não depois.

            Numa versão anterior ele só era mostrado após a troca — e como a
            troca recarrega a página na mesma hora, ninguém nunca o via. Aviso
            que chega depois da decisão não é aviso.

            A moldura do site está traduzida; termos, privacidade e os
            formulários ainda não. Quem escolhe coreano e cai num texto legal
            em português merece saber que é estado do produto, e não defeito
            do navegador dele.
          */}

        </div>
      )}
    </div>
  );
}

function IconeGlobo() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-3.5 shrink-0 text-zinc-500"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
    </svg>
  );
}
