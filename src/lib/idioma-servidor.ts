import "server-only";

import { cookies, headers } from "next/headers";

import { IDIOMAS, IDIOMA_PADRAO, ehIdioma, textos, type Idioma } from "@/lib/idiomas";

/**
 * Qual idioma servir, decidido NO SERVIDOR.
 *
 * ---------------------------------------------------------------------------
 * POR QUE COOKIE E NÃO `localStorage`
 * ---------------------------------------------------------------------------
 * `localStorage` só existe no navegador. O servidor montaria a página no
 * idioma padrão, ela chegaria pronta, e aí o JavaScript trocaria tudo — a
 * pessoa veria o menu inteiro piscar de inglês pra coreano a cada visita.
 *
 * Cookie viaja NA REQUISIÇÃO. O servidor já sabe, e a página nasce certa.
 *
 * Isso também conserta uma coisa que ninguém vê e importa: o atributo `lang`
 * do `<html>`. Ele estava fixo em `pt-BR` pra todo mundo. Leitor de tela usa
 * esse atributo pra escolher a PRONÚNCIA — um site em coreano marcado como
 * português é lido em voz alta como se fosse português. E buscador usa pra
 * saber pra quem mostrar a página.
 *
 * ---------------------------------------------------------------------------
 * O CUSTO, DITO EM VOZ ALTA
 * ---------------------------------------------------------------------------
 * Ler cookie no layout raiz torna TODA página dinâmica — as estáticas
 * (termos, privacidade, contato) passam a ser renderizadas a cada visita em
 * vez de servidas prontas.
 *
 * Vale a troca: a home e as páginas de moeda já eram dinâmicas porque exibem
 * dado de mercado ao vivo, as que sobram são páginas de texto que rendem em
 * milissegundos, e a alternativa é o site piscar na cara de quem chega.
 */

const NOME_DO_COOKIE = "chroma_idioma";

/**
 * Adivinha pelo `Accept-Language` do navegador quem ainda não escolheu.
 *
 * Sem isto, quem chega da Coreia lê inglês até descobrir sozinho que existe
 * um seletor — e a maioria não descobre. O palpite é sobrecrito assim que a
 * pessoa escolhe de verdade, porque o cookie tem prioridade.
 *
 * Compara só o prefixo: `pt-BR`, `pt-PT` e `pt` são todos `pt` pra nós. Um
 * dia, se houver diferença entre as variantes, é aqui que ela entra.
 */
function palpiteDoNavegador(aceita: string | null): Idioma | null {
  if (!aceita) return null;

  for (const parte of aceita.split(",")) {
    const etiqueta = parte.split(";")[0]!.trim().toLowerCase();
    const prefixo = etiqueta.split("-")[0]!;

    const achado = IDIOMAS.find((i) => i.chave === prefixo);
    if (achado) return achado.chave;
  }
  return null;
}

/** O idioma desta requisição: escolha salva > inglês. */
export async function idiomaAtual(): Promise<Idioma> {
  const escolhido = (await cookies()).get(NOME_DO_COOKIE)?.value;
  if (ehIdioma(escolhido)) return escolhido;

  /*
   * Sem escolha salva: INGLÊS, sempre (regra do dono, 29/09/2026 — o inglês é
   * a língua oficial do site). Não adivinhamos mais pelo idioma do navegador;
   * quem quiser português ou chinês troca no seletor e fica salvo.
   */
  void headers;
  void palpiteDoNavegador;
  return IDIOMA_PADRAO;
}

/** Atalho: o idioma e os textos dele de uma vez só. */
export async function textosAtuais() {
  const idioma = await idiomaAtual();
  return { idioma, t: textos(idioma) };
}

export { NOME_DO_COOKIE };
