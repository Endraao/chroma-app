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
    return [
      // Tudo, MENOS /p/…: ninguém nos coloca em iframe.
      { source: "/:path((?!p/).*)", headers: cabecalhosDeSeguranca({ desenvolvimento: emDesenvolvimento }) },
      // /p/…: a negociação dentro do post do X (player card) — só o X pode embutir.
      { source: "/p/:path*", headers: cabecalhosDeSeguranca({ desenvolvimento: emDesenvolvimento, embutivel: true }) },
    ];
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
  /*
   * LIGADO DE NOVO, MAS SÓ PARA IMAGENS DO PRÓPRIO SITE (28/09/2026).
   *
   * `remotePatterns` continua VAZIO: o otimizador não busca nenhum endereço
   * de fora, então o problema de proxy aberto descrito acima não volta. O
   * ganho que motivou religar é o que sai de `/api/logo/` — arte lida do contrato da moeda, que
   * chega do IPFS com centenas de KB e aparece num quadrado de 200 px.
   */
  images: {
    /* Só imagem do próprio site (logo, ícones e /api/logo). Nada de fora. */
    remotePatterns: [],
    formats: ["image/webp"],
    /*
     * O avatar de iniciais que /api/logo gera é SVG. SVG de TERCEIRO nunca
     * chega aqui (a rota recusa, e remotePatterns está vazio); mesmo assim
     * ele sai com a política que o Next recomenda: sem script, em sandbox.
     */
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    minimumCacheTTL: 31536000,
  },
  turbopack: {},
};

export default nextConfig;
