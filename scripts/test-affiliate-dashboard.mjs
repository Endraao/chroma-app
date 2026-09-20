/**
 * Teste do painel de comissões.
 *
 * Rode com o servidor de pé:
 *
 *   node scripts/test-affiliate-dashboard.mjs
 *
 * Grava conversões de mentira numa carteira de teste e confere se o resumo
 * devolve o que o painel precisa: total, hoje, 7 dias, as 14 barras do gráfico
 * e o agrupamento por moeda.
 *
 * O ponto central é a SEPARAÇÃO POR REDE. Solana paga a comissão em SOL e a
 * Robinhood Chain paga em ETH; se o resumo juntasse as duas num número só, a
 * tela mostraria um valor que não existe em carteira nenhuma. Por isso o teste
 * grava nas duas redes e exige que cada uma feche a própria conta.
 *
 * As linhas gravadas ficam em `.data/affiliate-events.jsonl` com a carteira de
 * teste — não poluem nenhum promotor real.
 */
const BASE = "http://localhost:3000/api/affiliate";
/*
 * Carteira nova a cada execução. Com endereço fixo, rodar o teste duas vezes
 * somaria as conversões da rodada anterior e as contas dariam errado — o
 * arquivo de eventos é append-only e nada apaga o que já entrou.
 */
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const CARTEIRA = Array.from(
  { length: 44 },
  () => BASE58[Math.floor(Math.random() * BASE58.length)],
).join("");

let falhas = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "  ok  " : " FALHA"}  ${msg}`);
  if (!cond) falhas++;
};

const registrar = (dados) =>
  fetch(BASE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event: "trade", wallet: CARTEIRA, ...dados }),
  });

console.log("\n--- gravando conversões de teste ---");
const conversoes = [
  { chain: "solana", tokenSymbol: "POPCAT", tokenAddress: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", volumeNative: 2.5, commissionNative: 0.0075, txHash: "tx_popcat_1" },
  { chain: "solana", tokenSymbol: "POPCAT", tokenAddress: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", volumeNative: 1.0, commissionNative: 0.003, txHash: "tx_popcat_2" },
  { chain: "solana", tokenSymbol: "WIFCASH", tokenAddress: "5cQVo6tpumpAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", volumeNative: 4.0, commissionNative: 0.012, txHash: "tx_wif_1" },
  { chain: "robinhood", tokenSymbol: "HOODCAT", tokenAddress: "0x1111111111111111111111111111111111111111", volumeNative: 0.5, commissionNative: 0.0015, txHash: "0xtx_hoodcat_1" },
];

for (const c of conversoes) {
  const moeda = c.chain === "robinhood" ? "ETH" : "SOL";
  const r = await registrar(c);
  ok(r.ok, `${c.chain}/${c.tokenSymbol}: ${c.commissionNative} ${moeda}`);
}

const resumo = await (await fetch(`${BASE}?wallet=${CARTEIRA}`)).json();

console.log("\n--- separação por rede ---");
const redes = resumo.porRede ?? [];
ok(redes.length === 2, `${redes.length} redes no resumo (esperado 2)`);

const sol = redes.find((r) => r.chain === "solana");
const eth = redes.find((r) => r.chain === "robinhood");

ok(sol?.symbol === "SOL", `Solana paga em ${sol?.symbol}`);
ok(eth?.symbol === "ETH", `Robinhood Chain paga em ${eth?.symbol}`);

/*
 * O que o bug fazia: 0,0225 SOL + 0,0015 ETH viravam "0,024" numa moeda só.
 * Aqui cada rede tem que fechar exatamente com o que foi gravado nela.
 */
const esperado = (chain) =>
  conversoes.filter((c) => c.chain === chain).reduce((a, c) => a + c.commissionNative, 0);

const perto = (a, b) => Math.abs((a ?? NaN) - b) < 1e-9;

ok(perto(sol?.commissionNative, esperado("solana")), `total Solana = ${sol?.commissionNative} SOL (esperado ${esperado("solana")})`);
ok(perto(eth?.commissionNative, esperado("robinhood")), `total Robinhood = ${eth?.commissionNative} ETH (esperado ${esperado("robinhood")})`);
ok(
  !perto(sol?.commissionNative, esperado("solana") + esperado("robinhood")),
  "o total da Solana NÃO inclui o ETH da Robinhood",
);

console.log("\n--- números da rede Solana ---");
ok(sol?.commissionToday >= esperado("solana") - 1e-9, `hoje = ${sol?.commissionToday} SOL`);
ok(sol?.commissionWeek >= esperado("solana") - 1e-9, `7 dias = ${sol?.commissionWeek} SOL`);
ok(sol?.daily?.length === 14, `gráfico com ${sol?.daily?.length} barras (precisa ser 14)`);
ok(
  sol?.daily?.at(-1)?.commission >= esperado("solana") - 1e-9,
  "a última barra é a de hoje e tem o valor certo",
);
ok(sol?.trades === 3, `${sol?.trades} trades na Solana (esperado 3)`);
ok(eth?.trades === 1, `${eth?.trades} trade na Robinhood (esperado 1)`);

console.log("\n--- agrupamento por moeda ---");
const porMoeda = sol?.byToken ?? [];
ok(porMoeda.length === 2, `${porMoeda.length} moedas distintas na Solana (esperado 2)`);
ok(porMoeda[0]?.symbol === "WIFCASH", `a que mais rendeu vem primeiro: ${porMoeda[0]?.symbol}`);
ok(
  porMoeda.find((t) => t.symbol === "POPCAT")?.trades === 2,
  "POPCAT com 2 trades somados na mesma linha",
);
ok(
  !porMoeda.some((t) => t.symbol === "HOODCAT"),
  "a moeda da Robinhood não aparece na lista da Solana",
);

console.log("\n--- lista de pagamentos ---");
const ultimo = sol?.recentTrades?.[0];
ok(Boolean(ultimo?.txHash), `cada pagamento tem comprovante (${ultimo?.txHash})`);
ok(Boolean(ultimo?.tokenSymbol), `e diz de qual moeda veio (${ultimo?.tokenSymbol})`);

console.log(falhas === 0 ? "\nTUDO PASSOU\n" : `\n${falhas} FALHA(S)\n`);
/*
 * exitCode em vez de exit(): sair no meio de fetches pendentes faz o libuv
 * estourar uma assertion no Windows. Assim o Node fecha sozinho, limpo.
 */
process.exitCode = falhas === 0 ? 0 : 1;
