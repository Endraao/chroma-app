import { neon, Pool, type PoolClient } from "@neondatabase/serverless";

/**
 * O banco do site.
 *
 * ---------------------------------------------------------------------------
 * POR QUE SAIU DO SQLITE
 * ---------------------------------------------------------------------------
 * Não foi por limitação do SQLite — ele dava conta. Foi por causa de ONDE o
 * site vai rodar.
 *
 * Na Vercel o disco é somente-leitura e some a cada publicação nova. Um banco
 * em arquivo ali significa contas, apelidos, vínculos de carteira e eventos de
 * afiliado desaparecendo a cada deploy — e, o que é pior, **funcionando
 * perfeitamente na máquina de desenvolvimento**. É o tipo de defeito que só
 * aparece em produção, com dado de gente de verdade.
 *
 * Então o estado foi pra um Postgres gerenciado (Neon), que é um serviço de
 * fora e não depende do disco de quem serve as páginas.
 *
 * ---------------------------------------------------------------------------
 * DOIS JEITOS DE FALAR COM O BANCO, E QUANDO USAR CADA UM
 * ---------------------------------------------------------------------------
 * `sql` — consulta por HTTP. Uma ida e volta, sem abrir conexão. É o certo pra
 * 95% do que fazemos, e é o que faz diferença em função serverless, onde cada
 * chamada pode nascer num processo novo.
 *
 * `comTransacao` — abre conexão de verdade por WebSocket. Custa mais, então só
 * entra onde precisa LER, DECIDIR e ESCREVER sem que ninguém se meta no meio:
 * hoje, o registro de apelido. Ali a leitura decide se cria conta ou atualiza a
 * existente, e duas requisições simultâneas sem transação criariam duas contas
 * pra mesma pessoa — com o dinheiro do afiliado indo pra uma delas.
 *
 * ---------------------------------------------------------------------------
 * AS REGRAS DE DINHEIRO SÃO DO BANCO, NÃO DO CÓDIGO
 * ---------------------------------------------------------------------------
 * Isto valia no SQLite e continua valendo: "uma carteira pertence a uma conta
 * só" é chave primária, e "um swap conta uma vez" é índice único. Checagem em
 * JavaScript não segura duas requisições que chegam juntas — e essas duas
 * regras decidem pra onde o dinheiro vai.
 */

function urlDoBanco(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL não configurada. Na Vercel ela vem do Neon; localmente, do .env.local.",
    );
  }
  return url;
}

/** Consulta simples, por HTTP. Use este na dúvida. */
export const sql = neon(urlDoBanco());

/**
 * Executa um bloco dentro de uma transação de verdade.
 *
 * Abre conexão, roda, e fecha SEMPRE — inclusive quando o bloco lança. Sem o
 * `finally` uma exceção deixaria a conexão presa, e em serverless isso vira
 * esgotamento do limite do Neon depois de algumas falhas.
 */
export async function comTransacao<T>(bloco: (c: PoolClient) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: urlDoBanco() });
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    const resultado = await bloco(cliente);
    await cliente.query("COMMIT");
    return resultado;
  } catch (erro) {
    try {
      await cliente.query("ROLLBACK");
    } catch {
      /* a conexão já pode ter caído; o importante é não engolir o erro de cima */
    }
    throw erro;
  } finally {
    cliente.release();
    await pool.end();
  }
}

/* ------------------------------------------------------------------ */
/* Esquema                                                             */
/* ------------------------------------------------------------------ */

/**
 * Cria as tabelas, uma vez por processo.
 *
 * Guardado numa promessa de módulo, e não num booleano: em serverless várias
 * requisições chegam juntas no mesmo processo recém-nascido, e um booleano
 * deixaria todas passarem antes da primeira terminar. Com a promessa, a
 * primeira cria e as outras esperam a mesma.
 */
let criacao: Promise<void> | null = null;

export function banco(): Promise<void> {
  criacao ??= criarTabelas();
  return criacao;
}

async function criarTabelas(): Promise<void> {
  /*
   * Uma instrução por chamada: o driver HTTP do Neon não aceita várias
   * separadas por ponto e vírgula numa consulta só.
   */
  const passos = [
    /*
     * A conta tem identidade PRÓPRIA, não é o apelido.
     *
     * Parece detalhe e não é: o apelido muda, e quando muda o antigo precisa
     * continuar funcionando. Se a chave fosse o apelido, renomear seria apagar
     * a conta e criar outra — e todo link de indicação já espalhado por aí
     * apontaria pro vazio.
     */
    `CREATE TABLE IF NOT EXISTS contas (
       id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
       apelido      TEXT NOT NULL,
       display_name TEXT NOT NULL,
       wallet       TEXT NOT NULL,
       kind         TEXT NOT NULL,
       avatar       TEXT,
       cover        TEXT,
       created_at   BIGINT NOT NULL
     )`,

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
    `CREATE TABLE IF NOT EXISTS apelidos (
       nickname TEXT PRIMARY KEY,
       conta    BIGINT NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
       desde    BIGINT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_apelidos_conta ON apelidos(conta)`,

    /*
     * QUEM INDICOU ESTA CONTA. Gravado uma vez, nunca sobrescrito.
     *
     * ---------------------------------------------------------------------
     * POR QUE NA CONTA, E NÃO SÓ NO NAVEGADOR
     * ---------------------------------------------------------------------
     * A atribuição de indicação vivia apenas no `localStorage` de quem clicou
     * no link. Isso funciona enquanto a pessoa fica no mesmo navegador — e
     * some quando ela troca de aparelho, limpa o histórico ou abre em aba
     * anônima. O promotor perdia a comissão sem nunca saber por quê.
     *
     * Pior: com uma carteira por rede, quem entrou pelo link na Solana e
     * depois conectou a Robinhood podia ser tratado como visita nova. As duas
     * redes da MESMA pessoa precisam pagar o MESMO promotor.
     *
     * Guardando na conta, o vínculo passa a valer para todas as carteiras
     * dela, em qualquer rede e em qualquer aparelho.
     *
     * Guarda o APELIDO, não o id: é o que sobrevive a o promotor trocar de
     * carteira, e é o mesmo identificador que anda no `?ref=`.
     *
     * `ADD COLUMN IF NOT EXISTS` porque a tabela já existe em produção com
     * dados reais — criar de novo apagaria contas de gente.
     */
    `ALTER TABLE contas ADD COLUMN IF NOT EXISTS indicado_por TEXT`,
    `CREATE INDEX IF NOT EXISTS idx_contas_indicado_por ON contas(indicado_por)`,

    /*
     * Carteiras em tabela própria, não num campo JSON.
     *
     * A chave primária é o endereço, e é ela que torna "uma carteira pertence
     * a uma conta só" uma regra do BANCO, não uma checagem que duas
     * requisições simultâneas atravessam juntas.
     *
     * Guardado em minúsculas quando é EVM: lá o mesmo endereço pode vir
     * escrito de várias formas, e sem normalizar ele entraria duas vezes.
     */
    `CREATE TABLE IF NOT EXISTS carteiras (
       endereco TEXT PRIMARY KEY,
       conta    BIGINT NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
       chain    TEXT NOT NULL,
       UNIQUE (conta, chain)
     )`,
    `CREATE INDEX IF NOT EXISTS idx_carteiras_conta ON carteiras(conta)`,

    `CREATE TABLE IF NOT EXISTS eventos_de_afiliado (
       id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
       wallet            TEXT NOT NULL,
       conta             TEXT,
       event             TEXT NOT NULL,
       at                BIGINT NOT NULL,
       chain             TEXT,
       landed_on         TEXT,
       volume_usd        DOUBLE PRECISION,
       volume_native     DOUBLE PRECISION,
       commission_native DOUBLE PRECISION,
       token_address     TEXT,
       token_symbol      TEXT,
       tx_hash           TEXT
     )`,

    /* O painel do promotor filtra por conta ou por carteira, sempre por tempo. */
    `CREATE INDEX IF NOT EXISTS idx_eventos_conta ON eventos_de_afiliado(conta, at)`,
    `CREATE INDEX IF NOT EXISTS idx_eventos_wallet ON eventos_de_afiliado(wallet, at)`,

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
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_eventos_tx
       ON eventos_de_afiliado(tx_hash) WHERE tx_hash IS NOT NULL`,

    `CREATE TABLE IF NOT EXISTS meta (
       chave TEXT PRIMARY KEY,
       valor TEXT NOT NULL
     )`,

    /*
     * As moedas lançadas AQUI.
     *
     * A vitrine da home é montada a partir de fontes de mercado, e moeda que
     * acabou de nascer na nossa curva ainda não tem par em DEX nenhuma. Sem
     * este registro, a launchpad lançava a moeda e ela sumia da própria
     * vitrine até migrar pra Raydium.
     *
     * Guarda só o que a rede NÃO responde: nome, arte, criador. Preço,
     * capitalização e progresso saem da conta da curva a cada leitura — número
     * de mercado guardado em banco envelhece sem ninguém perceber.
     */
    `CREATE TABLE IF NOT EXISTS moedas (
       endereco   TEXT PRIMARY KEY,
       rede       TEXT NOT NULL,
       nome       TEXT NOT NULL,
       simbolo    TEXT NOT NULL,
       descricao  TEXT,
       imagem     TEXT,
       criador    TEXT NOT NULL,
       assinatura TEXT,
       criada_em  BIGINT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_moedas_criada ON moedas(criada_em DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_moedas_criador ON moedas(criador)`,

    /*
     * Denúncias de moeda.
     *
     * ---------------------------------------------------------------------
     * POR QUE ISTO EXISTE
     * ---------------------------------------------------------------------
     * Qualquer pessoa cria uma moeda aqui, com o nome e a arte que quiser.
     * É assim que a launchpad funciona — e é também como o site acaba
     * hospedando insulto racial, pornografia e golpe explícito, do jeito que
     * acontece em toda plataforma do gênero que não se protegeu.
     *
     * Isso é risco NOSSO, não do denunciante: provedor de hospedagem,
     * provedor de dados e lei brasileira cobram de quem publica. A diferença
     * entre "não fizemos nada" e "temos canal e agimos" é literalmente esta
     * tabela.
     *
     * Guarda o denunciante só como carteira opcional — não pedimos identidade
     * pra alguém apontar um crime.
     */
    `CREATE TABLE IF NOT EXISTS denuncias (
       id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
       token     TEXT NOT NULL,
       rede      TEXT,
       simbolo   TEXT,
       motivo    TEXT NOT NULL,
       detalhe   TEXT,
       carteira  TEXT,
       ip_hash   TEXT,
       estado    TEXT NOT NULL DEFAULT 'aberta',
       criada_em BIGINT NOT NULL
     )`,
    /* A fila de moderação é sempre "o que está aberto, mais novo primeiro". */
    `CREATE INDEX IF NOT EXISTS idx_denuncias_fila ON denuncias(estado, criada_em DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_denuncias_token ON denuncias(token)`,

    /*
     * Mensagens do formulário de contato e suporte.
     *
     * Vai pro banco ANTES de tentar e-mail, e isso não é ordem à toa: se o
     * envio falhar — chave errada, serviço fora, cota estourada — a mensagem
     * da pessoa continua aqui. Formulário que só manda e-mail perde pedido de
     * ajuda em silêncio, e quem escreveu acha que foi ignorado.
     */
    `CREATE TABLE IF NOT EXISTS mensagens (
       id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
       nome      TEXT NOT NULL,
       email     TEXT NOT NULL,
       carteira  TEXT,
       assunto   TEXT NOT NULL,
       texto     TEXT NOT NULL,
       ip_hash   TEXT,
       enviada   BOOLEAN NOT NULL DEFAULT FALSE,
       estado    TEXT NOT NULL DEFAULT 'aberta',
       criada_em BIGINT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_mensagens_fila ON mensagens(estado, criada_em DESC)`,

    /*
     * O livro-razão de pontos do airdrop.
     *
     * ---------------------------------------------------------------------
     * É LANÇAMENTO, NÃO PLACAR
     * ---------------------------------------------------------------------
     * Cada linha é um fato que aconteceu e não muda mais: "esta carteira
     * ganhou 340 pontos por ESTE swap, nesta data". O total de alguém é a
     * SOMA das linhas, calculada na hora.
     *
     * A alternativa — uma coluna `total` que sobe a cada evento — parece mais
     * simples e é uma armadilha. Um bug que some errado uma vez corrompe o
     * número pra sempre, sem deixar rastro de quando nem por quê. E no dia da
     * distribuição, quem discordar do próprio saldo não tem o que conferir.
     * Aqui tem: dá pra abrir a conta lançamento por lançamento.
     *
     * ---------------------------------------------------------------------
     * `referencia` É O QUE IMPEDE CRÉDITO DUPLO
     * ---------------------------------------------------------------------
     * Assinatura da transação, endereço da moeda, id da indicação — o que
     * for, mas único e vindo de fora. Com o índice único em (tipo,
     * referencia), reenviar o mesmo swap dez vezes credita uma vez só.
     *
     * Esta é a mesma lição que os eventos de afiliado já ensinaram: sem o
     * índice, 136 registros de trade eram 6 transações repetidas. Lá isso
     * inflava um painel; aqui inflaria a fatia que alguém recebe de um token
     * com valor de mercado.
     */
    `CREATE TABLE IF NOT EXISTS pontos (
       id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
       carteira   TEXT NOT NULL,
       rede       TEXT NOT NULL,
       tipo       TEXT NOT NULL,
       pontos     INTEGER NOT NULL,
       referencia TEXT NOT NULL,
       detalhe    TEXT,
       temporada  INTEGER NOT NULL DEFAULT 1,
       criado_em  BIGINT NOT NULL
     )`,
    /* A regra de "cada fato conta uma vez" é do BANCO, não do código. */
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_pontos_unico ON pontos(tipo, referencia)`,
    /* O saldo de uma carteira é sempre "soma tudo desta carteira na temporada". */
    `CREATE INDEX IF NOT EXISTS idx_pontos_carteira ON pontos(carteira, temporada)`,
    `CREATE INDEX IF NOT EXISTS idx_pontos_tipo ON pontos(temporada, tipo)`,
  ];

  for (const passo of passos) await sql.query(passo);
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
 * `ON CONFLICT DO NOTHING`: a página de criação pode chamar duas vezes se a
 * pessoa recarregar, e o segundo registro não pode sobrescrever o primeiro — é
 * o primeiro que carrega a assinatura da transação que de fato criou a moeda.
 *
 * ATENÇÃO: esta função NÃO verifica nada. Quem chama é responsável por provar
 * que a moeda é mesmo da nossa curva — ver `POST /api/moedas`, que confere na
 * rede antes de chegar aqui.
 */
export async function registrarMoeda(m: MoedaRegistrada): Promise<void> {
  await banco();
  await sql.query(
    `INSERT INTO moedas
       (endereco, rede, nome, simbolo, descricao, imagem, criador, assinatura, criada_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (endereco) DO NOTHING`,
    [
      m.endereco,
      m.rede,
      m.nome,
      m.simbolo,
      m.descricao,
      m.imagem,
      m.criador,
      m.assinatura,
      m.criadaEm,
    ],
  );
}

/** As últimas moedas lançadas na Chroma, da mais nova pra mais velha. */
export async function listarMoedasDaChroma(limite = 60): Promise<MoedaRegistrada[]> {
  await banco();
  const linhas = (await sql.query(
    `SELECT endereco, rede, nome, simbolo, descricao, imagem, criador, assinatura, criada_em
       FROM moedas ORDER BY criada_em DESC LIMIT $1`,
    [limite],
  )) as Record<string, unknown>[];

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

/**
 * A forma canônica de um endereço, pra servir de chave.
 *
 * Em EVM o mesmo endereço aparece escrito de várias formas (com e sem
 * maiúsculas de checksum), e sem normalizar a mesma carteira entraria duas
 * vezes na tabela — o que quebraria justamente a regra de "uma carteira, uma
 * conta". Em Solana a caixa faz parte do endereço e não pode ser mexida.
 */
export function chaveDoEndereco(endereco: string): string {
  return endereco.startsWith("0x") ? endereco.toLowerCase() : endereco;
}
