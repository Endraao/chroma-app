import "server-only";

import { Connection, PublicKey } from "@solana/web3.js";

import { banco, sql } from "@/lib/db";
import {
  MOEDAS_QUE_PONTUAM,
  PONTOS_POR_INDICACAO,
  PONTOS_POR_MOEDA,
  TEMPORADA_ATUAL,
  pontosDeVolume,
  type TipoDePonto,
} from "@/lib/airdrop-regras";
import { SOL_MINT } from "@/lib/jupiter";
import { assinaturaPlausivel } from "@/lib/validacao";
import { PLATFORM_FEE_WALLET_SOL } from "@/lib/web3";
import { negocioNaTransacaoEvm } from "@/lib/curva-evm";
import { precosNativos } from "@/lib/precos-nativos";

/**
 * O livro-razão do airdrop.
 *
 * ---------------------------------------------------------------------------
 * A REGRA QUE GOVERNA TUDO AQUI
 * ---------------------------------------------------------------------------
 * **O navegador nunca diz quantos pontos alguém merece.** Ele diz, no máximo,
 * "olha esta transação" — e o servidor vai à blockchain conferir se ela
 * existe, se deu certo, se foi assinada por quem diz ter assinado e se passou
 * pela Chroma.
 *
 * Isso não é zelo excessivo, é a diferença entre o sistema funcionar e não
 * existir. O `/api/affiliate` aceita `volumeUsd` vindo do navegador porque lá
 * o número só pinta um painel: mentir ali é enganar a si mesmo. Aqui o número
 * vira fatia de um token com valor de mercado — e o primeiro sujeito que
 * descobrir que dá pra mandar `{ volumeUsd: 99999999 }` leva o airdrop
 * inteiro antes do café.
 *
 * Página de airdrop é ímã de gente tentando exatamente isso. Foi assim em
 * todas que já existiram.
 *
 * ---------------------------------------------------------------------------
 * O QUE AINDA NÃO ESTÁ COBERTO, DITO EM VOZ ALTA
 * ---------------------------------------------------------------------------
 * A verificação abaixo prova que a transação é real, é da pessoa e passou pela
 * Chroma. Ela NÃO impede lavagem de volume: alguém com duas carteiras
 * negociando entre si gera volume verdadeiro e ganha pontos verdadeiros.
 *
 * Isso é caro de fazer — cada ida e volta paga taxa de rede, de pool e nossa —
 * mas não é impossível, e quem for distribuir o token precisa olhar o padrão
 * dos lançamentos antes, não só o total. O livro-razão guarda tudo justamente
 * pra essa leitura ser possível depois.
 */

/* ------------------------------------------------------------------ */
/* Escrita                                                             */
/* ------------------------------------------------------------------ */

interface Lancamento {
  carteira: string;
  rede: string;
  tipo: TipoDePonto;
  pontos: number;
  /** Chave única do FATO: assinatura, endereço da moeda, id da indicação. */
  referencia: string;
  detalhe?: string;
}

/**
 * Credita pontos, uma vez só.
 *
 * `ON CONFLICT DO NOTHING` sobre o índice único (tipo, referencia): reenviar o
 * mesmo fato não soma de novo. Devolve se creditou agora, pra quem chama saber
 * diferenciar "deu certo" de "já estava lá" sem consultar o banco de novo.
 */
export async function creditar(l: Lancamento): Promise<boolean> {
  if (l.pontos <= 0) return false;
  await banco();

  const linhas = (await sql.query(
    `INSERT INTO pontos (carteira, rede, tipo, pontos, referencia, detalhe, temporada, criado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (tipo, referencia) DO NOTHING
     RETURNING id`,
    [
      /* EVM sempre em minúsculas: o mesmo endereço chega em checksum e não. */
      /^0x/i.test(l.carteira) ? l.carteira.toLowerCase() : l.carteira,
      l.rede,
      l.tipo,
      Math.floor(l.pontos),
      l.referencia,
      l.detalhe ?? null,
      TEMPORADA_ATUAL,
      Date.now(),
    ],
  )) as { id: string }[];

  return linhas.length > 0;
}

/* ------------------------------------------------------------------ */
/* Leitura                                                             */
/* ------------------------------------------------------------------ */

export interface SaldoDePontos {
  total: number;
  porTipo: Record<TipoDePonto, number>;
  /** Quantos lançamentos existem, por tipo — "3 moedas", "12 swaps". */
  contagem: Record<TipoDePonto, number>;
  volumeUsd: number;
}

const ZERADO = (): Record<TipoDePonto, number> => ({
  volume: 0,
  moeda: 0,
  indicacao: 0,
  bug: 0,
});

/** O extrato de uma carteira na temporada corrente. */
export async function saldoDe(carteira: string): Promise<SaldoDePontos> {
  await banco();

  const linhas = (await sql.query(
    `SELECT tipo, SUM(pontos)::int AS pontos, COUNT(*)::int AS quantos
       FROM pontos WHERE CASE WHEN carteira LIKE '0x%' THEN LOWER(carteira) ELSE carteira END = $1 AND temporada = $2
      GROUP BY tipo`,
    [carteira, TEMPORADA_ATUAL],
  )) as { tipo: string; pontos: number; quantos: number }[];

  const porTipo = ZERADO();
  const contagem = ZERADO();
  let total = 0;

  for (const l of linhas) {
    const tipo = l.tipo as TipoDePonto;
    if (!(tipo in porTipo)) continue;
    porTipo[tipo] = l.pontos;
    contagem[tipo] = l.quantos;
    total += l.pontos;
  }

  /* Volume é o inverso da regra de pontuação, que hoje é 1 pra 1. */
  return { total, porTipo, contagem, volumeUsd: porTipo.volume };
}

export interface LinhaDoPlacar {
  carteira: string;
  pontos: number;
}

/**
 * O placar.
 *
 * Endereço inteiro sai daqui; quem encurta pra exibir é a tela. Cortar no
 * servidor pareceria mais privado e não é: endereço de carteira já é público
 * na blockchain, e a tela precisa do valor cheio pra marcar "este é você".
 */
export async function placar(limite = 100): Promise<LinhaDoPlacar[]> {
  await banco();

  const linhas = (await sql.query(
    `SELECT CASE WHEN carteira LIKE '0x%' THEN LOWER(carteira) ELSE carteira END AS carteira, SUM(pontos)::int AS pontos
       FROM pontos WHERE temporada = $1
      GROUP BY 1 ORDER BY pontos DESC LIMIT $2`,
    [TEMPORADA_ATUAL, limite],
  )) as { carteira: string; pontos: number }[];

  return linhas;
}

/** Quanta gente está participando e quantos pontos já existem. */
export async function resumoDaTemporada() {
  await banco();

  const linhas = (await sql.query(
    `SELECT COUNT(DISTINCT CASE WHEN carteira LIKE '0x%' THEN LOWER(carteira) ELSE carteira END)::int AS carteiras,
            COALESCE(SUM(pontos), 0)::int AS pontos
       FROM pontos WHERE temporada = $1`,
    [TEMPORADA_ATUAL],
  )) as { carteiras: number; pontos: number }[];

  return {
    carteiras: linhas[0]?.carteiras ?? 0,
    pontos: linhas[0]?.pontos ?? 0,
    temporada: TEMPORADA_ATUAL,
  };
}

/* ------------------------------------------------------------------ */
/* Verificação on-chain de um swap                                     */
/* ------------------------------------------------------------------ */

const LAMPORTS = 1_000_000_000;

/** Teto por operação, pra um erro de preço não virar milhão de pontos. */
const TETO_POR_SWAP_USD = 250_000;

export type ResultadoDaVerificacao =
  | { ok: true; pontos: number; volumeUsd: number; jaCreditado: boolean }
  | { ok: false; motivo: string };

function conexao(): Connection {
  const url = process.env.NEXT_PUBLIC_SOLANA_RPC;
  if (!url) throw new Error("NEXT_PUBLIC_SOLANA_RPC não configurado");
  return new Connection(url, "confirmed");
}

/** Preço do SOL, da mesma fonte que o resto do site usa. */
async function precoDoSol(): Promise<number> {
  const res = await fetch(`https://lite-api.jup.ag/price/v3?ids=${SOL_MINT}`, {
    next: { revalidate: 30 },
  });
  if (!res.ok) throw new Error("preço do SOL indisponível");

  const dados = (await res.json()) as Record<string, { usdPrice?: number }>;
  const preco = dados[SOL_MINT]?.usdPrice ?? 0;
  if (preco <= 0) throw new Error("preço do SOL inválido");
  return preco;
}

/**
 * Confere um swap na blockchain e credita os pontos de volume.
 *
 * O caminho inteiro, e o motivo de cada passo:
 *
 *  1. **A transação existe e deu certo.** Assinatura inventada ou transação
 *     que falhou não valem nada.
 *  2. **Quem assinou é quem está pedindo.** Sem isto, eu pegaria a assinatura
 *     de um swap grande de outra pessoa e reivindicaria os pontos dela. Como
 *     assinatura é pública, isso seria trivial.
 *  3. **A transação passou pela Chroma.** Provado pela nossa carteira de taxa
 *     ter recebido SOL nela. Sem isto, alguém negociaria a vida toda em outro
 *     terminal e viria buscar os pontos aqui.
 *  4. **O volume sai do movimento real de SOL**, não de número enviado pela
 *     tela.
 */
export async function verificarSwapECreditar(
  assinatura: string,
  carteiraDeclarada: string,
): Promise<ResultadoDaVerificacao> {
  if (!PLATFORM_FEE_WALLET_SOL) {
    return { ok: false, motivo: "carteira de taxa não configurada no servidor" };
  }

  /*
   * Confere que a assinatura decodifica para 64 bytes ANTES de ir à rede.
   *
   * Um teste só de formato deixava passar 88 letras "a", e o RPC respondia com
   * exceção — que virava 503 na nossa cara. Ver a nota em `validacao.ts`.
   */
  if (!assinaturaPlausivel(assinatura)) {
    return { ok: false, motivo: "assinatura inválida" };
  }

  let carteira: PublicKey;
  try {
    carteira = new PublicKey(carteiraDeclarada);
  } catch {
    return { ok: false, motivo: "carteira inválida" };
  }

  const tx = await conexao().getTransaction(assinatura, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });

  if (!tx || !tx.meta) return { ok: false, motivo: "transação não encontrada na rede" };
  if (tx.meta.err) return { ok: false, motivo: "a transação falhou na rede" };

  /*
   * As chaves de conta, incluindo as que vieram de tabela de endereços.
   * Transação versionada guarda parte das contas fora da mensagem, e ignorar
   * essa parte faria a busca pela carteira de taxa falhar justamente nos
   * swaps da Jupiter — que são todos versionados.
   */
  const contas = tx.transaction.message
    .getAccountKeys({ accountKeysFromLookups: tx.meta.loadedAddresses })
    .keySegments()
    .flat();

  /* Quem paga a taxa da rede assina, e é sempre a primeira conta. */
  const assinante = contas[0];
  if (!assinante || !assinante.equals(carteira)) {
    return { ok: false, motivo: "esta transação não foi assinada por esta carteira" };
  }

  const indiceDe = (chave: string) => contas.findIndex((c) => c.toBase58() === chave);

  const iTaxa = indiceDe(PLATFORM_FEE_WALLET_SOL);
  if (iTaxa < 0) {
    return { ok: false, motivo: "esta transação não passou pela Chroma" };
  }

  const recebidoPelaTaxa =
    (tx.meta.postBalances[iTaxa] ?? 0) - (tx.meta.preBalances[iTaxa] ?? 0);
  if (recebidoPelaTaxa <= 0) {
    return { ok: false, motivo: "esta transação não passou pela Chroma" };
  }

  /*
   * O volume é o quanto de SOL a carteira movimentou, dos dois lados:
   * na compra ela perde SOL, na venda ela recebe. O valor absoluto cobre os
   * dois casos sem precisar adivinhar a direção.
   *
   * Desconta a taxa de rede porque ela sai do mesmo saldo e não é volume.
   */
  const deltaLamports = Math.abs(
    (tx.meta.postBalances[0] ?? 0) - (tx.meta.preBalances[0] ?? 0) - (tx.meta.fee ?? 0),
  );
  const volumeUsd = Math.min((deltaLamports / LAMPORTS) * (await precoDoSol()), TETO_POR_SWAP_USD);

  const pontos = pontosDeVolume(volumeUsd);
  if (pontos <= 0) return { ok: false, motivo: "operação pequena demais para pontuar" };

  const creditou = await creditar({
    carteira: carteiraDeclarada,
    rede: "solana",
    tipo: "volume",
    pontos,
    /* A assinatura é única na rede: é a chave natural contra crédito duplo. */
    referencia: assinatura,
    detalhe: `US$ ${volumeUsd.toFixed(2)}`,
  });

  return { ok: true, pontos, volumeUsd, jaCreditado: !creditou };
}

/**
 * O mesmo, na Robinhood Chain.
 *
 * Até 27/09/2026 só a Solana pontuava — e a Robinhood é a rede principal.
 * A regra mãe é a mesma: o navegador manda só o hash; a rede diz se a
 * transação deu certo, se foi ESTA carteira que assinou e quanto ETH passou
 * pela curva da Chroma (eventos `Negocio` do nosso contrato no recibo).
 */
export async function verificarSwapEvmECreditar(
  hash: string,
  carteira: string,
): Promise<ResultadoDaVerificacao> {
  const negocio = await negocioNaTransacaoEvm(hash, carteira);
  if (!negocio) return { ok: false, motivo: "esta transação não negociou na Chroma" };

  const precoEth = (await precosNativos().catch(() => null))?.robinhood ?? 0;
  if (precoEth <= 0) return { ok: false, motivo: "sem cotação do ETH agora" };

  const volumeUsd = Math.min(negocio.ethLimpo * precoEth, TETO_POR_SWAP_USD);
  const pontos = pontosDeVolume(volumeUsd);
  if (pontos <= 0) return { ok: false, motivo: "operação pequena demais para pontuar" };

  const creditou = await creditar({
    carteira: carteira.toLowerCase(),
    rede: "robinhood",
    tipo: "volume",
    pontos,
    referencia: hash.toLowerCase(),
    detalhe: `US$ ${volumeUsd.toFixed(2)}`,
  });

  return { ok: true, pontos, volumeUsd, jaCreditado: !creditou };
}

/* ------------------------------------------------------------------ */
/* Moedas e indicações                                                 */
/* ------------------------------------------------------------------ */

/**
 * Pontos por lançar moeda, respeitando o teto da temporada.
 *
 * O teto é conferido AQUI, no servidor, contando o que já está no livro —
 * não num contador que a tela manda. Criar moeda custa pouco em Solana, e sem
 * o teto alguém lançaria trezentas numa tarde.
 *
 * Chamado por `POST /api/moedas`, que antes disso já provou na rede que a
 * moeda saiu da nossa curva e que o criador é quem a conta on-chain diz.
 */
export async function creditarMoeda(
  endereco: string,
  criador: string,
  rede: string,
): Promise<void> {
  await banco();

  const linhas = (await sql.query(
    `SELECT COUNT(*)::int AS quantas
       FROM pontos WHERE carteira = $1 AND tipo = 'moeda' AND temporada = $2`,
    [criador, TEMPORADA_ATUAL],
  )) as { quantas: number }[];

  if ((linhas[0]?.quantas ?? 0) >= MOEDAS_QUE_PONTUAM) return;

  await creditar({
    carteira: criador,
    rede,
    tipo: "moeda",
    pontos: PONTOS_POR_MOEDA,
    referencia: endereco,
  });
}

/**
 * Pontos por indicação, na PRIMEIRA operação de quem foi indicado.
 *
 * A referência é a carteira do indicado, não a do promotor: é o que garante
 * que a mesma pessoa indicada pontue uma vez só, por mais que negocie depois.
 */
export async function creditarIndicacao(
  promotor: string,
  indicado: string,
  rede: string,
): Promise<void> {
  if (!promotor || !indicado || promotor === indicado) return;

  await creditar({
    carteira: promotor,
    rede,
    tipo: "indicacao",
    pontos: PONTOS_POR_INDICACAO,
    referencia: indicado,
    detalhe: `indicou ${indicado.slice(0, 8)}…`,
  });
}
