import "server-only";

import { cached } from "./cache";

/**
 * O fornecimento de um token, lido DA REDE.
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO DÁ PRA CONFIAR NO NÚMERO DA FONTE DE MERCADO
 * ---------------------------------------------------------------------------
 * A Dexscreener devolve dois números de tamanho, e nenhum dos dois é o de
 * hoje. Medido na STONK, com o preço a $0,3264:
 *
 *     fdv        $326,4M   -> supõe 1.000,1M tokens (o que foi cunhado no início)
 *     marketCap  $286,2M   -> supõe   876,8M tokens (estimativa velha)
 *     a rede diz              827,0M tokens
 *
 * Usávamos o `marketCap` e mostrávamos 50 milhões de tokens que não existem
 * mais — uns 6% a mais de capitalização. O terminal de referência mostrava
 * $270,7M e nós $286,16M pro MESMO preço, e a diferença inteira era essa.
 *
 * Queima reduz o fornecimento na Solana, e moeda de comunidade queima o tempo
 * todo. Uma estimativa de terceiro envelhece; a conta do mint, não.
 *
 * ---------------------------------------------------------------------------
 * LIDO DIRETO DA CONTA DO MINT, EM LOTE
 * ---------------------------------------------------------------------------
 * `getTokenSupply` gastaria uma chamada por moeda — 75 chamadas pra montar a
 * home. A conta do mint já carrega o número, e `getMultipleAccounts` traz até
 * 100 contas de uma vez: a vitrine inteira sai em uma chamada só.
 *
 * O formato dos primeiros 82 bytes é o mesmo no programa de token antigo e no
 * Token-2022, então não é preciso saber qual é qual.
 */

/** Onde o número mora dentro da conta do mint. */
const OFFSET_FORNECIMENTO = 36; // u64 little-endian
const OFFSET_CASAS = 44; // u8

/** Teto da chamada em lote no RPC. */
const POR_LOTE = 100;

/**
 * Cinco minutos.
 *
 * Fornecimento só muda quando alguém cunha ou queima — evento raro e que não
 * precisa aparecer no segundo em que acontece. Cache curto aqui seria gastar
 * o RPC, que é o recurso mais escasso que temos.
 */
const TTL = 300_000;

/**
 * Fornecimento em circulação de cada mint, já com as casas decimais aplicadas.
 *
 * Endereço que não responder simplesmente não entra no resultado — quem chama
 * continua com o número da fonte de mercado, que é impreciso mas existe. Um
 * nó fora do ar não pode zerar a capitalização da tela inteira.
 */
export async function fornecimentoDaRede(mints: string[]): Promise<Map<string, number>> {
  const saida = new Map<string, number>();

  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC;
  if (!rpc || mints.length === 0) return saida;

  /* Só endereços de Solana: em EVM o fornecimento não mora numa conta dessas. */
  const alvos = [...new Set(mints.filter((m) => m && !m.startsWith("0x")))];

  for (let i = 0; i < alvos.length; i += POR_LOTE) {
    const lote = alvos.slice(i, i + POR_LOTE);
    const chave = `fornecimento:${lote.join(",")}`;

    try {
      const doLote = await cached(chave, TTL, () => lerLote(rpc, lote));
      for (const [mint, valor] of doLote) saida.set(mint, valor);
    } catch (erro) {
      console.warn("[fornecimento] lote falhou:", erro);
    }
  }

  return saida;
}

async function lerLote(rpc: string, mints: string[]): Promise<Map<string, number>> {
  const resposta = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getMultipleAccounts",
      params: [mints, { encoding: "base64", commitment: "confirmed" }],
    }),
  });

  if (!resposta.ok) throw new Error(`RPC respondeu ${resposta.status}`);

  const json = (await resposta.json()) as {
    result?: { value: ({ data: [string, string] } | null)[] };
    error?: { message: string };
  };
  if (json.error) throw new Error(json.error.message);

  const valores = json.result?.value ?? [];
  const saida = new Map<string, number>();

  mints.forEach((mint, i) => {
    const conta = valores[i];
    if (!conta) return;

    const bytes = Buffer.from(conta.data[0], "base64");
    /* Conta menor que o layout do mint não é um mint: ignora em vez de ler lixo. */
    if (bytes.length < OFFSET_CASAS + 1) return;

    const bruto = bytes.readBigUInt64LE(OFFSET_FORNECIMENTO);
    const casas = bytes.readUInt8(OFFSET_CASAS);

    /*
     * A divisão vira ponto flutuante aqui de propósito: este número é pra
     * MOSTRAR capitalização na tela, não pra mover dinheiro. Conta que move
     * token continua em inteiro, dentro do programa.
     */
    const valor = Number(bruto) / 10 ** casas;
    if (Number.isFinite(valor) && valor > 0) saida.set(mint, valor);
  });

  return saida;
}
