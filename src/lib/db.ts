import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";

/**
 * O banco do site.
 *
 * ---------------------------------------------------------------------------
 * POR QUE SAIR DOS ARQUIVOS JSONL
 * ---------------------------------------------------------------------------
 * Os dois arquivos que existiam aqui (`accounts.jsonl` e
 * `affiliate-events.jsonl`) funcionavam com um processo só e pouca gente. Três
 * problemas apareceriam de uma vez com uso real:
 *
 *   - **Escrita concorrente.** Dois pedidos simultâneos podem intercalar bytes
 *     no meio de uma linha. O código lidava com isso IGNORANDO linhas quebradas
 *     — quer dizer: perdia o registro em silêncio. Se a linha perdida fosse a
 *     vinculação de carteira de alguém, a comissão passaria a cair na
 *     plataforma sem ninguém perceber.
 *
 *   - **Leitura de tudo, sempre.** Qualquer consulta carregava o arquivo
 *     inteiro na memória e varria linha por linha, a cada visita ao painel.
 *
 *   - **Regra que só existia no código.** "Uma carteira pertence a uma conta
 *     só" era uma checagem em JavaScript; duas requisições simultâneas passavam
 *     por ela juntas e as duas gravavam. É a regra que decide PRA ONDE O
 *     DINHEIRO VAI, e ela precisa ser do banco.
 *
 * ---------------------------------------------------------------------------
 * POR QUE SQLITE DA PRÓPRIA BIBLIOTECA DO NODE
 * ---------------------------------------------------------------------------
 * `node:sqlite` vem embutido no Node 22+ e não instala nada. As alternativas
 * populares são módulos nativos que COMPILAM na instalação — e este projeto
 * mantém `ignore-scripts=true` no .npmrc de propósito, porque script rodando em
 * `npm install` é o vetor clássico de ataque de cadeia de suprimentos.
 *
 * Trocar essa proteção por conveniência de banco seria péssimo negócio num site
 * que lida com carteira alheia.
 */

const DATA_DIR = path.join(process.cwd(), ".data");
const ARQUIVO = path.join(DATA_DIR, "chroma.db");

let conexao: DatabaseSync | null = null;

/** O banco, criado e migrado na primeira chamada. */
export function db(): DatabaseSync {
  if (conexao) return conexao;

  mkdirSync(DATA_DIR, { recursive: true });

  const banco = new DatabaseSync(ARQUIVO);

  /*
   * WAL: leitura não trava escrita nem vice-versa. Sem isto, o painel de um
   * promotor abrindo no mesmo instante de um trade daria "database is locked".
   */
  banco.exec("PRAGMA journal_mode = WAL");
  banco.exec("PRAGMA foreign_keys = ON");
  /*
   * `synchronous = NORMAL` com WAL aguenta queda do processo sem corromper; só
   * uma queda do SISTEMA custaria as últimas transações. É o padrão recomendado
   * e evita um fsync por escrita.
   */
  banco.exec("PRAGMA synchronous = NORMAL");

  criarTabelas(banco);
  conexao = banco;

  importarArquivosAntigos(banco);

  return banco;
}

function criarTabelas(banco: DatabaseSync) {
  banco.exec(`
    /*
     * A conta tem identidade PRÓPRIA, não é o apelido.
     *
     * Parece detalhe e não é: o apelido muda, e quando muda o antigo precisa
     * continuar funcionando. Se a chave fosse o apelido, renomear seria
     * apagar a conta e criar outra — e todo link de indicação já espalhado por
     * aí apontaria pro vazio.
     */
    CREATE TABLE IF NOT EXISTS contas (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      apelido      TEXT NOT NULL,
      display_name TEXT NOT NULL,
      wallet       TEXT NOT NULL,
      kind         TEXT NOT NULL,
      avatar       TEXT,
      cover        TEXT,
      created_at   INTEGER NOT NULL
    );

    /*
     * Todo apelido que a conta já teve, inclusive os largados.
     *
     * Duas razões pra guardar os antigos, e as duas são de dinheiro:
     *
     *   - **O link continua valendo.** Quem imprimiu ?ref=fulano num panfleto
     *     não reimprime porque a pessoa trocou de nome.
     *   - **Ninguém assume o nome de outro.** Apelido largado que volta pro
     *     mercado é convite pra se passar por quem o usava antes.
     */
    CREATE TABLE IF NOT EXISTS apelidos (
      nickname TEXT PRIMARY KEY,
      conta    INTEGER NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
      desde    INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_apelidos_conta ON apelidos(conta);

    /*
     * Carteiras em tabela própria, não num campo JSON.
     *
     * A chave primária é o endereço, e é ela que torna "uma carteira pertence a
     * uma conta só" uma regra do BANCO, não uma checagem que duas requisições
     * simultâneas atravessam juntas.
     *
     * Guardado em minúsculas quando é EVM: lá o mesmo endereço pode vir escrito
     * de várias formas, e sem normalizar ele entraria duas vezes.
     */
    CREATE TABLE IF NOT EXISTS carteiras (
      endereco TEXT PRIMARY KEY,
      conta    INTEGER NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
      chain    TEXT NOT NULL,
      UNIQUE (conta, chain)
    );

    CREATE INDEX IF NOT EXISTS idx_carteiras_conta ON carteiras(conta);

    CREATE TABLE IF NOT EXISTS eventos_de_afiliado (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet            TEXT NOT NULL,
      conta             TEXT,
      event             TEXT NOT NULL,
      at                INTEGER NOT NULL,
      chain             TEXT,
      landed_on         TEXT,
      volume_usd        REAL,
      volume_native     REAL,
      commission_native REAL,
      token_address     TEXT,
      token_symbol      TEXT,
      tx_hash           TEXT
    );

    /* O painel do promotor filtra por conta ou por carteira, sempre por tempo. */
    CREATE INDEX IF NOT EXISTS idx_eventos_conta ON eventos_de_afiliado(conta, at);
    CREATE INDEX IF NOT EXISTS idx_eventos_wallet ON eventos_de_afiliado(wallet, at);

    /*
     * Um swap só conta uma vez.
     *
     * Sem isto, um reenvio do registro de conversão — banal quando a rede
     * demora e a tela tenta de novo — soma a mesma comissão de novo no painel.
     * Nos dados que vieram do formato antigo isso já tinha acontecido: 136
     * registros de trade eram 6 transações repetidas.
     *
     * O índice é parcial porque evento de clique não tem transação.
     */
    CREATE UNIQUE INDEX IF NOT EXISTS idx_eventos_tx
      ON eventos_de_afiliado(tx_hash) WHERE tx_hash IS NOT NULL;

    CREATE TABLE IF NOT EXISTS meta (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );

    /*
     * As moedas lançadas AQUI.
     *
     * -------------------------------------------------------------------
     * POR QUE ESTA TABELA PRECISA EXISTIR
     * -------------------------------------------------------------------
     * A vitrine da home é montada a partir de fontes de mercado — e uma moeda
     * que acabou de nascer na nossa curva ainda não tem par em DEX nenhuma.
     * Resultado: ela não aparecia em canto nenhum do site até encher a curva
     * e migrar pra Raydium.
     *
     * Ou seja: a launchpad lançava a moeda e a moeda sumia da própria
     * vitrine, justo na hora em que ela mais precisa de gente olhando. É o
     * contrário do que uma launchpad faz.
     *
     * Aqui fica só o que a rede NÃO responde: nome de exibição, arte e quem
     * criou. Preço, progresso da curva e volume continuam vindo da rede a
     * cada leitura — número de mercado guardado em banco envelhece sem
     * ninguém perceber.
     */
    CREATE TABLE IF NOT EXISTS moedas (
      endereco   TEXT PRIMARY KEY,
      rede       TEXT NOT NULL,
      nome       TEXT NOT NULL,
      simbolo    TEXT NOT NULL,
      descricao  TEXT,
      imagem     TEXT,
      criador    TEXT NOT NULL,
      assinatura TEXT,
      criada_em  INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_moedas_criada ON moedas(criada_em DESC);
    CREATE INDEX IF NOT EXISTS idx_moedas_criador ON moedas(criador);
  `);
}

/* ------------------------------------------------------------------ */
/* Moedas lançadas na Chroma                                           */
/* ------------------------------------------------------------------ */

export interface MoedaRegistrada {
  endereco: string;
  rede: string;
  nome: string;
  simbolo: string;
  descricao: string | null;
  imagem: string | null;
  criador: string;
  assinatura: string | null;
  criadaEm: number;
}

/**
 * Registra uma moeda recém-lançada.
 *
 * `INSERT OR IGNORE`: a página de criação pode chamar duas vezes se a pessoa
 * recarregar, e o segundo registro não pode sobrescrever o primeiro — é o
 * primeiro que carrega a assinatura da transação que de fato criou a moeda.
 *
 * ATENÇÃO: esta função NÃO verifica nada. Quem chama é responsável por provar
 * que a moeda é mesmo da nossa curva — ver `POST /api/moedas`, que confere na
 * rede antes de chegar aqui.
 */
export function registrarMoeda(m: MoedaRegistrada): void {
  db()
    .prepare(
      `INSERT OR IGNORE INTO moedas
         (endereco, rede, nome, simbolo, descricao, imagem, criador, assinatura, criada_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      m.endereco,
      m.rede,
      m.nome,
      m.simbolo,
      m.descricao,
      m.imagem,
      m.criador,
      m.assinatura,
      m.criadaEm,
    );
}

/** As últimas moedas lançadas na Chroma, da mais nova pra mais velha. */
export function listarMoedasDaChroma(limite = 60): MoedaRegistrada[] {
  const linhas = db()
    .prepare(
      `SELECT endereco, rede, nome, simbolo, descricao, imagem, criador, assinatura, criada_em
         FROM moedas ORDER BY criada_em DESC LIMIT ?`,
    )
    .all(limite) as Record<string, unknown>[];

  return linhas.map((l) => ({
    endereco: String(l.endereco),
    rede: String(l.rede),
    nome: String(l.nome),
    simbolo: String(l.simbolo),
    descricao: l.descricao == null ? null : String(l.descricao),
    imagem: l.imagem == null ? null : String(l.imagem),
    criador: String(l.criador),
    assinatura: l.assinatura == null ? null : String(l.assinatura),
    criadaEm: Number(l.criada_em),
  }));
}

/* ------------------------------------------------------------------ */
/* Importação do que já existia                                        */
/* ------------------------------------------------------------------ */

/**
 * Traz os arquivos antigos pro banco, uma vez só.
 *
 * Os `.jsonl` NÃO são apagados — viram `.importado`. São dados de usuários de
 * verdade: se algo aqui estiver errado, o original precisa continuar existindo
 * pra conferência. Apagar seria irreversível por economia de 80 KB.
 */
function importarArquivosAntigos(banco: DatabaseSync) {
  const jaFoi = banco
    .prepare("SELECT valor FROM meta WHERE chave = 'importou_jsonl'")
    .get() as { valor: string } | undefined;

  if (jaFoi) return;

  const contas = path.join(DATA_DIR, "accounts.jsonl");
  const eventos = path.join(DATA_DIR, "affiliate-events.jsonl");

  let importadas = 0;
  let importados = 0;

  if (existsSync(contas)) {
    importadas = importarContas(banco, contas);
    renameSync(contas, `${contas}.importado`);
  }

  if (existsSync(eventos)) {
    importados = importarEventos(banco, eventos);
    renameSync(eventos, `${eventos}.importado`);
  }

  banco
    .prepare("INSERT INTO meta (chave, valor) VALUES ('importou_jsonl', ?)")
    .run(new Date().toISOString());

  if (importadas || importados) {
    console.info(
      `[db] importado do formato antigo: ${importadas} linha(s) de conta, ${importados} evento(s)`,
    );
  }
}

/** Lê um JSONL ignorando linha quebrada — o formato antigo permitia isso. */
function linhas<T>(arquivo: string): T[] {
  return readFileSync(arquivo, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l) as T;
      } catch {
        return null;
      }
    })
    .filter((v): v is T => v !== null);
}

interface ContaAntiga {
  nickname: string;
  displayName: string;
  wallet: string;
  kind: string;
  carteiras?: Record<string, string>;
  createdAt: number;
  avatar?: string;
  cover?: string;
}

const REDE_DO_KIND: Record<string, string> = { solana: "solana", evm: "robinhood" };

/**
 * Reconstrói as contas a partir do arquivo append-only.
 *
 * Cada linha era um retrato da conta naquele instante; a mesma pessoa aparece
 * várias vezes, com apelidos diferentes se ela renomeou. A costura é feita pela
 * CARTEIRA, que é o que não muda — e todo apelido encontrado pelo caminho vira
 * uma linha em `apelidos`, pra que os links antigos continuem funcionando.
 */
function importarContas(banco: DatabaseSync, arquivo: string): number {
  const registros = linhas<ContaAntiga>(arquivo);

  const acharPorCarteira = banco.prepare("SELECT conta FROM carteiras WHERE endereco = ?");
  const acharPorApelido = banco.prepare("SELECT conta FROM apelidos WHERE nickname = ?");

  banco.exec("BEGIN");
  try {
    for (const c of registros) {
      if (!c?.nickname) continue;

      const carteiras =
        c.carteiras && Object.keys(c.carteiras).length > 0
          ? c.carteiras
          : { [REDE_DO_KIND[c.kind] ?? "solana"]: c.wallet };

      const enderecos = Object.entries(carteiras).filter(([, e]) => Boolean(e));

      // A conta já existe? Procura por qualquer carteira, e depois pelo apelido.
      let id: number | null = null;
      for (const [, endereco] of enderecos) {
        const achou = acharPorCarteira.get(chaveDoEndereco(endereco)) as
          | { conta: number }
          | undefined;
        if (achou) {
          id = achou.conta;
          break;
        }
      }
      if (id === null) {
        const achou = acharPorApelido.get(c.nickname) as { conta: number } | undefined;
        if (achou) id = achou.conta;
      }

      if (id === null) {
        const r = banco
          .prepare(
            `INSERT INTO contas (apelido, display_name, wallet, kind, avatar, cover, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            c.nickname,
            c.displayName ?? c.nickname,
            c.wallet ?? "",
            c.kind ?? "solana",
            c.avatar ?? null,
            c.cover ?? null,
            c.createdAt ?? Date.now(),
          );
        id = Number(r.lastInsertRowid);
      } else {
        /*
         * Linha mais nova da mesma conta: atualiza o que muda. Foto ausente na
         * linha nova NÃO apaga a que já existia — o formato antigo omitia
         * campos, e tratar omissão como remoção apagaria a foto de alguém.
         */
        banco
          .prepare(
            `UPDATE contas SET apelido = ?, display_name = ?, wallet = ?, kind = ?,
                               avatar = COALESCE(?, avatar), cover = COALESCE(?, cover)
             WHERE id = ?`,
          )
          .run(
            c.nickname,
            c.displayName ?? c.nickname,
            c.wallet ?? "",
            c.kind ?? "solana",
            c.avatar ?? null,
            c.cover ?? null,
            id,
          );
      }

      banco
        .prepare(
          `INSERT INTO apelidos (nickname, conta, desde) VALUES (?, ?, ?)
           ON CONFLICT(nickname) DO NOTHING`,
        )
        .run(c.nickname, id, c.createdAt ?? Date.now());

      for (const [chain, endereco] of enderecos) {
        banco
          .prepare(
            `INSERT INTO carteiras (endereco, conta, chain) VALUES (?, ?, ?)
             ON CONFLICT(endereco) DO UPDATE SET conta = excluded.conta, chain = excluded.chain`,
          )
          .run(chaveDoEndereco(endereco), id, chain);
      }
    }
    banco.exec("COMMIT");
  } catch (erro) {
    banco.exec("ROLLBACK");
    throw erro;
  }

  return registros.length;
}

interface EventoAntigo {
  wallet: string;
  conta?: string;
  event: string;
  at: number;
  chain?: string;
  landedOn?: string;
  volumeUsd?: number;
  volumeNative?: number;
  commissionNative?: number;
  tokenAddress?: string;
  tokenSymbol?: string;
  txHash?: string;
}

function importarEventos(banco: DatabaseSync, arquivo: string): number {
  const registros = linhas<EventoAntigo>(arquivo);

  /*
   * `OR IGNORE` por causa do índice único de transação: o formato antigo não
   * impedia o mesmo swap de entrar várias vezes, e importar as duplicatas faria
   * o painel mostrar comissão que nunca foi paga.
   */
  const gravar = banco.prepare(`
    INSERT OR IGNORE INTO eventos_de_afiliado
      (wallet, conta, event, at, chain, landed_on, volume_usd, volume_native,
       commission_native, token_address, token_symbol, tx_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  banco.exec("BEGIN");
  try {
    for (const e of registros) {
      if (!e?.wallet || !e?.event) continue;
      gravar.run(
        e.wallet,
        e.conta ?? null,
        e.event,
        e.at ?? Date.now(),
        e.chain ?? null,
        e.landedOn ?? null,
        e.volumeUsd ?? null,
        e.volumeNative ?? null,
        e.commissionNative ?? null,
        e.tokenAddress ?? null,
        e.tokenSymbol ?? null,
        e.txHash ?? null,
      );
    }
    banco.exec("COMMIT");
  } catch (erro) {
    banco.exec("ROLLBACK");
    throw erro;
  }

  return registros.length;
}

/* ------------------------------------------------------------------ */

/**
 * Como um endereço vira chave.
 *
 * Endereço EVM é insensível a maiúsculas — `0xAbC` e `0xabc` são a MESMA
 * carteira — enquanto o da Solana é sensível. Guardar sem normalizar deixaria a
 * mesma carteira EVM entrar duas vezes em contas diferentes, que é exatamente o
 * furo que a chave primária existe pra fechar.
 */
export function chaveDoEndereco(endereco: string): string {
  return endereco.startsWith("0x") ? endereco.toLowerCase() : endereco;
}
