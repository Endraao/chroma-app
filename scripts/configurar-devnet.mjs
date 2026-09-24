/**
 * Cria a conta de configuração do programa da Chroma na devnet.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO É UM PASSO SEPARADO DO DEPLOY
 * ---------------------------------------------------------------------------
 * `anchor deploy` põe o código na rede, e só. O programa ainda não sabe quais
 * são as taxas, quantos tokens ficam à venda, nem para onde vai a fatia da
 * plataforma: tudo isso mora numa conta `config`, que alguém precisa criar uma
 * única vez, assinando com a carteira que vira autoridade.
 *
 * Sem este passo, lançar uma moeda falha com um erro de conta inexistente —
 * que parece bug do site e não é.
 *
 * ---------------------------------------------------------------------------
 * POR QUE OS NÚMEROS SÃO OS MESMOS DO `test-lancamento`
 * ---------------------------------------------------------------------------
 * Para que o que foi testado e o que está no ar sejam a mesma coisa. Mudar um
 * valor aqui e não lá significa que o teste passa num programa que não existe.
 *
 * As faixas são em LAMPORTS, não em dólar: o programa não tem como saber
 * cotação sem depender de um oráculo, e amarrar cada compra a um serviço
 * externo faz a compra falhar quando ele falhar. Os limites abaixo são os
 * equivalentes aproximados de $100 mil, $500 mil e $2 milhões.
 *
 * ---------------------------------------------------------------------------
 * COMO RODAR
 * ---------------------------------------------------------------------------
 *   npm run devnet:config
 *
 * A carteira sai do WSL (`~/.config/solana/id.json`), que é a mesma que o
 * `anchor deploy` usa. Passe `KEYPAIR=<caminho>` para usar outra.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

import { CHROMA_PROGRAM_ID, enderecoDaConfig, ixCriarConfig } from "../src/lib/chroma-program.ts";

const RPC = process.env.RPC_DEVNET || "https://api.devnet.solana.com";
const CARTEIRA_DA_PLATAFORMA =
  process.env.PLATFORM_WALLET || "2jbvKgnx1uiH3TWttr5Y2qMmb6knBmSVpdW4BAmhWomY";

/**
 * A chave vem do WSL, onde o Solana CLI está instalado.
 *
 * Ler por `wsl cat` em vez de copiar o arquivo para o disco do Windows: a
 * cópia seria uma segunda chave privada vivendo numa pasta que ninguém lembra
 * de apagar. Aqui ela só existe em memória, durante esta execução.
 */
function lerCarteira() {
  if (process.env.KEYPAIR) {
    return Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(process.env.KEYPAIR, "utf8"))),
    );
  }

  const bruto = execFileSync("wsl", ["-d", "Ubuntu", "-e", "cat", "/home/chroma/.config/solana/id.json"], {
    encoding: "utf8",
  });
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(bruto)));
}

const sol = (n) => BigInt(Math.round(n)) * BigInt(LAMPORTS_PER_SOL);

const conexao = new Connection(RPC, "confirmed");
const autoridade = lerCarteira();
const config = enderecoDaConfig();

console.log(`\nprograma   ${CHROMA_PROGRAM_ID.toBase58()}`);
console.log(`config     ${config.toBase58()}`);
console.log(`autoridade ${autoridade.publicKey.toBase58()}`);
console.log(`plataforma ${CARTEIRA_DA_PLATAFORMA}`);
console.log(`rede       ${RPC}\n`);

/* O programa existe? Sem isto o erro sairia como "conta não pertence ao programa". */
const noAr = await conexao.getAccountInfo(CHROMA_PROGRAM_ID);
if (!noAr) {
  console.error("O programa não está nesta rede. Rode `anchor deploy` antes.\n");
  process.exit(1);
}

const jaExiste = await conexao.getAccountInfo(config);
if (jaExiste) {
  console.log("A config já existe nesta rede. Nada a fazer.\n");
  process.exit(0);
}

const saldo = await conexao.getBalance(autoridade.publicKey);
console.log(`saldo da autoridade: ${(saldo / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
if (saldo === 0) {
  console.error("Sem saldo para assinar. Pegue SOL de devnet antes.\n");
  process.exit(1);
}

const assinatura = await sendAndConfirmTransaction(
  conexao,
  new Transaction().add(
    ixCriarConfig(autoridade.publicKey, {
      carteiraDaPlataforma: new PublicKey(CARTEIRA_DA_PLATAFORMA),
      taxaTotalBps: 125,
      taxaAfiliadoBps: 30,
      pisoPlataformaBps: 20,
      limitesDasFaixas: [0n, sol(900), sol(4_500), sol(18_000)],
      faixasDoCriadorBps: [30, 45, 60, 75],
      solVirtualInicial: sol(30),
      tokenVirtualInicial: 1_073_000_000n * 1_000_000n,
      tokenAVenda: 793_100_000n * 1_000_000n,
      emissaoTotal: 1_000_000_000n * 1_000_000n,
      taxaDeLancamento: 0n,
    }),
  ),
  [autoridade],
);

console.log(`\nconfig criada: ${assinatura}`);
console.log(`https://solscan.io/tx/${assinatura}?cluster=devnet\n`);
