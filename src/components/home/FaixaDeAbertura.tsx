import Link from "next/link";

import { Button } from "@/components/ui/Button";

/**
 * A abertura da home.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTAVA ERRADO
 * ---------------------------------------------------------------------------
 * Antes era tudo numa fileira só: "Tokens", "Volume 24h", "Criar token" e
 * "Link de afiliado" lado a lado, com a mesma altura e o mesmo espaçamento.
 *
 * O problema não é estético, é de leitura. Número e botão são coisas de
 * naturezas opostas — um você LÊ, o outro você CLICA. Alinhados na mesma
 * linha, com caixas do mesmo tamanho, nada indica qual é qual: o olho tem que
 * ler os quatro pra descobrir que dois são ação. E como cada caixinha tinha
 * borda própria, a faixa virava uma régua de retângulos soltos.
 *
 * ---------------------------------------------------------------------------
 * COMO FICOU
 * ---------------------------------------------------------------------------
 * Três camadas dentro de UM painel, empilhadas por função:
 *
 *   1. o que é a plataforma       (texto, à esquerda)
 *   2. o que você pode fazer      (as duas ações, à direita, em coluna)
 *   3. como ela está agora        (os números, na régua de rodapé)
 *
 * As ações em coluna, e não lado a lado, porque elas não são equivalentes:
 * criar um token é o que a plataforma existe pra fazer; o link de afiliado é
 * o segundo passo. Empilhadas, a primeira fica por cima — ordem de leitura é
 * ordem de importância.
 *
 * Os números viraram uma régua de rodapé, do jeito que um terminal mostra
 * estado: rótulo minúsculo, valor em mono, divididos por fio de 1px. Eles
 * continuam ali pra quem procura, e pararam de disputar com os botões.
 */
export function FaixaDeAbertura({
  quantidadeDeTokens,
  volumeTotal,
}: {
  quantidadeDeTokens: string;
  volumeTotal: string;
}) {
  return (
    <section className="brilho faceta relative overflow-hidden rounded-lg border border-ink-700 bg-ink-900">
      {/* A luz entrando pela aresta de cima do painel. */}
      <div className="aresta" />

      <div className="relative z-[1] flex flex-col gap-5 px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:gap-10 lg:px-6 lg:py-6">
        <div className="min-w-0 max-w-[620px]">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-3 w-[2px] shrink-0 rounded-full bg-chroma-gradient"
            />
            <span className="rotulo">Solana · Robinhood Chain</span>
          </div>

          <h1 className="mt-2.5 text-[24px] font-bold leading-[1.15] tracking-tight text-zinc-50 sm:text-[30px]">
            Lance, ganhe indicando e negocie com as melhores taxas.
          </h1>

          <p className="mt-2.5 text-[13px] leading-relaxed text-zinc-400">
            Terminal não-custodial, gráfico ao vivo e auditoria na mesma tela.{" "}
            <strong className="font-semibold text-marca">Quem indica recebe</strong> em cada
            swap, direto na carteira e na mesma transação.
          </p>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-2 sm:flex-row lg:w-auto lg:min-w-[190px] lg:flex-col">
          <Link href="/create" className="block sm:flex-1 lg:flex-none">
            <Button variant="chroma" size="lg" className="w-full">
              Criar token
            </Button>
          </Link>
          <Link href="/affiliate" className="block sm:flex-1 lg:flex-none">
            <Button variant="outline" size="lg" className="w-full">
              Link de afiliado
            </Button>
          </Link>
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
        <Medida rotulo="Tokens" valor={quantidadeDeTokens} />
        <Medida rotulo="Volume 24h" valor={volumeTotal} />
        <Medida rotulo="Redes" valor="2" aoVivo />
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
