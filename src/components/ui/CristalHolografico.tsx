import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * O cristal da Chroma, com a luz cromática atravessando.
 *
 * ---------------------------------------------------------------------------
 * A ARTE É A QUE JÁ EXISTE; O QUE ANIMA É A LUZ
 * ---------------------------------------------------------------------------
 * Uma versão anterior redesenhava o cristal como polígonos SVG, pra poder
 * animar face por face. Ficou ruim, e o motivo vale registrar pra ninguém
 * tentar de novo: o logo tem lapidação, sombra e profundidade reais, e
 * reproduzir isso com polígono chapado entrega um hexágono colorido —
 * parecido de longe, pobre de perto.
 *
 * O caminho certo é o inverso. Mantém-se a arte, e mexe-se só na LUZ que passa
 * por ela: `hue-rotate` faz exatamente isso, e é literalmente o conceito da
 * marca — luz refratada atravessando o cristal.
 *
 * ---------------------------------------------------------------------------
 * O BRILHO SEGUE O CONTORNO, NÃO UM CÍRCULO
 * ---------------------------------------------------------------------------
 * A luz em volta da pedra vem de `drop-shadow` aplicado na própria imagem, e
 * não de uma bola desfocada atrás dela. `drop-shadow` respeita o canal alfa,
 * então o brilho tem a forma facetada do cristal.
 *
 * A primeira tentativa usava dois círculos borrados por trás. Eles ficavam
 * escondidos atrás do próprio cristal — o halo existia no código e não
 * aparecia na tela.
 *
 * ---------------------------------------------------------------------------
 * BRANCO PARADO, LUZ RESPIRANDO
 * ---------------------------------------------------------------------------
 * A pedra NÃO muda de cor. Ela era sincronizada com as letras de CHROMA, no
 * laço azul → azul claro → branco, e isso saiu: duas coisas piscando juntas
 * dividem a atenção em vez de somar, e num terminal onde verde e vermelho
 * significam dinheiro, cor ornamental atrapalha antes de enfeitar.
 *
 * O que se move agora são duas coisas, e nenhuma é cor:
 *
 *   1. a pulsação da luz —  9s (`--pulso`) — a respiração
 *   2. a flutuação       — 48s (`--ciclo`) — três pixels, quase invisível
 *
 * A pulsação tem relógio PRÓPRIO porque uma respiração de 48 segundos não é
 * percebida como respiração — vira objeto parado. A flutuação segue o ciclo
 * lento do site. Como os períodos não são múltiplos, o conjunto demora pra
 * repetir exatamente a mesma combinação.
 *
 * ---------------------------------------------------------------------------
 * É ORNAMENTO
 * ---------------------------------------------------------------------------
 * `aria-hidden` e sem captura de clique: o nome da marca está escrito ao lado
 * em texto de verdade, e um leitor de tela anunciando "imagem" aqui só
 * atrapalha quem está tentando chegar na lista de moedas.
 */
export function CristalHolografico({
  size = 230,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        /*
         * Sem `motion-safe:`, por decisão do dono do projeto (23/09/2026):
         * a animação roda para todo mundo, inclusive para quem pediu redução
         * de movimento no sistema. Ver a nota longa em `globals.css`.
         */
        "pointer-events-none relative animate-[flutuar_var(--ciclo)_ease-in-out_infinite] select-none",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {/*
        NÃO existe camada de névoa atrás do cristal, e é de propósito.
        ---------------------------------------------------------------------
        Havia um `<div>` redondo e desfocado aqui. Duas versões dele foram
        testadas e as duas estavam erradas:

          1. gradiente da marca girando em 8s — cor diferente da do cristal no
             mesmo instante, então pareciam dois efeitos soltos;
          2. ciano sólido, sincronizado — e aí o problema ficou pior: um
             círculo de cor chapada a 16% desfocado vira uma BOLOTA visível
             em volta da pedra. O cristal parecia colado sobre um adesivo.

        O erro nas duas foi o mesmo: tentar iluminar um objeto facetado com uma
        forma REDONDA. Nenhum raio de desfoque conserta isso, porque o problema
        é a silhueta, não a suavidade.

        O brilho certo já vem do `drop-shadow` na própria imagem, logo abaixo:
        ele segue o canal alfa, ou seja, o contorno real do cristal. É a mesma
        decisão aplicada ao logo do cabeçalho.
      */}

      {/*
        `.cristal-parado` não é sobra: é o filtro BASE.

        Ele segura o brilho no primeiro quadro, antes de a animação assumir.
        Sem ele o PNG aparece escuro por um instante ao carregar — o cristal
        tem brilho médio 47/255 contra um fundo de 7/255, então sem filtro ele
        literalmente some antes de acender.
      */}
      <Image
        src="/logo.png"
        alt=""
        width={size * 2}
        height={size * 2}
        priority
        /*
         * `ease-in-out`, e aqui isso é o contrário da regra do resto do site.
         *
         * Nas animações de COR usamos `linear`, porque aceleração no fim da
         * volta lê como travamento. Numa RESPIRAÇÃO é o oposto: o que soa
         * artificial é a intensidade subir e descer em ritmo constante.
         * Respirar tem pausa no topo e no fundo — é justamente o que o
         * `ease-in-out` faz.
         */
        className="cristal-parado relative z-[1] animate-[cristal-pulsar_var(--pulso)_ease-in-out_infinite]"
        style={{ width: size, height: size }}
      />
    </div>
  );
}
