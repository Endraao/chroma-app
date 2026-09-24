/**
 * Avisa o servidor que um swap aconteceu, pra ele pontuar o airdrop.
 *
 * ---------------------------------------------------------------------------
 * SÓ A ASSINATURA VAI DAQUI
 * ---------------------------------------------------------------------------
 * Nem volume, nem valor, nem quantidade de pontos. O servidor busca a
 * transação na blockchain e tira dali tudo que precisa — inclusive se ela
 * existe mesmo.
 *
 * Isso é deliberado e vale repetir: se este arquivo um dia mandar um número
 * que vire ponto, o airdrop acabou. Qualquer pessoa abre o console do
 * navegador, vê a chamada, e repete com o número que quiser.
 *
 * ---------------------------------------------------------------------------
 * POR QUE TENTA MAIS DE UMA VEZ
 * ---------------------------------------------------------------------------
 * A transação acabou de ser confirmada quando chamamos — e "confirmada" não é
 * a mesma coisa que "já indexada pelo RPC que o servidor consulta". A primeira
 * tentativa falha com frequência por isso, e seria um ponto perdido sem
 * motivo.
 *
 * As tentativas são espaçadas e poucas: se depois disso ainda não apareceu, o
 * ponto não se perde de verdade — a transação continua na rede, e dá pra
 * reivindicar de novo depois, porque a assinatura é a chave contra crédito
 * duplo.
 */

const TENTATIVAS = 3;
const ESPERA_MS = 2_500;

export interface PontosGanhos {
  pontos: number;
  volumeUsd: number;
  /** Já estava creditado — reenvio do mesmo swap, não erro. */
  jaCreditado: boolean;
}

export async function reivindicarPontos(
  assinatura: string,
  carteira: string,
): Promise<PontosGanhos | null> {
  for (let tentativa = 0; tentativa < TENTATIVAS; tentativa++) {
    if (tentativa > 0) {
      await new Promise((r) => setTimeout(r, ESPERA_MS * tentativa));
    }

    try {
      const res = await fetch("/api/airdrop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assinatura, carteira }),
      });

      if (res.ok) {
        const d = (await res.json()) as PontosGanhos;
        return d;
      }

      /*
       * 422 é "a rede ainda não confirma o que você disse" — vale tentar de
       * novo. Qualquer outro código é problema que repetir não resolve.
       */
      if (res.status !== 422) return null;
    } catch {
      /* rede oscilou: cai na próxima tentativa */
    }
  }

  return null;
}
