import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

/**
 * Entrega as transações de criação dos contratos que o forge SIMULOU.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A PUBLICAÇÃO PASSA PELO NAVEGADOR
 * ---------------------------------------------------------------------------
 * `forge script --broadcast` precisa da chave privada da carteira que paga. A
 * carteira do dono é uma MetaMask, e tirar a chave dela pra colar num terminal
 * é exatamente o tipo de coisa que acaba com a chave num histórico de shell.
 * Aqui a MetaMask assina, e a chave nunca sai de lá.
 *
 * ---------------------------------------------------------------------------
 * POR QUE OS BYTES VÊM DO DRY-RUN, E NÃO DO `out/`
 * ---------------------------------------------------------------------------
 * O dry-run é a saída de `script/Publicar.s.sol` rodado contra a rede real:
 * bytecode + argumentos do construtor já codificados, com as taxas e faixas
 * escritas lá. Remontar o construtor aqui em TypeScript seria uma segunda
 * cópia desses números — e taxa de criador é imutável depois de publicada.
 *
 * Gerar o arquivo (não envia nada):
 *   forge script script/Publicar.s.sol --rpc-url robinhood --sender <carteira>
 *
 * Só existe em desenvolvimento. Em produção devolve 404.
 */

/** Scripts cujo dry-run esta página sabe enviar. */
const SCRIPTS = ["Publicar", "Ajustar"] as const;

const dryRun = (script: string) =>
  path.join(process.cwd(), `contracts/broadcast/${script}.s.sol/4663/dry-run/run-latest.json`);

interface TransacaoDoForge {
  transactionType: string;
  contractName: string;
  contractAddress: string;
  transaction: { from: string; to?: string | null; input: string; nonce: string };
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  const pedido = new URL(request.url).searchParams.get("script") ?? "Publicar";
  const script = SCRIPTS.find((s) => s === pedido);
  if (!script) return NextResponse.json({ error: "script desconhecido" }, { status: 400 });

  let bruto: string;
  try {
    bruto = await readFile(dryRun(script), "utf8");
  } catch {
    return NextResponse.json(
      { error: "Simulação não encontrada. Rode o forge script sem --broadcast primeiro." },
      { status: 404 },
    );
  }

  const execucao = JSON.parse(bruto) as { transactions: TransacaoDoForge[]; chain: number };

  if (execucao.chain !== 4663) {
    return NextResponse.json({ error: `A simulação é da rede ${execucao.chain}, não da 4663.` }, { status: 409 });
  }

  /*
   * CREATE publica contrato; CALL chama um já publicado (o ajuste da curva).
   * Chamada não tem endereço previsto — quem impede o envio em dobro é a
   * checagem de nonce na página.
   */
  const contratos = execucao.transactions
    .filter((t) => t.transactionType === "CREATE" || t.transactionType === "CALL")
    .map((t) => ({
      nome: t.transactionType === "CALL" ? `${script}: ${t.contractName ?? "chamada"}` : t.contractName,
      para: t.transactionType === "CALL" ? (t.transaction.to ?? null) : null,
      remetente: t.transaction.from,
      dados: t.transaction.input,
      /*
       * Endereço de contrato criado é função de (remetente, nonce). Se já há
       * código ali, esta simulação já foi publicada — e a tela pula o passo em
       * vez de publicar de novo.
       */
      /* Em CALL o forge põe aqui o contrato CHAMADO, que já tem código: não serve. */
      previsto: t.transactionType === "CREATE" ? t.contractAddress : null,
      nonce: Number(t.transaction.nonce),
    }));

  return NextResponse.json({ contratos });
}
