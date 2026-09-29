// Preenche no banco quais moedas da Robinhood a Chroma consegue negociar.
// Uso: npx tsx --env-file=.env.local scripts/classificar-robinhood.mts [site]
import { classificar, statusDasMoedas } from "../src/lib/negociaveis.ts";

const site = process.argv[2] ?? "https://chromalaunch.fun";
const html = await (await fetch(`${site}/?chain=robinhood`)).text();
const moedas = [...new Set([...html.matchAll(/href="\/token\/(0x[0-9a-f]{40})"/g)].map((m) => m[1]))];
console.log(moedas.length, "moedas");
const conta: Record<string, number> = {};
const ja = await statusDasMoedas(moedas);
for (const m of moedas) {
  const s = ja.get(m);
  if (process.argv.includes("--so-falhas") && s && (s.r.ok || s.r.motivo === "venda-bloqueada" || s.r.motivo === "sem-pool")) continue;
  const r = await classificar(m);
  const k = r ? (r.ok ? "ok" : r.motivo) : "erro";
  conta[k] = (conta[k] ?? 0) + 1;
  console.log(m, k);
}
console.log(conta);
