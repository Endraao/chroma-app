/**
 * Confere a matemática da curva ANTES de ela virar bytecode.
 *
 *   node scripts/test-curve-math.mjs
 *
 * As mesmas fórmulas do programa em Rust, reescritas aqui com BigInt. Serve
 * para duas coisas que o teste em Rust sozinho não faz:
 *
 *  1. provar que a divisão de taxas do contrato bate com `src/lib/fees.ts`,
 *     que é o que a página de taxas promete ao usuário. Se os dois
 *     divergirem, a plataforma cobra uma coisa e anuncia outra;
 *  2. rodar agora, sem esperar a cadeia de ferramentas compilar.
 *
 * Se alguém mudar os números em `fees.ts` e esquecer do contrato, é aqui que
 * aparece.
 */
import { AFFILIATE_FEE_BPS, CHAIN_FEES, PLATFORM_FLOOR_BPS } from "../src/lib/fees.ts";

let falhas = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "  ok  " : " FALHA"}  ${msg}`);
  if (!cond) falhas++;
};

/* ------------------------------------------------------------------ */
/* As mesmas constantes que vão pra configuração on-chain              */
/* ------------------------------------------------------------------ */

const LAMPORTS = 1_000_000_000n;
const CASAS = 1_000_000n; // 6 casas decimais

const V_SOL = 30n * LAMPORTS; //                     30 SOL virtuais
const V_TOKEN = 1_073_000_000n * CASAS; //   1.073.000.000 tokens virtuais
const A_VENDA = 793_100_000n * CASAS; //       793.100.000 à venda na curva
const EMISSAO = 1_000_000_000n * CASAS; //   1.000.000.000 de emissão total

const BPS = 10_000n;

/* ------------------------------------------------------------------ */
/* Curva — espelho de programs/chroma-curve/src/curva.rs               */
/* ------------------------------------------------------------------ */

/** Tokens que saem ao entrar com `solLiquido` (já sem a taxa). */
function tokensPorSol(vSol, vToken, solLiquido) {
  const k = vSol * vToken;
  const novoSol = vSol + solLiquido;
  // Arredonda a reserva pra CIMA para a SAÍDA cair pra baixo.
  const novoToken = (k + novoSol - 1n) / novoSol;
  return vToken - novoToken;
}

/** Lamports que saem (antes da taxa) ao devolver `tokens`. */
function solPorTokens(vSol, vToken, tokens) {
  const k = vSol * vToken;
  const novoToken = vToken + tokens;
  // Arredonda pra CIMA: a reserva nunca fica menor do que deveria.
  const novoSol = (k + novoToken - 1n) / novoToken;
  return vSol > novoSol ? vSol - novoSol : 0n;
}

/* ------------------------------------------------------------------ */

console.log("\n--- o preço sobe conforme compram ---");
{
  const umSol = LAMPORTS;
  const primeira = tokensPorSol(V_SOL, V_TOKEN, umSol);
  const segunda = tokensPorSol(V_SOL + umSol, V_TOKEN - primeira, umSol);
  const centesima = (() => {
    let s = V_SOL;
    let t = V_TOKEN;
    for (let i = 0; i < 99; i++) {
      const saida = tokensPorSol(s, t, umSol);
      s += umSol;
      t -= saida;
    }
    return tokensPorSol(s, t, umSol);
  })();

  ok(segunda < primeira, `o 2º SOL compra menos que o 1º (${segunda} < ${primeira})`);
  ok(centesima < segunda, `o 100º compra menos que o 2º (${centesima} < ${segunda})`);

  const queda = Number((primeira - centesima) * 100n / primeira);
  ok(queda > 50, `do 1º ao 100º SOL o token encarece ${queda}%`);
}

console.log("\n--- ida e volta nunca devolve mais do que entrou ---");
{
  /*
   * A invariante que protege a reserva. Comprar e vender na sequência, SEM
   * taxa nenhuma, tem que devolver no máximo o que entrou. Devolver mais seria
   * dinheiro nascendo do nada — e alguém repetiria até esvaziar a curva.
   */
  let pior = 0n;
  for (const entrada of [1_000n, 100_000n, LAMPORTS / 100n, LAMPORTS, 10n * LAMPORTS, 50n * LAMPORTS]) {
    const tokens = tokensPorSol(V_SOL, V_TOKEN, entrada);
    const volta = solPorTokens(V_SOL + entrada, V_TOKEN - tokens, tokens);
    if (volta > entrada) pior = volta - entrada;
    ok(volta <= entrada, `${entrada} lamports → ${tokens} tokens → ${volta} lamports`);
  }
  ok(pior === 0n, "nenhuma entrada devolveu mais do que recebeu");
}

console.log("\n--- a curva enche onde deveria ---");
{
  const k = V_SOL * V_TOKEN;
  const restante = V_TOKEN - A_VENDA;
  const arrecadado = k / restante - V_SOL;
  const emSol = Number(arrecadado) / Number(LAMPORTS);

  ok(emSol > 80 && emSol < 90, `vendidos os ${A_VENDA / CASAS} tokens, a curva junta ${emSol.toFixed(1)} SOL`);
  ok(A_VENDA < EMISSAO, `sobram ${(EMISSAO - A_VENDA) / CASAS} tokens pra pool da DEX na migração`);

  // Preço do primeiro e do último token, pra ver a amplitude da curva.
  const inicio = Number(V_SOL) / Number(V_TOKEN);
  const fim = Number(k / restante) / Number(restante);
  ok(fim > inicio * 10, `o preço multiplica por ${(fim / inicio).toFixed(0)}x do começo ao fim`);
}

console.log("\n--- a divisão de taxas bate com src/lib/fees.ts ---");
{
  const config = CHAIN_FEES.solana;
  const totalBps = BigInt(config.curveTotalBps);
  const afiliadoBps = BigInt(AFFILIATE_FEE_BPS);
  const pisoBps = BigInt(PLATFORM_FLOOR_BPS);

  /** Espelho de `dividir_taxa` em state.rs. */
  const dividir = (base, criadorBps, temAfiliado) => {
    const total = (base * totalBps) / BPS;
    const criador = (base * BigInt(criadorBps)) / BPS;
    const afiliado = temAfiliado ? (base * afiliadoBps) / BPS : 0n;
    const plataforma = total - criador - afiliado;
    return { total, criador, afiliado, plataforma };
  };

  const base = 10n * LAMPORTS;

  for (const faixa of config.creatorTiers) {
    for (const temAfiliado of [false, true]) {
      const d = dividir(base, faixa.creatorBps, temAfiliado);

      ok(
        d.criador + d.afiliado + d.plataforma === d.total,
        `${faixa.label}${temAfiliado ? " com afiliado" : ""}: as partes fecham o total exato`,
      );

      const piso = (base * pisoBps) / BPS;
      ok(
        d.plataforma >= piso,
        `${faixa.label}${temAfiliado ? " com afiliado" : ""}: plataforma ${d.plataforma} não fura o piso ${piso}`,
      );
    }
  }

  // O caso mais apertado: faixa mais alta do criador E com afiliado.
  const topo = config.creatorTiers[config.creatorTiers.length - 1];
  const apertado = dividir(base, topo.creatorBps, true);
  const sobraBps = Number((apertado.plataforma * BPS) / base);
  ok(
    sobraBps >= Number(pisoBps),
    `no pior caso (criador ${topo.creatorBps}bps + afiliado ${AFFILIATE_FEE_BPS}bps) sobram ${sobraBps}bps pra plataforma`,
  );

  // Sem indicação, a fatia do afiliado fica com a plataforma? Não: não é cobrada.
  const sem = dividir(base, topo.creatorBps, false);
  const com = dividir(base, topo.creatorBps, true);
  ok(
    sem.plataforma > com.plataforma,
    "sem indicação a plataforma fica com a fatia — é o que a página de taxas diz",
  );
  ok(sem.total === com.total, "e o trader paga o mesmo nos dois casos");
}

console.log("\n--- arredondamento sempre a favor da reserva ---");
{
  /*
   * Compras minúsculas repetidas não podem render mais token do que uma
   * compra única do mesmo total. Se rendessem, valeria a pena fatiar a ordem
   * — e o ataque seria fatiar até drenar.
   */
  const total = LAMPORTS;
  const deUmaVez = tokensPorSol(V_SOL, V_TOKEN, total);

  let s = V_SOL;
  let t = V_TOKEN;
  let picado = 0n;
  const pedaco = total / 1000n;
  for (let i = 0; i < 1000; i++) {
    const saida = tokensPorSol(s, t, pedaco);
    picado += saida;
    s += pedaco;
    t -= saida;
  }

  ok(
    picado <= deUmaVez,
    `1000 compras picadas rendem ${picado}, uma só rende ${deUmaVez} — picar não compensa`,
  );
}

console.log(falhas === 0 ? "\nTUDO PASSOU\n" : `\n${falhas} FALHA(S)\n`);
process.exitCode = falhas === 0 ? 0 : 1;
