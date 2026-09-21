"use client";

import { useCallback, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, Transaction } from "@solana/web3.js";

import {
  enderecoDaConfig,
  ixLancar,
  lerConfig,
  recusarDadosDoToken,
} from "@/lib/chroma-program";

/**
 * Lança uma moeda: publica a arte, cria o token e abre a curva.
 *
 * ---------------------------------------------------------------------------
 * A ORDEM NÃO PODE MUDAR
 * ---------------------------------------------------------------------------
 * A arte e os metadados vão pro ar ANTES da transação. A transação grava o
 * endereço deles de forma imutável — se ele apontasse pro vazio, a moeda
 * ficaria sem nome e sem imagem para sempre, e não existe conserto.
 *
 * Na ordem contrária, uma falha no envio da imagem depois da transação
 * produziria exatamente isso: um token publicado apontando pro nada.
 */

export type EtapaDoLancamento =
  | "parado"
  | "publicando-arte"
  | "aguardando-assinatura"
  | "confirmando"
  | "pronto";

/** O que a tela mostra em cada etapa. */
export const TEXTO_DA_ETAPA: Record<EtapaDoLancamento, string> = {
  parado: "",
  "publicando-arte": "Publicando a arte…",
  "aguardando-assinatura": "Aprove na sua carteira…",
  confirmando: "Confirmando na rede…",
  pronto: "Pronto!",
};

export interface DadosDoLancamento {
  nome: string;
  simbolo: string;
  descricao?: string;
  site?: string;
  twitter?: string;
  telegram?: string;
  /** a arte principal, escolhida no formulário */
  arte: File;
  banner?: File | null;
}

export function useLancarToken() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [etapa, setEtapa] = useState<EtapaDoLancamento>("parado");
  const [erro, setErro] = useState<string | null>(null);

  const lancar = useCallback(
    async (dados: DadosDoLancamento): Promise<{ mint: string; assinatura: string } | null> => {
      setErro(null);

      if (!publicKey) {
        setErro("Conecte uma carteira Solana antes.");
        return null;
      }

      /*
       * Os limites são conferidos aqui e de novo no servidor. Não é
       * duplicação à toa: eles não são preferência nossa, são do formato
       * on-chain, e uma transação que os viola é recusada pela rede DEPOIS de
       * a pessoa aprovar e pagar a taxa.
       */
      const problema = recusarDadosDoToken({
        nome: dados.nome,
        simbolo: dados.simbolo,
        // A URI só existe depois do envio; aqui só o que já dá pra checar.
        uri: "",
      });
      if (problema) {
        setErro(problema);
        return null;
      }

      try {
        /* --- 1. o que a rede diz ---------------------------------- */
        /*
         * Lido da configuração NA REDE, não de variável de ambiente.
         *
         * O programa recusa a transação se a carteira da plataforma não bater
         * com a que está gravada lá. Ler da fonte que o próprio programa usa
         * elimina uma classe inteira de erro: site fora de sincronia com a rede.
         *
         * Vem ANTES do envio da arte de propósito. Os dois motivos de recusa
         * conhecidos — plataforma não configurada e lançamentos pausados — dão
         * pra descobrir aqui, e descobrir depois significaria ter publicado
         * arquivos de uma moeda que não vai existir.
         */
        const contaDaConfig = await connection.getAccountInfo(enderecoDaConfig());
        if (!contaDaConfig) {
          throw new Error("a plataforma ainda não foi configurada nesta rede");
        }

        const config = lerConfig(contaDaConfig.data);

        // A trava é decidida na rede; o programa confere de novo do lado dele.
        if (config.pausado) {
          throw new Error("os lançamentos estão pausados no momento");
        }

        const carteiraDaPlataforma = config.carteiraDaPlataforma;

        /* --- 2. arte e metadados no ar ---------------------------- */
        setEtapa("publicando-arte");

        const form = new FormData();
        form.append("name", dados.nome);
        form.append("symbol", dados.simbolo);
        if (dados.descricao) form.append("description", dados.descricao);
        if (dados.site) form.append("website", dados.site);
        if (dados.twitter) form.append("twitter", dados.twitter);
        if (dados.telegram) form.append("telegram", dados.telegram);
        form.append("creator", publicKey.toBase58());
        form.append("coin", dados.arte);
        if (dados.banner) form.append("banner", dados.banner);

        const resposta = await fetch("/api/token-media", { method: "POST", body: form });
        const publicado = await resposta.json();
        if (!resposta.ok) throw new Error(publicado?.error ?? "não consegui publicar a arte");

        const uri: string = publicado.metadataUrl;

        // Agora dá pra conferir o tamanho da URI, que é o terceiro limite.
        const problemaDaUri = recusarDadosDoToken({
          nome: dados.nome,
          simbolo: dados.simbolo,
          uri,
        });
        if (problemaDaUri) throw new Error(problemaDaUri);

        /* --- 3. a transação --------------------------------------- */
        setEtapa("aguardando-assinatura");

        /*
         * O token ganha um par de chaves novo, e ele precisa ASSINAR: a conta
         * do token nasce nesta transação, e criar conta exige a assinatura de
         * quem vai ocupá-la. A chave é descartada logo depois — a autoridade
         * de emissão é renunciada dentro do mesmo lançamento, então ela não
         * serve pra mais nada.
         */
        const mint = Keypair.generate();

        const transacao = new Transaction().add(
          ixLancar({
            criador: publicKey,
            mint: mint.publicKey,
            carteiraDaPlataforma,
            nome: dados.nome,
            simbolo: dados.simbolo,
            uri,
          }),
        );

        const assinatura = await sendTransaction(transacao, connection, {
          signers: [mint],
        });

        /* --- 4. esperar a rede ------------------------------------ */
        setEtapa("confirmando");

        const bloco = await connection.getLatestBlockhash();
        const resultado = await connection.confirmTransaction(
          { signature: assinatura, ...bloco },
          "confirmed",
        );
        if (resultado.value.err) {
          throw new Error("a rede recusou a transação");
        }

        setEtapa("pronto");
        return { mint: mint.publicKey.toBase58(), assinatura };
      } catch (e) {
        setEtapa("parado");

        const mensagem = e instanceof Error ? e.message : String(e);
        /*
         * Recusar na carteira é escolha da pessoa, não erro. Mostrar "falhou"
         * em vermelho depois de ela cancelar de propósito assusta à toa.
         */
        setErro(/reject|denied|User rejected/i.test(mensagem) ? null : mensagem);
        return null;
      }
    },
    [connection, publicKey, sendTransaction],
  );

  return {
    lancar,
    etapa,
    erro,
    ocupado: etapa !== "parado" && etapa !== "pronto",
    /*
     * A tela precisa saber disto ANTES do clique.
     *
     * Sem carteira conectada o lançamento não sai, e descobrir isso só depois
     * de preencher o formulário inteiro e apertar o botão é a pior hora:
     * parece que deu erro, quando na verdade faltava um passo que ninguém
     * avisou. O botão usa isto pra pedir a carteira em vez de recusar.
     */
    carteiraConectada: Boolean(publicKey),
  };
}
