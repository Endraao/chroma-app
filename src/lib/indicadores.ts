/**
 * O catálogo de indicadores do gráfico.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO EXISTE
 * ---------------------------------------------------------------------------
 * A biblioteca traz 27 indicadores prontos, todos já dentro do pacote que o
 * navegador baixa. O site expunha 8 — os outros 19 estavam pagos, carregados e
 * desligados, sem botão que os alcançasse.
 *
 * E faltava o principal: dava pra LIGAR a média, não pra dizer QUAL média. A
 * MA vinha fixa em 5/10/30/60 porque é o padrão da biblioteca. Num terminal
 * de verdade a pessoa escolhe o período, e é justamente isso que separava o
 * nosso gráfico de um profissional — não o desenho da vela, a configuração.
 *
 * ---------------------------------------------------------------------------
 * POR QUE FICA FORA DO COMPONENTE
 * ---------------------------------------------------------------------------
 * `TradingChart.tsx` já passa de mil linhas. Catálogo é dado, não
 * comportamento: mora em arquivo próprio, e a tela que desenha o menu e o
 * componente que fala com a biblioteca leem a MESMA fonte. Sem isso, um
 * indicador novo precisaria ser lembrado em dois lugares — e não seria.
 */

/** Onde o indicador é desenhado. */
export type Painel = "velas" | "proprio";

export interface Parametro {
  /** O nome em português do que o número significa. */
  rotulo: string;
  padrao: number;
  /** Faixa aceita. Barra o 0 e o absurdo antes de chegar na biblioteca. */
  min: number;
  max: number;
}

export interface Indicador {
  chave: string;
  rotulo: string;
  /** Uma linha explicando pra que serve, pra quem não decorou a sigla. */
  nota: string;
  painel: Painel;
  parametros: Parametro[];
}

/** Atalho: a maioria dos parâmetros é um período em barras. */
const periodo = (rotulo: string, padrao: number, max = 400): Parametro => ({
  rotulo,
  padrao,
  min: 1,
  max,
});

/**
 * Os 27, em ordem de utilidade pra quem opera meme coin — não em ordem
 * alfabética. Média móvel e volume são o que 95% das pessoas liga; CR e BRAR
 * são para quem foi atrás deles de propósito. O menu segue esta ordem.
 */
export const CATALOGO: Indicador[] = [
  /* ---------------- Sobre as velas ---------------- */
  {
    chave: "MA",
    rotulo: "Média móvel simples",
    nota: "A média do preço nas últimas N barras",
    painel: "velas",
    parametros: [
      periodo("Período 1", 5),
      periodo("Período 2", 10),
      periodo("Período 3", 30),
      periodo("Período 4", 60),
    ],
  },
  {
    chave: "EMA",
    rotulo: "Média móvel exponencial",
    nota: "Como a simples, mas dá mais peso ao preço recente",
    painel: "velas",
    parametros: [periodo("Período 1", 6), periodo("Período 2", 12), periodo("Período 3", 20)],
  },
  {
    chave: "SMA",
    rotulo: "Média móvel suavizada",
    nota: "Média que reage mais devagar a solavanco",
    painel: "velas",
    parametros: [periodo("Período", 12), { rotulo: "Peso", padrao: 2, min: 1, max: 20 }],
  },
  {
    chave: "BOLL",
    rotulo: "Bandas de Bollinger",
    nota: "Um corredor em volta da média; preço fora dele é extremo",
    painel: "velas",
    parametros: [periodo("Período", 20), { rotulo: "Desvios", padrao: 2, min: 1, max: 10 }],
  },
  {
    chave: "BBI",
    rotulo: "Índice de médias múltiplas",
    nota: "Quatro médias condensadas numa linha só",
    painel: "velas",
    parametros: [
      periodo("Período 1", 3),
      periodo("Período 2", 6),
      periodo("Período 3", 12),
      periodo("Período 4", 24),
    ],
  },
  {
    chave: "SAR",
    rotulo: "Parabolic SAR",
    nota: "Pontos que marcam onde a tendência pode virar",
    painel: "velas",
    parametros: [
      { rotulo: "Início", padrao: 2, min: 1, max: 50 },
      { rotulo: "Passo", padrao: 2, min: 1, max: 50 },
      { rotulo: "Máximo", padrao: 20, min: 1, max: 100 },
    ],
  },
  {
    chave: "AVP",
    rotulo: "Preço médio por volume",
    nota: "O preço médio ponderado pelo volume negociado",
    painel: "velas",
    parametros: [],
  },

  /* ---------------- Painel próprio ---------------- */
  {
    chave: "VOL",
    rotulo: "Volume",
    nota: "Quanto foi negociado em cada barra",
    painel: "proprio",
    /*
     * Sem parâmetro, e é decisão, não esquecimento.
     *
     * A biblioteca calcula MA5/MA10/MA20 DO VOLUME por padrão e escreve as
     * três na legenda. Num gráfico de meme coin de um minuto isso é ruído
     * sobre ruído: três linhas tremendo por cima de barras que já tremem.
     *
     * Lista vazia aqui é o que apaga essas médias — é assim que o gráfico já
     * vinha se comportando, só que por um `if` especial no componente.
     */
    parametros: [],
  },
  {
    chave: "MACD",
    rotulo: "Convergência de médias",
    nota: "A distância entre duas médias; mede força da tendência",
    painel: "proprio",
    parametros: [periodo("Rápida", 12), periodo("Lenta", 26), periodo("Sinal", 9)],
  },
  {
    chave: "RSI",
    rotulo: "Índice de força relativa",
    nota: "De 0 a 100: acima de 70 é esticado, abaixo de 30 é castigado",
    painel: "proprio",
    parametros: [periodo("Período 1", 6), periodo("Período 2", 12), periodo("Período 3", 24)],
  },
  {
    chave: "KDJ",
    rotulo: "Estocástico KDJ",
    nota: "Onde o preço fechou dentro da faixa recente",
    painel: "proprio",
    parametros: [periodo("Período", 9), periodo("Suavização K", 3), periodo("Suavização D", 3)],
  },
  {
    chave: "WR",
    rotulo: "Williams %R",
    nota: "Parecido com o estocástico, escala invertida",
    painel: "proprio",
    parametros: [periodo("Período 1", 6), periodo("Período 2", 10), periodo("Período 3", 14)],
  },
  {
    chave: "CCI",
    rotulo: "Canal de commodities",
    nota: "Quanto o preço se afastou da própria média",
    painel: "proprio",
    parametros: [periodo("Período", 20)],
  },
  {
    chave: "BIAS",
    rotulo: "Desvio da média",
    nota: "Em % , o quanto o preço está longe da média",
    painel: "proprio",
    parametros: [periodo("Período 1", 6), periodo("Período 2", 12), periodo("Período 3", 24)],
  },
  {
    chave: "MTM",
    rotulo: "Momento",
    nota: "A velocidade da variação do preço",
    painel: "proprio",
    parametros: [periodo("Período", 12), periodo("Média", 6)],
  },
  {
    chave: "ROC",
    rotulo: "Taxa de variação",
    nota: "Quanto o preço mudou, em %, contra N barras atrás",
    painel: "proprio",
    parametros: [periodo("Período", 12), periodo("Média", 6)],
  },
  {
    chave: "TRIX",
    rotulo: "Média tripla suavizada",
    nota: "Filtra ruído de curto prazo; bom pra tendência longa",
    painel: "proprio",
    parametros: [periodo("Período", 12), periodo("Sinal", 9)],
  },
  {
    chave: "DMI",
    rotulo: "Índice direcional",
    nota: "Diz se existe tendência, e para que lado",
    painel: "proprio",
    parametros: [periodo("Período", 14), periodo("Suavização", 6)],
  },
  {
    chave: "DMA",
    rotulo: "Diferença de médias",
    nota: "A distância entre uma média curta e uma longa",
    painel: "proprio",
    parametros: [periodo("Curta", 10), periodo("Longa", 50), periodo("Sinal", 10)],
  },
  {
    chave: "OBV",
    rotulo: "Volume acumulado",
    nota: "Soma volume na alta e subtrai na baixa",
    painel: "proprio",
    parametros: [periodo("Média", 30)],
  },
  {
    chave: "PVT",
    rotulo: "Volume x variação",
    nota: "Como o volume acumulado, mas ponderado pela variação",
    painel: "proprio",
    parametros: [],
  },
  {
    chave: "VR",
    rotulo: "Índice de volume",
    nota: "Proporção entre volume de alta e de baixa",
    painel: "proprio",
    parametros: [periodo("Período", 26), periodo("Média", 6)],
  },
  {
    chave: "EMV",
    rotulo: "Facilidade de movimento",
    nota: "Quanto volume foi preciso pra mover o preço",
    painel: "proprio",
    parametros: [periodo("Período", 14), periodo("Média", 9)],
  },
  {
    chave: "PSY",
    rotulo: "Linha psicológica",
    nota: "Em quantas das últimas N barras o preço subiu",
    painel: "proprio",
    parametros: [periodo("Período", 12), periodo("Média", 6)],
  },
  {
    chave: "AO",
    rotulo: "Oscilador incrível",
    nota: "Duas médias do ponto médio da barra, uma contra a outra",
    painel: "proprio",
    parametros: [periodo("Rápida", 5), periodo("Lenta", 34)],
  },
  {
    chave: "BRAR",
    rotulo: "Índice de energia",
    nota: "Compara a força de compradores e vendedores",
    painel: "proprio",
    parametros: [periodo("Período", 26)],
  },
  {
    chave: "CR",
    rotulo: "Índice de intermediação",
    nota: "Energia do mercado com quatro janelas de média",
    painel: "proprio",
    parametros: [
      periodo("Período", 26),
      periodo("Média 1", 10),
      periodo("Média 2", 20),
      periodo("Média 3", 40),
      periodo("Média 4", 60),
    ],
  },
];

/** Busca rápida por chave, montada uma vez. */
export const POR_CHAVE = new Map(CATALOGO.map((i) => [i.chave, i]));

export const SOBRE_AS_VELAS = CATALOGO.filter((i) => i.painel === "velas");
export const EM_PAINEL_PROPRIO = CATALOGO.filter((i) => i.painel === "proprio");

/** Os valores de fábrica de um indicador, na ordem que a biblioteca espera. */
export function parametrosPadrao(chave: string): number[] {
  return POR_CHAVE.get(chave)?.parametros.map((p) => p.padrao) ?? [];
}

/**
 * Um valor digitado virando número que a biblioteca aceita.
 *
 * Período 0 faz a biblioteca dividir por zero e o indicador some do gráfico
 * sem erro nenhum no console — o tipo de defeito que a pessoa interpreta como
 * "o site quebrou". Prende na faixa em vez de confiar no `min` do `<input>`,
 * que só vale pra setinha e não pra quem digita.
 */
export function prender(valor: number, p: Parametro): number {
  if (!Number.isFinite(valor)) return p.padrao;
  return Math.min(p.max, Math.max(p.min, Math.round(valor)));
}
