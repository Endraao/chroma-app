/**
 * Gera a tabela de paridade entre a curva da Solana e a da Robinhood Chain.
 *
 *   node scripts/gerar-paridade.mjs
 *
 * ---------------------------------------------------------------------------
 * POR QUE UMA TABELA, E NÃO UM TESTE QUE CHAMA OS DOIS
 * ---------------------------------------------------------------------------
 * Os dois lados vivem em máquinas virtuais diferentes: um é Rust rodando na SVM,
 * o outro é Solidity na EVM. Um teste que rodasse os dois ao vivo precisaria de
 * um validador Solana E de uma rede EVM no ar ao mesmo tempo, só pra comparar
 * dois números.
 *
 * Em vez disso, este script tira os números do lado da Solana usando o MESMO
 * código que a tela usa (`cotarCompra`, que o `test:programa` já prova ser igual
 * ao Rust), e a tabela vai pro teste em Solidity. Se alguém mexer na curva de um
 * dos lados, a tabela deixa de bater.
 *
 * ---------------------------------------------------------------------------
 * POR QUE OS NÚMEROS NÃO BATEM EXATO
 * ---------------------------------------------------------------------------
 * Na Solana a moeda tem 6 casas decimais e o SOL tem 9. Em EVM a moeda tem 18 e
 * o ETH tem 18. A conta é a mesma, mas a granularidade do arredondamento não é:
 * arredondar pra cima em unidades de 1e-18 sobra menos do que arredondar em
 * unidades de 1e-6.
 *
 * A diferença é de no máximo UMA unidade na escala da Solana — um milionésimo
 * de token. O teste aceita essa margem e recusa qualquer coisa além dela.
 */
import { cotarCompra, cotarVenda } from "../src/lib/chroma-program.ts";

const LAMPORTS = 1_000_000_000n;
const CASAS_SOLANA = 1_000_000n;

/** O estado de largada, igual ao que a configuração grava na rede. */
const CURVA = {
  solVirtual: 30n * LAMPORTS,
  tokenVirtual: 1_073_000_000n * CASAS_SOLANA,
  tokenReal: 793_100_000n * CASAS_SOLANA,
};

/** Quanto se gasta, em SOL. Casos pequenos e grandes. */
const GASTOS = ["0.01", "0.1", "1", "5", "25", "80"];

const TAXA_BPS = 125;

const linhas = GASTOS.map((sol) => {
  const lamports = BigInt(Math.round(Number(sol) * 1e9));
  const tokens = cotarCompra(CURVA, lamports, TAXA_BPS);

  return { sol, lamports, tokens };
});

console.log("/* Gerado por `node scripts/gerar-paridade.mjs`. Não editar à mão. */");
console.log("uint256[6] memory gastoEmWei = [");
console.log(linhas.map((l) => `    uint256(${l.lamports * LAMPORTS})`).join(",\n"));
console.log("];");
console.log();
console.log("/* O que a curva da Solana entrega, convertido pra 18 casas. */");
console.log("uint256[6] memory tokensEsperados = [");
console.log(linhas.map((l) => `    uint256(${l.tokens * 1_000_000_000_000n})`).join(",\n"));
console.log("];");
console.log();

for (const l of linhas) {
  console.log(`// ${l.sol} SOL -> ${(Number(l.tokens) / 1e6).toLocaleString("pt-BR")} tokens`);
}

/* Uma venda também, pra garantir que o caminho de volta bate. */
const tokensParaVender = 1_000_000n * CASAS_SOLANA;
const solDaVenda = cotarVenda(
  { solVirtual: CURVA.solVirtual, tokenVirtual: CURVA.tokenVirtual },
  tokensParaVender,
  TAXA_BPS,
);
console.log();
console.log(`// venda de 1.000.000 tokens -> ${Number(solDaVenda) / 1e9} SOL`);
console.log(`uint256 constant VENDA_TOKENS = ${tokensParaVender * 1_000_000_000_000n};`);
console.log(`uint256 constant VENDA_ESPERADA_WEI = ${solDaVenda * LAMPORTS};`);
