"use client";

import { SOLANA_RPC } from "@/lib/web3";

/**
 * Aviso honesto: sem RPC dedicado, o swap NÃO funciona.
 *
 * O endpoint público da Solana (api.mainnet-beta.solana.com) responde 403 para
 * chamadas vindas do browser. Leitura de preço e gráfico passam pelo servidor e
 * continuam funcionando, mas ler saldo e ENVIAR a transação são feitos pelo
 * navegador — e esses quebram. Melhor dizer isso na cara do que deixar o
 * usuário clicar em "Comprar" e tomar um erro críptico.
 */
const USING_PUBLIC_RPC = !process.env.NEXT_PUBLIC_SOLANA_RPC;

export function RpcNotice() {
  if (!USING_PUBLIC_RPC) return null;

  return (
    <div className="border-b border-warn/20 bg-warn/[0.07]">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-2 px-4 py-1.5 text-[12px] lg:px-6">
        <span className="size-1.5 shrink-0 rounded-full bg-warn" />
        <span className="text-zinc-400">
          Sem RPC dedicado da Solana. Gráfico e cotação funcionam, mas{" "}
          <strong className="font-semibold text-warn">enviar transação vai falhar</strong> — o RPC público bloqueia
          o navegador. Crie uma chave grátis na Helius e ponha em{" "}
          <code className="text-zinc-300">NEXT_PUBLIC_SOLANA_RPC</code> no <code className="text-zinc-300">.env.local</code>.
        </span>
      </div>
    </div>
  );
}
