"use client";

import { useCallback, useState } from "react";
import { usePublicClient } from "wagmi";
import { decodeEventLog, parseEther, type Address } from "viem";

import {
  ABI_DA_CURVA,
  CHROMA_CURVE_EVM,
  ENDERECO_ZERO,
  curvaEvmDisponivel,
} from "@/lib/chroma-evm";
import { esperarRecibo, useCarteiraRobinhood } from "@/hooks/useCarteiraRobinhood";
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

export function useLancarTokenEvm() {
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
        setErro("Conecte uma carteira da Robinhood Chain antes.");
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
        setErro("O lançamento nesta rede ainda não está disponível.");
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
        setErro("O valor da compra inicial não é um número válido.");
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
        if (!resposta.ok) throw new Error(publicado?.error ?? "Não foi possível enviar a imagem.");

        const uri: string = publicado.metadataUrl;

        /* --- 2. a transação --------------------------------------- */
        setEtapa("aguardando-assinatura");

        /*
         * A taxa de lançamento vai como `value`. O contrato recusa a
         * transação se o valor enviado for menor que o que ele guarda — então
         * o número sai da variável de ambiente, e não de um literal aqui.
         */
        const taxaDeLancamento = parseEther(process.env.NEXT_PUBLIC_LAUNCH_FEE_ETH || "0");

        const carteira = await obterCarteira();
        const hash = await carteira.writeContract({
          address: CHROMA_CURVE_EVM as Address,
          abi: ABI_DA_CURVA,
          functionName: "lancar",
          args: [dados.nome, dados.simbolo, uri],
          value: taxaDeLancamento,
        });

        /* --- 3. confirmação --------------------------------------- */
        setEtapa("confirmando");

        if (!publicClient) throw new Error("sem conexão com a rede para confirmar");
        const recibo = await esperarRecibo(publicClient, hash);
        if (recibo.status !== "success") throw new Error("a rede recusou a transação");

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
            "a moeda foi criada, mas não foi possível ler o endereço dela no recibo",
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
          body: JSON.stringify({ address: moeda, chain: "robinhood", txHash: hash }),
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
            if (reciboDaCompra.status !== "success") throw new Error("a rede recusou a compra");
          } catch (e) {
            const mensagem = e instanceof Error ? e.message : String(e);
            avisoDeCompra = /reject|denied|cancel|User rejected/i.test(mensagem)
              ? "A moeda foi criada. Você recusou a compra inicial — dá pra comprar pela página dela."
              : `A moeda foi criada, mas a compra inicial falhou: ${mensagem}`;
          }
        }

        setEtapa("pronto");
        return { moeda, hash, avisoDeCompra };
      } catch (e) {
        const mensagem = e instanceof Error ? e.message : String(e);
        setEtapa("parado");

        // Recusar na carteira é escolha da pessoa, não erro pra mostrar em vermelho.
        if (/reject|denied|cancel|User rejected/i.test(mensagem)) return null;

        setErro(mensagem);
        return null;
      }
    },
    [address, obterCarteira, publicClient],
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
