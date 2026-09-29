"use client";

import { useCallback, useState } from "react";
import { usePublicClient } from "wagmi";
import { BaseError, ContractFunctionRevertedError, decodeEventLog, parseEther, type Address } from "viem";

import {
  ABI_DA_CURVA,
  CHROMA_CURVE_EVM,
  ENDERECO_ZERO,
  MOTIVO_DO_ERRO,
  curvaEvmDisponivel,
} from "@/lib/chroma-evm";
import { esperarRecibo, useCarteiraRobinhood } from "@/hooks/useCarteiraRobinhood";
import { reivindicarPontos } from "@/lib/reivindicar-pontos";
import { useIdioma } from "@/components/IdiomaProvider";
import { traducoes, type Idioma } from "@/lib/idiomas";
import { robinhoodChain } from "@/lib/web3";
import { TEXTO_DA_ETAPA, type DadosDoLancamento, type EtapaDoLancamento } from "@/hooks/useLancarToken";

export { TEXTO_DA_ETAPA };
export type { DadosDoLancamento, EtapaDoLancamento };

/**
 * Lançar moeda na Robinhood Chain.
 *
 * ---------------------------------------------------------------------------
 * A MESMA ORDEM DA SOLANA, PELO MESMO MOTIVO
 * ---------------------------------------------------------------------------
 * Arte e metadados sobem ANTES da transação. A transação grava o endereço
 * deles de forma imutável: se ele apontasse pro vazio, a moeda ficaria sem
 * nome e sem imagem para sempre, sem conserto.
 *
 * Na ordem contrária, uma falha no envio da imagem depois da transação
 * produziria exatamente isso — um token publicado apontando pro nada.
 *
 * ---------------------------------------------------------------------------
 * POR QUE O ENDEREÇO DA MOEDA SAI DO EVENTO, E NÃO DO RETORNO
 * ---------------------------------------------------------------------------
 * `lancar()` devolve o endereço da moeda, mas esse retorno só existe para quem
 * chama o contrato de dentro da própria rede. Quem manda uma transação recebe
 * um recibo, não o valor de retorno — a função já executou quando o recibo
 * chega.
 *
 * Por isso o endereço é lido do evento que o contrato emite. Ler do recibo é a
 * única forma correta, e tentar adivinhar o endereço antes (por nonce, por
 * exemplo) quebra no dia em que o contrato passar a usar clone determinístico.
 */

/**
 * O evento que carrega o endereço da moeda recém-criada.
 *
 * A lista de campos tem que bater EXATAMENTE com a declaração em
 * `ChromaCurve.sol`, incluindo os que não são usados aqui: o identificador do
 * evento é o hash da assinatura inteira. Um campo a menos gera outro hash,
 * nenhum registro casa, e o lançamento termina com "não foi possível ler o
 * endereço" sem nada apontando a causa.
 *
 * Conferido contra o ABI que o `forge build` gerou:
 *   Lancada(address indexed moeda, address indexed criador,
 *           string nome, string simbolo, string uri)
 */
const ABI_DO_EVENTO = [
  {
    type: "event",
    name: "Lancada",
    inputs: [
      { name: "moeda", type: "address", indexed: true },
      { name: "criador", type: "address", indexed: true },
      { name: "nome", type: "string", indexed: false },
      { name: "simbolo", type: "string", indexed: false },
      { name: "uri", type: "string", indexed: false },
    ],
  },
] as const;

/**
 * Traduz a recusa do contrato para o que a pessoa precisa mudar.
 *
 * O viem embrulha o erro em camadas; o nome do erro Solidity está numa delas.
 * Sem nome conhecido, devolve a mensagem curta do viem em vez do texto
 * gigante com o calldata inteiro.
 */
function explicarRecusa(e: unknown, idioma: Idioma = "en"): string {
  if (e instanceof BaseError) {
    const recusa = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (recusa instanceof ContractFunctionRevertedError) {
      const nome = recusa.data?.errorName;
      if (nome && MOTIVO_DO_ERRO[idioma][nome]) return MOTIVO_DO_ERRO[idioma][nome];
    }
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : String(e);
}

const MENSAGENS = traducoes({
  en: {
    conecte: "Connect a Robinhood Chain wallet first.", indisponivel: "Launching on this network is not available yet.",
    compraInvalida: "The initial buy amount is not a valid number.", semConexao: "No connection to Robinhood Chain right now. Try again in a moment.",
    imagem: "Could not upload the image.", recusou: "the network rejected the transaction", recusouCompra: "the network rejected the buy",
    semEndereco: "the coin was created, but its address could not be read from the receipt",
    recusouInicial: "The coin was created. You declined the initial buy — you can buy it on its page.",
    falhouInicial: (m: string) => `The coin was created, but the initial buy failed: ${m}`,
  },
  pt: {
    conecte: "Conecte uma carteira da Robinhood Chain antes.", indisponivel: "O lançamento nesta rede ainda não está disponível.",
    compraInvalida: "O valor da compra inicial não é um número válido.", semConexao: "Sem conexão com a Robinhood Chain agora. Tente de novo em instantes.",
    imagem: "Não foi possível enviar a imagem.", recusou: "a rede recusou a transação", recusouCompra: "a rede recusou a compra",
    semEndereco: "a moeda foi criada, mas não foi possível ler o endereço dela no recibo",
    recusouInicial: "A moeda foi criada. Você recusou a compra inicial — dá pra comprar pela página dela.",
    falhouInicial: (m: string) => `A moeda foi criada, mas a compra inicial falhou: ${m}`,
  },
  zh: {
    conecte: "请先连接 Robinhood Chain 钱包。", indisponivel: "该网络暂不支持发行。",
    compraInvalida: "首次买入金额不是有效数字。", semConexao: "暂时无法连接 Robinhood Chain，请稍后重试。",
    imagem: "无法上传图片。", recusou: "网络拒绝了该交易", recusouCompra: "网络拒绝了这笔买入",
    semEndereco: "代币已创建，但无法从回执中读取其地址",
    recusouInicial: "代币已创建。你拒绝了首次买入 —— 可以在代币页面购买。",
    falhouInicial: (m: string) => `代币已创建，但首次买入失败：${m}`,
  },
});

export function useLancarTokenEvm() {
  const idioma = useIdioma();
  const m = MENSAGENS[idioma];
  const { address, obterCarteira } = useCarteiraRobinhood();
  const publicClient = usePublicClient({ chainId: robinhoodChain.id });

  const [etapa, setEtapa] = useState<EtapaDoLancamento>("parado");
  const [erro, setErro] = useState<string | null>(null);

  const lancar = useCallback(
    async (
      dados: DadosDoLancamento,
    ): Promise<{ moeda: string; hash: string; avisoDeCompra: string | null } | null> => {
      setErro(null);

      if (!address) {
        setErro(m.conecte);
        return null;
      }

      /*
       * A CHECAGEM DE CONTRATO PUBLICADO VEM ANTES DE QUALQUER UPLOAD.
       *
       * Sem ela, a pessoa preencheria o formulário, veria a arte subir e só
       * então tomaria um erro de transação — tendo publicado os arquivos de
       * uma moeda que nunca vai existir.
       */
      if (!curvaEvmDisponivel()) {
        setErro(m.indisponivel);
        return null;
      }

      /*
       * Compra inicial validada ANTES de subir arte e assinar: valor torto
       * descoberto depois do lançamento deixaria a moeda criada e a compra
       * que a pessoa pediu sem acontecer.
       */
      let compra = 0n;
      try {
        compra = dados.compraInicial ? parseEther(dados.compraInicial) : 0n;
      } catch {
        setErro(m.compraInvalida);
        return null;
      }

      if (!publicClient) {
        setErro(m.semConexao);
        return null;
      }

      /* --- 0. o contrato aceitaria? ------------------------------- */
      /*
       * A TAXA SAI DO CONTRATO, NÃO DO AMBIENTE.
       *
       * Antes vinha de NEXT_PUBLIC_LAUNCH_FEE_ETH. Se a variável faltar na
       * Vercel, o site mandava zero, o contrato recusava, a MetaMask não
       * conseguia estimar o gás e a transação morria sem explicação
       * (27/09/2026). Quem cobra é o contrato; é dele que o número vem.
       *
       * E a simulação roda ANTES de subir a arte e de abrir a MetaMask: se o
       * contrato vai recusar, a pessoa lê o motivo em português aqui, em vez de
       * "Interaction failed" na carteira.
       */
      let taxaDeLancamento: bigint;
      let gas: bigint;
      try {
        taxaDeLancamento = (await publicClient.readContract({
          address: CHROMA_CURVE_EVM as Address,
          abi: ABI_DA_CURVA,
          functionName: "taxaDeLancamento",
        })) as bigint;

        const simulado = {
          address: CHROMA_CURVE_EVM as Address,
          abi: ABI_DA_CURVA,
          functionName: "lancar",
          /* A URI real só existe depois do upload; o tamanho é parecido. */
          args: [dados.nome, dados.simbolo, "https://chroma.exemplo/metadados/0000000000000000.json"],
          value: taxaDeLancamento,
          account: address,
        } as const;
        await publicClient.simulateContract(simulado);

        /*
         * Gás estimado aqui e enviado pronto, com 30% de folga. Na Robinhood
         * (Arbitrum) o limite também paga o dado postado na L1; se a carteira
         * chutar baixo, a rede recusa a transação antes de incluí-la.
         */
        gas = ((await publicClient.estimateContractGas(simulado)) * 13n) / 10n;
      } catch (e) {
        setErro(explicarRecusa(e, idioma));
        return null;
      }

      try {
        /* --- 1. arte e metadados no ar ---------------------------- */
        setEtapa("publicando-arte");

        const form = new FormData();
        form.append("name", dados.nome);
        form.append("symbol", dados.simbolo);
        if (dados.descricao) form.append("description", dados.descricao);
        if (dados.site) form.append("website", dados.site);
        if (dados.twitter) form.append("twitter", dados.twitter);
        if (dados.telegram) form.append("telegram", dados.telegram);
        form.append("creator", address);
        form.append("coin", dados.arte);
        if (dados.banner) form.append("banner", dados.banner);

        const resposta = await fetch("/api/token-media", { method: "POST", body: form });
        const publicado = await resposta.json();
        if (!resposta.ok) throw new Error(publicado?.error ?? m.imagem);

        const uri: string = publicado.metadataUrl;

        /* --- 2. a transação --------------------------------------- */
        setEtapa("aguardando-assinatura");

        const carteira = await obterCarteira();
        const hash = await carteira.writeContract({
          address: CHROMA_CURVE_EVM as Address,
          abi: ABI_DA_CURVA,
          functionName: "lancar",
          args: [dados.nome, dados.simbolo, uri],
          value: taxaDeLancamento,
          gas,
        });

        /* --- 3. confirmação --------------------------------------- */
        setEtapa("confirmando");

        const recibo = await esperarRecibo(publicClient, hash);
        if (recibo.status !== "success") throw new Error(m.recusou);

        /*
         * O endereço da moeda sai do evento emitido pela própria curva.
         *
         * Os registros de outros contratos na mesma transação são ignorados em
         * silêncio: decodificar um log que não é nosso lança, e isso não é
         * erro — é só um log de terceiro.
         */
        let moeda: string | null = null;
        for (const log of recibo.logs) {
          if (log.address.toLowerCase() !== String(CHROMA_CURVE_EVM).toLowerCase()) continue;
          try {
            const evento = decodeEventLog({ abi: ABI_DO_EVENTO, ...log });
            if (evento.eventName === "Lancada") {
              moeda = evento.args.moeda as string;
              break;
            }
          } catch {
            /* log de outro evento do mesmo contrato: segue procurando */
          }
        }

        if (!moeda) {
          throw new Error(
            m.semEndereco,
          );
        }

        /*
         * O catálogo é registrado DEPOIS, e uma falha aqui não derruba o
         * lançamento: a moeda já existe na rede. Mesma decisão do fluxo da
         * Solana — erro nosso de catálogo não pode virar "deu errado" para
         * quem acabou de pagar o gás.
         */
        void fetch("/api/moedas", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            site: dados.site,
            twitter: dados.twitter,
            telegram: dados.telegram,
            address: moeda,
            chain: "robinhood",
            txHash: hash,
            descricao: dados.descricao,
            imagem: publicado.imageUrl,
          }),
        }).catch((erroDeCatalogo) => {
          console.warn("[lancamento-evm] moeda criada, mas não entrou no catálogo:", erroDeCatalogo);
        });

        /* --- 4. compra inicial ------------------------------------ */
        /*
         * O contrato não compra junto do lançamento: o que passa da taxa volta
         * como troco. Então é uma SEGUNDA transação, e a MetaMask pede uma
         * segunda confirmação.
         *
         * Falhar aqui NÃO desfaz nada — a moeda já existe. Por isso o erro vira
         * aviso devolvido junto do resultado, e não exceção: "deu errado" pra
         * quem acabou de criar a moeda seria mentira.
         */
        let avisoDeCompra: string | null = null;
        if (compra > 0n) {
          setEtapa("comprando");
          try {
            const cotado = (await publicClient.readContract({
              address: CHROMA_CURVE_EVM as Address,
              abi: ABI_DA_CURVA,
              functionName: "cotarCompra",
              args: [moeda as Address, compra],
            })) as bigint;

            /*
             * 5% de folga: a curva acabou de nascer, mas alguém pode comprar
             * entre as duas transações. Passando disso o contrato reverte em
             * vez de entregar menos.
             */
            const minimo = (cotado * 9_500n) / 10_000n;

            const transacao = await carteira.writeContract({
              address: CHROMA_CURVE_EVM as Address,
              abi: ABI_DA_CURVA,
              functionName: "comprar",
              args: [moeda as Address, minimo, ENDERECO_ZERO as Address],
              value: compra,
            });
            const reciboDaCompra = await esperarRecibo(publicClient, transacao);
            if (reciboDaCompra.status !== "success") throw new Error(m.recusouCompra);
            void reivindicarPontos(transacao, address);
          } catch (e) {
            const mensagem = e instanceof Error ? e.message : String(e);
            avisoDeCompra = /reject|denied|cancel|User rejected/i.test(mensagem)
              ? m.recusouInicial
              : m.falhouInicial(explicarRecusa(e, idioma));
          }
        }

        setEtapa("pronto");
        return { moeda, hash, avisoDeCompra };
      } catch (e) {
        const mensagem = e instanceof Error ? e.message : String(e);
        setEtapa("parado");

        // Recusar na carteira é escolha da pessoa, não erro pra mostrar em vermelho.
        if (/reject|denied|cancel|User rejected/i.test(mensagem)) return null;

        setErro(explicarRecusa(e, idioma));
        return null;
      }
    },
    [address, obterCarteira, publicClient, idioma, m],
  );

  return {
    lancar,
    etapa,
    erro,
    ocupado: etapa !== "parado" && etapa !== "pronto",
    carteiraConectada: Boolean(address),
    /** A tela usa isto pra explicar "em breve" em vez de oferecer um botão morto. */
    disponivel: curvaEvmDisponivel(),
  };
}
