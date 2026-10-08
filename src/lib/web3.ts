import { clusterApiUrl } from "@solana/web3.js";
import { http, createConfig } from "wagmi";
import { defineChain } from "viem";
import { injected } from "wagmi/connectors";
import type { ChainId } from "./types";

/* ------------------------------------------------------------------ */
/* Solana                                                              */
/* ------------------------------------------------------------------ */

/**
 * RPC público do Solana responde 403 pra chamadas vindas do browser.
 * Sem um RPC dedicado (Helius, QuickNode, Triton) em NEXT_PUBLIC_SOLANA_RPC,
 * o app lê preço e gráfico pelo servidor mas não consegue enviar transação.
 */
export const SOLANA_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC || clusterApiUrl("mainnet-beta");
/**
 * WebSocket (confirmação de transação). O plano do RPC Fast aceita só UMA
 * assinatura ao mesmo tempo pro site inteiro (07/10/2026): a dos visitantes era
 * recusada e a confirmação podia travar. Com RPC Fast — no WebSocket ou no
 * HTTPS, de onde o web3.js deriva o WebSocket — vai o público da Solana.
 */
const WS_CONFIGURADO = process.env.NEXT_PUBLIC_SOLANA_WS || "";
const RPC_FAST = (url: string) => url.includes("rpcfast.com");
export const SOLANA_WS =
  WS_CONFIGURADO && !RPC_FAST(WS_CONFIGURADO)
    ? WS_CONFIGURADO
    : RPC_FAST(WS_CONFIGURADO) || RPC_FAST(SOLANA_RPC)
      ? "wss://api.mainnet-beta.solana.com"
      : undefined;

/** Carteira da plataforma que recebe a parte fixa da taxa (Solana). */
export const PLATFORM_FEE_WALLET_SOL = process.env.NEXT_PUBLIC_PLATFORM_FEE_WALLET_SOL || "";

/* ------------------------------------------------------------------ */
/* Robinhood Chain                                                     */
/* ------------------------------------------------------------------ */

/**
 * Robinhood Chain: L2 Arbitrum sobre Ethereum, gás em ETH, chain id 4663.
 * Ainda não vem em `viem/chains`, então é definida aqui.
 *
 * O RPC público não tem SLA e é limitado — para produção a documentação da
 * Robinhood recomenda Alchemy (`NEXT_PUBLIC_ROBINHOOD_RPC`).
 */
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
});

/** Carteira da plataforma que recebe a parte fixa da taxa (EVM). */
export const PLATFORM_FEE_WALLET_EVM = process.env.NEXT_PUBLIC_PLATFORM_FEE_WALLET_EVM || "";

/* ------------------------------------------------------------------ */
/* wagmi                                                               */
/* ------------------------------------------------------------------ */

export const wagmiConfig = createConfig({
  chains: [robinhoodChain],
  /*
   * Só `injected`. O conector do SDK da MetaMask foi removido de propósito:
   * ele aparece na lista mesmo sem a extensão instalada, e a tela acabava
   * dizendo "detectada" pra uma carteira que a pessoa não tem.
   *
   * `injected` combinado com a descoberta EIP-6963 (ligada por padrão no
   * wagmi) lista exatamente as carteiras presentes — e cada uma se anuncia
   * com o próprio nome e o próprio logo, igual ao Wallet Standard da Solana.
   */
  connectors: [injected({ shimDisconnect: true })],
  /*
   * As leituras passam pela nossa ponte, não pelo nó direto.
   *
   * Motivo imediato: o nó público já devolveu o cabeçalho de CORS duplicado
   * (`*,*`), e o navegador recusa — quando acontece, some o saldo, some o
   * preço e some a rede da tela, tudo de uma vez.
   *
   * Motivo de fundo: o endereço do nó deixa de morar no código que roda no
   * navegador. Trocar de provedor vira variável de ambiente no servidor, e
   * ninguém consegue apontar a nossa página pra um nó de mentira.
   *
   * ENVIAR transação continua fora daqui: isso é a carteira falando direto com
   * a rede, e é o que mantém a plataforma não-custodial.
   */
  transports: {
    [robinhoodChain.id]: http("/api/rpc/robinhood"),
  },
  ssr: true,
});

/* ------------------------------------------------------------------ */
/* Metadados das redes suportadas                                      */
/* ------------------------------------------------------------------ */

export const CHAINS: Record<
  ChainId,
  {
    label: string;
    kind: "solana" | "evm";
    nativeSymbol: string;
    explorer: string;
    accent: string;
    /** id da rede na GeckoTerminal (velas do gráfico) */
    gecko: string;
    /** id da rede na Dexscreener */
    dexscreener: string;
  }
> = {
  /*
   * A ORDEM AQUI É A ORDEM DA INTERFACE.
   *
   * `CHAIN_IDS` sai daqui, e com ele o seletor de rede, as abas do feed e as
   * seções da página de taxas. A Robinhood vem primeiro porque é onde o
   * launchpad funciona: é lá que dá pra criar moeda, e criar moeda é o que
   * esta plataforma faz de diferente.
   */
  solana: {
    label: "Solana",
    kind: "solana",
    nativeSymbol: "SOL",
    explorer: "https://solscan.io/token/",
    accent: "text-chroma-violet",
    gecko: "solana",
    dexscreener: "solana",
  },
  robinhood: {
    label: "Robinhood Chain",
    kind: "evm",
    nativeSymbol: "ETH",
    explorer: "https://robinhoodchain.blockscout.com/token/",
    accent: "text-chroma-mint",
    gecko: "robinhood",
    dexscreener: "robinhood",
  },
};

export const CHAIN_IDS = Object.keys(CHAINS) as ChainId[];

/**
 * A rede que o site abre quando ninguém pediu outra.
 *
 * Escrita UMA vez, em vez de `"robinhood"` repetido na home, no seletor e no
 * formulário de criar. Espalhada, trocar a rede principal exigiria achar todas
 * as cópias — e a que ficasse pra trás abriria numa rede diferente das demais,
 * sem ninguém notar até alguém reclamar.
 */
// Solana desde 05/10/2026: é onde vivem a Curva da Chroma e a promoção do criador.
export const REDE_PADRAO: ChainId = "solana";

/**
 * Dá pra LANÇAR moeda pela Chroma nesta rede?
 *
 * Hoje só na Robinhood. Na Solana o programa da curva ainda não está publicado,
 * então a moeda nem chega a ser criada — negociar funciona nas duas, criar não.
 *
 * Quem consome usa isto pra explicar o que falta, em vez de oferecer um botão
 * que montaria transação para um programa inexistente.
 */
export function podeLancarNaRede(chain: ChainId): boolean {
  // Solana: pela pump.fun (ver src/lib/pumpfun.ts). Robinhood: curva própria.
  return chain === "robinhood" || chain === "solana";
}

/**
 * Chain ids que a GoPlus usa nas rotas EVM.
 *
 * A Robinhood Chain (4663) ainda NÃO é coberta pela GoPlus. Em vez de
 * inventar um resultado, o painel de segurança avisa que a auditoria
 * automática não está disponível nessa rede.
 */
export const GOPLUS_CHAIN_ID: Partial<Record<ChainId, string>> = {};
