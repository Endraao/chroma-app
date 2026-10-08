import "server-only";

import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";

import { cached } from "@/lib/cache";
import { banco, gravarNoCacheDoBanco, lerDoCacheDoBanco, sql } from "@/lib/db";
import { AFFILIATE_FEE_BPS } from "@/lib/fees";
import { conferirTransacaoDeIndicacao } from "@/lib/ranking-divulgadores";

/**
 * CAMPANHAS PAGAS POR RESULTADO (pedido do dono, 07/10/2026).
 *
 * Um patrocinador (o dev da moeda ou qualquer um) oferece um BÔNUS EXTRA a
 * quem trouxer compradores: "X% do volume que você trouxer, até Y SOL, por Z
 * dias". A Chroma NÃO guarda dinheiro: mostra quem trouxe o quê — cada negócio
 * conferido na blockchain — e quanto o patrocinador deve a cada divulgador; o
 * patrocinador paga direto, da carteira dele, e o pagamento também é conferido
 * na rede. O histórico de quem paga fica público: é a reputação dele.
 *
 * Só Solana por enquanto (a comissão de indicação na Robinhood não dá pra
 * conferir pelo RPC público — ver ranking-divulgadores).
 */
export interface Campanha {
  id: string;
  moeda: string;
  simbolo: string;
  nome: string;
  imagem: string | null;
  patrocinador: string;
  bonusPct: number;
  orcamentoSol: number;
  inicio: number;
  fim: number;
  pagamentos: { carteira: string; sol: number; tx: string; em: number }[];
}

export interface Resultado {
  carteira: string;
  nome: string;
  negocios: number;
  volumeSol: number;
  devidoSol: number;
  pagoSol: number;
}

const CHAVE = "campanhas-v1";

export async function listarCampanhas(): Promise<Campanha[]> {
  return (await lerDoCacheDoBanco<Campanha[]>(CHAVE).catch(() => null)) ?? [];
}

async function salvar(lista: Campanha[]) {
  await gravarNoCacheDoBanco(CHAVE, lista);
}

export { mensagemDaCampanha, lerMensagemDaCampanha } from "@/lib/campanhas-mensagem";
import { lerMensagemDaCampanha as _ler } from "@/lib/campanhas-mensagem";
void _ler;

export async function criarCampanha(c: Omit<Campanha, "id" | "pagamentos">): Promise<Campanha> {
  const lista = await listarCampanhas();
  const nova: Campanha = { ...c, id: `${c.moeda.slice(0, 6)}-${Date.now().toString(36)}`, pagamentos: [] };
  await salvar([nova, ...lista].slice(0, 300));
  return nova;
}

interface LinhaDeEvento {
  wallet: string;
  conta: string | null;
  at: string | number;
  tx_hash: string;
}

/** Quem trouxe o quê, conferido na rede, e quanto o patrocinador deve a cada um. */
export function resultadosDaCampanha(c: Campanha): Promise<{ lista: Resultado[]; devidoTotal: number; pagoTotal: number }> {
  return cached(`campanha-res:${c.id}:${c.pagamentos.length}`, 90_000, async () => {
    const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC;
    if (!rpc?.startsWith("http")) return { lista: [], devidoTotal: 0, pagoTotal: 0 };
    await banco();
    const linhas = (await sql.query(
      `SELECT wallet, conta, at, tx_hash FROM eventos_de_afiliado
        WHERE event = 'trade' AND tx_hash IS NOT NULL AND token_address = $1 AND at >= $2 AND at <= $3
        ORDER BY at ASC LIMIT 2000`,
      [c.moeda, c.inicio, c.fim],
    )) as unknown as LinhaDeEvento[];
    const conexao = new Connection(rpc, { commitment: "confirmed", disableRetryOnRateLimit: true });
    const porQuem = new Map<string, Resultado>();
    for (let i = 0; i < linhas.length; i += 10) {
      const lote = linhas.slice(i, i + 10);
      const r = await Promise.all(lote.map((l) => conferirTransacaoDeIndicacao(conexao, l.tx_hash, l.wallet)));
      r.forEach((conf, j) => {
        if (!conf.ok) return;
        const l = lote[j];
        const d = porQuem.get(l.wallet) ?? {
          carteira: l.wallet,
          nome: l.conta ? `@${l.conta}` : `${l.wallet.slice(0, 4)}…${l.wallet.slice(-4)}`,
          negocios: 0,
          volumeSol: 0,
          devidoSol: 0,
          pagoSol: 0,
        };
        d.negocios++;
        // A comissão comprovada é 0,30% do volume: o volume sai dela, não do declarado.
        d.volumeSol += conf.sol / (AFFILIATE_FEE_BPS / 10_000);
        porQuem.set(l.wallet, d);
      });
    }
    const lista = [...porQuem.values()];
    let devidoBruto = 0;
    for (const d of lista) {
      d.devidoSol = d.volumeSol * (c.bonusPct / 100);
      devidoBruto += d.devidoSol;
    }
    // Orçamento estourou: divide proporcionalmente.
    const fator = devidoBruto > c.orcamentoSol ? c.orcamentoSol / devidoBruto : 1;
    for (const d of lista) {
      d.devidoSol *= fator;
      d.pagoSol = c.pagamentos.filter((p) => p.carteira === d.carteira).reduce((s, p) => s + p.sol, 0);
    }
    lista.sort((a, b) => b.devidoSol - a.devidoSol);
    return {
      lista,
      devidoTotal: lista.reduce((s, d) => s + d.devidoSol, 0),
      pagoTotal: c.pagamentos.reduce((s, p) => s + p.sol, 0),
    };
  });
}

/**
 * Registra um pagamento do patrocinador — só depois de conferir na rede que a
 * transação existe, deu certo, foi ASSINADA pelo patrocinador e mandou SOL
 * pra essas carteiras.
 */
export async function registrarPagamento(id: string, tx: string): Promise<{ ok: boolean; erro?: string; sol?: number }> {
  const lista = await listarCampanhas();
  const c = lista.find((x) => x.id === id);
  if (!c) return { ok: false, erro: "campanha não encontrada" };
  if (c.pagamentos.some((p) => p.tx === tx)) return { ok: true, sol: 0 };
  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC;
  if (!rpc?.startsWith("http")) return { ok: false, erro: "sem rpc" };
  const conexao = new Connection(rpc, { commitment: "confirmed", disableRetryOnRateLimit: true });
  const t = await conexao.getParsedTransaction(tx, { maxSupportedTransactionVersion: 1, commitment: "confirmed" }).catch(() => null);
  if (!t?.meta || t.meta.err) return { ok: false, erro: "transação não encontrada ou falhou" };
  const contas = t.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
  if (contas[0] !== c.patrocinador) return { ok: false, erro: "não foi assinada pelo patrocinador" };
  const novos: Campanha["pagamentos"] = [];
  contas.forEach((conta, i) => {
    if (i === 0) return;
    const sol = (t.meta!.postBalances[i] - t.meta!.preBalances[i]) / LAMPORTS_PER_SOL;
    if (sol > 0) novos.push({ carteira: conta, sol, tx, em: (t.blockTime ?? 0) * 1000 });
  });
  if (!novos.length) return { ok: false, erro: "nenhum SOL enviado" };
  c.pagamentos.push(...novos);
  await salvar(lista);
  return { ok: true, sol: novos.reduce((s, p) => s + p.sol, 0) };
}
