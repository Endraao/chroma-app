/**
 * Percorre o lançamento inteiro, do jeito que o navegador percorre.
 *
 *   node scripts/test-lancamento.mjs
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTE TESTE COBRE QUE OS OUTROS NÃO COBREM
 * ---------------------------------------------------------------------------
 * `test:programa` prova que o cliente e o programa falam a mesma língua, mas
 * inventa a URI dos metadados. `test:token-media` prova que a rota de mídia
 * funciona, mas não manda nada pra rede.
 *
 * O lançamento de verdade é a COSTURA entre os dois, e é exatamente ali que
 * mora o erro caro: a transação grava a URI de forma IMUTÁVEL. Se a rota
 * devolver um endereço que não abre, ou que abre com outro nome, a moeda nasce
 * quebrada e não existe conserto — nem pra nós, nem pro dono dela.
 *
 * Então aqui o caminho é o mesmo de `useLancarToken.ts`, na mesma ordem:
 *
 *   1. manda a arte pra /api/token-media e recebe a URI
 *   2. lê a carteira da plataforma DA REDE (não de variável de ambiente)
 *   3. monta e envia a transação de lançamento
 *   4. confere que a URI gravada na rede abre e descreve a moeda certa
 *
 * A única coisa que não dá pra reproduzir por aqui é o popup da carteira.
 *
 * Precisa da rede local (`npm run localnet`) e do site (`npm run dev`) no ar.
 */
import { deflateSync, crc32 } from "node:zlib";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

import {
  enderecoDaConfig,
  enderecoDaCurva,
  enderecoDosMetadados,
  ixCriarConfig,
  ixLancar,
  lerCurva,
  recusarDadosDoToken,
} from "../src/lib/chroma-program.ts";

const RPC = process.env.RPC_LOCAL || "http://127.0.0.1:8899";
const SITE = process.env.SITE_LOCAL || "http://localhost:3000";

let falhas = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "  ok  " : " FALHA"}  ${msg}`);
  if (!cond) falhas++;
};

/** PNG cinza válido de verdade. */
function png(largura, altura) {
  const chunk = (tipo, dados) => {
    const tamanho = Buffer.alloc(4);
    tamanho.writeUInt32BE(dados.length);
    const corpo = Buffer.concat([Buffer.from(tipo, "ascii"), dados]);
    const checagem = Buffer.alloc(4);
    checagem.writeUInt32BE(crc32(corpo));
    return Buffer.concat([tamanho, corpo, checagem]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;

  const cru = Buffer.concat(
    Array.from({ length: altura }, () =>
      Buffer.concat([Buffer.from([0]), Buffer.alloc(largura, 128)]),
    ),
  );

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(cru)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function noAr(url) {
  try {
    await fetch(url, { method: "HEAD" });
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */

const conexao = new Connection(RPC, "confirmed");

const redeNoAr = await conexao
  .getVersion()
  .then(() => true)
  .catch(() => false);

const siteNoAr = await noAr(SITE);

console.log("\n--- lançamento de ponta a ponta ---");

if (!redeNoAr || !siteNoAr) {
  if (!redeNoAr) console.log("  pulado  a rede local não respondeu (npm run localnet)");
  if (!siteNoAr) console.log("  pulado  o site não respondeu (npm run dev)");
  process.exit(0);
}

/*
 * Cada rodada usa uma carteira nova. Reaproveitar uma faria o teste depender
 * do que a rodada anterior deixou pra trás — e um teste que passa por causa do
 * lixo da rodada anterior não prova nada.
 */
const criador = Keypair.generate();

const creditar = async (quem, sol) => {
  const assinatura = await conexao.requestAirdrop(quem, sol * LAMPORTS_PER_SOL);
  const bloco = await conexao.getLatestBlockhash();
  await conexao.confirmTransaction({ signature: assinatura, ...bloco }, "confirmed");
};

await creditar(criador.publicKey, 50);

/* --- a configuração precisa existir antes de qualquer lançamento --- */

const config = enderecoDaConfig();
if (!(await conexao.getAccountInfo(config))) {
  const autoridade = Keypair.generate();
  await creditar(autoridade.publicKey, 10);

  await sendAndConfirmTransaction(
    conexao,
    new Transaction().add(
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
    ),
    [autoridade],
    { commitment: "confirmed" },
  );
  console.log("        (configuração criada nesta rede)");
}

/* --- 1. a arte vai pro ar ANTES da transação ---------------------- */

const MOEDA = {
  nome: "Gato de Teste",
  simbolo: "GATO",
  descricao: "moeda do teste de ponta a ponta",
  twitter: "https://twitter.com/gato",
};

const form = new FormData();
form.append("name", MOEDA.nome);
form.append("symbol", MOEDA.simbolo);
form.append("description", MOEDA.descricao);
form.append("twitter", MOEDA.twitter);
form.append("creator", criador.publicKey.toBase58());
form.append("coin", new Blob([png(1000, 1000)], { type: "image/png" }), "gato.png");
form.append("banner", new Blob([png(1500, 500)], { type: "image/png" }), "capa.png");

const resposta = await fetch(`${SITE}/api/token-media`, { method: "POST", body: form });
const publicado = await resposta.json();

ok(resposta.ok, `a arte subiu (${resposta.status})`);
if (!resposta.ok) {
  console.log(`        ${JSON.stringify(publicado)}`);
  process.exit(1);
}

const uri = publicado.metadataUrl;
ok(typeof uri === "string" && uri.startsWith("http"), `a URI veio absoluta: ${uri}`);

/*
 * O limite de 200 bytes da URI é do formato on-chain. Se a rota um dia passar
 * a devolver endereços mais longos — um CDN com assinatura na query, por
 * exemplo — a transação passa a ser recusada DEPOIS de a pessoa aprovar. Aqui
 * isso vira falha de teste antes de chegar em alguém.
 */
ok(
  recusarDadosDoToken({ nome: MOEDA.nome, simbolo: MOEDA.simbolo, uri }) === null,
  "nome, símbolo e URI cabem no formato da rede",
);

/* --- 2. a carteira da plataforma vem da rede ---------------------- */

const contaDaConfig = await conexao.getAccountInfo(config);
const carteiraDaPlataforma = new PublicKey(contaDaConfig.data.subarray(40, 72));

ok(
  !carteiraDaPlataforma.equals(PublicKey.default),
  `a carteira da plataforma foi lida da rede: ${carteiraDaPlataforma.toBase58().slice(0, 8)}…`,
);

/* --- 3. a transação ----------------------------------------------- */

const mint = Keypair.generate();

const assinatura = await sendAndConfirmTransaction(
  conexao,
  new Transaction().add(
    ixLancar({
      criador: criador.publicKey,
      mint: mint.publicKey,
      carteiraDaPlataforma,
      nome: MOEDA.nome,
      simbolo: MOEDA.simbolo,
      uri,
    }),
  ),
  [criador, mint],
  { commitment: "confirmed", skipPreflight: false },
);

ok(Boolean(assinatura), `a moeda foi lançada: ${mint.publicKey.toBase58()}`);

/* --- 4. o que ficou gravado --------------------------------------- */

const contaDaCurva = await conexao.getAccountInfo(enderecoDaCurva(mint.publicKey));
ok(Boolean(contaDaCurva), "a curva nasceu");

if (contaDaCurva) {
  const estado = lerCurva(contaDaCurva.data);
  ok(estado.criador.equals(criador.publicKey), "o criador gravado é quem assinou");
  ok(estado.solReal === 0n, "a curva começa sem SOL dentro");
}

const contaDosMetadados = await conexao.getAccountInfo(enderecoDosMetadados(mint.publicKey));
ok(Boolean(contaDosMetadados), "a conta de metadados foi criada pela Metaplex");

if (contaDosMetadados) {
  const cru = contaDosMetadados.data.toString("utf8");
  ok(cru.includes(MOEDA.nome), "o nome está gravado na rede");
  ok(cru.includes(MOEDA.simbolo), "o símbolo está gravado na rede");
  ok(cru.includes(uri), "a URI gravada é exatamente a que a rota devolveu");
}

/* --- 5. a parte que ninguém testa e é a que quebra ---------------- */
/*
 * A URI está gravada e não muda mais. Falta a única pergunta que importa pra
 * quem abrir a carteira: aquele endereço ABRE, e descreve esta moeda?
 */

const metadados = await fetch(uri).then((r) => (r.ok ? r.json() : null));
ok(Boolean(metadados), "a URI gravada na rede abre");

if (metadados) {
  ok(metadados.name === MOEDA.nome, "o JSON traz o nome certo");
  ok(metadados.symbol === MOEDA.simbolo, "o JSON traz o símbolo certo");
  ok(Boolean(metadados.image), "o JSON aponta pra uma imagem");

  if (metadados.image) {
    const imagem = await fetch(metadados.image);
    ok(
      imagem.ok && (imagem.headers.get("content-type") ?? "").startsWith("image/"),
      "e a imagem abre de verdade",
    );
  }
}

console.log(
  falhas === 0
    ? "\n  lançamento completo: arte, transação e metadados conferem\n"
    : `\n  ${falhas} falha(s)\n`,
);
process.exit(falhas === 0 ? 0 : 1);
