import { NextResponse } from "next/server";

import { PLATFORM_FEE_WALLET_SOL, SOLANA_RPC } from "@/lib/web3";

/**
 * GET /api/diagnostico — diz QUAIS variáveis chegaram, nunca o valor delas.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO EXISTE
 * ---------------------------------------------------------------------------
 * Três publicações seguidas saíram com as variáveis `NEXT_PUBLIC_*` vazias, e
 * de fora não dava pra saber em que ponto elas se perdiam. Tem dois lugares
 * possíveis, e o conserto é diferente em cada um:
 *
 *   - **Não chegam na publicação.** Aí `process.env` está vazio aqui no
 *     servidor também, e o problema é de configuração na Vercel.
 *   - **Chegam, mas não entram no código do navegador.** `process.env` tem
 *     valor aqui, mas a constante importada de `web3.ts` — que é o que o
 *     navegador realmente usa — está vazia. Aí o problema é o momento em que
 *     o valor é embutido, não a configuração.
 *
 * Por isso a resposta compara os dois: o que o servidor lê agora e o que ficou
 * gravado na constante em tempo de compilação.
 *
 * ---------------------------------------------------------------------------
 * NENHUM VALOR SAI DAQUI
 * ---------------------------------------------------------------------------
 * Só `true`/`false` e o tamanho em caracteres. Tamanho ajuda a flagrar valor
 * truncado ou com espaço sobrando, e não revela conteúdo.
 *
 * Mesmo assim: é um endereço público, e some assim que a dúvida for resolvida.
 */
export async function GET() {
  const doServidor = (nome: string) => {
    const v = process.env[nome];
    return { definida: Boolean(v), caracteres: v?.length ?? 0 };
  };

  return NextResponse.json({
    /* O que o servidor enxerga AGORA, lendo o ambiente da Vercel. */
    noServidor: {
      NEXT_PUBLIC_PLATFORM_FEE_WALLET_SOL: doServidor("NEXT_PUBLIC_PLATFORM_FEE_WALLET_SOL"),
      NEXT_PUBLIC_SOLANA_RPC: doServidor("NEXT_PUBLIC_SOLANA_RPC"),
      NEXT_PUBLIC_CHROMA_PROGRAM_ID: doServidor("NEXT_PUBLIC_CHROMA_PROGRAM_ID"),
      NEXT_PUBLIC_SITE_URL: doServidor("NEXT_PUBLIC_SITE_URL"),
      DATABASE_URL: doServidor("DATABASE_URL"),
      BLOB_READ_WRITE_TOKEN: doServidor("BLOB_READ_WRITE_TOKEN"),
    },

    /*
     * O que ficou gravado nas constantes na hora de compilar — é EXATAMENTE
     * isto que o navegador recebe. Se aqui estiver vazio e acima não, achamos
     * o ponto onde se perde.
     */
    noCodigo: {
      carteiraDeTaxa: {
        definida: Boolean(PLATFORM_FEE_WALLET_SOL),
        caracteres: PLATFORM_FEE_WALLET_SOL.length,
      },
      rpc: {
        /* O padrão de reserva é a URL pública da Solana; se for ela, a
           variável não entrou. */
        usandoReserva: SOLANA_RPC.includes("api.mainnet-beta.solana.com"),
        caracteres: SOLANA_RPC.length,
      },
    },

    at: Date.now(),
  });
}
