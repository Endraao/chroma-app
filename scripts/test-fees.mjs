/**
 * Teste da matemática das taxas, rede por rede.
 *
 * Roda direto no Node (24+ executa TypeScript nativamente), sem servidor:
 *
 *   node scripts/test-fees.mjs
 *
 * O que ele garante:
 *  - criador + plataforma + afiliado fecham sempre o total da rede;
 *  - a plataforma nunca cai abaixo do piso;
 *  - a fatia do criador só sobe, e no topo bate o concorrente da rede;
 *  - o swap de token externo custa menos que a curva;
 *  - o split do pool não perde nenhuma fração na divisão.
 */
import {
  AFFILIATE_FEE_BPS,
  CHAIN_FEES,
  PLATFORM_FLOOR_BPS,
  computeFeesRaw,
  distributeFees,
  swapFeeBps,
} from "../src/lib/fees.ts";

let falhas = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "  ok  " : " FALHA"}  ${msg}`);
  if (!cond) falhas++;
};

const pct = (bps) => `${(bps / 100).toFixed(2)}%`;
const chains = Object.keys(CHAIN_FEES);
const volumes = [0, 50_000, 100_000, 499_999, 500_000, 2_000_000, 50_000_000];

for (const chain of chains) {
  const config = CHAIN_FEES[chain];
  console.log(`\n=== ${chain} (total ${pct(config.curveTotalBps)}, concorrente ${config.reference.name}) ===`);

  for (const volume of volumes) {
    for (const comAfiliado of [true, false]) {
      const d = distributeFees(chain, volume, comAfiliado);
      const soma = d.creatorBps + d.affiliateBps + d.platformBps;

      ok(
        soma === config.curveTotalBps,
        `vol ${volume.toLocaleString("pt-BR").padStart(10)} ${comAfiliado ? "c/ ref" : "s/ ref"} → ` +
          `criador ${pct(d.creatorBps)} + afiliado ${pct(d.affiliateBps)} + plataforma ${pct(d.platformBps)} = ${pct(soma)}`,
      );
      ok(
        d.platformBps >= PLATFORM_FLOOR_BPS,
        `   plataforma ${pct(d.platformBps)} >= piso ${pct(PLATFORM_FLOOR_BPS)}`,
      );
    }
  }

  console.log("  -- faixas sobem, nunca descem --");
  for (let i = 1; i < config.creatorTiers.length; i++) {
    ok(
      config.creatorTiers[i].creatorBps > config.creatorTiers[i - 1].creatorBps &&
        config.creatorTiers[i].fromVolumeUsd > config.creatorTiers[i - 1].fromVolumeUsd,
      `faixa "${config.creatorTiers[i].label}" sobe em relação à anterior`,
    );
  }

  console.log("  -- no topo, o criador bate o concorrente --");
  const topo = config.creatorTiers[config.creatorTiers.length - 1].creatorBps;
  ok(
    topo >= config.reference.creatorBps,
    `topo ${pct(topo)} >= ${config.reference.name} ${pct(config.reference.creatorBps)}`,
  );

  console.log("  -- token externo custa menos que a curva --");
  const externo = swapFeeBps(chain);
  ok(
    externo < config.curveTotalBps && externo === config.curveTotalBps - config.creatorTiers[0].creatorBps,
    `swap externo ${pct(externo)} < curva ${pct(config.curveTotalBps)}`,
  );
  ok(
    externo - AFFILIATE_FEE_BPS >= PLATFORM_FLOOR_BPS,
    `   sobra pra plataforma no swap externo: ${pct(externo - AFFILIATE_FEE_BPS)}`,
  );

  console.log("  -- taxa de swap em inteiros --");
  for (const gross of [1_000_000_000n, 333_333_333n]) {
    const comRef = computeFeesRaw(gross, "carteira", chain);
    const semRef = computeFeesRaw(gross, null, chain);
    ok(
      comRef.platformFee + comRef.affiliateFee === comRef.totalFee,
      `${gross} c/ ref → plataforma ${comRef.platformFee} + afiliado ${comRef.affiliateFee} = ${comRef.totalFee}`,
    );
    ok(
      semRef.affiliateFee === 0n && semRef.platformFee === semRef.totalFee,
      `${gross} s/ ref → plataforma leva o total (${semRef.totalFee})`,
    );
  }
}

/*
 * O split do pool era testado aqui. Saiu junto com o pool: não existe mais
 * queima nem redistribuição, a fatia da plataforma fica integralmente em
 * caixa e já é conferida nos blocos acima.
 */

console.log(falhas === 0 ? "\nTUDO PASSOU\n" : `\n${falhas} FALHA(S)\n`);
process.exit(falhas === 0 ? 0 : 1);
