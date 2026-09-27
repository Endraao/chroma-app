/**
 * O ABI escrito à mão bate com o que o compilador gerou?
 *
 * ---------------------------------------------------------------------------
 * POR QUE ESTE TESTE EXISTE
 * ---------------------------------------------------------------------------
 * `src/lib/chroma-evm.ts` declara à mão só as funções que o site usa, em vez
 * de importar o JSON do build — que traz bytecode e metadados, centenas de
 * kilobytes que iriam parar no pacote do navegador para usar oito funções.
 *
 * O preço dessa escolha é a divergência silenciosa. Ela já aconteceu: o evento
 * `Lancada` foi escrito com quatro campos e o contrato declara cinco. Como o
 * identificador de um evento é o hash da assinatura inteira, um campo a menos
 * gera outro hash, nenhum registro casa, e o lançamento termina com "não foi
 * possível ler o endereço da moeda" sem nada apontando o motivo.
 *
 * O mesmo vale para função: trocar a ordem de dois argumentos do mesmo tipo
 * não dá erro de compilação nenhum — dá transação que executa com os valores
 * invertidos.
 *
 * Rodar isto depois de mexer nos contratos é mais barato que descobrir na
 * mainnet.
 *
 *   npm run test:abi
 */

import fs from "node:fs";

import { ABI_DA_CURVA } from "../src/lib/chroma-evm.ts";

let falhas = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "  ok  " : " FALHA"}  ${msg}`);
  if (!cond) falhas++;
};

/** A assinatura canônica, que é o que vira hash: `nome(tipo,tipo,...)`. */
function assinatura(item) {
  return `${item.name}(${(item.inputs ?? []).map((i) => i.type).join(",")})`;
}

/** Os campos indexados fazem parte do contrato do evento, então entram aqui. */
function formaDoEvento(item) {
  return `${item.name}(${(item.inputs ?? [])
    .map((i) => `${i.type}${i.indexed ? " indexed" : ""}`)
    .join(",")})`;
}

function abiDoBuild(contrato) {
  const caminho = `contracts/out/${contrato}.sol/${contrato}.json`;
  if (!fs.existsSync(caminho)) {
    console.error(`\nFalta o build: ${caminho}`);
    console.error("Rode `npm run contracts:build` antes.\n");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(caminho, "utf8")).abi ?? [];
}

console.log("\n--- ABI do site contra o ABI compilado ---\n");

const real = abiDoBuild("ChromaCurve");

/* --- funções -------------------------------------------------------- */

console.log("=== funções declaradas em chroma-evm.ts ===");

for (const nosso of ABI_DA_CURVA.filter((x) => x.type === "function")) {
  const deles = real.filter((x) => x.type === "function" && x.name === nosso.name);

  if (deles.length === 0) {
    ok(false, `${nosso.name} não existe no contrato`);
    continue;
  }

  /*
   * Solidity permite sobrecarga, então comparar pelo nome não basta: o que
   * tem que existir é uma função com a MESMA lista de tipos.
   */
  const igual = deles.find((d) => assinatura(d) === assinatura(nosso));
  ok(Boolean(igual), `${assinatura(nosso)}`);
  if (!igual) {
    console.log(`        o contrato tem: ${deles.map(assinatura).join(" | ")}`);
    continue;
  }

  ok(
    igual.stateMutability === nosso.stateMutability,
    `  ${nosso.name} é ${nosso.stateMutability}`,
  );

  const nossosRetornos = (nosso.outputs ?? []).map((o) => o.type).join(",");
  const retornosDeles = (igual.outputs ?? []).map((o) => o.type).join(",");
  ok(nossosRetornos === retornosDeles, `  ${nosso.name} devolve (${retornosDeles || "nada"})`);
}

/* --- evento --------------------------------------------------------- */

/*
 * O evento fica no hook, não em `chroma-evm.ts`, então é declarado aqui do
 * mesmo jeito. Se as duas cópias divergirem, este teste acusa.
 */
console.log("\n=== evento Lancada, lido pelo hook de lançamento ===");

const NOSSO_EVENTO =
  "Lancada(address indexed,address indexed,string,string,string)";

const eventoReal = real.find((x) => x.type === "event" && x.name === "Lancada");
ok(Boolean(eventoReal), "o contrato emite Lancada");

if (eventoReal) {
  ok(
    formaDoEvento(eventoReal) === NOSSO_EVENTO,
    `${formaDoEvento(eventoReal)}`,
  );
  if (formaDoEvento(eventoReal) !== NOSSO_EVENTO) {
    console.log(`        o hook espera: ${NOSSO_EVENTO}`);
    console.log("        Ajuste ABI_DO_EVENTO em src/hooks/useLancarTokenEvm.ts");
  }
}

/* --- erros ----------------------------------------------------------- */

/*
 * O seletor de um erro é o hash da assinatura. Um tipo errado aqui faz a recusa
 * do contrato chegar sem nome, e a tela cai na mensagem genérica.
 */
console.log("\n=== erros declarados em chroma-evm.ts ===");

for (const nosso of ABI_DA_CURVA.filter((x) => x.type === "error")) {
  const deles = real.find((x) => x.type === "error" && assinatura(x) === assinatura(nosso));
  ok(Boolean(deles), `${assinatura(nosso)}`);
}

console.log(falhas === 0 ? "\nTUDO PASSOU\n" : `\n${falhas} FALHA(S)\n`);
process.exit(falhas === 0 ? 0 : 1);
