/**
 * As regras do airdrop, num arquivo que o navegador também pode ler.
 *
 * ---------------------------------------------------------------------------
 * POR QUE SEPARADO DO RESTO
 * ---------------------------------------------------------------------------
 * A página precisa mostrar "quanto vale cada coisa" e o servidor precisa
 * CALCULAR com esses mesmos números. Se cada lado tivesse a sua cópia, um dia
 * a tabela na tela diria 200 pontos por moeda e o banco creditaria 150 — e
 * ninguém perceberia até alguém conferir na mão.
 *
 * Aqui não tem `server-only` nem import de banco de propósito: é só dado.
 *
 * ---------------------------------------------------------------------------
 * NENHUMA DATA, EM LUGAR NENHUM
 * ---------------------------------------------------------------------------
 * Decisão do produto: a temporada fica aberta enquanto fizer sentido. Anunciar
 * prazo cria dois problemas — quem chega perto do fim não começa, e quem já
 * está para de acumular no dia seguinte ao anúncio. Sem data, o incentivo não
 * tem prazo de validade.
 *
 * Isso tem uma contrapartida honesta, e ela está escrita na página: nada aqui
 * é promessa de token, de valor ou de data.
 */

export const TEMPORADA_ATUAL = 1;

/** Os jeitos de ganhar ponto. É o `tipo` de cada lançamento no livro-razão. */
export type TipoDePonto = "volume" | "moeda" | "indicacao" | "bug";

export interface Regra {
  tipo: TipoDePonto;
  titulo: string;
  /** Uma frase explicando o que a pessoa precisa fazer. */
  comoGanhar: string;
  /** O que aparece no cartão como valor: "1 pt / US$ 1". */
  valor: string;
  /** A letra miúda honesta: o limite, a condição, a pegadinha. */
  detalhe: string;
}

/* ------------------------------------------------------------------ */
/* Quanto vale cada coisa                                              */
/* ------------------------------------------------------------------ */

/** Um ponto por dólar negociado. Simples de entender e de conferir. */
export const PONTOS_POR_DOLAR = 1;

/** Moeda lançada aqui. Pontua na criação. */
export const PONTOS_POR_MOEDA = 200;

/**
 * Quantas moedas pontuam por temporada.
 *
 * Sem teto, criar moeda vira máquina de ponto: o custo de lançar é taxa de
 * rede, e alguém lançaria trezentas moedas vazias numa tarde. O limite deixa
 * o incentivo de pé pra quem lança de verdade e mata a fazenda.
 */
export const MOEDAS_QUE_PONTUAM = 5;

/**
 * Indicação. Só conta quando o indicado NEGOCIA.
 *
 * Pontuar por clique ou por cadastro seria pagar por carteira vazia, e criar
 * carteira em Solana é de graça. Exigir a primeira operação real amarra o
 * ponto a algo que custa dinheiro pra forjar.
 */
export const PONTOS_POR_INDICACAO = 300;

/**
 * Bug reportado, com aprovação MANUAL.
 *
 * É o único tipo que não é automático, e tem que ser assim: se o formulário
 * creditasse sozinho, o caminho mais rápido pro ponto seria mandar lixo em
 * série. Alguém lê, decide, e credita.
 */
export const PONTOS_POR_BUG = 500;

/* ------------------------------------------------------------------ */
/* O que a página mostra                                               */
/* ------------------------------------------------------------------ */

export const REGRAS: Regra[] = [
  {
    tipo: "volume",
    titulo: "Negocie",
    comoGanhar: "Compre e venda moedas pela Chroma",
    valor: `${PONTOS_POR_DOLAR} pt / US$ 1`,
    detalhe:
      "Contado pelo valor real da operação, conferido na blockchain. Compra e venda contam.",
  },
  {
    tipo: "moeda",
    titulo: "Lance moedas",
    comoGanhar: "Crie um token pela nossa launchpad",
    valor: `${PONTOS_POR_MOEDA} pts`,
    detalhe: `Vale para as suas primeiras ${MOEDAS_QUE_PONTUAM} moedas da temporada.`,
  },
  {
    tipo: "indicacao",
    titulo: "Traga gente",
    comoGanhar: "Compartilhe seu link e ganhe quando o indicado operar",
    valor: `${PONTOS_POR_INDICACAO} pts`,
    detalhe:
      "Creditado na primeira operação de quem você trouxe — e você segue ganhando 0,5% das taxas dele, sempre.",
  },
  {
    tipo: "bug",
    titulo: "Ache problemas",
    comoGanhar: "Reporte um bug ou uma falha de segurança",
    valor: `até ${PONTOS_POR_BUG} pts`,
    detalhe: "Revisado por uma pessoa antes de creditar. Achado de segurança vale mais.",
  },
];

/* ------------------------------------------------------------------ */
/* Contas                                                              */
/* ------------------------------------------------------------------ */

/**
 * Quantos pontos um volume em dólar vale.
 *
 * Arredonda pra baixo: operação de US$ 0,90 dá zero ponto, não "quase um". O
 * contrário abriria a porta pra mil operações de um centavo virarem mil
 * pontos — e em Solana mil operações de um centavo custam menos que um café.
 */
export function pontosDeVolume(volumeUsd: number): number {
  if (!Number.isFinite(volumeUsd) || volumeUsd <= 0) return 0;
  return Math.floor(volumeUsd * PONTOS_POR_DOLAR);
}

/** Os níveis existem pra dar progresso visível. Não prometem nada. */
export const NIVEIS = [
  { nome: "Prisma", minimo: 0 },
  { nome: "Quartzo", minimo: 500 },
  { nome: "Safira", minimo: 2_500 },
  { nome: "Espectro", minimo: 10_000 },
  { nome: "Cromo", minimo: 50_000 },
] as const;

export function nivelDe(pontos: number) {
  /*
   * O tipo é o do ELEMENTO, não o do primeiro item.
   *
   * Com `as const` em `NIVEIS`, `NIVEIS[0]` tem tipo literal `"Prisma"` — e
   * atribuir "Quartzo" a ele não compila. Anotar com o tipo do array inteiro
   * é o que permite a variável andar pelos níveis.
   */
  let atual: (typeof NIVEIS)[number] = NIVEIS[0];
  for (const n of NIVEIS) if (pontos >= n.minimo) atual = n;

  const proximo = NIVEIS.find((n) => n.minimo > pontos) ?? null;
  const base = atual.minimo;
  const alvo = proximo?.minimo ?? atual.minimo;

  return {
    atual: atual.nome,
    proximo: proximo?.nome ?? null,
    faltam: proximo ? proximo.minimo - pontos : 0,
    /* 0 a 1 dentro da faixa atual; cheio quando já está no topo. */
    progresso: proximo && alvo > base ? Math.min(1, (pontos - base) / (alvo - base)) : 1,
  };
}
