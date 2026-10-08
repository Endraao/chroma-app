/** Mensagem da campanha: montada no navegador (assinatura) e conferida no servidor. */
/** Mensagem que o patrocinador assina pra criar a campanha (sem gastar nada). */
export function mensagemDaCampanha(c: { moeda: string; bonusPct: number; orcamentoSol: number; dias: number; momento: number }) {
  return [
    "Chroma — create a promoter campaign",
    `Coin: ${c.moeda}`,
    `Bonus: ${c.bonusPct}% of the volume promoters bring`,
    `Budget: up to ${c.orcamentoSol} SOL`,
    `Duration: ${c.dias} days`,
    "I will pay promoters directly from my wallet. Chroma holds no funds.",
    `Time: ${new Date(c.momento).toISOString()}`,
  ].join("\n");
}

export function lerMensagemDaCampanha(m: string) {
  const pega = (re: RegExp) => re.exec(m)?.[1];
  const moeda = pega(/^Coin: (\S+)$/m);
  const bonusPct = Number(pega(/^Bonus: ([0-9.]+)%/m));
  const orcamentoSol = Number(pega(/^Budget: up to ([0-9.]+) SOL$/m));
  const dias = Number(pega(/^Duration: ([0-9]+) days$/m));
  if (!moeda || !(bonusPct > 0 && bonusPct <= 10) || !(orcamentoSol > 0 && orcamentoSol <= 1000) || !(dias >= 1 && dias <= 30)) return null;
  return { moeda, bonusPct, orcamentoSol, dias };
}
