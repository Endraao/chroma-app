/**
 * Teste da conta com uma carteira por rede.
 *
 * Precisa do servidor de pé:
 *
 *   node scripts/test-multichain.mjs
 *
 * É o teste do bug que motivou tudo isto: alguém registra o apelido com uma
 * carteira e divulga o link; quem entra pelo link opera na OUTRA rede; a
 * comissão não tem endereço pra onde ir e some em silêncio.
 *
 * O que ele garante:
 *  - vincular carteira EXIGE assinatura válida da carteira que já é da conta;
 *  - mensagem adulterada, assinatura de terceiro e mensagem velha são recusadas;
 *  - depois de vincular, o `?ref=` resolve o endereço certo PARA CADA REDE;
 *  - o painel soma as duas redes na mesma pessoa, mesmo com endereços diferentes;
 *  - a mesma carteira não pode ser vinculada a duas contas.
 */
import { createPrivateKey, sign as assinarEd25519 } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const RODADA = Date.now().toString(36);
const BASE = "http://localhost:3000";

let falhas = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "  ok  " : " FALHA"}  ${msg}`);
  if (!cond) falhas++;
};

/* ------------------------------------------------------------------ */
/* Assinaturas de verdade                                              */
/* ------------------------------------------------------------------ */

/**
 * Assina como uma carteira Solana assinaria.
 *
 * Mesmo truque do lado do servidor, ao contrário: o `node:crypto` só aceita a
 * chave privada em PKCS#8, então estes bytes de prefixo DER transformam a
 * semente crua de 32 bytes numa chave que ele entende.
 */
const PREFIXO_PKCS8 = Buffer.from("302e020100300506032b657004220420", "hex");

function assinarComoSolana(keypair, mensagem) {
  const semente = Buffer.from(keypair.secretKey.slice(0, 32));
  const chave = createPrivateKey({
    key: Buffer.concat([PREFIXO_PKCS8, semente]),
    format: "der",
    type: "pkcs8",
  });
  return assinarEd25519(null, Buffer.from(mensagem, "utf8"), chave).toString("hex");
}

/** O texto tem que ser byte a byte igual ao que o servidor remonta. */
function mensagemDeVinculo({ nickname, chain, endereco, momento }) {
  return [
    "Chroma — vincular carteira",
    "",
    `Conta: @${nickname}`,
    `Rede: ${chain}`,
    `Carteira: ${endereco}`,
    `Momento: ${new Date(momento).toISOString()}`,
    "",
    "Assinar apenas comprova que esta carteira é sua.",
    "Não move fundos e não dá permissão sobre eles.",
  ].join("\n");
}

const postar = async (rota, corpo) => {
  const res = await fetch(`${BASE}${rota}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
  return { status: res.status, corpo: await res.json() };
};

/* ------------------------------------------------------------------ */

const online = await fetch(`${BASE}/api/account?check=teste`)
  .then((r) => r.ok)
  .catch(() => false);

if (!online) {
  console.log("\nO servidor não está de pé. Rode `npm run dev` numa aba e tente de novo.\n");
  process.exitCode = 1;
} else {
  /* Conta nova a cada execução: os arquivos de dados são append-only. */
  const solana = Keypair.generate();
  const enderecoSolana = solana.publicKey.toBase58();

  const evm = privateKeyToAccount(generatePrivateKey());
  const enderecoEvm = evm.address;

  const apelido = "multi_" + Math.random().toString(36).slice(2, 8);

  console.log("\n--- conta criada só com a carteira Solana ---");
  const registro = await postar("/api/account", {
    nickname: apelido,
    wallet: enderecoSolana,
    kind: "solana",
  });
  ok(registro.status === 200, `@${apelido} registrada na Solana`);
  ok(
    registro.corpo.account?.carteiras?.solana === enderecoSolana,
    "a carteira já nasce ligada à rede certa",
  );

  console.log("\n--- antes de vincular, a Robinhood não tem pra onde pagar ---");
  const semRobinhood = await fetch(
    `${BASE}/api/account?nickname=${apelido}&chain=robinhood`,
  ).then((r) => r.json());
  ok(
    semRobinhood.wallet === null,
    `?ref=${apelido} na Robinhood resolve para ${semRobinhood.wallet} (esperado null)`,
  );

  const naSolana = await fetch(`${BASE}/api/account?nickname=${apelido}&chain=solana`).then((r) =>
    r.json(),
  );
  ok(naSolana.wallet === enderecoSolana, "e na Solana resolve o endereço certo");

  console.log("\n--- vincular sem prova não pode passar ---");

  const semAssinatura = await postar("/api/account/link", {
    assinante: enderecoSolana,
    endereco: enderecoEvm,
    chain: "robinhood",
    mensagem: mensagemDeVinculo({
      nickname: apelido,
      chain: "robinhood",
      endereco: enderecoEvm,
      momento: Date.now(),
    }),
    assinatura: "00".repeat(64),
  });
  ok(semAssinatura.status === 401, `assinatura falsa recusada (${semAssinatura.corpo.error})`);

  /*
   * O ataque que a assinatura existe pra impedir: um estranho plugando a
   * própria carteira no apelido de um divulgador pra receber no lugar dele.
   */
  const estranho = Keypair.generate();
  const momentoEstranho = Date.now();
  const msgEstranho = mensagemDeVinculo({
    nickname: apelido,
    chain: "robinhood",
    endereco: enderecoEvm,
    momento: momentoEstranho,
  });
  const ataque = await postar("/api/account/link", {
    assinante: estranho.publicKey.toBase58(),
    endereco: enderecoEvm,
    chain: "robinhood",
    mensagem: msgEstranho,
    assinatura: assinarComoSolana(estranho, msgEstranho),
  });
  ok(
    ataque.status === 404 || ataque.status === 401,
    `carteira de terceiro não vincula na conta alheia (${ataque.status}: ${ataque.corpo.error})`,
  );

  /*
   * Assinatura boa, mas de OUTRA mensagem. Sem remontar o texto no servidor,
   * daria pra fazer a pessoa assinar uma coisa e usar a assinatura pra outra.
   */
  const momentoTroca = Date.now();
  const outroEndereco = privateKeyToAccount(generatePrivateKey()).address;
  const msgOriginal = mensagemDeVinculo({
    nickname: apelido,
    chain: "robinhood",
    endereco: outroEndereco,
    momento: momentoTroca,
  });
  const trocada = await postar("/api/account/link", {
    assinante: enderecoSolana,
    endereco: enderecoEvm, // <- diferente do que está na mensagem assinada
    chain: "robinhood",
    mensagem: msgOriginal,
    assinatura: assinarComoSolana(solana, msgOriginal),
  });
  ok(trocada.status === 400, `endereço trocado depois de assinar é recusado (${trocada.corpo.error})`);

  const momentoVelho = Date.now() - 10 * 60 * 1000;
  const msgVelha = mensagemDeVinculo({
    nickname: apelido,
    chain: "robinhood",
    endereco: enderecoEvm,
    momento: momentoVelho,
  });
  const velha = await postar("/api/account/link", {
    assinante: enderecoSolana,
    endereco: enderecoEvm,
    chain: "robinhood",
    mensagem: msgVelha,
    assinatura: assinarComoSolana(solana, msgVelha),
  });
  ok(velha.status === 401, `assinatura de 10 minutos atrás é recusada (${velha.corpo.error})`);

  console.log("\n--- vincular de verdade ---");
  const momento = Date.now();
  const mensagem = mensagemDeVinculo({
    nickname: apelido,
    chain: "robinhood",
    endereco: enderecoEvm,
    momento,
  });
  const vinculo = await postar("/api/account/link", {
    assinante: enderecoSolana,
    endereco: enderecoEvm,
    chain: "robinhood",
    mensagem,
    assinatura: assinarComoSolana(solana, mensagem),
  });
  ok(vinculo.status === 200, `carteira Robinhood vinculada (${vinculo.corpo.error ?? "ok"})`);
  ok(
    vinculo.corpo.account?.carteiras?.solana === enderecoSolana,
    "e a carteira Solana continua lá",
  );

  const agoraRobinhood = await fetch(
    `${BASE}/api/account?nickname=${apelido}&chain=robinhood`,
  ).then((r) => r.json());
  ok(
    agoraRobinhood.wallet?.toLowerCase() === enderecoEvm.toLowerCase(),
    "agora o ?ref= resolve o endereço ETH na Robinhood",
  );

  console.log("\n--- a conta é achada por qualquer uma das carteiras ---");
  const porEvm = await fetch(`${BASE}/api/account?wallet=${enderecoEvm}`).then((r) => r.json());
  ok(porEvm?.nickname === apelido, `entrar pela MetaMask acha @${porEvm?.nickname}`);

  const porSolana = await fetch(`${BASE}/api/account?wallet=${enderecoSolana}`).then((r) =>
    r.json(),
  );
  ok(porSolana?.nickname === apelido, "e pela Phantom acha a mesma conta");

  console.log("\n--- a mesma carteira não vai pra duas contas ---");
  const outroApelido = "multi_" + Math.random().toString(36).slice(2, 8);
  const outraSolana = Keypair.generate();
  await postar("/api/account", {
    nickname: outroApelido,
    wallet: outraSolana.publicKey.toBase58(),
    kind: "solana",
  });

  const momentoDuplo = Date.now();
  const msgDuplo = mensagemDeVinculo({
    nickname: outroApelido,
    chain: "robinhood",
    endereco: enderecoEvm,
    momento: momentoDuplo,
  });
  const duplo = await postar("/api/account/link", {
    assinante: outraSolana.publicKey.toBase58(),
    endereco: enderecoEvm,
    chain: "robinhood",
    mensagem: msgDuplo,
    assinatura: assinarComoSolana(outraSolana, msgDuplo),
  });
  ok(duplo.status === 409, `carteira já usada é recusada (${duplo.corpo.error})`);

  console.log("\n--- o painel junta as duas redes na mesma pessoa ---");
  /*
   * O ponto final: a comissão da Solana caiu no endereço base58 e a da
   * Robinhood no `0x…`. São endereços diferentes, mas uma pessoa só — abrir o
   * painel por qualquer uma das carteiras tem que mostrar as duas.
   */
  await postar("/api/affiliate", {
    event: "trade",
    wallet: enderecoSolana,
    ref: apelido,
    chain: "solana",
    tokenSymbol: "POPCAT",
    volumeNative: 2,
    commissionNative: 0.006,
    // Único por rodada: o banco recusa o mesmo hash duas vezes, de propósito.
    txHash: `tx_sol_multi_${RODADA}`,
  });
  await postar("/api/affiliate", {
    event: "trade",
    wallet: enderecoEvm,
    ref: apelido,
    chain: "robinhood",
    tokenSymbol: "HOODCAT",
    volumeNative: 0.5,
    commissionNative: 0.0015,
    txHash: `0xtx_eth_multi_${RODADA}`,
  });

  for (const [rotulo, endereco] of [
    ["pela Phantom", enderecoSolana],
    ["pela MetaMask", enderecoEvm],
  ]) {
    const painel = await fetch(`${BASE}/api/affiliate?wallet=${endereco}`).then((r) => r.json());
    const sol = painel.porRede?.find((r) => r.chain === "solana");
    const eth = painel.porRede?.find((r) => r.chain === "robinhood");

    ok(
      Math.abs((sol?.commissionNative ?? 0) - 0.006) < 1e-9 &&
        Math.abs((eth?.commissionNative ?? 0) - 0.0015) < 1e-9,
      `${rotulo}: ${sol?.commissionNative} SOL + ${eth?.commissionNative} ETH`,
    );
    ok(
      painel.carteiras?.solana === enderecoSolana &&
        painel.carteiras?.robinhood?.toLowerCase() === enderecoEvm.toLowerCase(),
      `${rotulo}: o painel sabe qual carteira recebe em cada rede`,
    );
  }

  console.log(falhas === 0 ? "\nTUDO PASSOU\n" : `\n${falhas} FALHA(S)\n`);
  process.exitCode = falhas === 0 ? 0 : 1;
}
