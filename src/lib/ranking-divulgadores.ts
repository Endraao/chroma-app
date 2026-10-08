import "server-only";

import { Connection } from "@solana/web3.js";

import { cached } from "@/lib/cache";
import { banco, gravarNoCacheDoBanco, lerDoCacheDoBanco, sql } from "@/lib/db";
import { precosNativos } from "@/lib/precos-nativos";

/**
 * RANKING PÚBLICO DE DIVULGADORES (pedido do dono, 07/10/2026).
 *
 * A proposta: "divulgação que só ganha quando gera compra, comprovado na
 * blockchain" — o contrário do influenciador que cobra adiantado.
 *
 * Por isso NADA aqui confia no que o navegador declarou. Os negócios de
 * indicação são gravados pelo próprio navegador de quem negociou (dá pra
 * mandar número falso); cada um só entra no ranking se a TRANSAÇÃO existe,
 * deu certo e pôs SOL na carteira do divulgador. O ganho mostrado é esse SOL
 * medido na rede, não o declarado. A conferência de cada transação é feita
 * uma vez e guardada.
 *
 * Por enquanto só Solana: na Robinhood a comissão sai por dentro do contrato
 * (transferência interna), que o RPC público não mostra.
 */
export interface Divulgador {
  nome: string;
  carteira: string;
  negocios: number;
  moedas: number;
  ganhoSol: number;
  ganhoUsd: number;
  volumeUsd: number;
  ultimo: number;
}

interface Linha {
  wallet: string;
  conta: string | null;
  at: string | number;
  volume_usd: number | null;
  token_address: string | null;
  tx_hash: string;
}

type Conferido = { ok: boolean; sol: number };

async function conferir(conexao: Connection, tx: string, carteira: string): Promise<Conferido> {
  const chave = `afil-conf:${tx}`;
  const guardado = await lerDoCacheDoBanco<Conferido>(chave).catch(() => null);
  if (guardado) return guardado;
  const t = await conexao.getParsedTransaction(tx, { maxSupportedTransactionVersion: 1, commitment: "confirmed" }).catch(() => undefined);
  if (t === undefined) return { ok: false, sol: 0 }; // RPC falhou: tenta de novo na próxima, sem gravar
  let resultado: Conferido = { ok: false, sol: 0 };
  if (t?.meta && !t.meta.err) {
    const i = t.transaction.message.accountKeys.findIndex((k) => k.pubkey.toBase58() === carteira);
    if (i >= 0) {
      const sol = (t.meta.postBalances[i] - t.meta.preBalances[i]) / 1e9;
      if (sol > 0) resultado = { ok: true, sol };
    }
  }
  // Transação que não existe ainda pode ser lag do nó: só grava o "não" se ela existe.
  if (t) await gravarNoCacheDoBanco(chave, resultado).catch(() => {});
  return resultado;
}

export function rankingDeDivulgadores(dias: number | null): Promise<Divulgador[]> {
  return cached(`ranking-divulgadores:${dias ?? "tudo"}`, 120_000, async () => {
    const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC;
    if (!rpc?.startsWith("http")) return [];
    await banco();
    const desde = dias ? Date.now() - dias * 86_400_000 : 0;
    const linhas = (await sql.query(
      `SELECT wallet, conta, at, volume_usd, token_address, tx_hash
         FROM eventos_de_afiliado
        WHERE event = 'trade' AND tx_hash IS NOT NULL AND (chain = 'solana' OR chain IS NULL) AND at >= $1
        ORDER BY at DESC
        LIMIT 600`,
      [desde],
    )) as unknown as Linha[];

    const conexao = new Connection(rpc, { commitment: "confirmed", disableRetryOnRateLimit: true });
    const conferidos: (Conferido & { l: Linha })[] = [];
    for (let i = 0; i < linhas.length; i += 10) {
      const lote = linhas.slice(i, i + 10);
      const r = await Promise.all(lote.map((l) => conferir(conexao, l.tx_hash, l.wallet)));
      r.forEach((c, j) => conferidos.push({ ...c, l: lote[j] }));
    }

    const sol = (await precosNativos().catch(() => null))?.solana ?? 0;
    const porQuem = new Map<string, Divulgador & { _moedas: Set<string> }>();
    for (const { ok, sol: ganho, l } of conferidos) {
      if (!ok) continue;
      const chave = l.conta ?? l.wallet;
      const d =
        porQuem.get(chave) ??
        { nome: l.conta ? `@${l.conta}` : `${l.wallet.slice(0, 4)}…${l.wallet.slice(-4)}`, carteira: l.wallet, negocios: 0, moedas: 0, ganhoSol: 0, ganhoUsd: 0, volumeUsd: 0, ultimo: 0, _moedas: new Set<string>() };
      d.negocios++;
      d.ganhoSol += ganho;
      // Volume declarado só até o que a comissão comprovada permite (menor taxa possível: 0,2%).
      const tetoUsd = (ganho * sol) / 0.002;
      d.volumeUsd += Math.min(Number(l.volume_usd) || 0, tetoUsd);
      if (l.token_address) d._moedas.add(l.token_address);
      d.ultimo = Math.max(d.ultimo, Number(l.at));
      porQuem.set(chave, d);
    }
    return [...porQuem.values()]
      .map(({ _moedas, ...d }) => ({ ...d, moedas: _moedas.size, ganhoUsd: d.ganhoSol * sol }))
      .sort((a, b) => b.ganhoSol - a.ganhoSol)
      .slice(0, 100);
  });
}

/**
 * Os números de UM divulgador (apelido sem "@" ou carteira) pro card de
 * "quanto eu ganhei": a semana, com a posição no ranking, e o total.
 */
export async function ganhosDoDivulgador(id: string) {
  const casa = (d: Divulgador) => d.carteira === id || d.nome.toLowerCase() === `@${id.toLowerCase()}`;
  const [semana, sempre] = await Promise.all([rankingDeDivulgadores(7), rankingDeDivulgadores(null)]);
  const i = semana.findIndex(casa);
  const total = sempre.find(casa) ?? null;
  return {
    nome: total?.nome ?? semana[i]?.nome ?? (id.length > 20 ? `${id.slice(0, 4)}…${id.slice(-4)}` : `@${id}`),
    semana: i >= 0 ? semana[i] : null,
    posicao: i >= 0 ? i + 1 : null,
    total,
  };
}

/** Conferência de UMA transação de indicação (usada também pelas campanhas). */
export const conferirTransacaoDeIndicacao = conferir;
