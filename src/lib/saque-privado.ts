import type { LegacyWalletAdapter } from "@cloak.dev/sdk";
import type { PublicKey } from "@solana/web3.js";

/**
 * SAQUE PRIVADO do criador, pela Cloak (Privacy Week da Superteam Brasil,
 * 04/10/2026).
 *
 * O problema: a carteira que cria uma moeda é vigiada. Todo mundo vê quanto o
 * dev ganhou e pra onde mandou — e "dev mexeu na carteira" vira pânico no
 * grupo, ou expõe a carteira pessoal dele.
 *
 * Como funciona: o SOL entra no cofre protegido da Cloak (shielded pool) pela
 * carteira do criador e sai numa carteira de destino escolhida por ele. A
 * rede vê a entrada e a saída, mas não a ligação entre as duas.
 *
 *   1. depósito  → assinado pela carteira (transação)
 *   2. saque     → prova ZK feita no navegador, autenticada por assinatura de
 *                  MENSAGEM da carteira e enviada pela Cloak
 *
 * POR QUE NÃO DÁ PRA "BURLAR" A PLATAFORMA (pedido do dono):
 *   - Só a carteira que criou a moeda saca as taxas: quem confere é o próprio
 *     programa da Meteora na rede, não o site. E o que foi sacado zera — não
 *     existe saque em dobro.
 *   - O saque privado só move SOL que JÁ ESTÁ na carteira do criador. Não toca
 *     em dinheiro da Chroma nem no bônus.
 *   - O bônus é pago pela Chroma sempre na carteira que criou a moeda (lida da
 *     rede na hora), nunca na carteira de destino digitada aqui, e só a
 *     diferença entre o conquistado e o já pago (ver /admin/bonus).
 *
 * A NOTA do depósito é dinheiro: sem ela, ninguém (nem a Cloak) consegue sacar.
 * Ela fica salva neste navegador até o saque confirmar; se a aba fechar no
 * meio, `retomarSaquePrivado` termina o serviço.
 *
 * Taxa da Cloak no saque: 0,005 SOL + 0,3%. Depósito mínimo: 0,01 SOL.
 * O kit da Cloak é pesado (provas ZK): só é carregado na hora.
 */

export const MINIMO_LAMPORTS = 10_000_000n;

/** O que a Cloak cobra pra sair do cofre (cobrado na rede, pela própria Cloak). */
export function taxaDaCloak(lamports: bigint): bigint {
  return 5_000_000n + (lamports * 3n) / 1000n;
}

export interface CarteiraParaSaque {
  publicKey: PublicKey;
  signTransaction: NonNullable<LegacyWalletAdapter["signTransaction"]>;
  signMessage: (mensagem: Uint8Array) => Promise<Uint8Array>;
}

export type EtapaDoSaque = "deposito" | "prova" | "saque";

const CHAVE = "chroma.saque-privado.pendente";

interface Pendente {
  nota: string; // base64 de serializeUtxo
  destino: string;
  carteira: string;
  deposito?: string;
}

const paraBase64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const deBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function lerPendente(carteira: string): Pendente | null {
  try {
    const p = JSON.parse(window.localStorage.getItem(CHAVE) ?? "null") as Pendente | null;
    return p && p.carteira === carteira ? p : null;
  } catch {
    return null;
  }
}

function gravarPendente(p: Pendente | null) {
  // Sem try/catch de propósito: se não der pra guardar a nota, o depósito NÃO
  // pode acontecer — o erro sobe antes de qualquer transação.
  if (p) window.localStorage.setItem(CHAVE, JSON.stringify(p));
  else window.localStorage.removeItem(CHAVE);
}

/** Tem um saque privado que começou e não terminou nesta carteira? */
export function saquePendente(carteira: string): { destino: string } | null {
  if (typeof window === "undefined") return null;
  const p = lerPendente(carteira);
  return p ? { destino: p.destino } : null;
}

async function kit(rpcUrl: string, carteira: CarteiraParaSaque) {
  const [sdk, { VersionedTransaction }] = await Promise.all([import("@cloak.dev/sdk"), import("@solana/web3.js")]);
  const enderecoDaCarteira = sdk.addressFromPublicKey(carteira.publicKey);
  const opcoes = {
    connection: sdk.createCloakRpc(rpcUrl),
    programId: sdk.CLOAK_PROGRAM_ID,
    relayUrl: sdk.CLOAK_PRODUCTION_RELAY_URL,
    signer: sdk.signerFromWalletAdapter(
      {
        publicKey: carteira.publicKey,
        signTransaction: carteira.signTransaction,
        signMessage: carteira.signMessage,
      },
      { web3: { VersionedTransaction } },
    ),
    signMessage: carteira.signMessage,
    depositorPublicKey: enderecoDaCarteira,
    walletPublicKey: enderecoDaCarteira,
  };
  return { sdk, opcoes, enderecoDaCarteira };
}

type Kit = Awaited<ReturnType<typeof kit>>;
type Nota = Awaited<ReturnType<Kit["sdk"]["deserializeUtxo"]>>;

/** O saque da nota pra carteira de destino (prova ZK + 1 assinatura de mensagem). */
async function sacarNota(k: Kit, notas: Nota[], destino: string, extra: Record<string, unknown>, aoMudar: (e: EtapaDoSaque, pct?: number) => void) {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await k.sdk.fullWithdraw(notas, k.sdk.address(destino), {
        ...k.opcoes,
        ...extra,
        onProgress: () => aoMudar("saque"),
        onProofProgress: (pct: number) => aoMudar("prova", pct),
      });
    } catch (e) {
      if (!k.sdk.isRootNotFoundError(e) || tentativa >= 3) {
        const dica = k.sdk.explainRelayAuthRejection(String(e));
        throw dica ? new Error(dica, { cause: e }) : e;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

/**
 * Manda `lamports` da carteira do criador pra `destino` passando pelo cofre
 * da Cloak. Devolve as assinaturas do depósito e do saque (provas na rede).
 */
export async function enviarEmPrivado(params: {
  rpcUrl: string;
  carteira: CarteiraParaSaque;
  destino: string;
  lamports: bigint;
  aoMudar: (e: EtapaDoSaque, pct?: number) => void;
}): Promise<{ deposito: string; saque: string }> {
  const { rpcUrl, carteira, destino, lamports, aoMudar } = params;
  if (lamports < MINIMO_LAMPORTS) throw new Error("mínimo");
  const dono = carteira.publicKey.toBase58();
  // Um saque por vez: se um ficou no meio, ele tem de terminar primeiro.
  if (lerPendente(dono)) throw new Error("pendente");
  const k = await kit(rpcUrl, carteira);

  const chave = await k.sdk.generateUtxoKeypair();
  const nota = await k.sdk.createUtxo(lamports, chave, k.sdk.NATIVE_SOL_MINT);
  // Guarda a nota ANTES de depositar: é a única cópia do segredo dela.
  gravarPendente({ nota: paraBase64(k.sdk.serializeUtxo(nota)), destino, carteira: dono });

  aoMudar("deposito");
  let depositado: Awaited<ReturnType<typeof k.sdk.transact>>;
  try {
    depositado = await k.sdk.transact(
      {
        inputUtxos: [await k.sdk.createZeroUtxo(k.sdk.NATIVE_SOL_MINT)],
        outputUtxos: [nota],
        externalAmount: lamports,
        depositor: k.enderecoDaCarteira,
      },
      { ...k.opcoes, onProofProgress: (pct: number) => aoMudar("deposito", pct) },
    );
  } catch (e) {
    // Falhou ANTES de o depósito ir pra rede (recusou na carteira, sem saldo,
    // rede fora…): nada saiu dela, a nota guardada não vale nada. Só fica
    // guardada se o depósito pode ter sido enviado sem confirmação.
    const talvezEnviado =
      e instanceof k.sdk.TransactionConfirmationError || /confirm|timeout|timed out|outcome unknown|blockhash/i.test(String(e));
    if (!talvezEnviado) gravarPendente(null);
    throw e;
  }
  const notas = depositado.outputUtxos.filter((u) => u.amount > 0n);
  // Agora com a posição na árvore: é essa versão que o saque usa.
  gravarPendente({ nota: paraBase64(k.sdk.serializeUtxo(notas[0])), destino, carteira: dono, deposito: depositado.signature });

  const saque = await sacarNota(k, notas, destino, { cachedMerkleTree: depositado.merkleTree }, aoMudar);
  gravarPendente(null);
  return { deposito: depositado.signature, saque: saque.signature };
}

/** Termina um saque privado que ficou no meio (a nota está salva neste navegador). */
export async function retomarSaquePrivado(params: {
  rpcUrl: string;
  carteira: CarteiraParaSaque;
  aoMudar: (e: EtapaDoSaque, pct?: number) => void;
}): Promise<{ deposito: string; saque: string }> {
  const dono = params.carteira.publicKey.toBase58();
  const p = lerPendente(dono);
  if (!p) throw new Error("nada pendente");
  const k = await kit(params.rpcUrl, params.carteira);
  const nota = await k.sdk.deserializeUtxo(deBase64(p.nota));
  nota.commitment = await k.sdk.computeUtxoCommitment(nota);
  try {
    const saque = await sacarNota(k, [nota], p.destino, {}, params.aoMudar);
    gravarPendente(null);
    return { deposito: p.deposito ?? "", saque: saque.signature };
  } catch (e) {
    // Nota já gasta (o saque tinha passado) ou o depósito nunca entrou: não há
    // o que retomar, e a nota guardada pode ser descartada.
    if (e instanceof Error && /already spent|UtxoAlreadySpent|not found in tree|commitment not found/i.test(String(e))) {
      gravarPendente(null);
    }
    throw e;
  }
}
