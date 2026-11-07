import { EH_A_CHROMA } from "@/lib/marca";

/**
 * TABELA DE ENDEREÇOS DA CHROMA NA SOLANA.
 *
 * O lançamento (criação + compra do criador) em UMA
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
  process.env.NEXT_PUBLIC_PLATFORM_FEE_WALLET_SOL || "2jbvKgnx1uiH3TWttr5Y2qMmb6knBmSVpdW4BAmhWomY",
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

/**
 * Endereços acrescentados na mesma tabela para o lançamento pareado caber em uma
 * transação. Cada par precisa estar aqui: é o que libera a escolha dele na tela.
 * Para adicionar pares, inclua os endereços e use /admin/tabela (só local).
 */
export const ENDERECOS_DOS_PARES: string[] = [
  "6z6GDdfb2AjR9ZhJmAUQ5cipJCVxQvLJhB2H8mCwTFBP",
  "SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb",
  "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
  "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
  "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
  "5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD",
  "4Lpg3uSfU1az3omN4K2T46Hy1XRkPaV9Lzkbw3Qupj7S",
  "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
  "3BpXnfJaUTiwXnJNe7Ej1rcbzqTTQUvLShZaWazebsVR",
  "2j2Wm47KSgbZK69Hynss2mTeLypyx1obVGxQybVDPcS8",
  "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ",
  "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu",
  "7hTckgnGnLQR6sdH7YkqFTAA7VwTfYFaZ6EhEsU3saCX",
  "BHMXuvJVGQH37jZqKh1ZzJUn6AsKb37QPyQT1gDAi8JS",
  "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN",
  "5cjcW9wExnJJiqgLjq7DEG75Pm6JBgE1hNv4B2vHXUW6",
  "9dd5bBhkofY1XyD2gRv3NfAjfFpQsuDxjYmwQb6nysCw",
  "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg",
  "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX",
  "Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu",
  "XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ",
  "XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg",
  "Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re",
  "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
  "EDPWqVLVFYB7Fwd3RA2wSLWYL2Q532z4DumHVeAE7aLR",
  "pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn",
  "FWsW1xNtWscwNmKv6wVsU1iTzRN6wmmk3MjxRP5tT7hz",
  "8KJidaVpdw9UQwADmUxoCJ9igEzVq1dNHWDCkStzQ5rd",
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
  "CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM",
  "9nhuRgmWksMK64a6nDDiadMovFiecBsUXTNdhdfdEZqN",
  "98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g",
  "DoGEV7LASBkQbibMc5k5vKnTZoMg423GpJ5QtJEGfm7R",
  "5wt5k3J6d7qMozDKPqFVDkkqSN2FzvspXLdfdiSZzQC7",
  "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN",
  "EHAAiTxcdDwQ3U4bU6YcMsQGaekdzLS3B5SmYo46kJtL",
  "H1BJG6YbPRYYQ91Ns1XMQ43hsz5X39TbMtMqBx4FKirb"
];

/**
 * Endereço da tabela na rede (preenchido depois de criada). A da Chroma tem a
 * carteira de taxas dela: o site de um cliente cria a própria e passa em
 * NEXT_PUBLIC_TABELA_SOLANA (sem ela, lança em duas aprovações).
 */
export const TABELA_SOLANA: string | null = EH_A_CHROMA
  ? "A844pzPz6mnEKXKwWtFvne5dMJCK5sJogfVdarGwctXS"
  : process.env.NEXT_PUBLIC_TABELA_SOLANA || null;
