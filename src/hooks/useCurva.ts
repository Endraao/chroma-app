"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

import {
  enderecoDaConfig,
  enderecoDaCurva,
  lerConfig,
  lerCurva,
  type EstadoDaConfig,
  type EstadoDaCurva,
} from "@/lib/chroma-program";

/**
 * Descobre se uma moeda está na curva da Chroma, e acompanha o estado dela.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO DECIDE POR ONDE O SWAP PASSA
 * ---------------------------------------------------------------------------
 * Uma moeda lançada aqui não existe em DEX nenhuma enquanto está na curva: não
 * há pool, então a Jupiter não tem rota e responderia "sem rota disponível".
 * Quem tem os tokens é a curva, e só ela pode vendê-los.
 *
 * Depois que a curva enche, a liquidez migra pra uma DEX e a situação inverte:
 * a curva para de negociar e a Jupiter passa a ser o caminho certo.
 *
 * Então a pergunta "por onde negociar?" não é configuração nem palpite — é
 * leitura de duas contas na rede. É isso que este hook faz.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ACOMPANHA EM VEZ DE LER UMA VEZ
 * ---------------------------------------------------------------------------
 * O preço da curva é função das reservas, e as reservas mudam a cada compra e
 * cada venda de qualquer pessoa. Uma leitura única deixaria a tela cotando com
 * um estado velho, e a proteção de preço recusaria a transação na cara do
 * usuário sem explicar por quê. A assinatura na conta resolve: a rede avisa.
 */

export interface DadosDaCurva {
  estado: EstadoDaCurva;
  config: EstadoDaConfig;

  /** Dá pra comprar agora. A pausa da plataforma bloqueia. */
  podeComprar: boolean;
  /**
   * Dá pra vender agora.
   *
   * A pausa NÃO entra nesta conta, e isso é de propósito — é a mesma regra do
   * programa. Uma trava que prende quem já está dentro não é proteção.
   */
  podeVender: boolean;
}

interface Resultado {
  /** null = a moeda não está na curva (não é nossa, ou já migrou) */
  curva: DadosDaCurva | null;
  carregando: boolean;
}

/** Endereço de moeda pode ser EVM: a página é multi-rede. */
function chaveSegura(valor: string | null): PublicKey | null {
  if (!valor) return null;
  try {
    return new PublicKey(valor);
  } catch {
    return null;
  }
}

export function useCurva(tokenMint: string | null): Resultado {
  const { connection } = useConnection();

  const [curva, setCurva] = useState<DadosDaCurva | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const mint = chaveSegura(tokenMint);
    if (!mint) {
      setCurva(null);
      setCarregando(false);
      return;
    }

    let cancelado = false;
    let inscricao: number | null = null;

    setCarregando(true);

    (async () => {
      try {
        const enderecoCurva = enderecoDaCurva(mint);

        const [contaDaCurva, contaDaConfig] = await Promise.all([
          connection.getAccountInfo(enderecoCurva),
          connection.getAccountInfo(enderecoDaConfig()),
        ]);

        if (cancelado) return;

        /*
         * Sem conta da curva a moeda não é nossa — é o caso da imensa maioria,
         * e não é erro nenhum. Sem config, o programa não está nesta rede.
         * Nos dois casos o swap segue pela Jupiter, que é o certo.
         */
        if (!contaDaCurva || !contaDaConfig) {
          setCurva(null);
          setCarregando(false);
          return;
        }

        const config = lerConfig(contaDaConfig.data);

        const montar = (dados: Buffer): DadosDaCurva => {
          const estado = lerCurva(dados);
          return {
            estado,
            config,
            podeComprar: !estado.concluida && !config.pausado,
            podeVender: !estado.concluida,
          };
        };

        setCurva(montar(contaDaCurva.data));
        setCarregando(false);

        /*
         * A partir daqui a rede empurra as mudanças. `confirmed` e não
         * `finalized`: a diferença é de segundos, e cotar com um estado de
         * segundos atrás é o que causa recusa por proteção de preço.
         */
        inscricao = connection.onAccountChange(
          enderecoCurva,
          (conta) => {
            if (cancelado) return;
            setCurva(montar(conta.data));
          },
          { commitment: "confirmed" },
        );
      } catch (erro) {
        if (cancelado) return;
        /*
         * Falha de leitura não pode travar a tela. Cair pra Jupiter é o
         * comportamento seguro: no pior caso ela diz que não tem rota, em vez
         * de a pessoa ficar olhando um painel carregando pra sempre.
         */
        console.warn("[curva] não consegui ler o estado:", erro);
        setCurva(null);
        setCarregando(false);
      }
    })();

    return () => {
      cancelado = true;
      if (inscricao !== null) {
        void connection.removeAccountChangeListener(inscricao).catch(() => {});
      }
    };
  }, [connection, tokenMint]);

  return { curva, carregando };
}
