import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

import { enderecoDaCurva, lerCurva } from "@/lib/chroma-program";
import { registrarMoeda } from "@/lib/db";
import { creditarMoeda } from "@/lib/airdrop";
import { lerMoedaDaCurvaEvm } from "@/lib/curva-evm";
import { revalidateTag } from "next/cache";
import { TAG_DO_UNIVERSO } from "@/lib/tokens";

/**
 * POST /api/moedas — registra uma moeda recém-lançada na Chroma.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ESTA ROTA CONFERE NA REDE ANTES DE GRAVAR
 * ---------------------------------------------------------------------------
 * Porque sem isso ela é um convite aberto.
 *
 * O que entra nesta tabela aparece na home com o selo de "lançada na Chroma" —
 * e esse selo é, na cabeça de quem lê, um aval nosso. Um endpoint que aceita
 * qualquer corpo JSON deixaria qualquer pessoa pendurar o endereço de um golpe
 * na nossa vitrine, com o nome e a arte que ela quisesse, sem passar pela
 * nossa curva e sem pagar a taxa de lançamento.
 *
 * Então a prova não vem de quem chama: vem da rede. Derivamos o endereço da
 * conta de curva a partir do mint e perguntamos ao nó se ela existe e se é do
 * NOSSO programa. Só existe curva nesse endereço se o nosso programa a criou.
 * Quem chama não consegue forjar isso — teria que criar a moeda de verdade.
 *
 * O `criador` também não vem do corpo, e sim de dentro da conta da curva. Era
 * o mesmo furo do roteador de taxa em EVM: parâmetro que decide dinheiro não
 * pode ser escolhido por quem faz o pedido.
 */

/** Campos de texto têm teto: o banco é nosso, o texto vem de fora. */
const LIMITES = { nome: 64, simbolo: 16, descricao: 500, imagem: 500 } as const;

export async function POST(request: Request) {
  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }

  if (corpo.chain === "robinhood") return registrarNaRobinhood(corpo);

  const mint = texto(corpo.mint, 64);
  if (!mint) return NextResponse.json({ error: "'mint' é obrigatório" }, { status: 400 });

  let chaveDoMint: PublicKey;
  try {
    chaveDoMint = new PublicKey(mint);
  } catch {
    return NextResponse.json({ error: "'mint' não é um endereço Solana" }, { status: 400 });
  }

  /* --- a prova: a curva existe, e é do nosso programa? --------------- */
  const curva = await lerCurvaNoNo(chaveDoMint);

  if (!curva.existe) {
    return NextResponse.json(
      { error: "não existe curva da Chroma para este endereço" },
      { status: 403 },
    );
  }
  if (!curva.nossa) {
    return NextResponse.json(
      { error: "a conta neste endereço não pertence ao programa da Chroma" },
      { status: 403 },
    );
  }
  if (curva.criador === null) {
    return NextResponse.json({ error: "conta de curva ilegível" }, { status: 502 });
  }

  try {
    /*
     * `await` não é enfeite aqui.
     *
     * Sem ele a promessa fica solta, e em função serverless o processo pode
     * ser encerrado assim que a resposta sai — antes de a escrita terminar. A
     * moeda seria criada na rede e sumiria da nossa vitrine, de vez em quando,
     * sem erro em lugar nenhum. O `catch` também nunca pegaria nada.
     */
    await registrarMoeda({
      endereco: chaveDoMint.toBase58(),
      rede: "solana",
      nome: texto(corpo.nome, LIMITES.nome) || chaveDoMint.toBase58().slice(0, 6),
      simbolo: texto(corpo.simbolo, LIMITES.simbolo) || "?",
      descricao: texto(corpo.descricao, LIMITES.descricao) || null,
      imagem: urlSegura(corpo.imagem),
      /* De dentro da conta, não do corpo do pedido. */
      criador: curva.criador,
      assinatura: texto(corpo.assinatura, 128) || null,
      criadaEm: Date.now(),
    });
  } catch (erro) {
    console.warn("[moedas] falha ao registrar:", erro);
    return NextResponse.json({ error: "Não foi possível registrar agora." }, { status: 500 });
  }

  /*
   * Pontos do airdrop pela moeda lançada.
   *
   * Depois do registro e num `try` próprio: se a pontuação falhar, a moeda já
   * está registrada e a criação não pode ser desfeita por causa disso. Perder
   * ponto é chato; perder a moeda da vitrine é quebrar o produto.
   *
   * O criador vem da conta on-chain — o mesmo valor que o registro usou — e
   * não do corpo do pedido. Sem isso, qualquer um pediria pontos em nome de
   * qualquer endereço.
   */
  /* A moeda nova aparece na home já, sem esperar o cache vencer. */
  revalidateTag(TAG_DO_UNIVERSO, "max");

  try {
    await creditarMoeda(chaveDoMint.toBase58(), curva.criador, "solana");
  } catch (erro) {
    console.warn("[moedas] falha ao pontuar o airdrop:", erro);
  }

  return NextResponse.json({ ok: true, mint: chaveDoMint.toBase58() });
}

/* ------------------------------------------------------------------ */

/**
 * Registro de moeda lançada na curva da Robinhood.
 *
 * Existia só o caminho da Solana, e o lançamento EVM mandava pra cá um corpo
 * que ele recusava em silêncio — a primeira moeda (SundayCat, 27/09/2026)
 * nasceu na rede e ficou fora da vitrine e sem pontos de airdrop.
 *
 * A prova é a mesma ideia da Solana: a curva da Chroma conhece este endereço.
 * Nome, símbolo e criador saem do CONTRATO; do corpo só se aceita o que a
 * rede não guarda (imagem e descrição), com os mesmos filtros.
 */
async function registrarNaRobinhood(corpo: Record<string, unknown>) {
  const endereco = texto(corpo.address, 42);
  if (!/^0x[0-9a-fA-F]{40}$/.test(endereco)) {
    return NextResponse.json({ error: "'address' não é um endereço EVM" }, { status: 400 });
  }

  const moeda = await lerMoedaDaCurvaEvm(endereco).catch(() => null);
  if (!moeda) {
    return NextResponse.json(
      { error: "não existe curva da Chroma para este endereço" },
      { status: 403 },
    );
  }

  const criador = moeda.curva.criador;
  try {
    await registrarMoeda({
      endereco: endereco.toLowerCase(),
      rede: "robinhood",
      nome: moeda.nome.slice(0, LIMITES.nome) || endereco.slice(0, 6),
      simbolo: moeda.simbolo.slice(0, LIMITES.simbolo) || "?",
      descricao: texto(corpo.descricao, LIMITES.descricao) || null,
      imagem: urlSegura(corpo.imagem),
      criador,
      assinatura: texto(corpo.txHash, 128) || null,
      criadaEm: Date.now(),
    });
  } catch (erro) {
    console.warn("[moedas] falha ao registrar (robinhood):", erro);
    return NextResponse.json({ error: "Não foi possível registrar agora." }, { status: 500 });
  }

  /* A moeda nova aparece na home já, sem esperar o cache vencer. */
  revalidateTag(TAG_DO_UNIVERSO, "max");

  try {
    await creditarMoeda(endereco.toLowerCase(), criador, "robinhood");
  } catch (erro) {
    console.warn("[moedas] falha ao pontuar o airdrop (robinhood):", erro);
  }

  return NextResponse.json({ ok: true, address: endereco });
}

interface LeituraDaCurva {
  existe: boolean;
  /** a conta é de propriedade do programa da Chroma */
  nossa: boolean;
  criador: string | null;
}

async function lerCurvaNoNo(mint: PublicKey): Promise<LeituraDaCurva> {
  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC;
  if (!rpc) return { existe: false, nossa: false, criador: null };

  const endereco = enderecoDaCurva(mint).toBase58();

  try {
    const resposta = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: [endereco, { encoding: "base64", commitment: "confirmed" }],
      }),
    });
    if (!resposta.ok) return { existe: false, nossa: false, criador: null };

    const json = (await resposta.json()) as {
      result?: { value: { owner: string; data: [string, string] } | null };
    };
    const conta = json.result?.value;
    if (!conta) return { existe: false, nossa: false, criador: null };

    /*
     * O dono da conta é a prova.
     *
     * Só o programa que criou uma conta pode ser dono dela — é regra da rede,
     * não convenção nossa. Comparar com o nosso id de programa é o que separa
     * uma moeda lançada aqui de um endereço qualquer que alguém mandou.
     */
    const { CHROMA_PROGRAM_ID } = await import("@/lib/chroma-program");
    if (conta.owner !== CHROMA_PROGRAM_ID.toBase58()) {
      return { existe: true, nossa: false, criador: null };
    }

    try {
      const estado = lerCurva(Buffer.from(conta.data[0], "base64"));
      /* O mint gravado na conta tem que ser o que pediram — não é possível
         com a derivação por semente, mas conferir é barato. */
      if (!estado.mint.equals(mint)) return { existe: true, nossa: false, criador: null };
      return { existe: true, nossa: true, criador: estado.criador.toBase58() };
    } catch {
      return { existe: true, nossa: true, criador: null };
    }
  } catch {
    return { existe: false, nossa: false, criador: null };
  }
}

function texto(valor: unknown, limite: number): string {
  return typeof valor === "string" ? valor.trim().slice(0, limite) : "";
}

/**
 * Só aceita imagem de origem que a gente controla ou de `https`.
 *
 * Sem isto, o campo aceitaria `javascript:` ou um `data:` com SVG — e a arte
 * do card é renderizada em toda a home. Um `<img>` não executa SVG remoto, mas
 * o campo também vira link em outros lugares, e URL vinda de fora não deve
 * ganhar o benefício da dúvida.
 */
function urlSegura(valor: unknown): string | null {
  const bruto = texto(valor, LIMITES.imagem);
  if (!bruto) return null;
  if (bruto.startsWith("/")) return bruto; // servida por nós
  try {
    const u = new URL(bruto);
    return u.protocol === "https:" ? bruto : null;
  } catch {
    return null;
  }
}
