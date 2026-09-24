"use client";

import { useCallback, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { decodeEventLog, parseEther, type Address } from "viem";

import {
  ABI_DA_CURVA,
  CHROMA_CURVE_EVM,
  curvaEvmDisponivel,
} from "@/lib/chroma-evm";
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
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [etapa, setEtapa] = useState<EtapaDoLancamento>("parado");
  const [erro, setErro] = useState<string | null>(null);

  const lancar = useCallback(
    async (dados: DadosDoLancamento): Promise<{ moeda: string; hash: string } | null> => {
      setErro(null);

      if (!address || !walletClient) {
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
         * A taxa de lançamento vai como `value`. Hoje é zero na configuração
         * publicada, mas o contrato recusa a transação se o valor enviado não
         * bater com o que ele guarda — então o número sai da variável de
         * ambiente, e não de um literal aqui.
         */
        const taxaDeLancamento = parseEther(process.env.NEXT_PUBLIC_LAUNCH_FEE_ETH || "0");

        const hash = await walletClient.writeContract({
          address: CHROMA_CURVE_EVM as Address,
          abi: ABI_DA_CURVA,
          functionName: "lancar",
          args: [dados.nome, dados.simbolo, uri],
          value: taxaDeLancamento,
        });

        /* --- 3. confirmação --------------------------------------- */
        setEtapa("confirmando");

        if (!publicClient) throw new Error("sem conexão com a rede para confirmar");
        const recibo = await publicClient.waitForTransactionReceipt({ hash });
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

        setEtapa("pronto");
        return { moeda, hash };
      } catch (e) {
        const mensagem = e instanceof Error ? e.message : String(e);
        setEtapa("parado");

        // Recusar na carteira é escolha da pessoa, não erro pra mostrar em vermelho.
        if (/reject|denied|cancel|User rejected/i.test(mensagem)) return null;

        setErro(mensagem);
        return null;
      }
    },
    [address, walletClient, publicClient],
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
