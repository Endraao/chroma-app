import "server-only";


import type { ChainId } from "./types";
import { banco, chaveDoEndereco, comTransacao, sql } from "./db";

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


export type WalletKind = "solana" | "evm";

export interface Account {
  /** id interno da conta; usado pra comparar identidade sem depender do apelido */
  id: number;
  /**
   * Apelido de quem indicou esta pessoa, ou `null`.
   *
   * Gravado na criação e nunca alterado. É o que mantém as duas redes da mesma
   * pessoa pagando o mesmo promotor — ver `resolverIndicador` e a nota em
   * `db.ts`.
   */
  indicadoPor: string | null;
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
    return { ok: false, error: "Este apelido é reservado. Escolha outro." };
  }
  return { ok: true, nickname };
}

/* ------------------------------------------------------------------ */
/* Armazenamento                                                       */
/* ------------------------------------------------------------------ */

/*
 * O chão mudou de arquivo JSONL pra SQLite; as assinaturas não mudaram, então o
 * resto do site não sabe. O porquê da troca está em `db.ts`.
 *
 * As funções continuam `async` mesmo sendo síncronas por dentro: são chamadas
 * de rotas que já esperam promessa, e SQLite local não bloqueia de forma
 * perceptível.
 */

interface LinhaDaConta {
  id: number;
  apelido: string;
  display_name: string;
  wallet: string;
  kind: string;
  avatar: string | null;
  cover: string | null;
  created_at: number;
  /** Coluna acrescentada depois; contas antigas trazem `null`. */
  indicado_por: string | null;
}

/** Monta a conta juntando as carteiras dela. */
async function montar(linha: LinhaDaConta): Promise<Account> {
  const carteiras = (await sql.query(
    "SELECT chain, endereco FROM carteiras WHERE conta = $1",
    [linha.id],
  )) as unknown as { chain: string; endereco: string }[];

  return {
    id: linha.id,
    nickname: linha.apelido,
    displayName: linha.display_name,
    wallet: linha.wallet,
    kind: linha.kind as WalletKind,
    /* Minúsculo: é chave de busca em `apelidos`, que guarda tudo em caixa baixa. */
    indicadoPor: linha.indicado_por?.toLowerCase() ?? null,
    carteiras: Object.fromEntries(
      carteiras.map((c) => [c.chain, c.endereco]),
    ) as Partial<Record<ChainId, string>>,
    /*
     * `Number(...)` e não o valor cru: o driver do Postgres devolve BIGINT
     * como TEXTO, pra não perder precisão em número grande. Sem converter, a
     * data viraria "1789869050000" como string e toda conta de tempo daria
     * `NaN` — sem erro nenhum, só idade errada na tela.
     */
    createdAt: Number(linha.created_at),
    avatar: linha.avatar ?? undefined,
    cover: linha.cover ?? undefined,
  };
}

async function porId(id: number): Promise<Account | null> {
  const linhas = (await sql.query("SELECT * FROM contas WHERE id = $1", [
    id,
  ])) as unknown as LinhaDaConta[];
  return linhas[0] ? montar(linhas[0]) : null;
}

/**
 * Acha a conta por QUALQUER uma das carteiras dela.
 *
 * Tem que olhar todas, senão quem entrou pela MetaMask não encontraria a
 * própria conta criada com a Phantom. Antes era varredura do arquivo inteiro;
 * agora é acerto de chave primária.
 */
export async function findByWallet(wallet: string): Promise<Account | null> {
  await banco();
  const achou = (await sql.query("SELECT conta FROM carteiras WHERE endereco = $1", [
    chaveDoEndereco(wallet),
  ])) as unknown as { conta: number }[];

  return achou[0] ? porId(achou[0].conta) : null;
}

/**
 * Acha a conta por um apelido — inclusive um que a pessoa já largou.
 *
 * O apelido antigo continua resolvendo de propósito: quem imprimiu
 * `?ref=fulano` num panfleto não reimprime porque a pessoa trocou de nome. O
 * que volta é a conta ATUAL, com o apelido de hoje.
 */
export async function findByNickname(nickname: string): Promise<Account | null> {
  const key = nickname.trim().toLowerCase().replace(/^@/, "");
  await banco();
  const achou = (await sql.query("SELECT conta FROM apelidos WHERE nickname = $1", [
    key,
  ])) as unknown as { conta: number }[];

  return achou[0] ? porId(achou[0].conta) : null;
}

/**
 * Quem indicou o dono desta carteira, e pra onde a comissão vai NESTA rede.
 *
 * ---------------------------------------------------------------------------
 * É ISTO QUE FAZ AS DUAS REDES PAGAREM O MESMO PROMOTOR
 * ---------------------------------------------------------------------------
 * A pergunta é feita com a carteira que está operando AGORA — que pode ser a
 * da Solana ou a da Robinhood. Das duas se chega à mesma conta, e a conta
 * carrega o `indicado_por` gravado no dia em que ela nasceu.
 *
 * Daí o caminho segue: apelido do promotor → conta dele → carteira dele NA
 * REDE DO SWAP. Se alguém entrou pelo seu link e operou em Solana, e meses
 * depois conectou a Robinhood com outra carteira, você recebe nas duas —
 * porque o vínculo está na conta da pessoa, não no navegador dela.
 *
 * Devolve `null` quando não há indicador, quando o promotor não tem carteira
 * nesta rede (a comissão não teria pra onde ir), ou quando alguém tentou
 * indicar a si mesmo.
 */
export async function resolverIndicador(
  carteiraDeQuemOpera: string,
  chain: ChainId,
): Promise<{ apelido: string; endereco: string } | null> {
  const conta = await findByWallet(carteiraDeQuemOpera);
  if (!conta?.indicadoPor) return null;

  const promotor = await findByNickname(conta.indicadoPor);
  if (!promotor) return null;

  /*
   * Auto-indicação: a pessoa usou o próprio link. Barrado aqui, e não só na
   * gravação, porque contas antigas podem ter sido criadas antes desta
   * checagem existir.
   */
  if (promotor.id === conta.id) return null;

  const endereco = walletForChain(promotor, chain);
  return endereco ? { apelido: promotor.nickname, endereco } : null;
}

/**
 * O apelido está tomado por outra pessoa?
 *
 * Apelido largado continua tomado. Devolvê-lo ao mercado seria convite pra
 * alguém assumir o nome de quem o usava antes.
 */
export async function isNicknameTaken(nickname: string, byWallet?: string): Promise<boolean> {
  const existing = await findByNickname(nickname);
  if (!existing) return false;
  if (!byWallet) return true;

  // Livre pra quem já é dono — por qualquer uma das carteiras da conta.
  return !Object.values(existing.carteiras ?? {}).some((e) => mesmoEndereco(e, byWallet));
}

export type ClaimResult =
  | { ok: true; account: Account }
  | { ok: false; error: string; status: number };

export async function claimNickname(params: {
  nickname: string;
  wallet: string;
  kind: WalletKind;
  /**
   * Apelido de quem indicou esta pessoa, quando ela chegou por um `?ref=`.
   *
   * Gravado UMA VEZ, na criação da conta, e nunca sobrescrito. Ver a nota
   * longa em `db.ts`: é o que faz as duas redes da mesma pessoa pagarem
   * sempre o mesmo promotor, em qualquer aparelho.
   */
  indicadoPor?: string | null;
}): Promise<ClaimResult> {
  const validation = validateNickname(params.nickname);
  if (!validation.ok) return { ok: false, error: validation.error, status: 400 };
  const nickname = validation.nickname;

  if (await isNicknameTaken(nickname, params.wallet)) {
    return { ok: false, error: "Este apelido já está em uso.", status: 409 };
  }

  await banco();
  const chain = REDE_DO_KIND[params.kind];
  const agora = Date.now();
  const exibicao = params.nickname.trim().replace(/^@/, "");
  const enderecoChave = chaveDoEndereco(params.wallet);

  /*
   * Tudo numa transação, e a LEITURA vai dentro dela.
   *
   * No SQLite a leitura ficava do lado de fora, antes do `BEGIN`. Funcionava
   * porque lá só existe um escritor por vez. Em Postgres, com várias funções
   * serverless atendendo ao mesmo tempo, ler fora da transação abre a janela
   * clássica: duas requisições da mesma pessoa leem "não existe conta" juntas e
   * as duas criam — e a segunda vira uma conta órfã, com o apelido apontando
   * pra ela e a carteira apontando pra outra. É a linha que decide pra onde vai
   * a comissão.
   *
   * Uma troca de apelido também mexe em três tabelas; parar no meio deixaria a
   * conta com o nome novo e sem o apontamento, ou o contrário.
   */
  const id = await comTransacao(async (c) => {
      const existente = (
        await c.query<{ conta: number }>(
          "SELECT conta FROM carteiras WHERE endereco = $1 FOR UPDATE",
          [enderecoChave],
        )
      ).rows[0];

      let conta: number;

      if (existente) {
        // Troca de apelido: a conta é a mesma, o nome de exibição muda.
        conta = existente.conta;
        await c.query(
          "UPDATE contas SET apelido = $1, display_name = $2, kind = $3 WHERE id = $4",
          [nickname, exibicao, params.kind, conta],
        );
      } else {
        /*
         * O indicador entra AQUI, na criação, e só aqui.
         *
         * Nunca num `UPDATE` depois: senão bastaria a pessoa abrir um link de
         * indicação novo pra trocar de promotor, e o primeiro — que fez o
         * trabalho de trazê-la — perderia a comissão pro último que mandou
         * um link. Quem trouxe, trouxe.
         *
         * Indicar a si mesmo é barrado em `resolverIndicador`, antes de
         * chegar aqui.
         */
        const criada = await c.query<{ id: number }>(
          `INSERT INTO contas (apelido, display_name, wallet, kind, created_at, indicado_por)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [
            nickname,
            exibicao,
            params.wallet,
            params.kind,
            agora,
            indicadorValido(params.indicadoPor, nickname, params.wallet),
          ],
        );
        conta = Number(criada.rows[0].id);
      }

      /*
       * O apelido é REGISTRADO, nunca substituído. Os antigos ficam apontando
       * pra mesma conta — é isso que mantém link velho funcionando e impede
       * que alguém assuma um nome largado.
       */
      await c.query(
        `INSERT INTO apelidos (nickname, conta, desde) VALUES ($1, $2, $3)
         ON CONFLICT (nickname) DO NOTHING`,
        [nickname, conta, agora],
      );

      await c.query(
        `INSERT INTO carteiras (endereco, conta, chain) VALUES ($1, $2, $3)
         ON CONFLICT (endereco) DO UPDATE SET conta = excluded.conta, chain = excluded.chain`,
        [enderecoChave, conta, chain],
      );

    return conta;
  });

  /*
   * Sem try/catch aqui de propósito: `comTransacao` já desfaz tudo quando o
   * bloco lança, e engolir o erro neste ponto devolveria "deu certo" pra uma
   * gravação que não aconteceu. Falha de banco no registro de apelido tem que
   * subir e virar erro 500 — é melhor a pessoa tentar de novo do que achar que
   * o link de indicação dela existe quando não existe.
   */
  const account = await porId(id);
  return account
    ? { ok: true, account }
    : { ok: false, error: "Não foi possível salvar a sua conta.", status: 500 };
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
 * Os campos não enviados ficam como estavam — senão trocar a capa apagaria a
 * foto de perfil.
 */
export async function saveProfileMedia(params: {
  wallet: string;
  avatar?: string;
  cover?: string;
}): Promise<MediaResult> {
  await banco();
  const achou = (await sql.query("SELECT conta FROM carteiras WHERE endereco = $1", [
    chaveDoEndereco(params.wallet),
  ])) as unknown as { conta: number }[];

  if (!achou[0]) {
    return { ok: false, error: "Escolha um apelido antes de trocar as fotos.", status: 404 };
  }

  await sql.query(
    `UPDATE contas SET avatar = COALESCE($1, avatar), cover = COALESCE($2, cover) WHERE id = $3`,
    [params.avatar ?? null, params.cover ?? null, achou[0].conta],
  );

  const account = await porId(achou[0].conta);
  return account
    ? { ok: true, account }
    : { ok: false, error: "Não foi possível salvar as fotos.", status: 500 };
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
    return { ok: false, error: "Este endereço não pertence a esta rede.", status: 400 };
  }

  /*
   * Endereço que já está em OUTRA conta não entra. Não é só higiene: com o
   * mesmo endereço em duas contas, a busca reversa passaria a devolver conta
   * diferente dependendo da ordem dos registros, e o pagamento da indicação
   * seguiria junto.
   */
  const dono = await findByWallet(params.endereco);
  if (dono && dono.nickname !== conta.nickname) {
    return { ok: false, error: "Esta carteira já pertence a outra conta.", status: 409 };
  }

  /*
   * A chave primária da tabela de carteiras fecha a corrida que a checagem
   * acima não fecha sozinha: duas requisições simultâneas passariam as duas
   * pelo if e as duas gravariam. Aqui a segunda esbarra no banco.
   */
  const alvo = (await sql.query("SELECT conta FROM apelidos WHERE nickname = $1", [
    conta.nickname,
  ])) as unknown as { conta: number }[];

  if (!alvo[0]) {
    return { ok: false, error: "Não encontramos a conta para vincular.", status: 500 };
  }

  // DO NOTHING (antes: DO UPDATE): numa corrida, a segunda requisição não pode
  // tomar a carteira que a primeira acabou de gravar em outra conta.
  await sql.query(
    `INSERT INTO carteiras (endereco, conta, chain) VALUES ($1, $2, $3)
     ON CONFLICT (endereco) DO NOTHING`,
    [chaveDoEndereco(params.endereco), alvo[0].conta, params.chain],
  );
  const depois = await findByWallet(params.endereco);
  if (depois && depois.nickname !== conta.nickname) {
    return { ok: false, error: "Esta carteira já pertence a outra conta.", status: 409 };
  }

  const account = await findByNickname(conta.nickname);
  return account
    ? { ok: true, account }
    : { ok: false, error: "Não foi possível vincular a carteira.", status: 500 };
}

/** O indicador gravado na criação — nunca a própria pessoa (apelido ou carteira). */
function indicadorValido(bruto: string | null | undefined, apelido: string, carteira: string): string | null {
  const ref = bruto?.trim().replace(/^@/, "").toLowerCase() || null;
  if (!ref) return null;
  if (ref === apelido.toLowerCase() || ref === carteira.toLowerCase()) return null;
  return ref;
}
