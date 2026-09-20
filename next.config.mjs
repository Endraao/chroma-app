import { cabecalhosDeSeguranca } from "./src/lib/security-headers.mjs";

const emDesenvolvimento = process.env.NODE_ENV !== "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /*
   * Não anuncia qual servidor e qual versão está rodando.
   *
   * Sozinho não protege de nada, mas entregar "Next.js" de graça poupa ao
   * atacante o trabalho de descobrir quais falhas conhecidas testar primeiro.
   */
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: cabecalhosDeSeguranca({ desenvolvimento: emDesenvolvimento }) }];
  },
  // Ver scripts/build.mjs: separa os artefatos de dev e de produção.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  /*
   * Otimização de imagem DESLIGADA, de propósito.
   *
   * Com `remotePatterns` aberto em `**`, o otimizador do Next aceitava buscar
   * qualquer endereço https que aparecesse numa URL — e quem busca é o NOSSO
   * servidor. Isso é um proxy aberto: dá pra usar a Chroma pra varrer a rede
   * interna de onde ela estiver hospedada, e há aviso de segurança publicado
   * justamente sobre essa configuração.
   *
   * A arte das moedas vem de endereço que o criador escolheu, então não existe
   * lista de domínios confiáveis pra montar. Servir a imagem direto, sem passar
   * pelo nosso servidor, remove o problema inteiro — e é o que as tags <img>
   * deste projeto já fazem.
   */
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    // Alguns pacotes Solana esperam módulos de Node que não existem no browser.
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, net: false, tls: false };

    // O barrel "wagmi/connectors" arrasta o conector baseAccount, que puxa
    // @coinbase/cdp-sdk, que importa pacotes @x402/* que não são publicados.
    // Nada disso é usado aqui (só usamos carteiras injetadas), então
    // apontamos esses imports pra vazio em vez de quebrar o build.
    config.resolve.alias = {
      ...config.resolve.alias,
      '@x402/core/client': false,
      '@x402/svm/exact/client': false,
      '@x402/evm': false,
      // Logger opcional do WalletConnect: só existe em dev, não precisa no bundle.
      'pino-pretty': false,
      // Dependência React Native do SDK da MetaMask; não existe no browser.
      '@react-native-async-storage/async-storage': false,
    };
    return config;
  },
};

export default nextConfig;
