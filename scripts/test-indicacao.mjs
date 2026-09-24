/**
 * Prova que a comissão de indicação resolve NAS DUAS REDES.
 *
 * Testa pela ROTA HTTP real (`/api/affiliate/indicador`), e não chamando a
 * função direto: é o caminho que o navegador percorre antes de cada swap, com
 * validação de parâmetro e tratamento de erro no meio.
 *
 * Cenário:
 *   promotor  → carteira em Solana E em Robinhood
 *   indicado  → entrou pelo link dele, também tem as duas
 *
 * TUDO É APAGADO NO FINAL, mesmo se o teste falhar no meio.
 *
 * EXIGE o servidor rodando (`npm run dev`) e o banco acessível:
 *
 *   npm run test:indicacao
 *
 * Ele escreve no banco que o .env.local apontar. Se isso for produção, as
 * contas de teste nascem e morrem dentro da mesma execução — mas confira o
 * "total de contas no banco" impresso no fim.
 */
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";

const BASE = "http://localhost:3000";
const MARCA = "zzteste";
const SOL_PROMOTOR = "PromoTesteSo1anaXXXXXXXXXXXXXXXXXXXXXXXXXXX";
const EVM_PROMOTOR = "0xaaaa000000000000000000000000000000000001";
const SOL_INDICADO = "IndicTesteSo1anaXXXXXXXXXXXXXXXXXXXXXXXXXXX";
const EVM_INDICADO = "0xbbbb000000000000000000000000000000000002";

const sql = neon(
  fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/m)[1],
);

let falhas = 0;
const ok = (cond, msg, extra = "") => {
  console.log(`${cond ? "  ok  " : " FALHA"}  ${msg}${extra ? "  → " + extra : ""}`);
  if (!cond) falhas++;
};

const perguntar = async (wallet, chain) => {
  const r = await fetch(`${BASE}/api/affiliate/indicador?wallet=${wallet}&chain=${chain}`);
  return (await r.json()).indicador;
};

async function limpar() {
  await sql.query(`DELETE FROM carteiras WHERE endereco = ANY($1)`, [
    [SOL_PROMOTOR, EVM_PROMOTOR, SOL_INDICADO, EVM_INDICADO],
  ]);
  await sql.query(`DELETE FROM apelidos WHERE nickname LIKE $1`, [`${MARCA}%`]);
  await sql.query(`DELETE FROM contas WHERE apelido LIKE $1`, [`${MARCA}%`]);
}

try {
  await limpar();
  const agora = Date.now();

  const criar = async (apelido, wallet, kind, indicadoPor) => {
    const r = await sql.query(
      `INSERT INTO contas (apelido, display_name, wallet, kind, created_at, indicado_por)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [apelido, apelido, wallet, kind, agora, indicadoPor],
    );
    const id = Number(r[0].id);
    await sql.query(`INSERT INTO apelidos (nickname, conta, desde) VALUES ($1,$2,$3)`, [apelido, id, agora]);
    return id;
  };
  const vincular = (e, c, ch) =>
    sql.query(`INSERT INTO carteiras (endereco, conta, chain) VALUES ($1,$2,$3)`, [e, c, ch]);

  const promotor = await criar(`${MARCA}-promotor`, SOL_PROMOTOR, "solana", null);
  await vincular(SOL_PROMOTOR, promotor, "solana");
  await vincular(EVM_PROMOTOR, promotor, "robinhood");

  const indicado = await criar(`${MARCA}-indicado`, SOL_INDICADO, "solana", `${MARCA}-promotor`);
  await vincular(SOL_INDICADO, indicado, "solana");
  await vincular(EVM_INDICADO, indicado, "robinhood");

  console.log("\n=== o indicado opera na SOLANA ===");
  const a = await perguntar(SOL_INDICADO, "solana");
  ok(a !== null, "encontra o promotor");
  ok(a?.endereco === SOL_PROMOTOR, "paga na carteira SOLANA do promotor", a?.endereco);

  console.log("\n=== o MESMO indicado opera na ROBINHOOD, com OUTRA carteira ===");
  const b = await perguntar(EVM_INDICADO, "robinhood");
  ok(b !== null, "ainda encontra o promotor — o vínculo é da CONTA, não da carteira");
  ok(b?.endereco === EVM_PROMOTOR, "paga na carteira ROBINHOOD do promotor", b?.endereco);
  ok(a?.apelido === b?.apelido, "é o mesmo promotor nas duas redes", `${a?.apelido} = ${b?.apelido}`);

  console.log("\n=== o que tem que devolver nada ===");
  ok((await perguntar(SOL_PROMOTOR, "solana")) === null, "o promotor não tem indicador");
  ok(
    (await perguntar("CarteiraQueNaoExisteXXXXXXXXXXXXXXXXXXXXXXX", "solana")) === null,
    "carteira desconhecida não gera comissão",
  );

  console.log("\n=== auto-indicação ===");
  await sql.query(`UPDATE contas SET indicado_por = $1 WHERE id = $2`, [`${MARCA}-indicado`, indicado]);
  ok((await perguntar(SOL_INDICADO, "solana")) === null, "indicar a si mesmo é recusado");

  console.log("\n=== promotor SEM carteira na rede do swap ===");
  await sql.query(`UPDATE contas SET indicado_por = $1 WHERE id = $2`, [`${MARCA}-promotor`, indicado]);
  await sql.query(`DELETE FROM carteiras WHERE endereco = $1`, [EVM_PROMOTOR]);
  ok(
    (await perguntar(EVM_INDICADO, "robinhood")) === null,
    "sem carteira na rede, não há pra onde pagar",
  );
  ok((await perguntar(SOL_INDICADO, "solana")) !== null, "mas a outra rede continua pagando");
} finally {
  await limpar();
  const resto = await sql.query(`SELECT COUNT(*)::int AS n FROM contas WHERE apelido LIKE $1`, [`${MARCA}%`]);
  const total = await sql.query(`SELECT COUNT(*)::int AS n FROM contas`);
  console.log(`\nlimpeza: ${resto[0].n} conta(s) de teste restante(s) | total de contas no banco: ${total[0].n}`);
}

console.log(falhas === 0 ? "\n✓ tudo certo\n" : `\n✗ ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
