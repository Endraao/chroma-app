/**
 * Cabeçalhos de segurança do site.
 *
 * ---------------------------------------------------------------------------
 * POR QUE UM SITE DE CRIPTO PRECISA DISTO MAIS DO QUE OS OUTROS
 * ---------------------------------------------------------------------------
 * Num site comum, script injetado rouba sessão. Aqui ele reescreve a
 * TRANSAÇÃO antes de a carteira assinar: a pessoa lê "comprar 1 SOL de GATO",
 * aprova, e assina uma transferência da carteira inteira. A carteira mostra o
 * que recebeu; quem monta o que ela recebe é esta página.
 *
 * Ou seja: qualquer execução de código arbitrário aqui dentro vale o saldo de
 * quem estiver conectado. É por isso que a política abaixo é restritiva a
 * ponto de ser chata, e por isso que `connect-src` lista destino por destino
 * em vez de liberar `https:`.
 *
 * Fica em `.mjs` puro porque o `next.config.mjs` precisa importar, e ele roda
 * antes de qualquer transpilação de TypeScript.
 */

/**
 * De onde o navegador pode BUSCAR dados.
 *
 * Esta é a lista que impede exfiltração: mesmo que alguém consiga injetar
 * script, ele não consegue mandar o que roubou pra um servidor que não esteja
 * aqui. Adicionar destino aqui é decisão de segurança, não de conveniência.
 */
/** Só a ORIGEM (protocolo + domínio) do RPC configurado — nunca o caminho com a chave. */
function origensDoRpc() {
  const saida = [];
  for (const url of [process.env.NEXT_PUBLIC_SOLANA_RPC, process.env.NEXT_PUBLIC_SOLANA_WS]) {
    try {
      if (!url) continue;
      const u = new URL(url);
      saida.push(`${u.protocol}//${u.host}`);
      if (u.protocol === "https:") saida.push(`wss://${u.host}`);
    } catch {
      /* URL inválida: ignora */
    }
  }
  return saida;
}

const DESTINOS_DE_DADOS = [
  "'self'",

  // Preço e pares — mercado
  "https://api.dexscreener.com",
  "https://api.geckoterminal.com",

  // Rotas de swap e metadados de token
  "https://lite-api.jup.ag",
  "https://quote-api.jup.ag",

  // Auditoria de contrato
  "https://api.gopluslabs.io",

  // Saque privado do criador (Cloak): o envio do saque e os circuitos da prova ZK.
  "https://api.cloak.ag",
  "https://storage.googleapis.com/cloak-circuits/",

  // Nós da Solana, inclusive o canal de tempo real
  "https://*.helius-rpc.com",
  "wss://*.helius-rpc.com",
  // RPC Fast (plano Focus, 07/10/2026) — e, por segurança, a origem exata
  // do RPC/WebSocket configurados na Vercel, seja qual for o provedor.
  "https://*.rpcfast.com",
  "wss://*.rpcfast.com",
  ...origensDoRpc(),
  "https://api.mainnet-beta.solana.com",
  "wss://api.mainnet-beta.solana.com",
  "https://api.devnet.solana.com",
  "wss://api.devnet.solana.com",

  /*
   * O nó da Robinhood NÃO entra aqui de propósito. O navegador fala com a
   * nossa ponte (`/api/rpc/robinhood`, coberta por 'self'), e é o servidor
   * que fala com o nó. Um destino a menos nesta lista é um destino a menos
   * pra onde um script injetado poderia mandar dado.
   */

  /*
   * As carteiras conversam com os próprios servidores por aqui. Sem estas
   * entradas a conexão simplesmente não fecha — e um site de cripto onde a
   * carteira não conecta não é seguro, é inútil.
   */
  "https://*.walletconnect.com",
  "https://*.walletconnect.org",
  "wss://*.walletconnect.com",
  "wss://*.walletconnect.org",
  "https://*.phantom.app",
  "https://*.solflare.com",
];

/**
 * A política de conteúdo.
 *
 * `'unsafe-inline'` em `script-src` é uma concessão real e vale explicar: o
 * Next injeta scripts inline de hidratação sem nonce na configuração atual.
 * Trocar por nonce exige middleware e uma migração do framework — está na
 * lista do que falta. Enquanto isso, `connect-src` fechado continua impedindo
 * que qualquer coisa injetada MANDE o resultado pra fora, que é o passo sem o
 * qual o roubo não se completa.
 */
/**
 * Quem pode nos mostrar dentro de um iframe — SÓ a página de negociar dentro
 * do post (/p/…, o "player card" do X, 07/10/2026). Toda transação ainda pede
 * aprovação na carteira, que abre a janela dela por cima de tudo.
 */
const PODEM_EMBUTIR = ["https://x.com", "https://*.x.com", "https://twitter.com", "https://*.twitter.com", "https://web.telegram.org"];

function politicaDeConteudo({ desenvolvimento, embutivel = false }) {
  const regras = [
    ["default-src", ["'self'"]],

    [
      "script-src",
      [
        "'self'",
        "'unsafe-inline'",
        // WebAssembly e só ele (não libera eval): a prova ZK do saque privado (Cloak).
        "'wasm-unsafe-eval'",
        // O recarregamento automático do modo de desenvolvimento usa eval.
        ...(desenvolvimento ? ["'unsafe-eval'"] : []),
      ],
    ],

    /*
     * A folha do Google Fonts precisa constar aqui, e só ela.
     *
     * Liberar `https:` inteiro em style-src seria bem pior do que parece:
     * CSS consegue exfiltrar dado por seletor de atributo, então uma folha de
     * origem arbitrária lê o que está escrito na página.
     */
    ["style-src", ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"]],

    // Arte de moeda vem de onde o criador hospedou; `img-src` largo é aceitável
    // porque imagem não executa. `data:` é usado pelos avatares gerados.
    ["img-src", ["'self'", "data:", "blob:", "https:"]],
    ["media-src", ["'self'", "data:", "blob:", "https:"]],

    ["font-src", ["'self'", "data:", "https://fonts.gstatic.com"]],
    ["connect-src", desenvolvimento ? [...DESTINOS_DE_DADOS, "ws://localhost:*", "http://localhost:*"] : DESTINOS_DE_DADOS],

    // Nada de plugin, nada de <base> reescrito, formulário só pra cá.
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],

    /*
     * Ninguém pode nos colocar dentro de um iframe.
     *
     * É o que impede clickjacking: um site falso carrega a Chroma invisível
     * por cima de um botão qualquer, e o clique da pessoa vira aprovação de
     * transação na nossa página.
     */
    ["frame-ancestors", embutivel ? ["'self'", ...PODEM_EMBUTIR] : ["'none'"]],

    // As carteiras abrem janela própria; frame só de origem conhecida.
    ["frame-src", ["'self'", "https://*.walletconnect.com", "https://*.walletconnect.org"]],

    ["worker-src", ["'self'", "blob:"]],
  ];

  if (!desenvolvimento) regras.push(["upgrade-insecure-requests", []]);

  return regras
    .map(([nome, valores]) => (valores.length ? `${nome} ${valores.join(" ")}` : nome))
    .join("; ");
}

/**
 * Os cabeçalhos aplicados a todas as páginas.
 *
 * @param desenvolvimento afrouxa só o necessário pro modo de desenvolvimento
 * funcionar (eval do recarregamento automático e o websocket do localhost).
 */
export function cabecalhosDeSeguranca({ desenvolvimento = false, embutivel = false } = {}) {
  const cabecalhos = [
    {
      key: "Content-Security-Policy",
      value: politicaDeConteudo({ desenvolvimento, embutivel }),
    },
    // Redundante com frame-ancestors, mas navegador velho só entende este.
    // A página embutível não leva (ele não tem como listar o X).
    ...(embutivel ? [] : [{ key: "X-Frame-Options", value: "DENY" }]),
    {
      // Impede o navegador de adivinhar o tipo do conteúdo e executar o que
      // deveria ser dado. Ver também a rota de mídia, que repete isto.
      key: "X-Content-Type-Options",
      value: "nosniff",
    },
    {
      /*
       * Não vaza a URL da nossa página pra outros sites.
       *
       * Importa aqui porque nossos endereços carregam informação: sair de
       * `/token/<endereço>` pra um link externo contaria pro destino qual moeda
       * a pessoa estava olhando.
       */
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
    {
      // Nada de câmera, microfone, localização ou pagamento do navegador.
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    },
    {
      // Isola a janela: impede que outra aba com referência a esta a manipule.
      key: "Cross-Origin-Opener-Policy",
      value: "same-origin-allow-popups",
    },
  ];

  /*
   * HSTS só em produção. Em desenvolvimento o site é http://localhost, e
   * mandar o navegador exigir https no localhost trava o ambiente inteiro —
   * inclusive depois, porque o navegador memoriza.
   */
  if (!desenvolvimento) {
    cabecalhos.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }

  return cabecalhos;
}
