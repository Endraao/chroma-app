import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { CristalHolografico } from "@/components/ui/CristalHolografico";
import { textos, type Idioma } from "@/lib/idiomas";
import { CHAINS, CHAIN_IDS } from "@/lib/web3";

/**
 * A abertura da home.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ELA VOLTOU A TER UM TÍTULO GIGANTE
 * ---------------------------------------------------------------------------
 * Numa versão anterior o título grande foi REMOVIDO de propósito: numa
 * launchpad a lista é o produto, e espaço gasto em cabeçalho some da vitrine.
 * Aquele raciocínio continua certo sobre título que EXPLICA — um parágrafo de
 * promessa em corpo 40 empurrando a tabela pra baixo.
 *
 * O que entra aqui não é isso. É a MARCA, escrita uma vez, do jeito que só
 * este site consegue escrever: o nome é Chroma, e o espectro atravessando as
 * letras é literalmente o que a palavra significa. Um site de lançamento de
 * moeda é escolhido por confiança, e quem chega decide em dois segundos se
 * está num lugar construído ou num molde genérico.
 *
 * A vitrine continua logo abaixo, sem rolagem no desktop.
 *
 * ---------------------------------------------------------------------------
 * AS TRÊS CAMADAS DE MOVIMENTO, E POR QUE SÃO DIFERENTES ENTRE SI
 * ---------------------------------------------------------------------------
 *   - o reflexo nas letras   → 7s, constante  (a marca "respira")
 *   - o reflexo no cristal   → 6s, constante  (fora de fase com as letras)
 *   - a varredura do botão   → só no hover    (responde a VOCÊ)
 *
 * Fora de fase de propósito. Sincronizados, os três viram um pisca-pisca só e
 * o olho lê "animação"; defasados, leem como superfícies diferentes pegando a
 * mesma luz — que é o efeito procurado.
 *
 * Os números seguem numa régua de rodapé, do jeito que um terminal mostra
 * estado: rótulo minúsculo, valor em mono, divididos por fio de 1px.
 */
export function FaixaDeAbertura({
  idioma,
  quantidadeDeTokens,
  volumeTotal,
}: {
  idioma: Idioma;
  quantidadeDeTokens: string;
  volumeTotal: string;
}) {
  const t = textos(idioma);

  return (
    <section className="relative overflow-hidden rounded-lg border border-ink-700 bg-ink-900">
      {/*
        A textura pontilhada, atrás de tudo e sem capturar clique.

        Ponto, e não a grade de linhas que o site usava: grade desenha CAIXAS,
        e caixa logo acima de uma tabela cheia de bordas faz o olho tentar
        alinhar as duas. Ponto é textura; não compete com estrutura.
      */}
      <div className="fundo-pontos" aria-hidden />

      {/* A luz entrando pela aresta de cima do painel. */}
      <div className="aresta" />

      <div className="relative z-[1] flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:px-6 lg:py-4">
        <div className="min-w-0 max-w-[640px]">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-3 w-[2px] shrink-0 rounded-full bg-chroma-gradient"
            />
            {/*
              Sai de CHAIN_IDS, e não escrito à mão.

              Estava fixo como "Solana · Robinhood Chain", o que passou a
              contradizer o próprio site quando a Robinhood virou a rede
              principal: a primeira linha da home anunciava a Solana na frente
              enquanto todo o resto abria na Robinhood.
            */}
            <span className="rotulo">{CHAIN_IDS.map((c) => CHAINS[c].label).join(" · ")}</span>
          </div>

          {/*
            O nome como logotipo, não como frase.

            Peso máximo e `tracking` negativo porque a palavra precisa virar
            BLOCO: o reflexo atravessando letras espaçadas se perde no vão
            entre elas, e aí sobra só um degradê colorido.
          */}
          {/*
            "LAUNCHPAD" em linha própria, menor e com as letras ABERTAS.

            Numa linha só, "CHROMA LAUNCHPAD" em corpo 76 não caberia — e
            reduzir o corpo pra caber encolheria o nome da marca, que é
            justamente o que precisa dominar. Empilhado, CHROMA continua do
            tamanho que era e a palavra de baixo vira o que ela é: a categoria
            do produto, não parte do nome.

            O espaçamento positivo (`tracking-[0.34em]`) é o contrário do que
            CHROMA usa, e é de propósito: letra apertada lê como logotipo,
            letra aberta lê como rótulo. A diferença entre as duas linhas faz
            o trabalho que um tamanho menor sozinho não faria.
          */}
          <h1 className="mt-2 select-none">
            <span className="holo-texto block text-[32px] font-black leading-[0.92] tracking-[-0.045em] sm:text-[40px] lg:text-[46px]">
              CHROMA
            </span>
            <span className="mt-1 block text-[13px] font-bold uppercase tracking-[0.3em] text-zinc-400 sm:text-[16px] lg:text-[18px]">
              Launchpad
            </span>
          </h1>

          <p className="mt-2 max-w-[520px] text-[12.5px] leading-relaxed text-zinc-400">
            {/*
              Entre chaves, e não solto como texto: `///` cru no meio do JSX
              é lido pelo linter como começo de comentário, e o aviso está
              certo — quem lesse o arquivo depois hesitaria igual.
            */}
            <span className="font-mono text-marca">{"/// "}</span>
            {t.heroLinha}
          </p>

          <div className="mt-3 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {/*
              O único botão-espectro do site. Ver a nota em `Button.tsx`: o
              efeito só significa alguma coisa porque não se repete.
            */}
            <Link href="/create" className="block sm:w-auto">
              <Button variant="espectro" className="w-full px-6 sm:w-auto">
                {t.heroBotaoCriar}
              </Button>
            </Link>
            <Link href="/airdrop" className="block sm:w-auto">
              <Button variant="outline" className="w-full px-5 sm:w-auto">
                {t.heroBotaoPontos}
              </Button>
            </Link>
          </div>
        </div>

        {/*
          O cristal só aparece a partir de `lg`.

          No celular ele roubaria a altura que a primeira moeda da lista
          precisa: a pessoa abriria o site e veria um enfeite ocupando a tela
          toda, com o produto abaixo da dobra. Ornamento cede espaço, nunca o
          contrário.
        */}
        {/* Mesmo tamanho do cristal do Airdrop (150), um pouco afastado da borda direita. */}
        <div className="hidden shrink-0 lg:mr-6 lg:block xl:mr-10">
          <CristalHolografico size={150} />
        </div>
      </div>

      {/*
        A régua de estado.

        Encostada na esquerda, e não esticada pela largura toda: com três
        células dividindo 1600px o valor ficava sozinho no meio de um campo
        vazio, longe do próprio rótulo. Agrupados, os três números se leem
        como uma medida só — que é o que são.
      */}
      <div className="relative z-[1] grid grid-cols-3 divide-x divide-ink-700 border-t border-ink-700 sm:flex">
        {/* "Tokens", e não "Tokens listados": no celular o rótulo longo
            quebrava em duas linhas e torcia a régua. Ao lado de um número
            inteiro, numa launchpad, a palavra sozinha já diz tudo. */}
        <Medida rotulo={t.medidaTokens} valor={quantidadeDeTokens} />
        <Medida rotulo={t.medidaVolume} valor={volumeTotal} />
        <Medida rotulo={t.medidaRedes} valor="2" aoVivo />
      </div>
    </section>
  );
}

function Medida({
  rotulo,
  valor,
  aoVivo = false,
}: {
  rotulo: string;
  valor: string;
  aoVivo?: boolean;
}) {
  return (
    /*
     * Folga menor no celular. Com 375px de tela e três células, `px-5` deixava
     * 74px de rótulo — e "Tokens listados" quebrava em duas linhas enquanto os
     * vizinhos ficavam em uma, desalinhando a régua inteira.
     */
    <div className="px-3 py-2.5 sm:px-5 lg:px-6">
      <div className="flex items-center gap-1.5">
        <span className="rotulo">{rotulo}</span>
        {aoVivo && <span className="size-1 animate-pulse-dot rounded-full bg-bull" />}
      </div>
      <div className="tnum mt-0.5 text-[15px] font-bold text-zinc-100">{valor}</div>
    </div>
  );
}
