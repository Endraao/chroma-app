/**
 * TABELA DE ENDEREÇOS DA CHROMA NA SOLANA.
 *
 * O lançamento (taxa de 0,02 SOL + criação + compra do criador) em UMA
 * transação só passa do limite de 1.232 bytes: cada endereço ocupa 32 bytes.
 * Com os fixos numa tabela na rede, cada um vira 1 byte (medido em
 * scripts/medir-tx-com-tabela.mts: ~1.080 bytes no pior caso).
 *
 * Criada uma vez em /admin/tabela (só local). Sem `TABELA_SOLANA`, o
 * lançamento volta ao fluxo de duas aprovações.
 */
export const ENDERECOS_DA_TABELA: string[] = [
  "ComputeBudget111111111111111111111111111111",
  "11111111111111111111111111111111",
  "2jbvKgnx1uiH3TWttr5Y2qMmb6knBmSVpdW4BAmhWomY",
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
  "TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM",
  "4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e",
  "13ec7XdrjF3h3YcqBTFDSReRcUFwbCnJaAQspM4j6DDJ",
  "BwWK17cbHxwWBKZkUYvzxLcNQ1YVyaFezduWbtm2de6s",
  "Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1",
  "Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y",
  "8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt",
  "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ"
];

/** Endereço da tabela na rede (preenchido depois de criada). */
export const TABELA_SOLANA: string | null = "A844pzPz6mnEKXKwWtFvne5dMJCK5sJogfVdarGwctXS";
