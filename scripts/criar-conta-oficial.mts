// Cria a conta oficial "@chroma" para a carteira da plataforma (apelido reservado).
// Uso: npx tsx --env-file=.env.local scripts/criar-conta-oficial.mts
import { banco, sql } from "../src/lib/db.ts";

const CARTEIRA = "2jbvKgnx1uiH3TWttr5Y2qMmb6knBmSVpdW4BAmhWomY";
await banco();
const ja = (await sql.query(`SELECT conta FROM carteiras WHERE endereco = $1`, [CARTEIRA])) as { conta: number }[];
const apelido = (await sql.query(`SELECT conta FROM apelidos WHERE nickname = 'chroma'`)) as { conta: number }[];
if (ja.length || apelido.length) {
  console.log("já existe:", { carteira: ja, apelido });
  process.exit(0);
}
const agora = Date.now();
const [{ id }] = (await sql.query(
  `INSERT INTO contas (apelido, display_name, wallet, kind, created_at, indicado_por) VALUES ('chroma', 'Chroma', $1, 'solana', $2, NULL) RETURNING id`,
  [CARTEIRA, agora],
)) as { id: number }[];
await sql.query(`INSERT INTO apelidos (nickname, conta, desde) VALUES ('chroma', $1, $2)`, [id, agora]);
await sql.query(`INSERT INTO carteiras (endereco, conta, chain) VALUES ($1, $2, 'solana')`, [CARTEIRA, id]);
console.log("conta criada:", id);
