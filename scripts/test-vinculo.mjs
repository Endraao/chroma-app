/**
 * Vincular uma carteira nova funciona de ponta a ponta?
 *
 * Gera uma carteira EVM de teste, cria uma conta pra ela, ASSINA a mensagem de
 * verdade e chama `/api/account/link` pra vincular uma carteira Solana.
 * É o mesmo caminho que o navegador percorre.
 *
 * Apaga tudo no fim.
 */
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const BASE = "http://localhost:3000";
const MARCA = "zzvinculo";
/* Base58 NÃO tem l, O, 0 nem I — um "Solana" literal aqui seria recusado. */
const SOL_NOVA = "TesteVincu1arSo1anaXXXXXXXXXXXXXXXXXXXXXXXX";

const sql = neon(
  fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/m)[1],
);

let falhas = 0;
const ok = (c, m, e = "") => {
  console.log(`${c ? "  ok  " : " FALHA"}  ${m}${e ? "  → " + e : ""}`);
  if (!c) falhas++;
};

const dono = privateKeyToAccount(generatePrivateKey());

async function limpar() {
  await sql.query(`DELETE FROM carteiras WHERE endereco = ANY($1)`, [
    [dono.address.toLowerCase(), SOL_NOVA],
  ]);
  await sql.query(`DELETE FROM apelidos WHERE nickname LIKE $1`, [`${MARCA}%`]);
  await sql.query(`DELETE FROM contas WHERE apelido LIKE $1`, [`${MARCA}%`]);
}

try {
  await limpar();

  /* 1. A conta nasce com a carteira EVM, como a do dono do projeto. */
  const criar = await fetch(`${BASE}/api/account`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nickname: `${MARCA}dono`, wallet: dono.address, kind: "evm" }),
  });
  const conta = await criar.json();
  ok(criar.ok, "conta criada com a carteira EVM", conta?.account?.nickname ?? conta?.error);
  ok(!conta.account?.carteiras?.solana, "e NÃO tem carteira Solana ainda — é o estado do problema");

  /* 2. Monta a MESMA mensagem que a tela monta e assina com a carteira da conta. */
  const momento = Date.now();
  const mensagem = [
    "Chroma — vincular carteira",
    "",
    `Conta: @${MARCA}dono`,
    `Rede: solana`,
    `Carteira: ${SOL_NOVA}`,
    `Momento: ${new Date(momento).toISOString()}`,
    "",
    "Assinar apenas comprova que esta carteira é sua.",
    "Não move fundos e não dá permissão sobre eles.",
  ].join("\n");

  const assinatura = await dono.signMessage({ message: mensagem });

  const res = await fetch(`${BASE}/api/account/link`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      assinante: dono.address,
      endereco: SOL_NOVA,
      chain: "solana",
      mensagem,
      assinatura,
    }),
  });
  const data = await res.json();

  console.log("\n=== vincular a Solana assinando com a EVM ===");
  ok(res.ok, "a rota aceitou", res.ok ? "" : `${res.status} ${data?.error}`);
  ok(data.account?.carteiras?.solana === SOL_NOVA, "a Solana entrou na conta", data.account?.carteiras?.solana);
  ok(!!data.account?.carteiras?.robinhood, "e a EVM continua lá");

  console.log("\n=== o painel de indicação enxerga? ===");
  const painel = await (await fetch(`${BASE}/api/affiliate?wallet=${SOL_NOVA},${dono.address}`)).json();
  ok(!!painel.carteiras?.solana, "o aviso 'não tem carteira Solana' some", painel.carteiras?.solana);
  ok(!!painel.carteiras?.robinhood, "e o da Robinhood também");

  console.log("\n=== o que tem que ser recusado ===");
  const ruim = await fetch(`${BASE}/api/account/link`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      assinante: dono.address,
      endereco: "OutraCarteiraQua1querXXXXXXXXXXXXXXXXXXXXX",
      chain: "solana",
      mensagem, // mensagem de OUTRO endereço
      assinatura,
    }),
  });
  ok(!ruim.ok, "assinatura reaproveitada pra outro endereço é recusada", `HTTP ${ruim.status}`);
} finally {
  await limpar();
  const r = await sql.query(`SELECT COUNT(*)::int AS n FROM contas WHERE apelido LIKE $1`, [`${MARCA}%`]);
  const t = await sql.query(`SELECT COUNT(*)::int AS n FROM contas`);
  console.log(`\nlimpeza: ${r[0].n} de teste | total no banco: ${t[0].n}`);
}

console.log(falhas === 0 ? "\n✓ tudo certo\n" : `\n✗ ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
