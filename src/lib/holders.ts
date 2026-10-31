import "server-only";

import { Connection, PublicKey } from "@solana/web3.js";

import { cached } from "@/lib/cache";
import { buscarMoedaDaChroma } from "@/lib/db";

/**
 * OS MAIORES HOLDERS DE VERDADE (17/10/2026: "nossa tela de traders é
 * horrível, se inspira na Fomo").
 *
 * A tabela antiga só via os últimos ~300 negócios — numa moeda agitada, três
 * minutos. Aqui é o saldo de agora, lido da rede: as 20 maiores contas do
 * token, com o dono de cada uma e o que ele é (carteira, curva, pool,
 * contrato), e qual delas é o dev.
 */

export type TipoDeHolder = "carteira" | "curva" | "pool" | "contrato";

export interface Holder {
  carteira: string;
  quantidade: number;
  pct: number;
  tipo: TipoDeHolder;
  dev: boolean;
}

export interface QuadroDeHolders {
  lista: Holder[];
  fornecimento: number;
  /** Soma das 10 maiores CARTEIRAS (curva e pools não contam), em %. */
  top10Pct: number;
  /** O que o dev ainda segura, em %; null quando não se sabe quem é o dev. */
  devPct: number | null;
}

const SISTEMA = "11111111111111111111111111111111";
const PUMP = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

/** Programa dono da conta-dona → o que ela é. Curvas e pools não são "baleias". */
const PROGRAMAS: Record<string, TipoDeHolder> = {
  [PUMP]: "curva",
  dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN: "curva",
  pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA: "pool",
  LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo: "pool",
  cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG: "pool",
  Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB: "pool",
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": "pool",
  CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK: "pool",
  CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C: "pool",
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: "pool",
};
/**
 * Autoridades de pool que não têm conta própria (só existem como endereço).
 * Sem elas a curva da Meteora (DBC) aparecia como baleia com 99% e o Top 10
 * dava 100% (31/10/2026).
 */
const AUTORIDADES: Record<string, TipoDeHolder> = {
  "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1": "pool", // Raydium AMM v4
  FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM: "curva", // Meteora DBC
  HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC: "pool", // Meteora DAMM v2
};

/** Quem criou a moeda: o registro da Chroma ou, na pump.fun, o campo da curva. */
async function devDaMoeda(conexao: Connection, mint: PublicKey): Promise<string | null> {
  const daChroma = await buscarMoedaDaChroma(mint.toBase58()).catch(() => null);
  if (daChroma?.criador) return daChroma.criador;
  const [curva] = PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mint.toBuffer()], new PublicKey(PUMP));
  const info = await conexao.getAccountInfo(curva).catch(() => null);
  if (!info || info.data.length < 81) return null;
  return new PublicKey(info.data.subarray(49, 81)).toBase58();
}

export function maioresHolders(endereco: string): Promise<QuadroDeHolders> {
  return cached(`holders:${endereco}`, 30_000, async () => {
    const rpc = process.env.HELIUS_RPC || process.env.NEXT_PUBLIC_SOLANA_RPC;
    if (!rpc) throw new Error("RPC não configurado");
    const conexao = new Connection(rpc, { commitment: "confirmed", disableRetryOnRateLimit: true });
    const mint = new PublicKey(endereco);

    const [maiores, fornecimento, dev] = await Promise.all([
      conexao.getTokenLargestAccounts(mint),
      conexao.getTokenSupply(mint),
      devDaMoeda(conexao, mint),
    ]);
    const total = fornecimento.value.uiAmount ?? 0;
    const contas = maiores.value.filter((c) => (c.uiAmount ?? 0) > 0).slice(0, 20);

    // Conta de token → dono; dono → programa que manda nele.
    const tokenInfos = await conexao.getMultipleParsedAccounts(contas.map((c) => c.address));
    const donos = tokenInfos.value.map((v) => {
      const dados = v?.data as { parsed?: { info?: { owner?: string } } } | undefined;
      return dados?.parsed?.info?.owner ?? null;
    });
    const unicos = [...new Set(donos.filter((d): d is string => Boolean(d)))];
    const donoInfos = await conexao.getMultipleAccountsInfo(unicos.map((d) => new PublicKey(d)));
    const programaDoDono = new Map(unicos.map((d, i) => [d, donoInfos[i]?.owner.toBase58() ?? null]));

    // A mesma carteira pode ter mais de uma conta do token: soma.
    const porDono = new Map<string, Holder>();
    contas.forEach((c, i) => {
      const dono = donos[i];
      if (!dono) return;
      const programa = programaDoDono.get(dono);
      const tipo: TipoDeHolder =
        AUTORIDADES[dono] ?? (programa && programa !== SISTEMA ? (PROGRAMAS[programa] ?? "contrato") : "carteira");
      const anterior = porDono.get(dono);
      const quantidade = (anterior?.quantidade ?? 0) + (c.uiAmount ?? 0);
      porDono.set(dono, { carteira: dono, quantidade, pct: total > 0 ? (quantidade / total) * 100 : 0, tipo, dev: dono === dev });
    });

    const lista = [...porDono.values()].sort((a, b) => b.quantidade - a.quantidade);
    const carteiras = lista.filter((h) => h.tipo === "carteira");
    const top10Pct = carteiras.slice(0, 10).reduce((s, h) => s + h.pct, 0);
    const doDev = lista.find((h) => h.dev);
    return {
      lista,
      fornecimento: total,
      top10Pct,
      // Dev conhecido mas fora das 20 maiores: segura menos que a menor delas — mostra como ~0.
      devPct: dev ? (doDev?.pct ?? 0) : null,
    };
  });
}
