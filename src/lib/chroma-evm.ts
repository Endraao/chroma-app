import type { Address } from "viem";

/**
 * A ponte entre o site e os contratos da Chroma na Robinhood Chain.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTE ARQUIVO É, E O QUE NÃO É
 * ---------------------------------------------------------------------------
 * É o equivalente EVM de `chroma-program.ts`: endereços, ABI e os tipos do que
 * a rede devolve. Nada mais — quem monta transação são os hooks.
 *
 * Os contratos existiam há tempos, com 55 testes passando, e o site não tinha
 * UMA linha que falasse com eles: nenhum endereço, nenhum ABI. Lançar moeda em
 * `/create` ficava travado em `chain !== "solana"` e o swap mostrava "em
 * breve". Os dois lados estavam prontos e não se conheciam.
 *
 * ---------------------------------------------------------------------------
 * POR QUE O ABI É ESCRITO À MÃO E NÃO IMPORTADO DO BUILD
 * ---------------------------------------------------------------------------
 * `contracts/out/ChromaCurve.sol/ChromaCurve.json` tem o ABI inteiro mais
 * bytecode e metadados — centenas de kilobytes que iriam parar no pacote do
 * navegador para usar oito funções.
 *
 * Escrito aqui, entra no bundle só o que é usado, e o `as const` deixa o viem
 * inferir os tipos de argumento e de retorno. O preço é o mesmo de
 * `chroma-program.ts`: mudou a assinatura no contrato, muda aqui. Por isso as
 * assinaturas abaixo são cópia literal do que `forge build` gerou.
 */

/* ------------------------------------------------------------------ */
/* Endereços                                                           */
/* ------------------------------------------------------------------ */

/**
 * Vazio significa NÃO PUBLICADO, e é o estado de hoje.
 *
 * Quem consome checa `curvaEvmDisponivel()` antes de oferecer qualquer ação.
 * Sem isso, a tela ofereceria um botão que monta uma transação para o endereço
 * zero — que a carteira aceita assinar e a rede recusa, com um erro que não
 * diz nada a quem clicou.
 */
export const CHROMA_CURVE_EVM = (process.env.NEXT_PUBLIC_CHROMA_CURVE_EVM ?? "") as Address | "";
export const CHROMA_ROUTER_EVM = (process.env.NEXT_PUBLIC_CHROMA_ROUTER_EVM ?? "") as Address | "";

const ENDERECO_VALIDO = /^0x[0-9a-fA-F]{40}$/;

/** Há curva publicada nesta rede? */
export function curvaEvmDisponivel(): boolean {
  return ENDERECO_VALIDO.test(CHROMA_CURVE_EVM);
}

/** Há roteador de swap publicado nesta rede? */
export function roteadorEvmDisponivel(): boolean {
  return ENDERECO_VALIDO.test(CHROMA_ROUTER_EVM);
}

/* ------------------------------------------------------------------ */
/* ABI da curva                                                        */
/* ------------------------------------------------------------------ */

export const ABI_DA_CURVA = [
  {
    type: "function",
    name: "lancar",
    stateMutability: "payable",
    inputs: [
      { name: "nome", type: "string" },
      { name: "simbolo", type: "string" },
      { name: "uri", type: "string" },
    ],
    outputs: [{ name: "moeda", type: "address" }],
  },
  {
    type: "function",
    name: "comprar",
    stateMutability: "payable",
    inputs: [
      { name: "moeda", type: "address" },
      { name: "minTokens", type: "uint256" },
      { name: "afiliado", type: "address" },
    ],
    outputs: [{ name: "tokens", type: "uint256" }],
  },
  {
    type: "function",
    name: "vender",
    stateMutability: "nonpayable",
    inputs: [
      { name: "moeda", type: "address" },
      { name: "tokens", type: "uint256" },
      { name: "minEth", type: "uint256" },
      { name: "afiliado", type: "address" },
    ],
    outputs: [{ name: "liquido", type: "uint256" }],
  },
  {
    type: "function",
    name: "migrar",
    stateMutability: "nonpayable",
    inputs: [{ name: "moeda", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "cotarCompra",
    stateMutability: "view",
    inputs: [
      { name: "moeda", type: "address" },
      { name: "ethBruto", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "cotarVenda",
    stateMutability: "view",
    inputs: [
      { name: "moeda", type: "address" },
      { name: "tokens", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    /*
     * O estado da curva de uma moeda.
     *
     * A ordem dos campos é a do struct em `ChromaCurve.sol` e NÃO pode ser
     * reordenada aqui: o viem devolve a tupla por posição, não por nome.
     * Trocar dois campos de lugar não dá erro de compilação — dá número certo
     * no lugar errado, que é o pior tipo de defeito numa tela de preço.
     */
    type: "function",
    name: "curvas",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "criador", type: "address" },
      { name: "ethVirtual", type: "uint256" },
      { name: "tokenVirtual", type: "uint256" },
      { name: "ethReal", type: "uint256" },
      { name: "tokenReal", type: "uint256" },
      { name: "volumeAcumulado", type: "uint256" },
      { name: "concluida", type: "bool" },
      { name: "migrada", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "tokenAVenda",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "pausado",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "taxaDeLancamento",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },

  /*
   * Os erros do contrato. Sem eles, uma recusa chega como "execution reverted"
   * sem nome, e a tela não tem como dizer À PESSOA o que ela precisa mudar.
   * Conferidos contra o build por `npm run test:abi`.
   */
  { type: "error", name: "ValorZero", inputs: [] },
  { type: "error", name: "Pausado", inputs: [] },
  { type: "error", name: "TextoLongoDemais", inputs: [] },
  { type: "error", name: "MoedaDesconhecida", inputs: [] },
  { type: "error", name: "CurvaConcluida", inputs: [] },
  { type: "error", name: "AfiliadoEhOProprioTrader", inputs: [] },
  { type: "error", name: "FalhaNoRepasse", inputs: [] },
  { type: "error", name: "SaldoInsuficiente", inputs: [] },
  {
    type: "error",
    name: "AbaixoDoMinimo",
    inputs: [
      { name: "recebido", type: "uint256" },
      { name: "minimo", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "AcimaDoMaximo",
    inputs: [
      { name: "gasto", type: "uint256" },
      { name: "maximo", type: "uint256" },
    ],
  },
] as const;

/**
 * O que dizer à pessoa quando o contrato recusa, pelo nome do erro.
 *
 * `AcimaDoMaximo` no lançamento é a taxa enviada MENOR que a exigida — o
 * contrato reaproveita o erro com os argumentos (enviado, exigido).
 */
export const MOTIVO_DO_ERRO: Record<"en" | "pt" | "zh", Record<string, string>> = {
  en: {
    ValorZero: "The amount must be greater than zero.",
    Pausado: "Buying and launching are paused right now. Selling is still open.",
    TextoLongoDemais: "Name up to 32 characters and symbol up to 10 (accented letters count as 2).",
    MoedaDesconhecida: "This coin was not launched by Chroma.",
    CurvaConcluida: "This coin's curve is already full; it trades on Uniswap now.",
    AfiliadoEhOProprioTrader: "You cannot use your own referral link.",
    SaldoInsuficiente: "Not enough balance in the curve for this trade.",
    AbaixoDoMinimo: "The price moved more than the allowed slippage. Try again.",
    AcimaDoMaximo: "The amount sent does not cover the launch fee.",
  },
  zh: {
    ValorZero: "金额必须大于零。",
    Pausado: "买入和发行暂时暂停，卖出不受影响。",
    TextoLongoDemais: "名称最多 32 个字符，代号最多 10 个（带重音的字母算 2 个）。",
    MoedaDesconhecida: "该代币不是由 Chroma 发行的。",
    CurvaConcluida: "该代币的曲线已满，现在在 Uniswap 上交易。",
    AfiliadoEhOProprioTrader: "不能使用你自己的推荐链接。",
    SaldoInsuficiente: "曲线余额不足以完成此交易。",
    AbaixoDoMinimo: "价格变动超过允许的滑点，请重试。",
    AcimaDoMaximo: "发送的金额不足以支付发行费。",
  },
  pt: {
  ValorZero: "O valor precisa ser maior que zero.",
  Pausado: "As compras e os lançamentos estão pausados no momento. Vender continua liberado.",
  TextoLongoDemais: "Nome até 32 caracteres e símbolo até 10 (letra com acento conta como 2).",
  MoedaDesconhecida: "Esta moeda não foi lançada pela Chroma.",
  CurvaConcluida: "A curva desta moeda já encheu; ela negocia na Uniswap agora.",
  AfiliadoEhOProprioTrader: "Você não pode usar o seu próprio link de indicação.",
  SaldoInsuficiente: "Saldo insuficiente na curva para esta operação.",
  AbaixoDoMinimo: "O preço andou mais que a folga permitida. Tente de novo.",
  AcimaDoMaximo: "O valor enviado não cobre a taxa de lançamento.",
  },
};

/* ------------------------------------------------------------------ */
/* Estado da curva                                                     */
/* ------------------------------------------------------------------ */

export interface EstadoDaCurvaEvm {
  criador: Address;
  ethVirtual: bigint;
  tokenVirtual: bigint;
  ethReal: bigint;
  tokenReal: bigint;
  volumeAcumulado: bigint;
  concluida: boolean;
  migrada: boolean;
}

/** Curva que nunca existiu devolve criador zerado — não é curva da Chroma. */
export const ENDERECO_ZERO = "0x0000000000000000000000000000000000000000" as const;

export function ehCurvaDaChroma(estado: EstadoDaCurvaEvm | null): boolean {
  return Boolean(estado) && estado!.criador !== ENDERECO_ZERO;
}

/**
 * Converte a tupla que o viem devolve no objeto nomeado.
 *
 * Existe para que a ordem do struct seja lida em UM lugar só. Espalhar
 * `resultado[3]` pelos componentes faria cada um deles depender da ordem, e
 * uma mudança no contrato quebraria todos em silêncio.
 */
export function lerCurvaEvm(
  bruto: readonly [Address, bigint, bigint, bigint, bigint, bigint, boolean, boolean],
): EstadoDaCurvaEvm {
  const [
    criador,
    ethVirtual,
    tokenVirtual,
    ethReal,
    tokenReal,
    volumeAcumulado,
    concluida,
    migrada,
  ] = bruto;

  return {
    criador,
    ethVirtual,
    tokenVirtual,
    ethReal,
    tokenReal,
    volumeAcumulado,
    concluida,
    migrada,
  };
}

/**
 * Quanto da emissão à venda já saiu, de 0 a 100.
 *
 * Mesma conta da Solana, e pelo mesmo motivo: a curva fecha quando o último
 * token à venda sai, não quando junta um valor redondo de ETH. Medir em ETH
 * daria um número que muda de sentido conforme o preço anda.
 */
export function progressoDaCurvaEvm(estado: EstadoDaCurvaEvm, tokenAVenda: bigint): number {
  if (tokenAVenda <= 0n) return 0;
  const vendidos = tokenAVenda > estado.tokenReal ? tokenAVenda - estado.tokenReal : 0n;
  return Number((vendidos * 10_000n) / tokenAVenda) / 100;
}
