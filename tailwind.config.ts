import type { Config } from "tailwindcss";

/**
 * Tema Chroma.
 * Regra de ouro: o fundo é preto/grafite absoluto. A "refração" (arco-íris)
 * aparece SÓ em acentos — bordas, hover, botões de comprar/vender, badges.
 */
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Superfícies (do mais fundo pro mais alto)
        ink: {
          950: "#06070a", // fundo absoluto da página
          900: "#0a0c11", // cards
          800: "#11141b", // cards elevados / inputs
          700: "#1a1e28", // bordas fortes
          600: "#262b38", // divisórias
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
        // Semântica de trading / segurança
        bull: "#22c55e",
        bear: "#ef4444",
        warn: "#f59e0b",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      backgroundImage: {
        // Gradiente de refração, usado com parcimônia
        "chroma-gradient":
          "linear-gradient(100deg, #8b5cf6 0%, #6366f1 28%, #22d3ee 62%, #34d399 100%)",
        // Borda de vidro: usado em ::before com mask
        "chroma-edge":
          "linear-gradient(140deg, rgba(139,92,246,.55), rgba(34,211,238,.35) 45%, rgba(52,211,153,.25) 100%)",
        "grid-faint":
          "linear-gradient(rgba(255,255,255,.028) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.028) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "44px 44px",
      },
      boxShadow: {
        glass: "0 1px 0 0 rgba(255,255,255,.04) inset, 0 20px 60px -30px rgba(0,0,0,.9)",
        "glow-violet": "0 0 0 1px rgba(139,92,246,.25), 0 8px 40px -12px rgba(139,92,246,.45)",
        "glow-bull": "0 0 0 1px rgba(34,197,94,.25), 0 8px 40px -12px rgba(34,197,94,.45)",
        "glow-bear": "0 0 0 1px rgba(239,68,68,.25), 0 8px 40px -12px rgba(239,68,68,.45)",
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
