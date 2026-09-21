import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";

/**
 * Como o site conversa com a curva on-chain.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ESCRITO À MÃO, SEM O CLIENTE DO ANCHOR
 * ---------------------------------------------------------------------------
 * O pacote oficial (`@coral-xyz/anchor`) resolveria isto sozinho, mas traz
 * junto uma árvore grande de dependências pro navegador — e este projeto já
 * teve dor de cabeça com dependência transitiva quebrando o empacotamento.
 *
 * O que ele faz de fato são duas coisas simples: calcular um identificador de
 * 8 bytes a partir do nome da instrução, e serializar os argumentos. As duas
 * estão aqui embaixo, explicadas. São ~40 linhas contra alguns megabytes.
 *
 * O preço é este arquivo precisar acompanhar o programa: mudou a assinatura de
 * uma instrução lá, muda aqui. O teste `test:programa` existe pra que essa
 * divergência apareça como falha, e não como transação recusada pelo usuário.
 */

/** Endereço do programa. Trocado por rede em `PROGRAMAS`, abaixo. */
export const CHROMA_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_CHROMA_PROGRAM_ID ||
    "2uAzEJEhVdEsk3DVMrkrcnHCmoFicmg8QPk7xKw8uqB4",
);

export const SEMENTE_CONFIG = Buffer.from("config");
export const SEMENTE_CURVA = Buffer.from("curve");

export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

/** Programa de metadados da Metaplex. O mesmo endereço em todas as redes. */
export const METAPLEX_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
);

/**
 * Limites do formato ON-CHAIN. Não são preferência nossa.
 *
 * Passar deles não fica feio: a rede recusa a transação e quem lançou paga a
 * taxa à toa. A tela precisa barrar antes.
 */
export const LIMITES_DO_TOKEN = { nome: 32, simbolo: 10, uri: 200 } as const;
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

/* ------------------------------------------------------------------ */
/* Endereços derivados                                                 */
/* ------------------------------------------------------------------ */

/** A conta de configuração global. Uma só, pra toda a plataforma. */
export function enderecoDaConfig(): PublicKey {
  return PublicKey.findProgramAddressSync([SEMENTE_CONFIG], CHROMA_PROGRAM_ID)[0];
}

/** A curva de uma moeda. Derivada do mint, então não precisa ser guardada. */
export function enderecoDaCurva(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEMENTE_CURVA, mint.toBuffer()],
    CHROMA_PROGRAM_ID,
  )[0];
}

/** Onde a Metaplex guarda nome, símbolo e imagem de um token. */
export function enderecoDosMetadados(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METAPLEX_PROGRAM_ID,
  )[0];
}

/**
 * Conta de token associada — o endereço padrão da carteira de alguém para uma
 * moeda. É derivado, não escolhido, e é isso que torna seguro criá-lo sob
 * demanda dentro da transação.
 */
export function contaDeToken(dono: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [dono.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

/* ------------------------------------------------------------------ */
/* Serialização                                                        */
/* ------------------------------------------------------------------ */

/**
 * O identificador de 8 bytes que abre os dados de cada instrução.
 *
 * É como o programa sabe qual função chamar: os 8 primeiros bytes do sha256 de
 * `global:<nome_da_função>`, com o nome do Rust em snake_case.
 *
 * Gravados como constante em vez de calculados: este arquivo roda no NAVEGADOR,
 * onde não existe `node:crypto`, e calcular por Web Crypto obrigaria a tornar
 * assíncrona toda a montagem de transação — por um valor que nunca muda.
 *
 * Para conferir ou regerar:
 *   node -e "console.log(require('node:crypto').createHash('sha256')
 *     .update('global:buy').digest().subarray(0,8))"
 *
 * O teste `test:programa` refaz essa conta e compara, pra que uma instrução
 * renomeada no Rust apareça como falha aqui e não como transação recusada na
 * cara do usuário.
 */
export const IDENTIFICADORES = {
  initialize_config: [208, 127, 21, 1, 194, 190, 196, 70],
  update_config: [29, 158, 252, 191, 10, 83, 219, 99],
  set_paused: [91, 60, 125, 192, 176, 225, 166, 218],
  create: [24, 30, 200, 40, 5, 28, 7, 119],
  buy: [102, 6, 61, 18, 1, 218, 235, 234],
  sell: [51, 230, 133, 164, 1, 127, 131, 173],
} as const;

export type NomeDaInstrucao = keyof typeof IDENTIFICADORES;

export function identificador(nome: NomeDaInstrucao): Buffer {
  return Buffer.from(IDENTIFICADORES[nome]);
}

/** Inteiro sem sinal, little-endian, no tamanho pedido. */
function inteiro(valor: bigint | number, bytes: number): Buffer {
  const b = Buffer.alloc(bytes);
  let v = BigInt(valor);
  for (let i = 0; i < bytes; i++) {
    b[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return b;
}

const u16 = (v: number) => inteiro(v, 2);
const u64 = (v: bigint | number) => inteiro(v, 8);

/**
 * Texto em Borsh: 4 bytes de tamanho, little-endian, e os bytes do texto.
 *
 * O tamanho é em BYTES, não em letras. "Gatão" tem 5 letras e 6 bytes — usar a
 * contagem de caracteres deixaria passar um nome que a rede recusa.
 */
function texto(valor: string): Buffer {
  const bytes = Buffer.from(valor, "utf8");
  return Buffer.concat([inteiro(bytes.length, 4), bytes]);
}

/* ------------------------------------------------------------------ */
/* Parâmetros da configuração                                          */
/* ------------------------------------------------------------------ */

export interface ParametrosDaConfig {
  carteiraDaPlataforma: PublicKey;
  taxaTotalBps: number;
  taxaAfiliadoBps: number;
  pisoPlataformaBps: number;
  /** volume acumulado em lamports a partir do qual cada faixa vale */
  limitesDasFaixas: [bigint, bigint, bigint, bigint];
  faixasDoCriadorBps: [number, number, number, number];
  solVirtualInicial: bigint;
  tokenVirtualInicial: bigint;
  tokenAVenda: bigint;
  emissaoTotal: bigint;
  taxaDeLancamento: bigint;
}

/**
 * Serializa os parâmetros no formato que o programa espera.
 *
 * Array de tamanho fixo em Borsh é só os elementos em sequência, SEM contagem
 * na frente — diferente de lista de tamanho variável. Pôr a contagem aqui
 * desalinharia tudo que vem depois, e o erro apareceria como número absurdo
 * numa faixa de comissão, não como falha de leitura.
 */
function serializarParametros(p: ParametrosDaConfig): Buffer {
  return Buffer.concat([
    p.carteiraDaPlataforma.toBuffer(),
    u16(p.taxaTotalBps),
    u16(p.taxaAfiliadoBps),
    u16(p.pisoPlataformaBps),
    ...p.limitesDasFaixas.map(u64),
    ...p.faixasDoCriadorBps.map(u16),
    u64(p.solVirtualInicial),
    u64(p.tokenVirtualInicial),
    u64(p.tokenAVenda),
    u64(p.emissaoTotal),
    u64(p.taxaDeLancamento),
  ]);
}

/* ------------------------------------------------------------------ */
/* Instruções                                                          */
/* ------------------------------------------------------------------ */

const escreve = (pubkey: PublicKey) => ({ pubkey, isSigner: false, isWritable: true });
const le = (pubkey: PublicKey) => ({ pubkey, isSigner: false, isWritable: false });
const assina = (pubkey: PublicKey, isWritable = true) => ({ pubkey, isSigner: true, isWritable });

/** Cria a configuração global. Roda uma vez por rede. */
export function ixCriarConfig(
  autoridade: PublicKey,
  params: ParametrosDaConfig,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: CHROMA_PROGRAM_ID,
    keys: [
      assina(autoridade),
      escreve(enderecoDaConfig()),
      le(SystemProgram.programId),
    ],
    data: Buffer.concat([identificador("initialize_config"), serializarParametros(params)]),
  });
}

/**
 * Lança uma moeda. O `mint` precisa assinar: a conta dele nasce aqui.
 *
 * @param uri endereço do JSON com nome, imagem e redes sociais. Vai gravado de
 * forma IMUTÁVEL — publique o arquivo antes de mandar isto, senão a moeda fica
 * sem imagem pra sempre.
 */
export function ixLancar(params: {
  criador: PublicKey;
  mint: PublicKey;
  carteiraDaPlataforma: PublicKey;
  nome: string;
  simbolo: string;
  uri: string;
}): TransactionInstruction {
  const curva = enderecoDaCurva(params.mint);

  return new TransactionInstruction({
    programId: CHROMA_PROGRAM_ID,
    keys: [
      assina(params.criador),
      le(enderecoDaConfig()),
      assina(params.mint),
      escreve(curva),
      escreve(contaDeToken(curva, params.mint)),
      escreve(params.carteiraDaPlataforma),
      escreve(enderecoDosMetadados(params.mint)),
      le(METAPLEX_PROGRAM_ID),
      le(SystemProgram.programId),
      le(TOKEN_PROGRAM_ID),
      le(ASSOCIATED_TOKEN_PROGRAM_ID),
    ],
    data: Buffer.concat([
      identificador("create"),
      texto(params.nome),
      texto(params.simbolo),
      texto(params.uri),
    ]),
  });
}

/** Recusa o que a rede recusaria, com o motivo em português. */
export function recusarDadosDoToken(p: {
  nome: string;
  simbolo: string;
  uri: string;
}): string | null {
  const bytes = (t: string) => Buffer.from(t, "utf8").length;

  if (bytes(p.nome) > LIMITES_DO_TOKEN.nome) {
    return `O nome passa de ${LIMITES_DO_TOKEN.nome} bytes (acentos contam por 2).`;
  }
  if (bytes(p.simbolo) > LIMITES_DO_TOKEN.simbolo) {
    return `O símbolo passa de ${LIMITES_DO_TOKEN.simbolo} bytes.`;
  }
  if (bytes(p.uri) > LIMITES_DO_TOKEN.uri) {
    return `O endereço dos metadados passa de ${LIMITES_DO_TOKEN.uri} bytes.`;
  }
  return null;
}

interface ContasDeNegocio {
  trader: PublicKey;
  mint: PublicKey;
  criador: PublicKey;
  carteiraDaPlataforma: PublicKey;
  /** endereço de quem indicou; ausente quando não houve indicação */
  afiliado?: PublicKey | null;
}

function chavesDeNegocio(c: ContasDeNegocio) {
  const curva = enderecoDaCurva(c.mint);

  const chaves = [
    assina(c.trader),
    le(enderecoDaConfig()),
    escreve(curva),
    le(c.mint),
    escreve(contaDeToken(curva, c.mint)),
    escreve(contaDeToken(c.trader, c.mint)),
    escreve(c.criador),
    escreve(c.carteiraDaPlataforma),
  ];

  /*
   * Conta opcional no Anchor é posicional: quando existe, entra aqui; quando
   * não, o lugar é ocupado pelo PRÓPRIO PROGRAMA. Omitir a posição faria o
   * programa ler o programa do sistema como se fosse o afiliado.
   */
  chaves.push(c.afiliado ? escreve(c.afiliado) : le(CHROMA_PROGRAM_ID));

  chaves.push(le(SystemProgram.programId), le(TOKEN_PROGRAM_ID), le(ASSOCIATED_TOKEN_PROGRAM_ID));
  return chaves;
}

/**
 * Compra tokens da curva.
 *
 * @param maxSol teto que a pessoa aceita gastar, em lamports
 * @param minTokens mínimo que aceita receber — é a proteção contra o preço
 * mudar entre montar e processar a transação. Zero aqui significaria aceitar
 * qualquer resultado, que é como se perde dinheiro pra sanduíche.
 */
export function ixComprar(
  contas: ContasDeNegocio,
  maxSol: bigint,
  minTokens: bigint,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: CHROMA_PROGRAM_ID,
    keys: chavesDeNegocio(contas),
    data: Buffer.concat([identificador("buy"), u64(maxSol), u64(minTokens)]),
  });
}

/** Vende tokens de volta pra curva. `minSol` protege do mesmo jeito. */
export function ixVender(
  contas: ContasDeNegocio,
  tokens: bigint,
  minSol: bigint,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: CHROMA_PROGRAM_ID,
    keys: chavesDeNegocio(contas),
    data: Buffer.concat([identificador("sell"), u64(tokens), u64(minSol)]),
  });
}

/* ------------------------------------------------------------------ */
/* Leitura das contas                                                  */
/* ------------------------------------------------------------------ */

export interface EstadoDaCurva {
  mint: PublicKey;
  criador: PublicKey;
  solVirtual: bigint;
  tokenVirtual: bigint;
  solReal: bigint;
  tokenReal: bigint;
  volumeAcumulado: bigint;
  concluida: boolean;
}

/** Lê um u64 little-endian. */
function lerU64(dados: Buffer, em: number): bigint {
  return dados.readBigUInt64LE(em);
}

/**
 * Decodifica a conta da curva.
 *
 * Os 8 primeiros bytes são o identificador do tipo da conta, posto pelo
 * Anchor; o conteúdo começa depois deles.
 */
export function lerCurva(dados: Buffer): EstadoDaCurva {
  let em = 8;
  const pubkey = () => {
    const p = new PublicKey(dados.subarray(em, em + 32));
    em += 32;
    return p;
  };
  const numero = () => {
    const v = lerU64(dados, em);
    em += 8;
    return v;
  };

  const mint = pubkey();
  const criador = pubkey();
  const solVirtual = numero();
  const tokenVirtual = numero();
  const solReal = numero();
  const tokenReal = numero();
  const volumeAcumulado = numero();
  const concluida = dados[em] === 1;

  return {
    mint,
    criador,
    solVirtual,
    tokenVirtual,
    solReal,
    tokenReal,
    volumeAcumulado,
    concluida,
  };
}

export interface EstadoDaConfig {
  autoridade: PublicKey;
  carteiraDaPlataforma: PublicKey;
  taxaTotalBps: number;
  taxaAfiliadoBps: number;
  pisoPlataformaBps: number;
  limitesDasFaixas: bigint[];
  faixasDoCriadorBps: number[];
  solVirtualInicial: bigint;
  tokenVirtualInicial: bigint;
  tokenAVendaInicial: bigint;
  emissaoTotal: bigint;
  taxaDeLancamento: bigint;
  pausado: boolean;
}

/**
 * Decodifica a configuração global.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO PRECISA SER LIDO, E NÃO CHUTADO
 * ---------------------------------------------------------------------------
 * A taxa que a tela mostra tem que ser a MESMA que o programa cobra. Se o site
 * assumisse 1,25% fixo e a configuração na rede fosse outra, a cotação sairia
 * errada — e a proteção de preço que a própria tela calcula recusaria compras
 * legítimas, ou pior, deixaria passar o que não deveria.
 *
 * Vale o mesmo pra `pausado`: a trava é decidida na rede, não aqui.
 */
export function lerConfig(dados: Buffer): EstadoDaConfig {
  let em = 8;
  const pubkey = () => {
    const p = new PublicKey(dados.subarray(em, em + 32));
    em += 32;
    return p;
  };
  const u16Em = () => {
    const v = dados.readUInt16LE(em);
    em += 2;
    return v;
  };
  const u64Em = () => {
    const v = lerU64(dados, em);
    em += 8;
    return v;
  };

  const autoridade = pubkey();
  const carteiraDaPlataforma = pubkey();
  const taxaTotalBps = u16Em();
  const taxaAfiliadoBps = u16Em();
  const pisoPlataformaBps = u16Em();
  const limitesDasFaixas = [u64Em(), u64Em(), u64Em(), u64Em()];
  const faixasDoCriadorBps = [u16Em(), u16Em(), u16Em(), u16Em()];
  const solVirtualInicial = u64Em();
  const tokenVirtualInicial = u64Em();
  const tokenAVendaInicial = u64Em();
  const emissaoTotal = u64Em();
  const taxaDeLancamento = u64Em();
  const pausado = dados[em] === 1;

  return {
    autoridade,
    carteiraDaPlataforma,
    taxaTotalBps,
    taxaAfiliadoBps,
    pisoPlataformaBps,
    limitesDasFaixas,
    faixasDoCriadorBps,
    solVirtualInicial,
    tokenVirtualInicial,
    tokenAVendaInicial,
    emissaoTotal,
    taxaDeLancamento,
    pausado,
  };
}

/* ------------------------------------------------------------------ */
/* Divisão da taxa                                                     */
/* ------------------------------------------------------------------ */

/**
 * Qual fatia o criador leva no volume acumulado atual.
 *
 * A faixa é escolhida de trás pra frente: vale a mais alta que o volume já
 * alcançou. Percorrer de frente pararia na primeira e ignoraria o resto.
 */
export function faixaDoCriadorBps(
  config: Pick<EstadoDaConfig, "limitesDasFaixas" | "faixasDoCriadorBps">,
  volumeAcumulado: bigint,
): number {
  for (let i = config.limitesDasFaixas.length - 1; i >= 0; i--) {
    if (volumeAcumulado >= config.limitesDasFaixas[i]) {
      return config.faixasDoCriadorBps[i];
    }
  }
  return config.faixasDoCriadorBps[0];
}

export interface DivisaoDaTaxa {
  total: bigint;
  criador: bigint;
  afiliado: bigint;
  plataforma: bigint;
}

/**
 * Como a taxa se reparte — o mesmo cálculo de `dividir_taxa` no programa.
 *
 * A fatia da plataforma é o RESTO, nunca uma conta à parte. É assim no Rust
 * pelo mesmo motivo: somar as três pontas separadamente deixaria sobrar ou
 * faltar um lamport por arredondamento, e um lamport por operação, repetido,
 * é dinheiro que some sem dono.
 *
 * Existe aqui pra tela poder mostrar quanto vai pra cada ponta ANTES de a
 * pessoa assinar, com os mesmos números que a rede vai gravar.
 */
export function dividirTaxa(
  config: Pick<
    EstadoDaConfig,
    "taxaTotalBps" | "taxaAfiliadoBps" | "limitesDasFaixas" | "faixasDoCriadorBps"
  >,
  base: bigint,
  volumeAcumulado: bigint,
  temAfiliado: boolean,
): DivisaoDaTaxa {
  const porBps = (bps: number) => (base * BigInt(bps)) / 10_000n;

  const total = porBps(config.taxaTotalBps);
  const criador = porBps(faixaDoCriadorBps(config, volumeAcumulado));
  const afiliado = temAfiliado ? porBps(config.taxaAfiliadoBps) : 0n;

  return { total, criador, afiliado, plataforma: total - criador - afiliado };
}

/* ------------------------------------------------------------------ */
/* Cotação                                                             */
/* ------------------------------------------------------------------ */

/**
 * Quantos tokens saem por `solBruto` lamports — o mesmo cálculo do programa.
 *
 * Existe aqui pra cotar ANTES de mandar a transação: é com este número que a
 * tela mostra o que a pessoa vai receber e calcula o mínimo aceitável. Tem que
 * arredondar igual ao programa, senão a cotação da tela e o resultado real
 * divergiriam e a proteção de preço rejeitaria compras legítimas.
 */
export function cotarCompra(
  curva: Pick<EstadoDaCurva, "solVirtual" | "tokenVirtual" | "tokenReal">,
  solBruto: bigint,
  taxaTotalBps: number,
): bigint {
  const taxa = (solBruto * BigInt(taxaTotalBps)) / 10_000n;
  const liquido = solBruto - taxa;
  if (liquido <= 0n) return 0n;

  const k = curva.solVirtual * curva.tokenVirtual;
  const novoSol = curva.solVirtual + liquido;
  // Reserva pra cima, saída pra baixo — igual ao programa.
  const novoToken = (k + novoSol - 1n) / novoSol;
  const saida = curva.tokenVirtual - novoToken;

  // A última compra leva só o que resta.
  return saida < curva.tokenReal ? saida : curva.tokenReal;
}

/** Quanto SOL sai ao devolver `tokens`, já descontada a taxa. */
export function cotarVenda(
  curva: Pick<EstadoDaCurva, "solVirtual" | "tokenVirtual">,
  tokens: bigint,
  taxaTotalBps: number,
): bigint {
  if (tokens <= 0n) return 0n;

  const k = curva.solVirtual * curva.tokenVirtual;
  const novoToken = curva.tokenVirtual + tokens;
  const novoSol = (k + novoToken - 1n) / novoToken;
  const bruto = curva.solVirtual > novoSol ? curva.solVirtual - novoSol : 0n;

  return bruto - (bruto * BigInt(taxaTotalBps)) / 10_000n;
}
