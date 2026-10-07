"use client";

import { useCallback, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, PublicKey } from "@solana/web3.js";

import { recusarDadosDoToken } from "@/lib/chroma-program";
import {
  esperarCurva,
  transacaoDeCriacao,
  transacaoDeDivisao,
  transacaoDeTaxaEDivisao,
  transacoesDeLancamento,
  transacaoUnicaDeLancamento,
} from "@/lib/pumpfun";
import { CHAIN_FEES } from "@/lib/fees";
import { PLATFORM_FEE_WALLET_SOL } from "@/lib/web3";
import { useIdioma } from "@/components/IdiomaProvider";
import { anotarOperacao } from "@/lib/posicoes-locais";
import { TABELA_SOLANA } from "@/lib/tabela-solana";
import { CURVA_CHROMA_DISPONIVEL, transacaoDeLancamentoNaCurva } from "@/lib/meteora-dbc";
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
  | "aprovar-unica"
  | "aprovar-tudo"
  | "finalizando"
  | "aguardando-assinatura"
  | "confirmando"
  | "comprando"
  | "dividindo"
  | "pronto";

/** O que a tela mostra em cada etapa. */
export const TEXTO_DA_ETAPA: Record<EtapaDoLancamento, string> = {
  parado: "",
  "publicando-arte": "Publicando a arte…",
  "aprovar-unica": "Aprove o lançamento na sua carteira…",
  "aprovar-tudo": "Etapa 1 de 2 — aprove a criação e a sua compra…",
  finalizando: "Etapa 2 de 2 — aprove as taxas na carteira…",
  "aguardando-assinatura": "Aprove na sua carteira…",
  confirmando: "Confirmando na rede…",
  comprando: "Moeda criada. Aprove a compra inicial…",
  dividindo: "Etapa 2 de 2 — aprove na carteira a compra inicial e a divisão das taxas…",
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
  /** pra quem vão as recompensas de criador (só Solana por enquanto) */
  recompensas?: "criador" | "detentores";
  /** par de liquidez na Solana: SOL ou USDC */
  par?: "SOL" | "USDC";
  /** Robinhood: taxa extra do criador em cada negociação, em % (0 a 10), paga toda a ele */
  taxaDoCriador?: number;
  /** Solana: em qual curva nasce — a da pump.fun (padrão) ou a Curva da Chroma (Meteora DBC) */
  curva?: "pump" | "chroma";
}

const MENSAGENS = traducoes({
  en: {
    conecte: "Connect a Solana wallet first.", semCarteira: "Launching on Solana is not configured yet.",
    compraInvalida: "The initial buy amount is not a valid number.", imagem: "Could not upload the image.",
    recusou: "the network rejected the transaction", semSaldo: (precisa: string, tem: string) => `Not enough SOL: launching with this initial buy needs about ${precisa} SOL and your wallet has ${tem} SOL. Add SOL or lower the initial buy.`, demorou: "The coin was created, but the network is slow to show it. Open its page in a minute.",
    semDivisao: "Your coin was created. Finish the last step on its page.",
    expirou: "The approval took too long and the network turned it down. Nothing was charged — just click again.",
  },
  pt: {
    conecte: "Conecte uma carteira Solana antes.", semCarteira: "O lançamento na Solana ainda não está configurado.",
    compraInvalida: "O valor da compra inicial não é um número válido.", imagem: "Não foi possível enviar a imagem.",
    recusou: "a rede recusou a transação", semSaldo: (precisa: string, tem: string) => `Saldo insuficiente: lançar com essa compra inicial precisa de uns ${precisa} SOL e sua carteira tem ${tem} SOL. Coloque mais SOL ou diminua a compra inicial.`, demorou: "A moeda foi criada, mas a rede está demorando para mostrá-la. Abra a página dela em um minuto.",
    semDivisao: "Sua moeda foi criada. Conclua a última etapa na página dela.",
    expirou: "A aprovação demorou demais e a rede recusou. Nada foi cobrado — é só clicar de novo.",
  },
  zh: {
    conecte: "请先连接 Solana 钱包。", semCarteira: "Solana 发行尚未配置。",
    compraInvalida: "首次买入金额不是有效数字。", imagem: "无法上传图片。",
    recusou: "网络拒绝了该交易", semSaldo: (precisa: string, tem: string) => `SOL 不足：使用此首次买入发币大约需要 ${precisa} SOL，你的钱包有 ${tem} SOL。请充值 SOL 或降低首次买入。`, demorou: "代币已创建，但网络显示较慢。请一分钟后打开其页面。",
    semDivisao: "你的代币已创建。请在代币页面完成最后一步。",
    expirou: "确认耗时过长，网络已拒绝。未产生任何费用——再点一次即可。",
  },
});

export function useLancarToken() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, signTransaction } = useWallet();
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

        const paraDetentoresUnico = dados.recompensas === "detentores";
        const registrar = (assinatura: string, assinaturaTaxa?: string) =>
          fetch("/api/moedas", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              site: dados.site,
              twitter: dados.twitter,
              telegram: dados.telegram,
              recompensas: dados.recompensas,
              chain: "solana",
              mint: mintCriado,
              nome: dados.nome,
              simbolo: dados.simbolo,
              descricao: dados.descricao,
              imagem: publicado.imageUrl,
              assinatura,
              assinaturaTaxa,
              curva: dados.curva === "chroma" ? "chroma" : undefined,
            }),
          }).catch((erroDeCatalogo) => console.warn("[lancamento] fora do catálogo:", erroDeCatalogo));

        /*
         * UMA TRANSAÇÃO SÓ (com a tabela de endereços da Chroma na rede):
         * taxa + criação + compra do criador, atômicas. Ver
         * `transacaoUnicaDeLancamento`.
         */
        /*
         * CURVA DA CHROMA (Meteora DBC): criação + compra do criador numa
         * transação só, e a taxa de lançamento é cobrada pela própria curva.
         * A carteira assina PRIMEIRO; a assinatura da moeda nova entra depois
         * (ordem recomendada pela Phantom).
         */
        if (dados.curva === "chroma" && CURVA_CHROMA_DISPONIVEL && signTransaction) {
          /*
           * Saldo ANTES de tudo. Sem isso, faltando SOL a simulação falhava, a
           * carteira nem abria e a tela ficava em "aprove na carteira" sem dizer
           * o porquê (05/10/2026). Custo: 0,02 de taxa + ~0,015 das contas da
           * moeda + a compra inicial + ~0,001 de rede.
           */
          const precisa = 0.02 + 0.015 + compraSol + 0.001;
          const tem = (await connection.getBalance(publicKey)) / 1e9;
          if (tem < precisa) throw new Error(m.semSaldo(precisa.toFixed(3), tem.toFixed(3)));
          setEtapa("aprovar-unica");
          const mint = Keypair.generate();
          const tx = await transacaoDeLancamentoNaCurva({
            conexao: connection,
            criador: publicKey,
            mint,
            nome: dados.nome,
            simbolo: dados.simbolo,
            uri,
            compraSol,
          });
          const sim = await connection.simulateTransaction(tx);
          if (sim.value.err) {
            // O motivo da rede, não só "recusou" (07/10/2026: sem ele não dava
            // pra saber o que corrigir).
            const logs = sim.value.logs ?? [];
            console.warn("[lançamento] simulação recusada", sim.value.err, logs);
            if (logs.some((l) => /insufficient lamports|insufficient funds/i.test(l))) throw new Error(m.semSaldo(precisa.toFixed(3), tem.toFixed(3)));
            const motivo = logs.map((l) => l.match(/Error Message: (.+?).?$/)?.[1] ?? l.match(/failed: (.+)$/)?.[1]).find(Boolean);
            throw new Error(motivo ? `${m.recusou}: ${motivo}` : `${m.recusou} (${JSON.stringify(sim.value.err)})`);
          }
          const assinada = await signTransaction(tx);
          assinada.partialSign(mint);
          const assinatura = await connection.sendRawTransaction(assinada.serialize());
          setEtapa("confirmando");
          const bloco = await connection.getLatestBlockhash();
          const r = await connection.confirmTransaction({ signature: assinatura, ...bloco }, "confirmed");
          if (r.value.err) throw new Error(m.recusou);
          mintCriado = mint.publicKey.toBase58();
          await registrar(assinatura);
          setEtapa("pronto");
          return { moeda: mintCriado, mint: mintCriado, assinatura, avisoDeCompra: null };
        }

        if (dados.par !== "USDC" && TABELA_SOLANA) {
          setEtapa("aprovar-unica");
          const mint = Keypair.generate();
          const tx = await transacaoUnicaDeLancamento({
            conn: connection,
            criador: publicKey,
            mint: mint.publicKey,
            nome: dados.nome,
            simbolo: dados.simbolo,
            uri,
            carteiraDaChroma,
            taxaSol: CHAIN_FEES.solana.launchFee,
            compraSol,
            paraDetentores: paraDetentoresUnico,
            tabela: new PublicKey(TABELA_SOLANA),
          });
          tx.sign([mint]);
          const assinatura = await sendTransaction(tx, connection);
          setEtapa("confirmando");
          const bloco = await connection.getLatestBlockhash();
          const r = await connection.confirmTransaction({ signature: assinatura, ...bloco }, "confirmed");
          if (r.value.err) throw new Error(m.recusou);
          mintCriado = mint.publicKey.toBase58();
          if (compraSol > 0) {
            const criadoAgora = mintCriado;
            void connection
              .getParsedTokenAccountsByOwner(publicKey, { mint: mint.publicKey })
              .then((contas) => {
                const tokens = contas.value.reduce((s, c) => s + Number(c.account.data.parsed.info.tokenAmount.uiAmount ?? 0), 0);
                if (tokens > 0) anotarOperacao(publicKey.toBase58(), criadoAgora, "buy", tokens, compraSol);
              })
              .catch(() => {});
          }
          await registrar(assinatura);
          setEtapa("pronto");
          return { moeda: mintCriado, mint: mintCriado, assinatura, avisoDeCompra: null };
        }

        /*
         * Sem a tabela: duas aprovações em sequência (ver abaixo).
         */
        if (dados.par !== "USDC") {
          setEtapa("aprovar-tudo");
          const mint = Keypair.generate();
          const { criacao, divisao } = await transacoesDeLancamento({
            conn: connection,
            criador: publicKey,
            mint: mint.publicKey,
            nome: dados.nome,
            simbolo: dados.simbolo,
            uri,
            carteiraDaChroma,
            taxaSol: CHAIN_FEES.solana.launchFee,
            compraSol,
            paraDetentores: paraDetentoresUnico,
          });
          criacao.sign([mint]);

          /*
           * DUAS APROVAÇÕES, EM SEQUÊNCIA (30/09/2026).
           * Assinar as duas juntas não serve: a carteira (MetaMask, Phantom)
           * SIMULA cada uma antes, e a 2 depende da moeda já existir — ela
           * aparecia como "reverted" e o botão de confirmar travava. Então a 1
           * (criação + compra, atômicas: o criador compra primeiro) é assinada
           * e confirmada, e só então a 2 é montada e pedida.
           */
          void divisao;
          const assinadas: (typeof criacao)[] | null = null as (typeof criacao)[] | null;
          const divisaoAssinada = assinadas?.[1] ?? null;

          setEtapa("confirmando");
          const assinatura = assinadas
            ? await connection.sendRawTransaction(assinadas[0].serialize(), { maxRetries: 5 })
            : await sendTransaction(criacao, connection);
          const bloco = await connection.getLatestBlockhash();
          const r1 = await connection.confirmTransaction({ signature: assinatura, ...bloco }, "confirmed");
          if (r1.value.err) throw new Error(m.recusou);
          mintCriado = mint.publicKey.toBase58();
          // A compra inicial saiu junto com a criação: anota pro painel "Sua
          // posição" ter o preço médio desde o primeiro segundo.
          if (compraSol > 0) {
            const criadoAgora = mintCriado;
            void connection
              .getParsedTokenAccountsByOwner(publicKey, { mint: mint.publicKey })
              .then((contas) => {
                const tokens = contas.value.reduce((s, c) => s + Number(c.account.data.parsed.info.tokenAmount.uiAmount ?? 0), 0);
                if (tokens > 0) anotarOperacao(publicKey.toBase58(), criadoAgora, "buy", tokens, compraSol);
              })
              .catch(() => {});
          }

          /* Transação 2: já assinada. Se falhar, remonta e pede de novo (só nesse caso). */
          setEtapa("finalizando");
          let assinaturaTaxa: string | undefined;
          const enviar = async (tx: typeof criacao) => {
            const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 5 });
            const b = await connection.getLatestBlockhash();
            const r = await connection.confirmTransaction({ signature: sig, ...b }, "confirmed");
            if (r.value.err) throw new Error(m.recusou);
            return sig;
          };
          try {
            await esperarCurva(connection, mint.publicKey);
            if (!divisaoAssinada) throw new Error("sem assinatura prévia");
            assinaturaTaxa = await enviar(divisaoAssinada);
          } catch (e1) {
            console.warn("[lancamento] etapa 2 falhou, remontando:", e1);
            try {
              await esperarCurva(connection, mint.publicKey);
              const nova = await transacaoDeTaxaEDivisao({
                conn: connection,
                criador: publicKey,
                mint: mint.publicKey,
                carteiraDaChroma,
                taxaSol: CHAIN_FEES.solana.launchFee,
                paraDetentores: paraDetentoresUnico,
              });
              assinaturaTaxa = await sendTransaction(nova, connection);
              const b = await connection.getLatestBlockhash();
              const r = await connection.confirmTransaction({ signature: assinaturaTaxa, ...b }, "confirmed");
              if (r.value.err) assinaturaTaxa = undefined;
            } catch (e2) {
              console.warn("[lancamento] etapa 2 não concluída:", e2);
              assinaturaTaxa = undefined;
            }
          }

          await registrar(assinatura, assinaturaTaxa);
          setEtapa("pronto");
          return { moeda: mintCriado, mint: mintCriado, assinatura, avisoDeCompra: null };
        }

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
          paraDetentores: dados.recompensas === "detentores",
          par: dados.par,
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
              site: dados.site,
              twitter: dados.twitter,
              telegram: dados.telegram,
              recompensas: dados.recompensas,
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
        const paraDetentores = dados.recompensas === "detentores";
        // Modo detentores sem compra inicial: não há etapa B.
        if (!(paraDetentores && compraSol <= 0)) try {
          await esperarCurva(connection, mint.publicKey);
          setEtapa("dividindo");
          // Duas tentativas: a curva recém-criada às vezes ainda não aparece
          // para o RPC da carteira e a primeira simulação falha. Recusa da
          // pessoa não repete.
          for (let tentativa = 1; ; tentativa++) {
            try {
              const txB = await transacaoDeDivisao({
                conn: connection,
                criador: publicKey,
                mint: mint.publicKey,
                carteiraDaChroma,
                compraSol,
                paraDetentores,
                par: dados.par,
              });
              const assinaturaB = await sendTransaction(txB, connection);
              const blocoB = await connection.getLatestBlockhash();
              const resB = await connection.confirmTransaction({ signature: assinaturaB, ...blocoB }, "confirmed");
              if (resB.value.err) throw new Error(m.recusou);
              break;
            } catch (erroB) {
              const msg = erroB instanceof Error ? erroB.message : String(erroB);
              if (tentativa >= 2 || /reject|denied|cancel/i.test(msg)) throw erroB;
              await new Promise((r) => setTimeout(r, 2500));
            }
          }
        } catch (e) {
          console.warn("[lancamento] etapa B não concluída:", e);
          avisoDeCompra = e instanceof Error && e.message === "curve-timeout" ? m.demorou : m.semDivisao;
        }

        setEtapa("pronto");
        return { moeda: mintCriado, mint: mintCriado, assinatura, avisoDeCompra };
      } catch (e) {
        setEtapa("parado");
        const mensagem = e instanceof Error ? e.message : String(e);
        setErro(
          /reject|denied|User rejected/i.test(mensagem)
            ? null
            : /blockhash|expired|block height exceeded/i.test(mensagem)
              ? m.expirou
              : mensagem,
        );
        return null;
      }
    },
    [connection, publicKey, sendTransaction, signTransaction, m],
  );

  return {
    lancar,
    etapa,
    erro,
    ocupado: etapa !== "parado" && etapa !== "pronto",
    carteiraConectada: Boolean(publicKey),
  };
}
