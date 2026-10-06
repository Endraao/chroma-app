import type { Idioma } from "@/lib/idiomas";

/**
 * Erro cru da carteira/rede → frase que a pessoa entende, no idioma do site.
 *
 * As carteiras (MetaMask, Backpack, Phantom) e o viem devolvem mensagens
 * técnicas em inglês — "The total cost (gas * gas fee + value) of executing
 * this transaction exceeds the balance of the account" — e o site mostrava
 * isso como estava, mesmo em português (05/10/2026).
 *
 * Recusa na carteira não é erro: devolve null (não mostra nada em vermelho).
 */
const FRASES = {
  saldo: {
    pt: "Saldo insuficiente pra essa operação (contando a taxa de rede).",
    en: "Not enough balance for this trade (including the network fee).",
    zh: "余额不足，无法完成此交易（含网络费）。",
  },
  rede: {
    pt: "Sua carteira está em outra rede. Troque pra rede certa na carteira e tente de novo.",
    en: "Your wallet is on a different network. Switch networks in your wallet and try again.",
    zh: "你的钱包处于其他网络。请在钱包中切换网络后重试。",
  },
  preco: {
    pt: "O preço mudou antes da confirmação. Aumente o slippage ou tente de novo.",
    en: "The price moved before confirmation. Raise the slippage or try again.",
    zh: "确认前价格已变动。请提高滑点或重试。",
  },
  rede_lenta: {
    pt: "A rede está lenta e a operação não confirmou a tempo. Confira na carteira antes de tentar de novo.",
    en: "The network is slow and the trade didn't confirm in time. Check your wallet before trying again.",
    zh: "网络缓慢，交易未及时确认。请先在钱包中确认后再重试。",
  },
} as const;

export function explicarErroDaCarteira(bruto: string | null | undefined, idioma: Idioma): string | null {
  if (!bruto) return null;
  const msg = String(bruto);
  if (/user rejected|rejected the request|denied|cancel/i.test(msg)) return null;
  if (/exceeds the balance|insufficient (funds|balance|lamports)|no record of a prior credit|saldo insuficiente/i.test(msg)) return FRASES.saldo[idioma];
  if (/chain mismatch|does not match the target chain|unsupported chain|wrong network/i.test(msg)) return FRASES.rede[idioma];
  if (/slippage|too little received|minimum|exceeds desired slippage|price impact/i.test(msg)) return FRASES.preco[idioma];
  if (/timed? ?out|block height exceeded|expired/i.test(msg)) return FRASES.rede_lenta[idioma];
  // Desconhecido: só a primeira linha, sem o despejo técnico do viem.
  const primeira = msg.split(/\r?\n/)[0].replace(/^Error:\s*/, "");
  return primeira.length > 180 ? `${primeira.slice(0, 180)}…` : primeira;
}
