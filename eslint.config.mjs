import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/**
 * Configuração do ESLint 9, no formato "flat".
 *
 * O `eslint-config-next` 16 já vem nesse formato, então é só espalhar o que
 * ele exporta — nada de camada de compatibilidade.
 */
export default [
  {
    /*
     * Arquivos gerados por script não são revisados à mão: quem manda neles é
     * o gerador. Apontar estilo aqui só criaria ruído que ninguém pode
     * consertar sem mexer no script que os produz.
     */
    ignores: [
      "src/lib/wallet-catalog.ts",
      "src/lib/pair-icons.ts",
      ".next/**",
      ".next-prod/**",
      "node_modules/**",
      "target/**",
    ],
  },

  ...nextCoreWebVitals,

  {
    rules: {
      /*
       * As artes de moeda vêm de endereços que os criadores escolheram, e o
       * otimizador de imagens do Next está desligado de propósito — ver
       * `next.config.mjs`. Sem otimizador, `next/image` não traz vantagem e
       * ainda exigiria uma lista de domínios permitidos que não dá pra montar.
       */
      "@next/next/no-img-element": "off",

      /*
       * Aviso, não erro — e de propósito.
       *
       * Regra nova que chegou com o React 19. Ela aponta `setState` dentro de
       * efeito, que de fato causa uma renderização a mais. Só que 22 das
       * ocorrências aqui são o padrão documentado de "ler algo que só existe no
       * navegador depois de montar" (localStorage, `window`, estado da
       * carteira) — necessário justamente para o servidor e o cliente
       * renderizarem a mesma coisa.
       *
       * Transformar isso em erro logo depois de uma migração grande travaria
       * o lint inteiro por um problema de desempenho, não de correção.
       * Desligar esconderia uma dívida real. Fica como aviso: aparece, incomoda
       * e vai sendo pago.
       */
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];
