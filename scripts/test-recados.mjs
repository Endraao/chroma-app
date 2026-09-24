/**
 * Teste da higiene de entrada e das contas do airdrop.
 *
 * Roda direto no Node (24+ executa TypeScript nativamente), sem servidor:
 *
 *   node scripts/test-recados.mjs
 *
 * O que ele garante:
 *  - texto de formulário perde caractere de controle e respeita o limite;
 *  - e-mail e carteira inválidos são barrados, válidos passam;
 *  - o escape de HTML fecha os vetores que chegariam na nossa caixa de e-mail;
 *  - assunto de e-mail nunca carrega quebra de linha (injeção de cabeçalho);
 *  - pontos de volume nunca premiam operação de centavo nem número absurdo;
 *  - os níveis do airdrop avançam na ordem e o progresso fica entre 0 e 1.
 */
import {
  LIMITES,
  assinaturaPlausivel,
  escapar,
  limpar,
  pareceCarteira,
  pareceEmail,
  umaLinha,
} from "../src/lib/validacao.ts";
import { NIVEIS, nivelDe, pontosDeVolume } from "../src/lib/airdrop-regras.ts";

let falhas = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "  ok  " : " FALHA"}  ${msg}`);
  if (!cond) falhas++;
};

/* ------------------------------------------------------------------ */
console.log("\n=== limpar() ===");

ok(limpar("  oi  ", 80) === "oi", "tira espaço das pontas");
ok(limpar("", 80) === null, "string vazia vira null");
ok(limpar("   ", 80) === null, "só espaço vira null");
ok(limpar(123, 80) === null, "o que não é texto vira null");
ok(limpar(null, 80) === null, "null continua null");
ok(limpar("a".repeat(500), 80).length === 80, "corta no limite pedido");

/*
 * Montado por código, não escrito à mão.
 *
 * Byte de controle CRU dentro de arquivo-fonte não sobrevive a editor, a
 * `sed`, nem a cópia e cola — e quando some, o teste passa a afirmar que
 * "antesde" vira "antesde", que é verdade e não prova nada.
 */
const comControle = "an" + String.fromCharCode(0) + "tes" + String.fromCharCode(7) + "de";
ok(limpar(comControle, 80) === "antesde", "remove caractere de controle");
/* "an" + 1 + "tes" + 1 + "de" = 9 caracteres; o resultado limpo tem 7. */
ok(comControle.length === 9, "o caso de teste de fato carrega os bytes de controle");

ok(limpar("a\r\nb", 80) === "a\nb", "normaliza quebra de linha do Windows");
ok(limpar("a\n\n\n\n\nb", 80) === "a\n\nb", "colapsa excesso de linha em branco");
ok(limpar("a\tb", 80) === "a\tb", "preserva tabulação, que é texto legítimo");

/* ------------------------------------------------------------------ */
console.log("\n=== pareceEmail() ===");

for (const bom of ["a@b.co", "nome.sobrenome@empresa.com.br", "x+tag@dominio.io"]) {
  ok(pareceEmail(bom), `aceita ${bom}`);
}
for (const ruim of ["", "sem-arroba", "a@b", "a@@b.co", "a b@c.co", "@b.co", "a@.co"]) {
  ok(!pareceEmail(ruim), `barra ${JSON.stringify(ruim)}`);
}

/* ------------------------------------------------------------------ */
console.log("\n=== pareceCarteira() ===");

const solana = "2jbvKgnx1uiH3TWttr5Y2qMmb6knBmSVpdW4BAmhWomY";
const evm = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";

ok(pareceCarteira(solana), "aceita endereço Solana");
ok(pareceCarteira(evm), "aceita endereço EVM");
ok(!pareceCarteira("0x123"), "barra EVM curto demais");
ok(!pareceCarteira("abc"), "barra texto solto");
ok(!pareceCarteira(""), "barra vazio");
/* 0, O, I e l não existem no alfabeto base58 — é o que pega erro de digitação. */
ok(!pareceCarteira("0OIl" + solana.slice(4)), "barra caractere fora do base58");

/* ------------------------------------------------------------------ */
console.log("\n=== assinaturaPlausivel() ===");

/* Assinaturas de verdade, de transações que já rodaram nesta plataforma. */
const reais = [
  "3ZXUuAWwHqMz8aZwrDaHXEnENnufi5MuZaZGkcPcfto12Nw1ucHAtfdAWyFAorEh9BB4oFbYcQN7qfXwrgBUS8kx",
  "5KtPn1LGuxhFiwTxKp8Vy8LFoZhNhrYHWMpH1kMYL6pNRPVcXbSsXyKbEBYKZE5j9ZKHRZqHqZKJvmqV8Wc4Xn1k",
];
for (const s of reais) {
  ok(assinaturaPlausivel(s), `aceita assinatura real (${s.length} chars)`);
}

/*
 * Este é o caso que fazia a rota devolver 503: 88 caracteres, todos do
 * alfabeto base58, passando por qualquer teste de formato — e explodindo no
 * RPC. Precisa ser recusado AQUI.
 */
ok(!assinaturaPlausivel("a".repeat(88)), "barra 88 letras 'a' (não dá 64 bytes)");
ok(!assinaturaPlausivel("1".repeat(88)), "barra 88 zeros base58");
ok(!assinaturaPlausivel(""), "barra vazio");
ok(!assinaturaPlausivel("curta"), "barra texto curto");
ok(!assinaturaPlausivel(reais[0] + "x"), "barra assinatura com um caractere a mais");
ok(!assinaturaPlausivel(reais[0].replace(/./, "0")), "barra caractere fora do base58");
ok(!assinaturaPlausivel(reais[0].slice(0, 40)), "barra assinatura cortada pela metade");

/*
 * Cortar UM caractere de uma assinatura de 88 não é testado de propósito.
 *
 * Em Solana a assinatura tem 87 OU 88 caracteres — as duas são válidas —, e
 * uma de 88 truncada pode dar uma de 87 que decodifica para 64 bytes
 * certinhos. Ela não existe na rede, e é o RPC que vai dizer isso; exigir que
 * esta função adivinhasse seria pedir o impossível de uma checagem de formato.
 */
ok(!assinaturaPlausivel("O".repeat(88)), "barra 'O' maiúsculo, que não existe em base58");

/* ------------------------------------------------------------------ */
console.log("\n=== escapar() — o que chegaria na nossa caixa ===");

ok(
  escapar('<img src=x onerror="alert(1)">') ===
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
  "neutraliza tag com manipulador de evento",
);
ok(escapar("<script>") === "&lt;script&gt;", "neutraliza abertura de script");
ok(escapar("a & b") === "a &amp; b", "escapa o & antes do resto");
ok(escapar("'aspas'") === "&#39;aspas&#39;", "escapa aspa simples");
ok(!escapar("<b>x</b>").includes("<"), "nenhum sinal de menor sobra");

/* ------------------------------------------------------------------ */
console.log("\n=== umaLinha() — injeção de cabeçalho de e-mail ===");

const tentativa = "Assunto\nBcc: ladrao@exemplo.com";
ok(!umaLinha(tentativa).includes("\n"), "achata a quebra de linha");
ok(umaLinha(tentativa) === "Assunto Bcc: ladrao@exemplo.com", "vira uma linha só");
ok(umaLinha("a".repeat(400)).length === 160, "corta no limite padrão");
ok(umaLinha("  a   b  ") === "a b", "colapsa espaço interno");

/* ------------------------------------------------------------------ */
console.log("\n=== pontosDeVolume() ===");

ok(pontosDeVolume(0) === 0, "volume zero não pontua");
ok(pontosDeVolume(-50) === 0, "volume negativo não pontua");
ok(pontosDeVolume(0.99) === 0, "operação de centavo não pontua");
ok(pontosDeVolume(1) === 1, "US$ 1 vale 1 ponto");
ok(pontosDeVolume(19.99) === 19, "arredonda pra baixo");
ok(pontosDeVolume(NaN) === 0, "NaN não vira ponto");
ok(pontosDeVolume(Infinity) === 0, "Infinity não vira ponto");

/*
 * Mil operações de um centavo não podem valer o mesmo que uma de dez dólares.
 * Em Solana mil operações custam menos que um café, então esta é a fronteira
 * entre incentivo e fazenda de pontos.
 */
const milDeCentavo = Array.from({ length: 1000 }, () => pontosDeVolume(0.01));
ok(
  milDeCentavo.reduce((a, b) => a + b, 0) === 0,
  "mil operações de um centavo somam zero ponto",
);

/* ------------------------------------------------------------------ */
console.log("\n=== nivelDe() ===");

ok(nivelDe(0).atual === "Prisma", "começa no primeiro nível");
ok(nivelDe(-10).atual === "Prisma", "saldo negativo não quebra");
ok(nivelDe(499).atual === "Prisma", "um ponto antes não sobe");
ok(nivelDe(500).atual === "Quartzo", "sobe exatamente no mínimo");
ok(nivelDe(999_999).atual === "Cromo", "trava no último nível");
ok(nivelDe(999_999).proximo === null, "no topo não há próximo");
ok(nivelDe(999_999).faltam === 0, "no topo não falta nada");
ok(nivelDe(0).proximo === "Quartzo", "aponta o próximo certo");
ok(nivelDe(0).faltam === 500, "calcula quanto falta");

for (const pontos of [0, 1, 250, 499, 500, 2_499, 9_999, 50_000, 1e9]) {
  const n = nivelDe(pontos);
  ok(
    n.progresso >= 0 && n.progresso <= 1,
    `progresso de ${pontos} fica entre 0 e 1 (${n.progresso.toFixed(3)})`,
  );
}

/* Os níveis têm que estar em ordem crescente, senão `nivelDe` mente. */
for (let i = 1; i < NIVEIS.length; i++) {
  ok(NIVEIS[i].minimo > NIVEIS[i - 1].minimo, `${NIVEIS[i].nome} exige mais que o anterior`);
}

/* ------------------------------------------------------------------ */
console.log("\n=== LIMITES ===");

for (const [campo, valor] of Object.entries(LIMITES)) {
  ok(Number.isInteger(valor) && valor > 0, `${campo} tem limite positivo (${valor})`);
}

console.log(falhas === 0 ? "\n✓ tudo certo\n" : `\n✗ ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
