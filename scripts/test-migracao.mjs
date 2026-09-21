/**
 * Enche uma curva até o fim e migra a liquidez pra Raydium de verdade.
 *
 *   node scripts/test-migracao.mjs
 *
 * ---------------------------------------------------------------------------
 * POR QUE ESTE TESTE É O MAIS IMPORTANTE DO PROJETO
 * ---------------------------------------------------------------------------
 * Encher a curva é o SUCESSO de uma moeda. Se a migração não funcionar, o
 * sucesso vira o fim: comprar e vender ficam bloqueados e o SOL arrecadado fica
 * parado numa conta sem saída. Não é um bug que atrapalha — é um bug que come o
 * dinheiro de quem acreditou na moeda.
 *
 * E é um caminho que NINGUÉM percorre por acidente: só acontece depois de ~85
 * SOL de compras. Sem um teste que chegue lá, o primeiro a descobrir que está
 * quebrado seria um usuário, com dinheiro real dentro.
 *
 * ---------------------------------------------------------------------------
 * CONTRA A RAYDIUM REAL, NÃO CONTRA UMA IMITAÇÃO
 * ---------------------------------------------------------------------------
 * A rede local carrega o programa da Raydium copiado da mainnet. A instrução é
 * montada byte a byte neste projeto, com uma ordem de contas que é interface
 * dela, não nossa. Uma imitação aceitaria o que eu escrevi; só a de verdade
 * prova que a ordem está certa.
 *
 * Precisa da rede local: `npm run localnet`.
 */
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

import {
  CUSTO_DA_MIGRACAO,
  contaDeToken,
  cotarCompra,
  enderecoDaConfig,
  enderecoDaCurva,
  enderecosDaPool,
  ixComprar,
  ixCriarConfig,
  ixLancar,
  ixMigrar,
  ixPrepararMigracao,
  ixVender,
  lerConfig,
  lerCurva,
  WSOL_MINT,
} from "../src/lib/chroma-program.ts";

const RPC = process.env.RPC_LOCAL || "http://127.0.0.1:8899";

let falhas = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "  ok  " : " FALHA"}  ${msg}`);
  if (!cond) falhas++;
};

const conexao = new Connection(RPC, "confirmed");

const noAr = await conexao
  .getVersion()
  .then(() => true)
  .catch(() => false);

console.log("\n--- migração pra Raydium ---");

if (!noAr) {
  console.log("  pulado  a rede local não respondeu (npm run localnet)");
  process.exit(0);
}

const creditar = async (quem, sol) => {
  const a = await conexao.requestAirdrop(quem, sol * LAMPORTS_PER_SOL);
  const b = await conexao.getLatestBlockhash();
  await conexao.confirmTransaction({ signature: a, ...b }, "confirmed");
};

const enviar = (assinantes, ...ixs) =>
  sendAndConfirmTransaction(conexao, new Transaction().add(...ixs), assinantes, {
    commitment: "confirmed",
    skipPreflight: false,
  });

/* --- configuração --------------------------------------------------- */

const config = enderecoDaConfig();
if (!(await conexao.getAccountInfo(config))) {
  const autoridade = Keypair.generate();
  await creditar(autoridade.publicKey, 10);
  await enviar(
    [autoridade],
    ixCriarConfig(autoridade.publicKey, {
      carteiraDaPlataforma: Keypair.generate().publicKey,
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
}

const dadosDaConfig = lerConfig((await conexao.getAccountInfo(config)).data);

/* --- lançamento ----------------------------------------------------- */

const criador = Keypair.generate();
const mint = Keypair.generate();
await creditar(criador.publicKey, 50);

await enviar(
  [criador, mint],
  ixLancar({
    criador: criador.publicKey,
    mint: mint.publicKey,
    carteiraDaPlataforma: dadosDaConfig.carteiraDaPlataforma,
    nome: "Moeda que Venceu",
    simbolo: "VENCEU",
    uri: "https://exemplo.invalido/venceu.json",
  }),
);

const curva = enderecoDaCurva(mint.publicKey);
ok(Boolean(await conexao.getAccountInfo(curva)), "a curva nasceu");

/* --- encher a curva até o último token ------------------------------ */
/*
 * Compras grandes e sucessivas. A última leva só o que resta: o programa
 * entrega o saldo e não mais que isso, então não é preciso acertar o valor
 * exato — é o comportamento que faz a curva fechar sem sobra.
 */

const baleia = Keypair.generate();
await creditar(baleia.publicKey, 400);

let estado = lerCurva((await conexao.getAccountInfo(curva)).data);
let rodadas = 0;

while (!estado.concluida && rodadas < 40) {
  const gasto = 12n * BigInt(LAMPORTS_PER_SOL);
  const previsto = cotarCompra(estado, gasto, dadosDaConfig.taxaTotalBps);
  if (previsto <= 0n) break;

  await enviar(
    [baleia],
    ixComprar(
      {
        trader: baleia.publicKey,
        mint: mint.publicKey,
        criador: criador.publicKey,
        carteiraDaPlataforma: dadosDaConfig.carteiraDaPlataforma,
      },
      gasto,
      // Sem exigência de mínimo: aqui o objetivo é chegar ao fim, não cotar.
      0n,
    ),
  );

  estado = lerCurva((await conexao.getAccountInfo(curva)).data);
  rodadas++;
}

ok(estado.concluida, `a curva encheu em ${rodadas} compras`);
ok(estado.tokenReal === 0n, "não sobrou token à venda");

const arrecadado = estado.solReal;
console.log(`        arrecadou ${Number(arrecadado) / LAMPORTS_PER_SOL} SOL`);

/* --- vender depois de cheia tem que falhar -------------------------- */

const recusouVenda = await enviar(
  [baleia],
  ixVender(
    {
      trader: baleia.publicKey,
      mint: mint.publicKey,
      criador: criador.publicKey,
      carteiraDaPlataforma: dadosDaConfig.carteiraDaPlataforma,
    },
    1_000_000n,
    0n,
  ),
)
  .then(() => false)
  .catch(() => true);

ok(recusouVenda, "com a curva cheia, a curva para de negociar");

/* --- migrar --------------------------------------------------------- */
/*
 * Quem executa é uma carteira ALEATÓRIA, sem relação nenhuma com a plataforma
 * nem com quem lançou. É a prova de que a migração é aberta: se dependesse de
 * nós, uma chave perdida prenderia dinheiro de terceiros sem prazo.
 */
const estranho = Keypair.generate();
await creditar(estranho.publicKey, 5);

const p = enderecosDaPool(mint.publicKey);
const cofreDaCurva = contaDeToken(curva, mint.publicKey);
const tokensParaPool = BigInt(
  (await conexao.getTokenAccountBalance(cofreDaCurva)).value.amount,
);

console.log(`        sobraram ${Number(tokensParaPool) / 1e6} tokens pra pool`);

let erroDaMigracao = null;
try {
  /*
   * Dois passos, nesta ordem. O primeiro embrulha o SOL; o segundo cria a
   * pool. Não dá pra juntar: a rede recusa creditar lamports numa conta que
   * não é do programa e chamar outro programa com ela na mesma instrução.
   */
  await enviar([estranho], ixPrepararMigracao({ executor: estranho.publicKey, mint: mint.publicKey }));

  await enviar(
    [estranho],
    /*
     * A Raydium cria seis contas nesta chamada; o orçamento padrão de 200 mil
     * unidades não cobre isso. Sem este pedido a transação falha por falta de
     * computação, o que parece erro de lógica e não é.
     */
    ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
    ixMigrar({ executor: estranho.publicKey, mint: mint.publicKey }),
  );
} catch (e) {
  erroDaMigracao = e;
}

if (erroDaMigracao) {
  ok(false, `a migração falhou: ${erroDaMigracao.message}`);
  const logs = erroDaMigracao.logs ?? erroDaMigracao.transactionLogs;
  if (logs) console.log(logs.slice(-12).map((l) => `        ${l}`).join("\n"));
  process.exit(1);
}

ok(true, "uma carteira qualquer conseguiu migrar");

/* --- o que ficou na rede -------------------------------------------- */

const depois = lerCurva((await conexao.getAccountInfo(curva)).data);
ok(depois.migrada, "a curva ficou marcada como migrada");

const contaDaPool = await conexao.getAccountInfo(p.pool);
ok(Boolean(contaDaPool), `a pool existe: ${p.pool.toBase58()}`);
ok(
  contaDaPool?.owner.equals(new PublicKey("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C")),
  "e pertence mesmo ao programa da Raydium",
);

/* A liquidez está nos cofres da pool, não mais na curva. */
const moedaEhMint0 = p.mint0.equals(mint.publicKey);
const cofreDaMoeda = moedaEhMint0 ? p.cofre0 : p.cofre1;
const cofreDoSol = moedaEhMint0 ? p.cofre1 : p.cofre0;

const naPoolMoeda = BigInt((await conexao.getTokenAccountBalance(cofreDaMoeda)).value.amount);
const naPoolSol = BigInt((await conexao.getTokenAccountBalance(cofreDoSol)).value.amount);

ok(naPoolMoeda === tokensParaPool, `os ${Number(naPoolMoeda) / 1e6} tokens entraram na pool`);
ok(
  naPoolSol === arrecadado - CUSTO_DA_MIGRACAO,
  `o SOL entrou na pool: ${Number(naPoolSol) / LAMPORTS_PER_SOL} (arrecadado menos o custo fixo)`,
);

ok(
  BigInt((await conexao.getTokenAccountBalance(cofreDaCurva)).value.amount) === 0n,
  "a curva ficou sem token nenhum",
);

/* --- o LP foi queimado ---------------------------------------------- */
/*
 * A prova que protege quem comprou: sem LP na mão de ninguém, a liquidez não
 * pode ser retirada. É a diferença entre uma pool e um golpe de saída.
 */
const contaLp = contaDeToken(estranho.publicKey, p.lpMint);
const saldoLp = BigInt((await conexao.getTokenAccountBalance(contaLp)).value.amount);
ok(
  saldoLp === 0n,
  "o LP foi queimado na mão de quem executou — a liquidez está travada",
);

/* --- migrar duas vezes não pode ------------------------------------- */

const recusouSegunda = await enviar(
  [estranho],
  ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
  ixMigrar({ executor: estranho.publicKey, mint: mint.publicKey }),
)
  .then(() => false)
  .catch(() => true);

ok(recusouSegunda, "a segunda tentativa de migrar é recusada");

console.log(
  falhas === 0
    ? "\n  a moeda que encheu a curva virou pool de verdade, com o LP queimado\n"
    : `\n  ${falhas} falha(s)\n`,
);
process.exit(falhas === 0 ? 0 : 1);
