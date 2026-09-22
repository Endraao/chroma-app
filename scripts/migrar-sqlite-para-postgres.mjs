/**
 * Move o conteúdo do SQLite antigo (.data/chroma.db) pro Postgres.
 *
 * ---------------------------------------------------------------------------
 * POR QUE OS IDs SÃO PRESERVADOS
 * ---------------------------------------------------------------------------
 * `apelidos.conta` e `carteiras.conta` apontam pro `contas.id`. Deixar o
 * Postgres gerar ids novos quebraria esses apontamentos em silêncio: o apelido
 * de uma pessoa passaria a apontar pra conta de outra, e a comissão junto.
 *
 * Por isso o id vai explícito, com `OVERRIDING SYSTEM VALUE`, e no fim a
 * sequência é adiantada pro maior id usado — senão a próxima conta criada pelo
 * site nasceria com id 1 e colidiria com o que acabou de ser importado.
 *
 * ---------------------------------------------------------------------------
 * RODAR DUAS VEZES NÃO DUPLICA
 * ---------------------------------------------------------------------------
 * Todo INSERT tem `ON CONFLICT DO NOTHING`. Se a migração parar no meio por
 * queda de rede, é só rodar de novo: o que já entrou é ignorado e o resto
 * continua de onde parou.
 *
 * Uso: node scripts/migrar-sqlite-para-postgres.mjs
 */
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const ARQUIVO = ".data/chroma.db";

if (!fs.existsSync(ARQUIVO)) {
  console.log(`Não achei ${ARQUIVO} — nada a migrar.`);
  process.exit(0);
}

const env = fs.readFileSync(".env.local", "utf8");
process.env.DATABASE_URL = (env.match(/^DATABASE_URL=(.+)$/m) || [])[1]?.trim();
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não está no .env.local");
  process.exit(1);
}

const { banco, sql } = await import("../src/lib/db.ts");
await banco();

/*
 * -------------------------------------------------------------------------
 * O DESTINO TEM QUE ESTAR VAZIO
 * -------------------------------------------------------------------------
 * Isto não é zelo — é conserto de um erro que aconteceu de verdade na
 * primeira execução.
 *
 * O site estava rodando enquanto a migração corria. Alguém criou uma conta
 * pelo navegador e ela nasceu com `id 1`. Quando a migração chegou na conta
 * de `id 1` que vinha do SQLite, o `ON CONFLICT (id) DO NOTHING` a descartou
 * EM SILÊNCIO — e os apelidos e carteiras dela, que já tinham sido inseridos,
 * ficaram apontando pra conta de outra pessoa.
 *
 * Ninguém veria isso: os totais batiam, nenhum erro aparecia, e o link de
 * indicação de alguém passaria a pagar outra pessoa.
 *
 * Então: ou o destino está vazio, ou a migração não roda. Com `--limpar` ela
 * apaga o destino antes — e aí a decisão é explícita de quem digitou.
 */
const limpar = process.argv.includes("--limpar");
const TABELAS = ["eventos_de_afiliado", "carteiras", "apelidos", "moedas", "contas"];

if (limpar) {
  // Ordem importa: filhas antes das mães, senão a chave estrangeira barra.
  for (const t of TABELAS) await sql.query(`DELETE FROM ${t}`);
  console.log("destino limpo\n");
} else {
  const ocupadas = [];
  for (const t of TABELAS) {
    const r = await sql.query(`SELECT COUNT(*)::int AS c FROM ${t}`);
    if (r[0].c > 0) ocupadas.push(`${t} (${r[0].c})`);
  }
  if (ocupadas.length) {
    console.error("O Postgres NÃO está vazio:", ocupadas.join(", "));
    console.error("");
    console.error("Migrar por cima descartaria linhas em silêncio e deixaria apelido");
    console.error("apontando pra conta errada. Rode com --limpar pra apagar o destino");
    console.error("antes, ou confira o que já está lá.");
    console.error("");
    console.error("Antes de rodar, PARE o servidor de desenvolvimento: com ele de pé,");
    console.error("uma visita ao site cria conta no meio da migração.");
    process.exit(1);
  }
}

const antigo = new DatabaseSync(ARQUIVO, { readOnly: true });
const ler = (tabela) => {
  try {
    return antigo.prepare(`SELECT * FROM ${tabela}`).all();
  } catch {
    return [];
  }
};

/* --- contas ------------------------------------------------------- */
const contas = ler("contas");
for (const c of contas) {
  await sql.query(
    `INSERT INTO contas (id, apelido, display_name, wallet, kind, avatar, cover, created_at)
     OVERRIDING SYSTEM VALUE
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO NOTHING`,
    [c.id, c.apelido, c.display_name, c.wallet, c.kind, c.avatar, c.cover, c.created_at],
  );
}

/*
 * A sequência precisa passar do maior id importado. Sem isto, a próxima conta
 * criada pelo site tentaria o id 1 e esbarraria numa que acabou de entrar.
 */
if (contas.length) {
  const maior = Math.max(...contas.map((c) => Number(c.id)));
  await sql.query(`ALTER TABLE contas ALTER COLUMN id RESTART WITH ${maior + 1}`);
}

/* --- apelidos, carteiras, eventos, moedas -------------------------- */
const apelidos = ler("apelidos");
for (const a of apelidos) {
  await sql.query(
    `INSERT INTO apelidos (nickname, conta, desde) VALUES ($1, $2, $3)
     ON CONFLICT (nickname) DO NOTHING`,
    [a.nickname, a.conta, a.desde],
  );
}

const carteiras = ler("carteiras");
for (const w of carteiras) {
  await sql.query(
    `INSERT INTO carteiras (endereco, conta, chain) VALUES ($1, $2, $3)
     ON CONFLICT (endereco) DO NOTHING`,
    [w.endereco, w.conta, w.chain],
  );
}

const eventos = ler("eventos_de_afiliado");
for (const e of eventos) {
  await sql.query(
    `INSERT INTO eventos_de_afiliado
       (wallet, conta, event, at, chain, landed_on, volume_usd, volume_native,
        commission_native, token_address, token_symbol, tx_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT DO NOTHING`,
    [
      e.wallet, e.conta, e.event, e.at, e.chain, e.landed_on,
      e.volume_usd, e.volume_native, e.commission_native,
      e.token_address, e.token_symbol, e.tx_hash,
    ],
  );
}

const moedas = ler("moedas");
for (const m of moedas) {
  await sql.query(
    `INSERT INTO moedas
       (endereco, rede, nome, simbolo, descricao, imagem, criador, assinatura, criada_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (endereco) DO NOTHING`,
    [m.endereco, m.rede, m.nome, m.simbolo, m.descricao, m.imagem, m.criador, m.assinatura, m.criada_em],
  );
}

/* --- conferência: contou igual dos dois lados? --------------------- */
console.log("tabela                 SQLite  ->  Postgres");
let tudoBate = true;
for (const [tabela, origem] of [
  ["contas", contas],
  ["apelidos", apelidos],
  ["carteiras", carteiras],
  ["eventos_de_afiliado", eventos],
  ["moedas", moedas],
]) {
  const r = await sql.query(`SELECT COUNT(*)::int AS c FROM ${tabela}`);
  const destino = r[0].c;
  const bate = destino >= origem.length;
  if (!bate) tudoBate = false;
  console.log(
    `  ${tabela.padEnd(20)} ${String(origem.length).padStart(5)}  ->  ${String(destino).padStart(5)}  ${bate ? "ok" : "FALTOU"}`,
  );
}

/*
 * Um teste que conta mais que os números: um apelido qualquer tem que chegar
 * na conta certa DEPOIS da migração. É o caminho que decide a comissão.
 */
if (apelidos.length) {
  const amostra = apelidos[0];
  const r = await sql.query(
    `SELECT c.apelido, c.wallet FROM apelidos a JOIN contas c ON c.id = a.conta WHERE a.nickname = $1`,
    [amostra.nickname],
  );
  const contaOriginal = contas.find((c) => c.id === amostra.conta);
  const ok = r[0] && contaOriginal && r[0].wallet === contaOriginal.wallet;
  if (!ok) tudoBate = false;
  console.log(`\nligação apelido -> conta: ${ok ? "confere" : "QUEBROU"} (@${amostra.nickname})`);
}

console.log(tudoBate ? "\nMIGRAÇÃO OK" : "\nMIGRAÇÃO INCOMPLETA — não apague o SQLite");
process.exit(tudoBate ? 0 : 1);
