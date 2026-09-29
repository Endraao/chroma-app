/**
 * Preço médio das compras feitas PELA CHROMA, guardado no navegador.
 *
 * A lista de traders vem das últimas negociações da GeckoTerminal; em moeda
 * movimentada as compras da pessoa saem dessa janela em minutos, e o painel
 * "Sua posição" sumia. Aqui cada operação feita no site é anotada (em moeda
 * nativa: SOL ou ETH) e o lucro é calculado com o preço atual.
 */
export interface PosicaoLocal {
  tokens: number; // quanto ainda tem, pelas operações anotadas
  custoNativo: number; // quanto pagou (em SOL/ETH) por esses tokens
  compras: number;
  vendas: number;
}

const CHAVE = "chroma.posicoes";

function ler(): Record<string, PosicaoLocal> {
  try {
    return JSON.parse(window.localStorage.getItem(CHAVE) ?? "{}");
  } catch {
    return {};
  }
}

export function posicaoLocal(carteira: string, moeda: string): PosicaoLocal | null {
  return ler()[`${carteira.toLowerCase()}:${moeda.toLowerCase()}`] ?? null;
}

export function anotarOperacao(
  carteira: string,
  moeda: string,
  lado: "buy" | "sell",
  tokens: number,
  nativo: number,
) {
  if (!(tokens > 0) || !(nativo > 0)) return;
  const todas = ler();
  const k = `${carteira.toLowerCase()}:${moeda.toLowerCase()}`;
  const p = todas[k] ?? { tokens: 0, custoNativo: 0, compras: 0, vendas: 0 };
  if (lado === "buy") {
    p.tokens += tokens;
    p.custoNativo += nativo;
    p.compras += 1;
  } else {
    // Venda tira custo na proporção do que saiu (preço médio não muda).
    const fracao = p.tokens > 0 ? Math.min(1, tokens / p.tokens) : 1;
    p.custoNativo -= p.custoNativo * fracao;
    p.tokens = Math.max(0, p.tokens - tokens);
    p.vendas += 1;
  }
  todas[k] = p;
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(todas));
  } catch {
    /* sem storage: a posição usa só o histórico público */
  }
}
