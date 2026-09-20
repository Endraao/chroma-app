import "server-only";

import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { ChainId } from "./types";

/**
 * Apelidos (nicknames) ligados a carteiras.
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO PEDE ASSINATURA
 * ---------------------------------------------------------------------------
 * O apelido é só um nome de exibição. Pedir assinatura da carteira logo na
 * primeira tela assusta quem está chegando — parece que o site vai mexer nos
 * fundos, quando não vai — e derruba cadastro por medo, não por atrito.
 *
 * E a assinatura protegia menos do que parecia. O medo era "alguém toma o
 * apelido de um divulgador conhecido"; só que o atacante faria isso assinando
 * com a carteira DELE, normalmente. Assinatura só impediria registrar um
 * apelido apontando pra carteira de terceiro — o que daria o dinheiro pra
 * vítima, não pro atacante. Não é ataque.
 *
 * O que de fato protege, e está implementado:
 *
 *  - nomes reservados (chroma, admin, suporte…) bloqueados;
 *  - formato validado e apelido já usado não é tomado de quem o registrou;
 *  - limite de requisições por IP na rota, contra registro em massa;
 *  - apelido antigo continua resolvendo pra mesma carteira, então trocar de
 *    nome não quebra link divulgado nem libera o nome pra outra pessoa.
 *
 * LIMITE CONHECIDO: sem assinatura, o servidor acredita na carteira que o
 * cliente informa. Dá pra alguém trocar o apelido exibido de outra carteira —
 * vandalismo, não roubo: o dinheiro continua indo pro endereço certo e os
 * links antigos continuam valendo. Se um dia isso incomodar, o caminho é
 * exigir assinatura só na TROCA (quando a pessoa já está dentro), mantendo o
 * primeiro registro sem fricção.
 */

const DATA_DIR = path.join(process.cwd(), ".data");
const ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.jsonl");

export type WalletKind = "solana" | "evm";

export interface Account {
  /** chave única, sempre minúscula */
  nickname: string;
  /** como a pessoa digitou, para exibir */
  displayName: string;
  /**
   * A primeira carteira da conta. Mantido por compatibilidade: os registros
   * antigos só têm este campo, e o arquivo é append-only — nada é reescrito.
   */
  wallet: string;
  kind: WalletKind;
  /**
   * Uma carteira por rede.
   *
   * Existe porque cada rede paga na própria moeda e num endereço de formato
   * diferente: comissão da Robinhood é ETH e vai pra um `0x…`, que não existe
   * na Solana. Com uma carteira só, indicações da outra rede eram descartadas
   * em silêncio e a fatia ia parar na plataforma — ver `solana-swap.ts`, que
   * ignora afiliado cujo endereço não vira `PublicKey`.
   */
  carteiras?: Partial<Record<ChainId, string>>;
  createdAt: number;
  /** foto de perfil enviada pela pessoa; sem ela, o avatar é gerado do endereço */
  avatar?: string;
  /** foto de capa enviada pela pessoa; sem ela, a capa é gerada do endereço */
  cover?: string;
}

/** `kind` é anterior às redes nomeadas; "evm" aqui só pode ser Robinhood Chain. */
export const REDE_DO_KIND: Record<WalletKind, ChainId> = {
  solana: "solana",
  evm: "robinhood",
};

/** Endereço EVM é case-insensitive; o da Solana não é. */
function mesmoEndereco(a: string, b: string): boolean {
  if (a.startsWith("0x") || b.startsWith("0x")) return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

/**
 * Preenche `carteiras` nos registros gravados antes deste campo existir.
 *
 * Sem isto, toda conta antiga apareceria sem carteira nenhuma e o pagamento de
 * indicação pararia pra quem já estava cadastrado. O arquivo é append-only de
 * propósito, então a migração acontece na leitura, não reescrevendo o passado.
 */
function normalizar(a: Account): Account {
  if (a.carteiras && Object.keys(a.carteiras).length > 0) return a;
  return { ...a, carteiras: { [REDE_DO_KIND[a.kind]]: a.wallet } };
}

/** O endereço que recebe nessa rede, ou null se a pessoa não vinculou ainda. */
export function walletForChain(account: Account, chain: ChainId): string | null {
  return normalizar(account).carteiras?.[chain] ?? null;
}

/* ------------------------------------------------------------------ */
/* Regras do apelido                                                   */
/* ------------------------------------------------------------------ */

const NICKNAME_RE = /^[a-z0-9_]{3,20}$/;

/**
 * Nomes que não podem virar apelido porque colidem com rotas do site ou
 * seriam usados pra se passar pela plataforma.
 */
const RESERVED = new Set([
  "chroma", "admin", "support", "suporte", "api", "token", "create", "criar",
  "affiliate", "afiliado", "about", "terms", "privacy", "help", "ajuda",
  "official", "oficial", "team", "staff", "moderator", "mod", "root", "null",
  "undefined", "settings", "login", "signin", "signup", "wallet",
]);

export function validateNickname(raw: string): { ok: true; nickname: string } | { ok: false; error: string } {
  const nickname = raw.trim().toLowerCase().replace(/^@/, "");

  if (!NICKNAME_RE.test(nickname)) {
    return {
      ok: false,
      error: "O apelido precisa ter de 3 a 20 caracteres, usando só letras, números e _.",
    };
  }
  if (RESERVED.has(nickname)) {
    return { ok: false, error: "Esse apelido é reservado. Escolha outro." };
  }
  return { ok: true, nickname };
}

/* ------------------------------------------------------------------ */
/* Armazenamento                                                       */
/* ------------------------------------------------------------------ */

let cache: { accounts: Account[]; loadedAt: number } | null = null;
const CACHE_MS = 5_000;

async function readAll(): Promise<Account[]> {
  if (cache && Date.now() - cache.loadedAt < CACHE_MS) return cache.accounts;

  try {
    const raw = await readFile(ACCOUNTS_FILE, "utf8");
    const accounts = raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as Account;
        } catch {
          return null;
        }
      })
      .filter((a): a is Account => a !== null)
      .map(normalizar);

    cache = { accounts, loadedAt: Date.now() };
    return accounts;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/**
 * Acha a conta por QUALQUER uma das carteiras dela; o registro mais recente
 * vence. Tem que olhar todas, senão quem entrou pela MetaMask não encontraria
 * a própria conta criada com a Phantom.
 */
export async function findByWallet(wallet: string): Promise<Account | null> {
  const all = await readAll();
  return (
    [...all]
      .reverse()
      .find((a) =>
        Object.values(a.carteiras ?? {}).some((endereco) => mesmoEndereco(endereco, wallet)),
      ) ?? null
  );
}

export async function findByNickname(nickname: string): Promise<Account | null> {
  const key = nickname.trim().toLowerCase().replace(/^@/, "");
  const all = await readAll();
  return [...all].reverse().find((a) => a.nickname === key) ?? null;
}

export async function isNicknameTaken(nickname: string, byWallet?: string): Promise<boolean> {
  const existing = await findByNickname(nickname);
  if (!existing) return false;
  return existing.wallet !== byWallet;
}

export type ClaimResult =
  | { ok: true; account: Account }
  | { ok: false; error: string; status: number };

export async function claimNickname(params: {
  nickname: string;
  wallet: string;
  kind: WalletKind;
}): Promise<ClaimResult> {
  const validation = validateNickname(params.nickname);
  if (!validation.ok) return { ok: false, error: validation.error, status: 400 };
  const nickname = validation.nickname;

  // Já registrado por OUTRA carteira? Então não é desta pessoa.
  if (await isNicknameTaken(nickname, params.wallet)) {
    return { ok: false, error: "Esse apelido já está em uso.", status: 409 };
  }

  /*
   * Se a carteira já tem conta, isto é troca de apelido, não conta nova: as
   * carteiras das outras redes têm que vir junto. Sem isso, trocar de nome
   * desvincularia a segunda rede em silêncio.
   */
  const anterior = await findByWallet(params.wallet);

  const account: Account = {
    ...(anterior ?? {}),
    nickname,
    displayName: params.nickname.trim().replace(/^@/, ""),
    wallet: params.wallet,
    kind: params.kind,
    carteiras: {
      ...(anterior?.carteiras ?? {}),
      [REDE_DO_KIND[params.kind]]: params.wallet,
    },
    createdAt: Date.now(),
  };

  await mkdir(DATA_DIR, { recursive: true });
  await appendFile(ACCOUNTS_FILE, JSON.stringify(account) + "\n", "utf8");
  cache = null;

  return { ok: true, account };
}

/* ------------------------------------------------------------------ */
/* Fotos                                                               */
/* ------------------------------------------------------------------ */

export type MediaResult =
  | { ok: true; account: Account }
  | { ok: false; error: string; status: number };

/**
 * Troca a foto de perfil e/ou a de capa.
 *
 * Grava um registro NOVO em vez de reescrever o antigo, igual ao resto deste
 * arquivo: o histórico fica e não existe um instante em que o arquivo está
 * pela metade se a máquina cair no meio da escrita.
 *
 * Os campos não enviados são copiados do registro atual — senão trocar a capa
 * apagaria a foto de perfil.
 */
export async function saveProfileMedia(params: {
  wallet: string;
  avatar?: string;
  cover?: string;
}): Promise<MediaResult> {
  const atual = await findByWallet(params.wallet);
  if (!atual) {
    return { ok: false, error: "Escolha um apelido antes de trocar as fotos.", status: 404 };
  }

  const account: Account = {
    ...atual,
    avatar: params.avatar ?? atual.avatar,
    cover: params.cover ?? atual.cover,
    createdAt: Date.now(),
  };

  await mkdir(DATA_DIR, { recursive: true });
  await appendFile(ACCOUNTS_FILE, JSON.stringify(account) + "\n", "utf8");
  cache = null;

  return { ok: true, account };
}

/* ------------------------------------------------------------------ */
/* Vincular a segunda rede                                             */
/* ------------------------------------------------------------------ */

export type LinkResult =
  | { ok: true; account: Account }
  | { ok: false; error: string; status: number };

/**
 * Liga um endereço de outra rede à mesma conta.
 *
 * Quem chama TEM que ter verificado a assinatura antes (ver
 * `src/lib/wallet-auth.ts`). Esta função não confere prova nenhuma: ela é o
 * armazenamento, e deixar a checagem aqui dentro esconderia o fato de que esta
 * é a única operação da conta que muda pra onde o dinheiro vai.
 */
export async function linkWallet(params: {
  /** carteira que já pertence à conta, usada pra achá-la */
  contaDe: string;
  chain: ChainId;
  endereco: string;
}): Promise<LinkResult> {
  const conta = await findByWallet(params.contaDe);
  if (!conta) {
    return { ok: false, error: "Escolha um apelido antes de vincular outra carteira.", status: 404 };
  }

  const formatoOk =
    params.chain === "solana"
      ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(params.endereco)
      : /^0x[a-fA-F0-9]{40}$/.test(params.endereco);

  if (!formatoOk) {
    return { ok: false, error: "Esse endereço não é dessa rede.", status: 400 };
  }

  /*
   * Endereço que já está em OUTRA conta não entra. Não é só higiene: com o
   * mesmo endereço em duas contas, a busca reversa passaria a devolver conta
   * diferente dependendo da ordem dos registros, e o pagamento da indicação
   * seguiria junto.
   */
  const dono = await findByWallet(params.endereco);
  if (dono && dono.nickname !== conta.nickname) {
    return { ok: false, error: "Essa carteira já está em outra conta.", status: 409 };
  }

  const account: Account = {
    ...conta,
    carteiras: { ...(conta.carteiras ?? {}), [params.chain]: params.endereco },
    createdAt: Date.now(),
  };

  await mkdir(DATA_DIR, { recursive: true });
  await appendFile(ACCOUNTS_FILE, JSON.stringify(account) + "\n", "utf8");
  cache = null;

  return { ok: true, account };
}
