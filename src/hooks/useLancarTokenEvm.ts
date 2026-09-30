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
import { ABI_CHROMA_PONS, CHROMA_PONS, FABRICA_DA_PONS } from "@/lib/chroma-pons";
import { anotarOperacao } from "@/lib/posicoes-locais";

/** Evento do ChromaPons com o endereço da moeda e a compra do criador. */
const ABI_LANCADA_PONS = [
  {
    type: "event",
    name: "Lancada",
    inputs: [
      { name: "moeda", type: "address", indexed: true },
      { name: "curva", type: "address", indexed: true },
      { name: "criador", type: "address", indexed: true },
      { name: "compra", type: "uint256", indexed: false },
      { name: "tokens", type: "uint256", indexed: false },
    ],
  },
] as const;
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
       * LANÇAMENTO PELA CURVA DA PONS (30/09/2026), numa transação só: taxa
       * da Pons + taxa da Chroma + criação + compra do criador, pelo contrato
       * ChromaPons. As duas taxas saem dos contratos, não do ambiente.
       *
       * A simulação roda ANTES de subir a arte e de abrir a carteira: se algo
       * vai ser recusado, a pessoa lê o motivo aqui.
       */
      const salt = `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
      const parametros = (logo: string) => ({
        name: dados.nome,
        symbol: dados.simbolo,
        logo,
        description: dados.descricao ?? "",
        socials: {
          twitter: dados.twitter ?? "",
          telegram: dados.telegram ?? "",
          discord: "",
          website: dados.site ?? "",
          farcaster: "",
        },
        creatorFeeRecipient: address,
        creatorTaxBps: 0,
        buybackEnabled: false,
        expectedEconomics: `0x${"0".repeat(64)}` as `0x${string}`,
        salt,
      });
      let valor: bigint;
      let gas: bigint;
      try {
        const [taxaDaPons, taxaDaChroma] = await Promise.all([
          publicClient.readContract({
            address: FABRICA_DA_PONS,
            abi: [{ type: "function", name: "launchFee", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }] as const,
            functionName: "launchFee",
          }),
          publicClient.readContract({ address: CHROMA_PONS, abi: ABI_CHROMA_PONS, functionName: "taxaDeLancamento" }) as Promise<bigint>,
        ]);
        valor = taxaDaPons + taxaDaChroma + compra;
        const simulado = {
          address: CHROMA_PONS,
          abi: ABI_CHROMA_PONS,
          functionName: "lancar",
          /* O endereço real da arte só existe depois do upload; o tamanho é parecido. */
          args: [parametros("https://chromalaunch.fun/api/media/00000000000000000000000000000000.jpg"), 0n, 0n],
          value: valor,
          account: address,
        } as const;
        await publicClient.simulateContract(simulado);
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

        /* --- 2. a transação (uma só) ------------------------------ */
        setEtapa("aprovar-unica");

        const carteira = await obterCarteira();
        const hash = await carteira.writeContract({
          address: CHROMA_PONS,
          abi: ABI_CHROMA_PONS,
          functionName: "lancar",
          args: [parametros(publicado.imageUrl as string), 0n, 0n],
          value: valor,
          gas,
        });

        /* --- 3. confirmação --------------------------------------- */
        setEtapa("confirmando");

        const recibo = await esperarRecibo(publicClient, hash);
        if (recibo.status !== "success") throw new Error(m.recusou);

        let moeda: string | null = null;
        let tokensDoCriador = 0n;
        for (const log of recibo.logs) {
          if (log.address.toLowerCase() !== CHROMA_PONS.toLowerCase()) continue;
          try {
            const evento = decodeEventLog({ abi: ABI_LANCADA_PONS, ...log });
            if (evento.eventName === "Lancada") {
              moeda = evento.args.moeda as string;
              tokensDoCriador = evento.args.tokens as bigint;
              break;
            }
          } catch {
            /* outro evento do mesmo contrato */
          }
        }
        if (!moeda) throw new Error(m.semEndereco);

        // A compra do criador saiu junto: anota pro painel "Sua posição".
        if (compra > 0n && tokensDoCriador > 0n) {
          anotarOperacao(address, moeda.toLowerCase(), "buy", Number(tokensDoCriador) / 1e18, Number(compra) / 1e18);
        }

        /*
         * Catálogo DEPOIS, e falha aqui não derruba o lançamento: a moeda já
         * existe na rede. O servidor confere o recibo (foi o nosso contrato,
         * e quem lançou é quem assinou).
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
            nome: dados.nome,
            simbolo: dados.simbolo,
            descricao: dados.descricao,
            imagem: publicado.imageUrl,
          }),
        }).catch((erroDeCatalogo) => {
          console.warn("[lancamento-evm] moeda criada, mas não entrou no catálogo:", erroDeCatalogo);
        });
        void reivindicarPontos(hash, address);
        const avisoDeCompra: string | null = null;

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
