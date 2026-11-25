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

/**
 * Taxa da plataforma (Chroma) no envio privado: 1% do valor, numa transferência
 * normal pra uma carteira só da taxa — separada do cofre. O endereço é público
 * (só recebe); quem gasta a taxa é o dono, com o segredo guardado fora do site.
 */
export const CLOAKER_FEE_WALLET =
  process.env.NEXT_PUBLIC_CLOAKER_FEE_WALLET || "6aGAEmbmCt3frdzpPb11jKeyTUb6RWaB9ojsthBcNPHb";
export function taxaPlataforma(lamports: bigint): bigint {
  return (lamports * 1n) / 100n;
}

export interface CarteiraParaSaque {
  publicKey: PublicKey;
  signTransaction: NonNullable<LegacyWalletAdapter["signTransaction"]>;
  signMessage: (mensagem: Uint8Array) => Promise<Uint8Array>;
}

export type EtapaDoSaque = "taxa" | "deposito" | "prova" | "saque";

const CHAVE = "chroma.saque-privado.pendente";

interface Pendente {
  nota: string; // base64 de serializeUtxo
  destino: string;
  carteira: string;
  deposito?: string;
  // Depósito feito DE PROPÓSITO pra sacar depois (não é um envio que deu erro no
  // meio). Muda só o texto que a tela mostra.
  intencional?: boolean;
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

/** Tem um saque privado guardado (ou que ficou no meio) nesta carteira? */
export function saquePendente(carteira: string): { destino: string; intencional: boolean } | null {
  if (typeof window === "undefined") return null;
  const p = lerPendente(carteira);
  return p ? { destino: p.destino, intencional: !!p.intencional } : null;
}

/**
 * O segredo do depósito guardado (base64), pra você salvar como backup.
 * ATENÇÃO: isto É o dinheiro. Quem tiver este segredo saca os fundos. Trate
 * como senha: guarde num lugar seguro e não mande pra ninguém.
 */
export function exportarNotaPendente(carteira: string): string | null {
  const p = lerPendente(carteira);
  return p ? p.nota : null;
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
 * Cobra a taxa da plataforma (1%): uma transferência normal e visível da
 * carteira pra CLOAKER_FEE_WALLET, ANTES do depósito. É separada do cofre de
 * propósito — não entra no envio privado. Devolve a assinatura.
 */
async function cobrarTaxa(
  rpcUrl: string,
  carteira: CarteiraParaSaque,
  taxa: bigint,
  aoMudar: (e: EtapaDoSaque, pct?: number) => void,
): Promise<string> {
  const { Connection, PublicKey: PK, SystemProgram, Transaction } = await import("@solana/web3.js");
  const conn = new Connection(rpcUrl, "confirmed");
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: carteira.publicKey, blockhash, lastValidBlockHeight }).add(
    SystemProgram.transfer({ fromPubkey: carteira.publicKey, toPubkey: new PK(CLOAKER_FEE_WALLET), lamports: taxa }),
  );
  aoMudar("taxa");
  const assinada = await carteira.signTransaction(tx);
  const sig = await conn.sendRawTransaction(assinada.serialize());
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  return sig;
}

/**
 * Só o DEPÓSITO: põe `lamports` no cofre da Cloak e guarda a nota (o segredo).
 * Devolve as notas (com posição na árvore), a árvore e a assinatura do depósito.
 */
async function depositar(
  k: Kit,
  lamports: bigint,
  destino: string,
  dono: string,
  intencional: boolean,
  aoMudar: (e: EtapaDoSaque, pct?: number) => void,
): Promise<{ notas: Nota[]; deposito: string; merkleTree: unknown }> {
  const chave = await k.sdk.generateUtxoKeypair();
  const nota = await k.sdk.createUtxo(lamports, chave, k.sdk.NATIVE_SOL_MINT);
  // Guarda a nota ANTES de depositar: é a única cópia do segredo dela.
  gravarPendente({ nota: paraBase64(k.sdk.serializeUtxo(nota)), destino, carteira: dono, intencional });

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
      // Só no DEPÓSITO: sem o envelope da nota na rede (a nota fica guardada
      // aqui), a transação encolhe e não estoura 1232 bytes quando a carteira
      // mexe nela. No saque a Cloak EXIGE o envelope.
      { ...k.opcoes, disableChainNotes: true, onProofProgress: (pct: number) => aoMudar("deposito", pct) },
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
  // A posição na árvore vem na resposta do depósito; garante que a nota a tem
  // (sem ela a prova do saque não sai: "UTXO must have an index").
  for (const n of notas) {
    if (n.index !== undefined) continue;
    const c = n.commitment ?? (await k.sdk.computeUtxoCommitment(n));
    const i = depositado.outputCommitments.findIndex((x) => x === c);
    n.index = depositado.commitmentIndices[i >= 0 ? i : 0];
  }
  // Agora com a posição na árvore: é essa versão que o saque usa.
  gravarPendente({ nota: paraBase64(k.sdk.serializeUtxo(notas[0])), destino, carteira: dono, deposito: depositado.signature, intencional });
  return { notas, deposito: depositado.signature, merkleTree: depositado.merkleTree };
}

/** O que sobra pro cofre (e pro destino) depois da taxa de 1% da plataforma. */
export function valorNoCofre(lamports: bigint): bigint {
  return lamports - taxaPlataforma(lamports);
}

/**
 * Manda `lamports` da carteira pra `destino` DE UMA VEZ: cobra 1%, deposita o
 * resto no cofre e saca na hora. Menos privado que depositar e sacar depois
 * (ver `depositarParaDepois`), porque a entrada e a saída saem juntas.
 */
export async function enviarEmPrivado(params: {
  rpcUrl: string;
  carteira: CarteiraParaSaque;
  destino: string;
  lamports: bigint;
  aoMudar: (e: EtapaDoSaque, pct?: number) => void;
}): Promise<{ deposito: string; saque: string }> {
  const { rpcUrl, carteira, destino, lamports, aoMudar } = params;
  const noCofre = valorNoCofre(lamports);
  if (noCofre < MINIMO_LAMPORTS) throw new Error("mínimo");
  const dono = carteira.publicKey.toBase58();
  // Um saque por vez: se um ficou no meio, ele tem de terminar primeiro.
  if (lerPendente(dono)) throw new Error("pendente");

  const taxa = taxaPlataforma(lamports);
  if (taxa > 0n) await cobrarTaxa(rpcUrl, carteira, taxa, aoMudar);

  const k = await kit(rpcUrl, carteira);
  const { notas, deposito, merkleTree } = await depositar(k, noCofre, destino, dono, false, aoMudar);
  const saque = await sacarNota(k, notas, destino, { cachedMerkleTree: merkleTree }, aoMudar);
  gravarPendente(null);
  return { deposito, saque: saque.signature };
}

/**
 * Só DEPOSITA (cobra 1% e põe o resto no cofre) e PARA. O saque fica guardado
 * pra você terminar quando quiser — no outro dia, 3 dias depois… Quanto mais
 * tempo passa, e mais gente usa o cofre nesse meio, mais difícil ligar a
 * entrada à saída. Terminar com `retomarSaquePrivado`; o segredo fica salvo
 * neste navegador (faça backup com `exportarNotaPendente`).
 */
export async function depositarParaDepois(params: {
  rpcUrl: string;
  carteira: CarteiraParaSaque;
  destino: string;
  lamports: bigint;
  aoMudar: (e: EtapaDoSaque, pct?: number) => void;
}): Promise<{ deposito: string }> {
  const { rpcUrl, carteira, destino, lamports, aoMudar } = params;
  const noCofre = valorNoCofre(lamports);
  if (noCofre < MINIMO_LAMPORTS) throw new Error("mínimo");
  const dono = carteira.publicKey.toBase58();
  if (lerPendente(dono)) throw new Error("pendente");

  const taxa = taxaPlataforma(lamports);
  if (taxa > 0n) await cobrarTaxa(rpcUrl, carteira, taxa, aoMudar);

  const k = await kit(rpcUrl, carteira);
  const { deposito } = await depositar(k, noCofre, destino, dono, true, aoMudar);
  return { deposito };
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

  // Nota sem posição na árvore = a cópia guardada ANTES do depósito. Procura
  // na árvore da Cloak: se o depósito entrou, acha a posição; se não entrou,
  // nada saiu da carteira e a nota guardada é descartada.
  if (nota.index === undefined) {
    const lista = await k.sdk.fetchCommitments(k.opcoes.relayUrl, { mint: k.sdk.NATIVE_SOL_MINT, sync: true });
    const achada = lista.find((c) => {
      try {
        return BigInt(c.commitment.startsWith("0x") || /^[0-9]+$/.test(c.commitment) ? c.commitment : `0x${c.commitment}`) === nota.commitment;
      } catch {
        return false;
      }
    });
    if (!achada) {
      gravarPendente(null);
      throw new Error("DEPOSITO_NAO_ACONTECEU");
    }
    nota.index = achada.index;
  }
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

/**
 * RESGATE DE EMERGÊNCIA: saca com o segredo de um backup (o .txt que você
 * baixou), em qualquer navegador, mesmo que este não tenha o depósito guardado.
 * É o que salva o dinheiro se você limpou o navegador ou trocou de PC.
 */
export async function sacarComBackup(params: {
  rpcUrl: string;
  carteira: CarteiraParaSaque;
  segredo: string; // base64 do exportarNotaPendente / do .txt
  destino: string;
  aoMudar: (e: EtapaDoSaque, pct?: number) => void;
}): Promise<{ saque: string }> {
  const k = await kit(params.rpcUrl, params.carteira);
  const nota = await k.sdk.deserializeUtxo(deBase64(params.segredo.trim()));
  nota.commitment = await k.sdk.computeUtxoCommitment(nota);
  // O backup é a nota do depósito; procura a posição dela na árvore da Cloak.
  if (nota.index === undefined) {
    const lista = await k.sdk.fetchCommitments(k.opcoes.relayUrl, { mint: k.sdk.NATIVE_SOL_MINT, sync: true });
    const achada = lista.find((c) => {
      try {
        return BigInt(c.commitment.startsWith("0x") || /^[0-9]+$/.test(c.commitment) ? c.commitment : `0x${c.commitment}`) === nota.commitment;
      } catch {
        return false;
      }
    });
    if (!achada) throw new Error("DEPOSITO_NAO_ACONTECEU");
    nota.index = achada.index;
  }
  const saque = await sacarNota(k, [nota], params.destino, {}, params.aoMudar);
  // Se este navegador tinha o mesmo depósito guardado, já foi resolvido.
  if (saquePendente(params.carteira.publicKey.toBase58())) gravarPendente(null);
  return { saque: saque.signature };
}
