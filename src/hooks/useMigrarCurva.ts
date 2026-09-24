"use client";

import { useCallback, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { ComputeBudgetProgram, PublicKey, Transaction } from "@solana/web3.js";

import { ixMigrar, ixPrepararMigracao } from "@/lib/chroma-program";

/**
 * Dispara a migração da curva cheia para a pool da Raydium.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ESTE BOTÃO PRECISA EXISTIR NA INTERFACE
 * ---------------------------------------------------------------------------
 * O programa on-chain deixa QUALQUER carteira migrar de propósito: quem chama
 * não escolhe valor nem destino, só paga o gás. A razão está em
 * `programs/chroma-curve/src/migracao.rs` — migração que depende da plataforma
 * prende dinheiro de terceiros no dia em que a plataforma falhar.
 *
 * Só que "qualquer um pode" não serve de nada se ninguém tem por onde. Sem
 * este botão, encher a curva — que é o sucesso da moeda — travaria a compra e
 * a venda até alguém rodar um script na mão. O painel já dizia "qualquer
 * pessoa pode executar esse último passo" e não oferecia o passo.
 *
 * ---------------------------------------------------------------------------
 * POR QUE SÃO DUAS TRANSAÇÕES, E NESTA ORDEM
 * ---------------------------------------------------------------------------
 * `preparar_migracao` embrulha o SOL arrecadado em WSOL; `migrar` cria a pool
 * e queima o LP. Não dá pra juntar as duas: a rede recusa creditar lamports
 * numa conta e, na mesma instrução, chamar outro programa passando essa conta.
 *
 * A segunda leva um pedido de orçamento de computação. A Raydium cria seis
 * contas nessa chamada e as 200 mil unidades padrão não cobrem — sem o pedido
 * a transação falha por falta de computação, o que na tela pareceria um erro
 * de lógica do site.
 *
 * ---------------------------------------------------------------------------
 * SE A PRIMEIRA PASSAR E A SEGUNDA FALHAR
 * ---------------------------------------------------------------------------
 * Nada se perde: `preparar_migracao` é idempotente do ponto de vista de quem
 * chama — só deixa o SOL embrulhado na conta da própria curva. Basta apertar
 * de novo, inclusive de outra carteira.
 */

const ORCAMENTO_DA_POOL = 600_000;

export type FaseDaMigracao = "parada" | "executando" | "pronta" | "erro";

export function useMigrarCurva(mint: string) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [fase, setFase] = useState<FaseDaMigracao>("parada");
  const [passo, setPasso] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [assinatura, setAssinatura] = useState<string | null>(null);

  const migrar = useCallback(async () => {
    if (!publicKey || !sendTransaction) return;

    setFase("executando");
    setErro(null);
    setAssinatura(null);

    /** Manda uma transação e espera a rede confirmar antes de seguir. */
    async function enviar(transacao: Transaction) {
      const sig = await sendTransaction(transacao, connection);
      const bloco = await connection.getLatestBlockhash();
      const r = await connection.confirmTransaction({ signature: sig, ...bloco }, "confirmed");
      if (r.value.err) throw new Error("a rede recusou a transação");
      return sig;
    }

    try {
      const moeda = new PublicKey(mint);

      setPasso("Preparando a liquidez… (1 de 2)");
      await enviar(new Transaction().add(ixPrepararMigracao({ executor: publicKey, mint: moeda })));

      setPasso("Criando a pool na Raydium… (2 de 2)");
      const sig = await enviar(
        new Transaction()
          .add(ComputeBudgetProgram.setComputeUnitLimit({ units: ORCAMENTO_DA_POOL }))
          .add(ixMigrar({ executor: publicKey, mint: moeda })),
      );

      setAssinatura(sig);
      setFase("pronta");
      setPasso("");
    } catch (e) {
      setPasso("");
      const mensagem = e instanceof Error ? e.message : String(e);

      // Recusar na carteira é escolha da pessoa, não erro pra mostrar em vermelho.
      if (/reject|denied|cancel/i.test(mensagem)) {
        setFase("parada");
        return;
      }
      setErro(mensagem);
      setFase("erro");
    }
  }, [publicKey, sendTransaction, connection, mint]);

  return {
    migrar,
    fase,
    passo,
    erro,
    assinatura,
    podeMigrar: Boolean(publicKey && sendTransaction),
  };
}
