/**
 * Teste das regras de apelido.
 *
 * Rode com o servidor de pé:
 *
 *   node scripts/test-nickname.mjs
 *
 * O registro NÃO pede assinatura de carteira — é decisão de produto, e o
 * porquê está em `src/lib/accounts.ts`. O que precisa continuar valendo:
 *
 *   1. apelido livre é aceito, sem assinatura;
 *   2. apelido já usado por OUTRA carteira é recusado (409);
 *   3. nome reservado é recusado;
 *   4. formato inválido é recusado;
 *   5. o apelido resolve pra carteira certa — é disso que depende a comissão;
 *   6. trocar de apelido NÃO quebra o link antigo: ele continua resolvendo pra
 *      mesma carteira, e ninguém mais consegue registrá-lo.
 *
 * O item 6 é o mais importante: é o que permite trocar de nome sem perder o
 * que já foi divulgado, e sem liberar o nome antigo pra um impostor.
 */
const BASE = "http://localhost:3000/api/account";

const sufixo = Math.floor(Math.random() * 100000);
const carteiraA = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const carteiraB = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1";
const nomeA = `trader${sufixo}`;
const nomeNovo = `trader${sufixo}b`;

let falhas = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "  ok  " : " FALHA"}  ${msg}`);
  if (!cond) falhas++;
};

const j = async (r) => ({ status: r.status, body: await r.json().catch(() => null) });

const registrar = (nickname, wallet) =>
  fetch(BASE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nickname, wallet, kind: "solana" }),
  }).then(j);

console.log("\n--- 1. registro sem assinatura ---");
const r1 = await registrar(nomeA, carteiraA);
ok(r1.status === 200, `@${nomeA} registrado sem pedir assinatura (${r1.status})`);
ok(r1.body?.account?.wallet === carteiraA, "gravou a carteira certa");

console.log("\n--- 2. outra carteira não toma o apelido ---");
const r2 = await registrar(nomeA, carteiraB);
ok(r2.status === 409, `recusado com 409 (${JSON.stringify(r2.body)})`);

console.log("\n--- 3. nome reservado ---");
const r3 = await j(await fetch(`${BASE}?check=admin`));
ok(r3.body?.available === false, `admin indisponível: ${r3.body?.reason}`);

console.log("\n--- 4. formato inválido ---");
const r4 = await registrar("ab", carteiraA);
ok(r4.status === 400, `"ab" recusado com 400 (${JSON.stringify(r4.body)})`);

console.log("\n--- 5. resolução apelido → carteira ---");
const r5 = await j(await fetch(`${BASE}?nickname=${nomeA}`));
ok(r5.body?.wallet === carteiraA, "o link de indicação aponta pra carteira certa");

console.log("\n--- 6. trocar de apelido não quebra o link antigo ---");
const r6 = await registrar(nomeNovo, carteiraA);
ok(r6.status === 200, `@${nomeNovo} registrado pela mesma carteira`);

const antigo = await j(await fetch(`${BASE}?nickname=${nomeA}`));
ok(antigo.body?.wallet === carteiraA, `@${nomeA} (antigo) ainda resolve pra mesma carteira`);

const atual = await j(await fetch(`${BASE}?wallet=${carteiraA}`));
ok(atual.body?.nickname === nomeNovo, `a carteira agora exibe @${nomeNovo}`);

const roubo = await registrar(nomeA, carteiraB);
ok(roubo.status === 409, "o apelido largado continua bloqueado pra terceiros");

console.log(falhas === 0 ? "\nTUDO PASSOU\n" : `\n${falhas} FALHA(S)\n`);
/*
 * exitCode em vez de exit(): sair no meio de fetches pendentes faz o libuv
 * estourar uma assertion no Windows. Assim o Node fecha sozinho, limpo.
 */
process.exitCode = falhas === 0 ? 0 : 1;
