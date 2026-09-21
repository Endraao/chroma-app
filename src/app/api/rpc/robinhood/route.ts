import { NextResponse } from "next/server";

import { robinhoodChain } from "@/lib/web3";

/**
 * POST /api/rpc/robinhood — ponte pro nó da Robinhood Chain.
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO FALAR DIRETO COM O NÓ
 * ---------------------------------------------------------------------------
 * Falava. Três problemas apareceram:
 *
 *  1. Dependia do CORS deles. Já vi a resposta voltar com o cabeçalho
 *     duplicado (`*,*`), que o navegador recusa — e quando isso acontece o
 *     preço ao vivo morre pra todo mundo ao mesmo tempo, sem nada de errado
 *     do nosso lado e sem nada que a gente possa fazer.
 *
 *  2. Trocar de provedor exigia publicar o site de novo, porque o endereço
 *     estava dentro do código que roda no navegador.
 *
 *  3. Sem passar por aqui, não há como limitar uso: qualquer um apontava a
 *     nossa página pro nó e o que acontecesse era problema do nó.
 *
 * ---------------------------------------------------------------------------
 * O QUE ISTO NÃO É
 * ---------------------------------------------------------------------------
 * Não é um RPC aberto. Só passa a lista de métodos abaixo, e todos são de
 * LEITURA. Sem isso, a Chroma viraria um proxy anônimo de graça pra quem
 * quisesse enviar transação ou varrer a rede por trás do nosso endereço — e o
 * abuso apareceria com a nossa cara.
 *
 * Método de escrita não entra nem por descuido: assinar e enviar transação
 * continua sendo coisa da carteira, direto com a rede, sem passar por nós. É o
 * que mantém a plataforma não-custodial de verdade.
 */

/**
 * Só leitura, e só o que a interface realmente usa.
 *
 * A lista cresceu porque o wagmi também passa por aqui: além do preço ao vivo,
 * ele consulta saldo, taxa de gás e recibo de transação. Todos continuam sendo
 * de leitura — nenhum escreve nada na rede.
 */
const METODOS_PERMITIDOS = new Set([
  // Preço ao vivo e auditoria de contrato
  "eth_blockNumber",
  "eth_call",
  "eth_getLogs",
  "eth_getStorageAt",
  "eth_getCode",
  "eth_chainId",
  "net_version",

  // O que o wagmi precisa pra mostrar saldo e acompanhar transação
  "eth_getBalance",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_getTransactionByHash",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
]);

/** Teto de blocos por consulta de eventos, pra ninguém pedir a cadeia inteira. */
const MAX_BLOCOS_POR_CONSULTA = 5_000n;

/*
 * Medido: uma aba de moeda aberta faz ~14 pedidos por 10s (o ticker a cada
 * 700ms). Com 60 o teto batia já na quarta aba — e atrás de um provedor de
 * internet ou de uma CDN várias pessoas dividem o mesmo IP, então o teto
 * punia quem estava usando normalmente.
 *
 * 150 dá folga pra umas dez abas e continua longe de qualquer varredura, que
 * faria ordens de grandeza mais.
 */
const LIMITE = { janelaMs: 10_000, max: 150 };
const acessos = new Map<string, { contagem: number; expiraEm: number }>();

function excedeuLimite(request: Request): boolean {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "local";

  const agora = Date.now();
  const atual = acessos.get(ip);

  if (!atual || atual.expiraEm <= agora) {
    acessos.set(ip, { contagem: 1, expiraEm: agora + LIMITE.janelaMs });
    return false;
  }
  atual.contagem++;
  return atual.contagem > LIMITE.max;
}

interface Chamada {
  jsonrpc?: string;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

/**
 * Recusa o que não deve passar.
 *
 * Devolve o motivo, ou `null` quando a chamada é aceitável.
 */
function recusar(chamada: Chamada): string | null {
  const metodo = typeof chamada.method === "string" ? chamada.method : "";
  if (!METODOS_PERMITIDOS.has(metodo)) {
    return `método não permitido: ${metodo || "(vazio)"}`;
  }

  if (!Array.isArray(chamada.params)) {
    return "params precisa ser uma lista";
  }
  if (chamada.params.length > 4) {
    return "params longo demais";
  }

  /*
   * Consulta de eventos com intervalo aberto derruba qualquer nó. Como a
   * interface sempre pede a partir do último bloco visto, um intervalo grande
   * aqui só pode ser abuso ou defeito — nos dois casos, melhor barrar.
   */
  if (metodo === "eth_getLogs") {
    const filtro = chamada.params[0] as Record<string, unknown> | undefined;
    if (!filtro || typeof filtro !== "object") return "filtro inválido";

    const de = filtro.fromBlock;
    const ate = filtro.toBlock;

    if (typeof de !== "string") return "fromBlock é obrigatório";

    if (typeof ate === "string" && ate !== "latest" && de !== "latest") {
      try {
        const intervalo = BigInt(ate) - BigInt(de);
        if (intervalo > MAX_BLOCOS_POR_CONSULTA) {
          return `intervalo de ${intervalo} blocos passa do limite de ${MAX_BLOCOS_POR_CONSULTA}`;
        }
      } catch {
        return "fromBlock ou toBlock não são números válidos";
      }
    }
  }

  return null;
}

export async function POST(request: Request) {
  if (excedeuLimite(request)) {
    return NextResponse.json(
      { error: { code: -32005, message: "muitas requisições" } },
      { status: 429 },
    );
  }

  let corpo: Chamada;
  try {
    corpo = (await request.json()) as Chamada;
  } catch {
    return NextResponse.json(
      { error: { code: -32700, message: "corpo inválido" } },
      { status: 400 },
    );
  }

  // Um pedido por vez. Lote permitiria burlar o limite de uso com uma chamada.
  if (Array.isArray(corpo)) {
    return NextResponse.json(
      { error: { code: -32600, message: "envie um pedido por vez" } },
      { status: 400 },
    );
  }

  const motivo = recusar(corpo);
  if (motivo) {
    return NextResponse.json({ error: { code: -32601, message: motivo } }, { status: 400 });
  }

  try {
    /*
     * Endereço do nó lido do ambiente do SERVIDOR, sem `NEXT_PUBLIC_`. Com o
     * prefixo público, o valor vai junto no pacote que o navegador baixa — e
     * se um dia for um nó pago com chave no endereço, a chave iria junto.
     */
    const no = process.env.ROBINHOOD_RPC || robinhoodChain.rpcUrls.default.http[0];

    const resposta = await fetch(no, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: corpo.id ?? 1,
        method: corpo.method,
        params: corpo.params,
      }),
      // O nó é rápido; esperar mais que isto só segura conexão à toa.
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });

    const texto = await resposta.text();

    /*
     * Repassa como veio, inclusive erro do próprio nó — quem chamou precisa
     * distinguir "o nó recusou" de "a ponte falhou". Só o cabeçalho é nosso.
     */
    return new NextResponse(texto, {
      status: resposta.ok ? 200 : 502,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (erro) {
    const expirou = erro instanceof Error && erro.name === "TimeoutError";
    return NextResponse.json(
      {
        error: {
          code: -32603,
          message: expirou ? "o nó não respondeu a tempo" : "falha ao falar com o nó",
        },
      },
      { status: 504 },
    );
  }
}
