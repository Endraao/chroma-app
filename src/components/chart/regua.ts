import { registerOverlay } from "klinecharts";

/**
 * A régua: mede a variação entre dois pontos do gráfico.
 *
 * ---------------------------------------------------------------------------
 * POR QUE PRECISOU SER ESCRITA
 * ---------------------------------------------------------------------------
 * O TradingView tem esta ferramenta e a biblioteca que usamos não. Sem ela, a
 * barra teria um buraco no meio — e é uma das que mais se usa: arrastar de um
 * fundo até um topo pra ver de quanto foi o movimento é o gesto mais comum de
 * quem olha gráfico.
 *
 * A biblioteca deixa registrar ferramenta própria, então é isso: dois pontos,
 * um retângulo entre eles e a conta escrita em cima.
 *
 * ---------------------------------------------------------------------------
 * A COR SEGUE A DIREÇÃO
 * ---------------------------------------------------------------------------
 * Verde medindo pra cima, vermelho pra baixo — a mesma leitura das velas. Uma
 * cor só obrigaria a ler o sinal do número pra saber o que aconteceu.
 */

const VERDE = "#089981";
const VERMELHO = "#F23645";

const NOME = "chroma-regua";

export function registrarRegua() {
  registerOverlay({
    name: NOME,
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,

    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return [];

      const [a, b] = coordinates;
      const pontos = overlay.points ?? [];

      const de = Number(pontos[0]?.value ?? 0);
      const para = Number(pontos[1]?.value ?? 0);

      const variacao = para - de;
      const pct = de !== 0 ? (variacao / de) * 100 : 0;
      const subindo = variacao >= 0;
      const cor = subindo ? VERDE : VERMELHO;

      /*
       * Quantas velas o trecho cobre. É a outra metade da pergunta: "subiu
       * quanto" sem "em quanto tempo" não diz se foi um tranco ou uma subida
       * lenta.
       */
      const barras = Math.abs(
        Number(pontos[1]?.dataIndex ?? 0) - Number(pontos[0]?.dataIndex ?? 0),
      );

      const esquerda = Math.min(a.x, b.x);
      const largura = Math.abs(b.x - a.x);
      const topo = Math.min(a.y, b.y);
      const altura = Math.abs(b.y - a.y);

      const texto = `${subindo ? "+" : ""}${pct.toFixed(2).replace(".", ",")}%  ·  ${barras} ${
        barras === 1 ? "vela" : "velas"
      }`;

      return [
        {
          type: "rect",
          attrs: { x: esquerda, y: topo, width: largura, height: altura },
          styles: {
            style: "stroke_fill",
            color: subindo ? "rgba(8,153,129,.14)" : "rgba(242,54,69,.14)",
            borderColor: cor,
            borderSize: 1,
          },
        },
        {
          type: "line",
          attrs: { coordinates: [a, b] },
          styles: { color: cor, size: 1, style: "dashed" },
        },
        {
          type: "text",
          attrs: {
            x: esquerda + largura / 2,
            /* Acima do retângulo, com uma folga: em cima da borda fica ilegível. */
            y: topo - 6,
            text: texto,
            align: "center",
            baseline: "bottom",
          },
          styles: {
            color: "#ffffff",
            size: 11,
            family: "inherit",
            paddingLeft: 6,
            paddingRight: 6,
            paddingTop: 3,
            paddingBottom: 3,
            borderRadius: 3,
            backgroundColor: cor,
          },
        },
      ];
    },
  });
}

export const NOME_DA_REGUA = NOME;
