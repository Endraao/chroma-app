import "server-only";

import { fetchTrades, type NegocioDoPool } from "@/lib/market";

/**
 * Quem está posicionado na moeda, quanto botou e quanto está ganhando.
 *
 * ---------------------------------------------------------------------------
 * A LIMITAÇÃO, ANTES DE QUALQUER OUTRA COISA
 * ---------------------------------------------------------------------------
 * Isto é calculado sobre os ÚLTIMOS ~300 NEGÓCIOS do par. Não é o histórico da
 * moeda, não é o saldo real das carteiras e não é a posição verdadeira de
 * ninguém. É uma foto de uma janela recente.
 *
 * Fazer melhor exigiria indexar a moeda desde o primeiro bloco e ler o saldo
 * de cada carteira na rede — um indexador, não uma chamada de API. Vale fazer
 * um dia; não dá pra fingir que já está feito.
 *
 * Por isso duas decisões atravessam o arquivo inteiro:
 *
 * 1. Quem VENDEU MAIS DO QUE COMPROU na janela entrou antes dela. O preço que
 *    essa pessoa pagou está fora da nossa vista, então o lucro dela é
 *    DESCONHECIDO — e aparece como desconhecido, não como zero. Zero seria uma
 *    afirmação, e uma afirmação falsa.
 *
 * 2. A tela que mostra isso é obrigada a dizer o tamanho da janela. Uma tabela
 *    de "lucro dos traders" sem essa frase faz o número parecer definitivo, e
 *    aí alguém decide dinheiro em cima dele.
 */

export interface Trader {
  carteira: string;

  /** Tokens que entraram e saíram da carteira DENTRO da janela. */
  tokensComprados: number;
  tokensVendidos: number;
  /** O que sobrou na mão, na janela. Pode ser negativo em quem entrou antes. */
  saldo: number;
  /** Quanto o saldo representa do fornecimento circulante, em %. */
  pctDoFornecimento: number;

  /** Dólares que a carteira colocou comprando. */
  investidoUsd: number;
  /** Dólares que a carteira tirou vendendo. */
  recebidoUsd: number;

  /** Preço médio de compra na janela. `null` em quem só vendeu. */
  precoMedioUsd: number | null;
  /** Lucro já realizado nas vendas. `null` quando o preço médio é desconhecido. */
  realizadoUsd: number | null;
  /** Lucro no papel, do que ainda está na mão. */
  naoRealizadoUsd: number | null;
  /** A soma dos dois. `null` quando não dá pra saber — e aí é `null` mesmo. */
  lucroUsd: number | null;

  negocios: number;
  compras: number;
  vendas: number;

  /** Vendeu mais do que comprou na janela: já tinha token antes dela. */
  vindoDeAntes: boolean;
  ultimoEm: number;
}

export interface QuadroDeTraders {
  lista: Trader[];
  /** Quantos negócios a janela cobriu. */
  negociosLidos: number;
  /** Extremos da janela, em epoch ms. */
  desde: number | null;
  ate: number | null;
  /** Preço usado pra marcar a mercado o que ainda está na mão. */
  precoUsd: number;
  /** Fornecimento usado no cálculo de %; 0 quando não deu pra estimar. */
  fornecimento: number;
}

/**
 * Folga pra diferença de arredondamento entre o que a API reporta na compra e
 * na venda. Vender 0,2% a mais do que comprou é ruído de casa decimal; vender
 * o dobro é outra história, e é essa que precisa ser marcada.
 */
const TOLERANCIA = 0.005;

export async function agregarTraders({
  address,
  precoUsd,
  marketCapUsd,
}: {
  address: string;
  precoUsd: number;
  marketCapUsd: number;
}): Promise<QuadroDeTraders> {
  const negocios = await fetchTrades(address);

  /*
   * O fornecimento sai de capitalização ÷ preço.
   *
   * Não é um dado que a Dexscreener entregue direto, mas os dois números que
   * compõem ele vêm da mesma fonte e do mesmo instante — então a divisão é
   * consistente com o resto da tela, que é o que importa aqui. Se qualquer um
   * dos dois faltar, a coluna de % simplesmente não aparece.
   */
  const fornecimento = precoUsd > 0 && marketCapUsd > 0 ? marketCapUsd / precoUsd : 0;

  const porCarteira = new Map<string, Acumulado>();

  for (const n of negocios) {
    const acc = porCarteira.get(n.carteira) ?? novo();
    somar(acc, n);
    porCarteira.set(n.carteira, acc);
  }

  const lista: Trader[] = [];

  for (const [carteira, a] of porCarteira) {
    const excedente = a.tokensVendidos - a.tokensComprados;
    const vindoDeAntes =
      a.tokensComprados <= 0 || excedente > a.tokensComprados * TOLERANCIA;

    const saldo = a.tokensComprados - a.tokensVendidos;

    /*
     * Preço médio ponderado pelo VALOR, não pela quantidade de ordens.
     *
     * Uma compra de mil dólares e uma de dez não pesam igual na conta de
     * quanto a pessoa pagou pelo token — e é a média por ordem que produz
     * aquele "lucro" absurdo que algumas telas mostram.
     */
    const precoMedioUsd =
      !vindoDeAntes && a.tokensComprados > 0 ? a.investidoUsd / a.tokensComprados : null;

    let realizadoUsd: number | null = null;
    let naoRealizadoUsd: number | null = null;

    if (precoMedioUsd !== null) {
      /* O que já virou dinheiro: o que recebeu menos o custo do que entregou. */
      realizadoUsd = a.recebidoUsd - a.tokensVendidos * precoMedioUsd;
      /* E o que ainda é papel: o que sobrou, marcado no preço de agora. */
      naoRealizadoUsd = Math.max(0, saldo) * (precoUsd - precoMedioUsd);
    }

    lista.push({
      carteira,
      tokensComprados: a.tokensComprados,
      tokensVendidos: a.tokensVendidos,
      saldo,
      pctDoFornecimento: fornecimento > 0 ? (Math.max(0, saldo) / fornecimento) * 100 : 0,
      investidoUsd: a.investidoUsd,
      recebidoUsd: a.recebidoUsd,
      precoMedioUsd,
      realizadoUsd,
      naoRealizadoUsd,
      lucroUsd:
        realizadoUsd === null || naoRealizadoUsd === null
          ? null
          : realizadoUsd + naoRealizadoUsd,
      negocios: a.compras + a.vendas,
      compras: a.compras,
      vendas: a.vendas,
      vindoDeAntes,
      ultimoEm: a.ultimoEm,
    });
  }

  /*
   * Ordem padrão: quem botou mais dinheiro primeiro.
   *
   * Ordenar por lucro poria no topo a carteira que multiplicou vinte dólares
   * por dez — número bonito, informação nenhuma. Quem está olhando a tabela
   * quer saber quem tem tamanho pra mexer no preço.
   */
  lista.sort((x, y) => y.investidoUsd - x.investidoUsd);

  const tempos = negocios.map((n) => n.em);

  return {
    lista,
    negociosLidos: negocios.length,
    desde: tempos.length ? Math.min(...tempos) : null,
    ate: tempos.length ? Math.max(...tempos) : null,
    precoUsd,
    fornecimento,
  };
}

/* ------------------------------------------------------------------ */

interface Acumulado {
  tokensComprados: number;
  tokensVendidos: number;
  investidoUsd: number;
  recebidoUsd: number;
  compras: number;
  vendas: number;
  ultimoEm: number;
}

function novo(): Acumulado {
  return {
    tokensComprados: 0,
    tokensVendidos: 0,
    investidoUsd: 0,
    recebidoUsd: 0,
    compras: 0,
    vendas: 0,
    ultimoEm: 0,
  };
}

function somar(acc: Acumulado, n: NegocioDoPool) {
  if (n.lado === "compra") {
    acc.tokensComprados += n.tokens;
    acc.investidoUsd += n.usd;
    acc.compras += 1;
  } else {
    acc.tokensVendidos += n.tokens;
    acc.recebidoUsd += n.usd;
    acc.vendas += 1;
  }
  if (n.em > acc.ultimoEm) acc.ultimoEm = n.em;
}
