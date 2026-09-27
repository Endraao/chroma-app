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

const DRY_RUN = path.join(
  process.cwd(),
  "contracts/broadcast/Publicar.s.sol/4663/dry-run/run-latest.json",
);

interface TransacaoDoForge {
  transactionType: string;
  contractName: string;
  contractAddress: string;
  transaction: { from: string; input: string; nonce: string };
}

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  let bruto: string;
  try {
    bruto = await readFile(DRY_RUN, "utf8");
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

  const contratos = execucao.transactions
    .filter((t) => t.transactionType === "CREATE")
    .map((t) => ({
      nome: t.contractName,
      remetente: t.transaction.from,
      dados: t.transaction.input,
      /*
       * Endereço de contrato criado é função de (remetente, nonce). Se já há
       * código ali, esta simulação já foi publicada — e a tela pula o passo em
       * vez de publicar de novo.
       */
      previsto: t.contractAddress,
      nonce: Number(t.transaction.nonce),
    }));

  return NextResponse.json({ contratos });
}
