/**
 * Registra no painel do afiliado uma operação da Robinhood que pagou comissão.
 *
 * Na Robinhood a comissão já cai na carteira de quem indicou dentro da própria
 * transação; isto aqui só alimenta o PAINEL (cliques × trades × quanto ganhou).
 * Não bloqueia nada: se falhar, o dinheiro já foi pago mesmo assim.
 */
export function registrarIndicacaoEvm(p: {
  afiliado: string;
  txHash: string;
  volumeEth: string;
  comissaoEth: string;
  moeda: string;
  simbolo?: string;
}) {
  void fetch("/api/affiliate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      event: "trade",
      // Sem "ref": o promotor é identificado pela carteira que RECEBEU —
      // o link guardado no navegador pode ser de outra pessoa.
      wallet: p.afiliado,
      txHash: p.txHash,
      volumeNative: p.volumeEth,
      commissionNative: p.comissaoEth,
      tokenAddress: p.moeda,
      tokenSymbol: p.simbolo,
      chain: "robinhood",
    }),
  }).catch(() => {});
}
