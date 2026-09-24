"use client";

import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";

import {
  BarraDeCategorias,
  CHAVE_DA_BARRA,
  EsqueletoDaBarra,
} from "@/components/ui/BarraDeCategorias";

/**
 * A moldura da aplicação: a coluna de categorias à esquerda e o conteúdo.
 *
 * ---------------------------------------------------------------------------
 * POR QUE OS DOIS MORAM NO MESMO COMPONENTE
 * ---------------------------------------------------------------------------
 * Porque o estado de aberta/fechada muda a largura dos DOIS. Se a barra fosse
 * `fixed` e o conteúdo ganhasse um recuo, os dois precisariam saber o mesmo
 * número em dois lugares — e é exatamente aí que aparece a faixa vazia ou o
 * texto passando por baixo da barra quando alguém mexe num dos valores.
 *
 * Num flex simples não existe esse número: a barra ocupa o que ocupa e o
 * conteúdo ocupa o resto, sozinho.
 *
 * ---------------------------------------------------------------------------
 * A ESCOLHA FICA GUARDADA, MAS SÓ DEPOIS DE MONTAR
 * ---------------------------------------------------------------------------
 * A página é renderizada no servidor, que não tem como saber o que está no
 * `localStorage` do navegador. Ler antes da montagem faria o HTML do servidor
 * e o do cliente discordarem, e o React reclamaria de hidratação.
 *
 * Então começa sempre fechada e abre no primeiro efeito, se for o caso. Quem
 * deixou aberta vê a barra crescer uma vez ao carregar — o preço de manter a
 * preferência sem quebrar a renderização no servidor.
 */
export function Moldura({ children }: { children: ReactNode }) {
  const [aberta, setAberta] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(CHAVE_DA_BARRA) === "1") setAberta(true);
    } catch {
      /* navegador anônimo ou storage bloqueado: fica fechada, que é o padrão */
    }
  }, []);

  const alternar = useCallback(() => {
    setAberta((v) => {
      try {
        window.localStorage.setItem(CHAVE_DA_BARRA, v ? "0" : "1");
      } catch {
        /* sem storage a escolha só vale nesta aba, e tudo bem */
      }
      return !v;
    });
  }, []);

  return (
    /*
     * Sem `items-start`. A barra precisa ESTICAR até o fim da página.
     *
     * A barra da esquerda é `sticky`, e `sticky` só gruda dentro da caixa do
     * próprio pai. Com `items-start`, o `<aside>` ficava com a altura do
     * conteúdo dele — cerca de uma tela — e em página longa, ao rolar além
     * disso, a caixa acabava e a barra ia embora junto.
     *
     * Esticada (o padrão do flex), ela acompanha a altura da coluna de
     * conteúdo, e o `sticky` lá dentro passa a ter pista pra correr a página
     * inteira.
     *
     * `sticky` e não `fixed` de propósito: `fixed` tiraria a barra do fluxo, e
     * o conteúdo precisaria de um recuo manual do tamanho exato dela — o
     * número mágico repetido em dois lugares que este componente existe justo
     * pra evitar.
     */
    <div className="flex">
      {/*
        A fronteira de Suspense abraça SÓ a barra, e isso não é detalhe.

        Ela estava no layout, em volta da moldura inteira. Como a barra lê
        `useSearchParams` e isso suspende no servidor, a página toda ia junto:
        o React transmitia o conteúdo dentro de um `<div hidden>` esperando ser
        revelado, e enquanto isso a tela ficava com o cabeçalho e mais nada.
        O HTML tinha tudo, o servidor respondia 200, e o site aparecia vazio.

        Com a fronteira aqui, quem espera é a barra. O conteúdo da página nunca
        depende dela pra ser desenhado.
      */}
      <Suspense fallback={<EsqueletoDaBarra aberta={aberta} />}>
        <BarraDeCategorias aberta={aberta} alternar={alternar} />
      </Suspense>

      {/*
        `min-w-0` não é enfeite: sem ele, uma tabela larga dentro do conteúdo
        empurra o flex e a barra da esquerda é espremida até sumir.
      */}
      <main className="min-w-0 flex-1 px-4 pb-16 pt-6 lg:px-6">
        <div className="mx-auto w-full max-w-[1600px]">{children}</div>
      </main>
    </div>
  );
}
