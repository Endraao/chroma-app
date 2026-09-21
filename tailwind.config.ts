import type { Config } from "tailwindcss";

/**
 * A linguagem visual da Chroma.
 *
 * ---------------------------------------------------------------------------
 * O QUE MUDOU, E POR QUÊ
 * ---------------------------------------------------------------------------
 * A primeira versão tinha vidro fosco, canto de 16px, sombra difusa e um
 * gradiente violeta no título. Cada uma dessas coisas isolada é defensável;
 * juntas são a receita da landing page genérica — e o site parecia feito por
 * máquina porque parecia todos os outros.
 *
 * A direção agora é TERMINAL: fundo quase preto, borda de 1px que dá pra ver,
 * canto duro, informação densa. É o que um launchpad de meme coin é na prática
 * — uma tela cheia de número que muda sozinho, não um folheto.
 *
 * O espectro da marca (o nome é Chroma) continua, mas como ASSINATURA: a logo,
 * a barra de progresso da curva, um fio de 1px. Espalhado em título e botão,
 * ele vira justamente o clichê do qual estamos saindo.
 */
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        /*
         * Superfícies quase pretas.
         *
         * Mais escuras que antes de propósito: num terminal a cor tem que vir
         * do DADO — o verde, o vermelho, o ciano da marca. Fundo cinza-azulado
         * rouba contraste de tudo que importa.
         */
        ink: {
          950: "#08090b", // fundo da página
          900: "#0d0e12", // cartões
          800: "#131419", // cartões elevados, campos
          700: "#1c1e25", // bordas
          600: "#282b34", // divisórias e bordas em destaque
        },
        // Acentos Chroma (refração de luz)
        chroma: {
          violet: "#8b5cf6",
          indigo: "#6366f1",
          cyan: "#22d3ee",
          mint: "#34d399",
          amber: "#fbbf24",
          rose: "#fb7185",
        },
        /*
         * O acento de trabalho é o CIANO, não o violeta.
         *
         * Violeta é a cor da apresentação de startup: está em todo lugar e
         * carrega essa leitura junto. O ciano lê como terminal, contrasta com o
         * verde e o vermelho do mercado sem competir com eles, e já era da
         * paleta da marca.
         */
        marca: {
          DEFAULT: "#22d3ee",
          forte: "#06b6d4",
        },
        // Semântica de trading / segurança
        bull: "#00d18f",
        bear: "#ff4d5e",
        warn: "#f5a524",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        /*
         * Cantos duros. O arredondado de 16px é o que dá ar de "cartãozinho";
         * 4 a 8px lê como painel de operação.
         */
        DEFAULT: "4px",
        md: "5px",
        lg: "6px",
        xl: "8px",
        "2xl": "10px",
      },
      backgroundImage: {
        // Gradiente de refração: logo e barra de progresso da curva, só.
        "chroma-gradient":
          "linear-gradient(100deg, #8b5cf6 0%, #6366f1 28%, #22d3ee 62%, #34d399 100%)",
        "grid-faint":
          "linear-gradient(rgba(255,255,255,.022) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.022) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "48px 48px",
      },
      boxShadow: {
        /* Sombra de camada, não de brilho: menor e mais dura. */
        painel: "0 10px 30px -12px rgba(0,0,0,.85)",
        "glow-bull": "0 0 0 1px rgba(0,209,143,.35)",
        "glow-bear": "0 0 0 1px rgba(255,77,94,.35)",
      },
      letterSpacing: {
        /* Os rótulos minúsculos em caixa alta, que dão o tom de terminal. */
        rotulo: "0.09em",
      },
      keyframes: {
        "chroma-pan": {
          "0%,100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "pulse-dot": {
          "0%,100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: ".35", transform: "scale(.85)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "chroma-pan": "chroma-pan 8s ease-in-out infinite",
        "pulse-dot": "pulse-dot 1.6s ease-in-out infinite",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
