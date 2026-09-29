"use client";

import { useCallback, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, PublicKey } from "@solana/web3.js";

import { recusarDadosDoToken } from "@/lib/chroma-program";
import { esperarCurva, transacaoDeCriacao, transacaoDeDivisao } from "@/lib/pumpfun";
import { CHAIN_FEES } from "@/lib/fees";
import { PLATFORM_FEE_WALLET_SOL } from "@/lib/web3";
import { useIdioma } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";

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
  | "comprando"
  | "dividindo"
  | "pronto";

/** O que a tela mostra em cada etapa. */
export const TEXTO_DA_ETAPA: Record<EtapaDoLancamento, string> = {
  parado: "",
  "publicando-arte": "Publicando a arte…",
  "aguardando-assinatura": "Aprove na sua carteira…",
  confirmando: "Confirmando na rede…",
  comprando: "Moeda criada. Aprove a compra inicial…",
  dividindo: "Moeda criada. Aprove a última etapa na carteira…",
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
  /**
   * Quanto comprar logo depois de lançar, na moeda nativa da rede (texto como
   * foi digitado). Só a Robinhood usa por enquanto: o programa da Solana não
   * está publicado na mainnet.
   */
  compraInicial?: string;
}

const MENSAGENS = traducoes({
  en: {
    conecte: "Connect a Solana wallet first.", semCarteira: "Launching on Solana is not configured yet.",
    compraInvalida: "The initial buy amount is not a valid number.", imagem: "Could not upload the image.",
    recusou: "the network rejected the transaction", demorou: "The coin was created, but the network is slow to show it. Open its page in a minute.",
    semDivisao: "The coin was created on pump.fun. The last step (fee split and initial buy) was not completed — you can buy it on its page.",
  },
  pt: {
    conecte: "Conecte uma carteira Solana antes.", semCarteira: "O lançamento na Solana ainda não está configurado.",
    compraInvalida: "O valor da compra inicial não é um número válido.", imagem: "Não foi possível enviar a imagem.",
    recusou: "a rede recusou a transação", demorou: "A moeda foi criada, mas a rede está demorando para mostrá-la. Abra a página dela em um minuto.",
    semDivisao: "A moeda foi criada na pump.fun. A última etapa (divisão da taxa e compra inicial) não foi concluída — dá pra comprar pela página dela.",
  },
  zh: {
    conecte: "请先连接 Solana 钱包。", semCarteira: "Solana 发行尚未配置。",
    compraInvalida: "首次买入金额不是有效数字。", imagem: "无法上传图片。",
    recusou: "网络拒绝了该交易", demorou: "代币已创建，但网络显示较慢。请一分钟后打开其页面。",
    semDivisao: "代币已在 pump.fun 创建。最后一步（费用分成和首次买入）未完成 —— 可以在代币页面购买。",
  },
});

export function useLancarToken() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const idioma = useIdioma();
  const m = MENSAGENS[idioma];

  const [etapa, setEtapa] = useState<EtapaDoLancamento>("parado");
  const [erro, setErro] = useState<string | null>(null);

  const lancar = useCallback(
    async (
      dados: DadosDoLancamento,
    ): Promise<{ moeda: string; mint: string; assinatura: string; avisoDeCompra: string | null } | null> => {
      setErro(null);

      if (!publicKey) {
        setErro(m.conecte);
        return null;
      }
      if (!PLATFORM_FEE_WALLET_SOL) {
        setErro(m.semCarteira);
        return null;
      }
      const compraSol = dados.compraInicial ? Number(dados.compraInicial.replace(",", ".")) : 0;
      if (!Number.isFinite(compraSol) || compraSol < 0) {
        setErro(m.compraInvalida);
        return null;
      }

      const problema = recusarDadosDoToken({ nome: dados.nome, simbolo: dados.simbolo, uri: "" });
      if (problema) {
        setErro(problema);
        return null;
      }

      const carteiraDaChroma = new PublicKey(PLATFORM_FEE_WALLET_SOL);
      let mintCriado: string | null = null;

      try {
        /* 1. Arte e metadados no ar ANTES da transação (ver nota no topo). */
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
        if (!resposta.ok) throw new Error(publicado?.error ?? m.imagem);

        const uri: string = publicado.metadataUrl;
        const problemaDaUri = recusarDadosDoToken({ nome: dados.nome, simbolo: dados.simbolo, uri });
        if (problemaDaUri) throw new Error(problemaDaUri);

        /* 2. Transação A: taxa da Chroma + criação na pump.fun. */
        setEtapa("aguardando-assinatura");
        const mint = Keypair.generate();
        const txA = await transacaoDeCriacao({
          conn: connection,
          criador: publicKey,
          mint: mint.publicKey,
          nome: dados.nome,
          simbolo: dados.simbolo,
          uri,
          carteiraDaChroma,
          taxaSol: CHAIN_FEES.solana.launchFee,
        });
        txA.sign([mint]);
        const assinatura = await sendTransaction(txA, connection);

        setEtapa("confirmando");
        const bloco = await connection.getLatestBlockhash();
        const resultado = await connection.confirmTransaction({ signature: assinatura, ...bloco }, "confirmed");
        if (resultado.value.err) throw new Error(m.recusou);
        mintCriado = mint.publicKey.toBase58();

        /* 3. Registra no catálogo da Chroma já — a moeda existe, com ou sem a etapa B. */
        try {
          await fetch("/api/moedas", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              chain: "solana",
              mint: mintCriado,
              nome: dados.nome,
              simbolo: dados.simbolo,
              descricao: dados.descricao,
              imagem: publicado.imageUrl,
              assinatura,
            }),
          });
        } catch (erroDeCatalogo) {
          console.warn("[lancamento] moeda criada, mas não entrou no catálogo:", erroDeCatalogo);
        }

        /* 4. Transação B: divisão da taxa de criador + compra inicial. */
        let avisoDeCompra: string | null = null;
        try {
          await esperarCurva(connection, mint.publicKey);
          setEtapa("dividindo");
          const txB = await transacaoDeDivisao({
            conn: connection,
            criador: publicKey,
            mint: mint.publicKey,
            carteiraDaChroma,
            compraSol,
          });
          const assinaturaB = await sendTransaction(txB, connection);
          const blocoB = await connection.getLatestBlockhash();
          const resB = await connection.confirmTransaction({ signature: assinaturaB, ...blocoB }, "confirmed");
          if (resB.value.err) throw new Error(m.recusou);
        } catch (e) {
          console.warn("[lancamento] etapa B não concluída:", e);
          avisoDeCompra = e instanceof Error && e.message === "curve-timeout" ? m.demorou : m.semDivisao;
        }

        setEtapa("pronto");
        return { moeda: mintCriado, mint: mintCriado, assinatura, avisoDeCompra };
      } catch (e) {
        setEtapa("parado");
        const mensagem = e instanceof Error ? e.message : String(e);
        setErro(/reject|denied|User rejected/i.test(mensagem) ? null : mensagem);
        return null;
      }
    },
    [connection, publicKey, sendTransaction, m],
  );

  return {
    lancar,
    etapa,
    erro,
    ocupado: etapa !== "parado" && etapa !== "pronto",
    carteiraConectada: Boolean(publicKey),
  };
}
