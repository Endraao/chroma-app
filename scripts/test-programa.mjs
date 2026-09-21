/**
 * Confere que o cliente TypeScript e o programa Rust falam a mesma língua.
 *
 *   node scripts/test-programa.mjs
 *
 * Este teste existe por um motivo específico: `src/lib/chroma-program.ts` monta
 * as transações à mão, sem o cliente oficial do Anchor. Isso economiza alguns
 * megabytes no navegador, mas cria uma obrigação — se alguém renomear uma
 * instrução no Rust, ou mudar a ordem de um campo, nada quebra na compilação.
 * A transação simplesmente é recusada pela rede, na cara do usuário, com uma
 * mensagem que não explica nada.
 *
 * Aqui a divergência vira falha de teste.
 *
 * Com a rede local no ar, também roda o caminho completo: cria a configuração,
 * lança uma moeda, compra e vende — e confere que o dinheiro chegou.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

import {
  CHROMA_PROGRAM_ID,
  IDENTIFICADORES,
  cotarCompra,
  cotarVenda,
  contaDeToken,
  enderecoDaConfig,
  enderecoDaCurva,
  ixComprar,
  ixCriarConfig,
  ixLancar,
  ixVender,
  lerCurva,
} from "../src/lib/chroma-program.ts";

const RPC = process.env.RPC_LOCAL || "http://127.0.0.1:8899";


let falhas = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "  ok  " : " FALHA"}  ${msg}`);
  if (!cond) falhas++;
};

/* ------------------------------------------------------------------ */
/* 1. Os identificadores batem com o nome das funções no Rust          */
/* ------------------------------------------------------------------ */

console.log("\n--- identificadores das instruções ---");

const fonteRust = readFileSync("programs/chroma-curve/src/lib.rs", "utf8");

for (const [nome, gravado] of Object.entries(IDENTIFICADORES)) {
  const calculado = Array.from(
    createHash("sha256").update(`global:${nome}`).digest().subarray(0, 8),
  );

  ok(
    JSON.stringify(calculado) === JSON.stringify(gravado),
    `${nome}: identificador confere`,
  );

  /*
   * E a função tem que existir no Rust com esse nome exato. Sem esta checagem,
   * uma instrução renomeada continuaria "conferindo" contra o próprio hash
   * errado — o teste passaria e a transação falharia em produção.
   */
  ok(
    new RegExp(`pub fn ${nome}\\b`).test(fonteRust),
    `${nome}: existe no programa`,
  );
}

/* ------------------------------------------------------------------ */
/* 2. O caminho completo, na rede local                                */
/* ------------------------------------------------------------------ */

const conexao = new Connection(RPC, "confirmed");

const noAr = await conexao
  .getVersion()
  .then(() => true)
  .catch(() => false);

if (!noAr) {
  console.log("\n(rede local fora do ar: pulei o teste de ponta a ponta)");
  console.log("  suba com: npm run localnet");
} else {
  const programa = await conexao.getAccountInfo(CHROMA_PROGRAM_ID);
  if (!programa?.executable) {
    console.log("\n(o programa não está nesta rede: pulei o teste de ponta a ponta)");
  } else {
    console.log("\n--- caminho completo na rede local ---");
    try {

    /**
     * Credita e espera o SALDO aparecer.
     *
     * Espera pelo saldo, não pela assinatura: o bloco de referência expira
     * enquanto se aguarda a confirmação, e aí a espera falha mesmo com o
     * dinheiro tendo chegado. O saldo é o que a transação seguinte precisa.
     */
    const creditar = async (quem, sol) => {
      const alvo = sol * LAMPORTS_PER_SOL;
      await conexao.requestAirdrop(quem, alvo);

      for (let tentativa = 0; tentativa < 40; tentativa++) {
        if ((await conexao.getBalance(quem, "confirmed")) >= alvo) return;
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error(`o crédito de ${sol} SOL não chegou`);
    };

    const enviar = async (assinantes, ...ixs) => {
      const tx = new Transaction().add(...ixs);
      return sendAndConfirmTransaction(conexao, tx, assinantes, {
        commitment: "confirmed",
        skipPreflight: false,
      });
    };

    const autoridade = Keypair.generate();
    const plataforma = Keypair.generate().publicKey;
    await creditar(autoridade.publicKey, 100);

    /* --- configuração (só na primeira vez que a rede sobe) --- */
    const config = enderecoDaConfig();
    const jaExiste = await conexao.getAccountInfo(config);

    let carteiraDaPlataforma = plataforma;

    if (!jaExiste) {
      await enviar(
        [autoridade],
        ixCriarConfig(autoridade.publicKey, {
          carteiraDaPlataforma: plataforma,
          taxaTotalBps: 125,
          taxaAfiliadoBps: 30,
          pisoPlataformaBps: 20,
          limitesDasFaixas: [
            0n,
            900n * BigInt(LAMPORTS_PER_SOL),
            4_500n * BigInt(LAMPORTS_PER_SOL),
            18_000n * BigInt(LAMPORTS_PER_SOL),
          ],
          faixasDoCriadorBps: [30, 45, 60, 75],
          solVirtualInicial: 30n * BigInt(LAMPORTS_PER_SOL),
          tokenVirtualInicial: 1_073_000_000n * 1_000_000n,
          tokenAVenda: 793_100_000n * 1_000_000n,
          emissaoTotal: 1_000_000_000n * 1_000_000n,
          taxaDeLancamento: 0n,
        }),
      );
      ok(true, "configuração criada na rede");
    } else {
      // A rede já tinha configuração: reaproveita a carteira gravada nela.
      carteiraDaPlataforma = new PublicKey(jaExiste.data.subarray(8 + 32, 8 + 64));
      ok(true, "configuração já existia — reaproveitando");
    }

    /* --- lançamento --- */
    const criador = Keypair.generate();
    const mint = Keypair.generate();
    await creditar(criador.publicKey, 50);

    await enviar(
      [criador, mint],
      ixLancar({
        criador: criador.publicKey,
        mint: mint.publicKey,
        carteiraDaPlataforma,
      }),
    );

    const curva = enderecoDaCurva(mint.publicKey);
    const estado = lerCurva((await conexao.getAccountInfo(curva)).data);

    ok(estado.mint.equals(mint.publicKey), "a curva aponta pro mint certo");
    ok(estado.criador.equals(criador.publicKey), "e guarda quem lançou");
    ok(estado.tokenReal === 793_100_000n * 1_000_000n, `${estado.tokenReal / 1_000_000n} tokens à venda`);
    ok(estado.solReal === 0n, "a curva começa sem SOL");

    /* --- compra, com a cotação da tela --- */
    const trader = Keypair.generate();
    const afiliado = Keypair.generate().publicKey;
    await creditar(trader.publicKey, 50);

    const gasto = 5n * BigInt(LAMPORTS_PER_SOL);
    const previsto = cotarCompra(estado, gasto, 125);

    const antesCriador = await conexao.getBalance(criador.publicKey);
    const antesPlataforma = await conexao.getBalance(carteiraDaPlataforma);

    await enviar(
      [trader],
      ixComprar(
        {
          trader: trader.publicKey,
          mint: mint.publicKey,
          criador: criador.publicKey,
          carteiraDaPlataforma,
          afiliado,
        },
        gasto,
        // 1% de tolerância, como a tela vai fazer.
        (previsto * 99n) / 100n,
      ),
    );

    const conta = await conexao.getTokenAccountBalance(
      contaDeToken(trader.publicKey, mint.publicKey),
    );
    const recebido = BigInt(conta.value.amount);

    /*
     * A prova de que a cotação da tela vale: o que o programa entregou tem que
     * ser exatamente o que o cliente previu. Se divergisse, a proteção de preço
     * recusaria compras legítimas — e a tela mostraria um número que não
     * acontece.
     */
    ok(
      recebido === previsto,
      `a cotação bateu com o resultado: previsto ${previsto}, recebido ${recebido}`,
    );

    const depoisCriador = await conexao.getBalance(criador.publicKey);
    const depoisPlataforma = await conexao.getBalance(carteiraDaPlataforma);

    const taxaCriador = Number((gasto * 30n) / 10_000n);
    const taxaTotal = Number((gasto * 125n) / 10_000n);
    const taxaAfiliado = Number((gasto * 30n) / 10_000n);

    ok(depoisCriador - antesCriador === taxaCriador, `criador recebeu ${taxaCriador} lamports`);
    ok(
      depoisPlataforma - antesPlataforma === taxaTotal - taxaCriador - taxaAfiliado,
      "plataforma ficou com o resto",
    );
    ok(
      (await conexao.getBalance(afiliado)) === taxaAfiliado,
      `afiliado recebeu ${taxaAfiliado} lamports`,
    );

    /* --- venda --- */
    const depoisDaCompra = lerCurva((await conexao.getAccountInfo(curva)).data);
    const previstoNaVenda = cotarVenda(depoisDaCompra, recebido, 125);

    const antesTrader = await conexao.getBalance(trader.publicKey);

    await enviar(
      [trader],
      ixVender(
        {
          trader: trader.publicKey,
          mint: mint.publicKey,
          criador: criador.publicKey,
          carteiraDaPlataforma,
          afiliado: null,
        },
        recebido,
        (previstoNaVenda * 99n) / 100n,
      ),
    );

    const ganho = (await conexao.getBalance(trader.publicKey)) - antesTrader;
    ok(ganho > 0, `a venda devolveu ${ganho} lamports`);
    ok(
      Math.abs(ganho - Number(previstoNaVenda)) < Number(previstoNaVenda) / 100,
      `e ficou dentro de 1% do previsto (${previstoNaVenda})`,
    );

    const final = lerCurva((await conexao.getAccountInfo(curva)).data);
    ok(
      final.tokenReal === 793_100_000n * 1_000_000n,
      "os tokens voltaram todos pra curva",
    );
    } catch (erro) {
      falhas++;
      console.log(" FALHA  o caminho completo quebrou:", erro?.message ?? erro);
      // Os registros do programa dizem o motivo real; a mensagem sozinha não.
      if (typeof erro?.getLogs === "function") {
        const registros = await erro.getLogs(conexao).catch(() => null);
        if (registros?.length) console.log("   registros:", registros.slice(-6).join(" | "));
      }
    }
  }
}

console.log(falhas === 0 ? "\nTUDO PASSOU\n" : `\n${falhas} FALHA(S)\n`);
process.exitCode = falhas === 0 ? 0 : 1;
