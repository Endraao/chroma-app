/**
 * Login com Google (e outras contas sociais).
 *
 * ---------------------------------------------------------------------------
 * ESTADO: NÃO IMPLEMENTADO — E POR QUÊ
 * ---------------------------------------------------------------------------
 * "Entrar com o Google" numa plataforma não-custodial não é um login comum.
 * Não existe carteira Google: o que acontece é que um provedor de embedded
 * wallets cria uma carteira para a pessoa e guarda a chave fragmentada,
 * liberando o acesso depois que o Google confirma quem ela é.
 *
 * Isso exige contratar um provedor e ter uma chave de API. Os candidatos:
 *
 *  - Privy       (privy.io)      — o mais usado em launchpads; suporta Solana e EVM
 *  - Web3Auth    (web3auth.io)   — MPC, plano gratuito generoso
 *  - Dynamic     (dynamic.xyz)   — bom suporte multi-chain
 *  - Turnkey     (turnkey.com)   — mais baixo nível, mais controle
 *
 * Decisão consciente de não escolher um por conta própria: a escolha amarra
 * a plataforma a um fornecedor que passa a controlar o acesso às carteiras
 * dos seus usuários. Isso é decisão de negócio, não de código.
 *
 * Para ligar: escolha o provedor, ponha a chave em NEXT_PUBLIC_SOCIAL_LOGIN_KEY,
 * instale o SDK e implemente `startSocialLogin` abaixo. A interface já trata
 * o botão como disponível assim que a variável existir.
 */

export const SOCIAL_LOGIN_PROVIDER = process.env.NEXT_PUBLIC_SOCIAL_LOGIN_PROVIDER || "";
export const SOCIAL_LOGIN_KEY = process.env.NEXT_PUBLIC_SOCIAL_LOGIN_KEY || "";

export const SOCIAL_LOGIN_ENABLED = Boolean(SOCIAL_LOGIN_PROVIDER && SOCIAL_LOGIN_KEY);

export async function startSocialLogin(_provider: "google" | "apple" | "x"): Promise<never> {
  throw new Error(
    "Login social ainda não está configurado. Ver src/lib/social-login.ts para os passos.",
  );
}
