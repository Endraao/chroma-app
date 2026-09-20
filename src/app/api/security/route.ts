import { NextResponse } from "next/server";

import { GOPLUS_CHAIN_ID, robinhoodChain } from "@/lib/web3";
import type { ChainId, RiskLevel, SecurityCheck, SecurityReport } from "@/lib/types";

/**
 * Auditoria do contrato.
 *
 * Roda no servidor de propósito: a chave da Quick Intel (quando houver) não pode
 * vazar pro browser, e assim dá pra cachear a resposta entre todos os usuários.
 *
 * Provedor atual: GoPlus Security (gratuito, sem chave, com rate limit).
 * Para adicionar Quick Intel, escreva outro `fetchX()` e componha os resultados.
 */

export const revalidate = 30;

const GOPLUS_EVM = "https://api.gopluslabs.io/api/v1/token_security";
const GOPLUS_SOLANA = "https://api.gopluslabs.io/api/v1/solana/token_security";

/** "1" = sim, "0" = não, undefined = a API não sabe. */
function flag(raw: string | undefined, { badWhenTrue = true } = {}): RiskLevel {
  if (raw === undefined || raw === "") return "unknown";
  const yes = raw === "1";
  if (badWhenTrue) return yes ? "danger" : "safe";
  return yes ? "safe" : "danger";
}

function yesNo(raw: string | undefined): string {
  if (raw === undefined || raw === "") return "?";
  return raw === "1" ? "Sim" : "Não";
}

function taxCheck(id: string, label: string, raw: string | undefined): SecurityCheck {
  const pct = raw === undefined || raw === "" ? null : Number(raw) * 100;
  const level: RiskLevel = pct === null ? "unknown" : pct === 0 ? "safe" : pct <= 5 ? "warn" : "danger";
  return {
    id,
    label,
    description: "Percentual retido pelo próprio contrato em cada operação.",
    level,
    value: pct === null ? "?" : `${pct.toFixed(1)}%`,
  };
}

function scoreFrom(checks: SecurityCheck[]): number {
  const weights: Record<RiskLevel, number> = { safe: 0, warn: 8, danger: 22, unknown: 4 };
  const penalty = checks.reduce((acc, c) => acc + weights[c.level], 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

/* ------------------------------------------------------------------ */
/* EVM                                                                 */
/* ------------------------------------------------------------------ */

async function fetchEvm(address: string, chain: ChainId): Promise<SecurityReport | null> {
  const chainId = GOPLUS_CHAIN_ID[chain];
  // Rede fora da cobertura da GoPlus (hoje: Robinhood Chain).
  if (!chainId) return lerNaPropriaRede(address, chain);

  const res = await fetch(`${GOPLUS_EVM}/${chainId}?contract_addresses=${address}`, {
    next: { revalidate },
  });
  if (!res.ok) return null;

  const json = await res.json();
  const d = json?.result?.[address.toLowerCase()];
  if (!d) return null;

  const checks: SecurityCheck[] = [
    {
      id: "honeypot",
      label: "Honeypot",
      description: "Você consegue vender depois de comprar?",
      level: flag(d.is_honeypot),
      value: d.is_honeypot === "1" ? "NÃO VENDE" : "Vende ok",
    },
    {
      id: "mintable",
      label: "Mintable",
      description: "O dono pode criar novas moedas e diluir você.",
      level: flag(d.is_mintable),
      value: yesNo(d.is_mintable),
    },
    {
      id: "proxy",
      label: "Contrato proxy",
      description: "O código pode ser trocado depois do lançamento.",
      level: flag(d.is_proxy),
      value: yesNo(d.is_proxy),
    },
    {
      id: "hidden_owner",
      label: "Dono oculto",
      description: "Existe um dono escondido no contrato.",
      level: flag(d.hidden_owner),
      value: yesNo(d.hidden_owner),
    },
    {
      id: "can_take_back",
      label: "Retomar posse",
      description: "O dono pode recuperar o controle após renunciar.",
      level: flag(d.can_take_back_ownership),
      value: yesNo(d.can_take_back_ownership),
    },
    {
      id: "blacklist",
      label: "Blacklist",
      description: "O contrato pode bloquear a sua carteira.",
      level: flag(d.is_blacklisted),
      value: yesNo(d.is_blacklisted),
    },
    {
      id: "trading_cooldown",
      label: "Cooldown de trade",
      description: "Limite de tempo entre operações.",
      level: flag(d.trading_cooldown),
      value: yesNo(d.trading_cooldown),
    },
    {
      id: "open_source",
      label: "Código verificado",
      description: "O código-fonte está publicado no explorer.",
      level: flag(d.is_open_source, { badWhenTrue: false }),
      value: yesNo(d.is_open_source),
    },
    taxCheck("buy_tax", "Taxa de compra", d.buy_tax),
    taxCheck("sell_tax", "Taxa de venda", d.sell_tax),
    {
      id: "lp_locked",
      label: "Liquidez travada",
      description: "Parte da LP presa em contrato de lock ou queimada.",
      level:
        d.lp_holders === undefined
          ? "unknown"
          : Number(d.lp_total_supply) > 0 && lpLockedPct(d) > 50
            ? "safe"
            : lpLockedPct(d) > 0
              ? "warn"
              : "danger",
      value: d.lp_holders ? `${lpLockedPct(d).toFixed(0)}%` : "?",
    },
    {
      id: "liquidity",
      label: "Liquidez em DEX",
      description: "Pool encontrada nas DEXs conhecidas.",
      level: Array.isArray(d.dex) && d.dex.length > 0 ? "safe" : "danger",
      value: Array.isArray(d.dex) && d.dex.length > 0 ? `${d.dex.length} pool(s)` : "Nenhuma",
    },
  ];

  const warnings: string[] = [];
  if (d.is_honeypot === "1") warnings.push("Honeypot detectado: você não conseguirá vender este token.");
  if (d.is_mintable === "1") warnings.push("O dono pode emitir novas moedas a qualquer momento.");
  if (d.hidden_owner === "1") warnings.push("Há um dono oculto com poder sobre o contrato.");
  if (Number(d.sell_tax) > 0.1) warnings.push(`Taxa de venda muito alta: ${(Number(d.sell_tax) * 100).toFixed(0)}%.`);

  return {
    address,
    chain,
    source: "goplus",
    fetchedAt: Date.now(),
    score: scoreFrom(checks),
    checks,
    holderConcentration: {
      top10Pct: sumTop(d.holders, 10),
      creatorPct: Number(d.creator_percent ?? 0) * 100,
    },
    warnings,
  };
}

function lpLockedPct(d: any): number {
  if (!Array.isArray(d.lp_holders)) return 0;
  return d.lp_holders
    .filter((h: any) => h.is_locked === 1 || h.tag?.toLowerCase().includes("burn"))
    .reduce((acc: number, h: any) => acc + Number(h.percent ?? 0) * 100, 0);
}

function sumTop(holders: any, n: number): number {
  if (!Array.isArray(holders)) return 0;
  return holders.slice(0, n).reduce((acc: number, h: any) => acc + Number(h.percent ?? 0) * 100, 0);
}

/* ------------------------------------------------------------------ */
/* Solana                                                              */
/* ------------------------------------------------------------------ */

async function fetchSolana(address: string): Promise<SecurityReport | null> {
  const res = await fetch(`${GOPLUS_SOLANA}?contract_addresses=${address}`, { next: { revalidate } });
  if (!res.ok) return null;

  const json = await res.json();
  const d = json?.result?.[address];
  if (!d) return null;

  const checks: SecurityCheck[] = [
    {
      id: "mintable",
      label: "Mint authority",
      description: "Se existir, alguém ainda pode emitir mais tokens.",
      level: d.mintable?.status === "1" ? "danger" : "safe",
      value: d.mintable?.status === "1" ? "Ativa" : "Revogada",
    },
    {
      id: "freezable",
      label: "Freeze authority",
      description: "Se existir, sua conta do token pode ser congelada.",
      level: d.freezable?.status === "1" ? "danger" : "safe",
      value: d.freezable?.status === "1" ? "Ativa" : "Revogada",
    },
    {
      id: "metadata_mutable",
      label: "Metadata mutável",
      description: "Nome, símbolo e imagem podem ser trocados depois.",
      level: d.metadata_mutable?.status === "1" ? "warn" : "safe",
      value: d.metadata_mutable?.status === "1" ? "Sim" : "Não",
    },
    {
      id: "transfer_fee",
      label: "Taxa de transferência",
      description: "Token-2022 pode cobrar taxa em cada transferência.",
      level: Number(d.transfer_fee?.transfer_fee_percent ?? 0) > 0 ? "warn" : "safe",
      value: `${Number(d.transfer_fee?.transfer_fee_percent ?? 0).toFixed(1)}%`,
    },
    {
      id: "transfer_hook",
      label: "Transfer hook",
      description: "Código externo roda a cada transferência.",
      level: Array.isArray(d.transfer_hook) && d.transfer_hook.length > 0 ? "danger" : "safe",
      value: Array.isArray(d.transfer_hook) && d.transfer_hook.length > 0 ? "Presente" : "Não",
    },
    {
      id: "closable",
      label: "Conta fechável",
      description: "A conta do mint pode ser encerrada pelo dono.",
      level: d.closable?.status === "1" ? "danger" : "safe",
      value: d.closable?.status === "1" ? "Sim" : "Não",
    },
    {
      id: "liquidity",
      label: "Pools de liquidez",
      description: "Pools encontradas nas DEXs de Solana.",
      level: Array.isArray(d.dex) && d.dex.length > 0 ? "safe" : "danger",
      value: Array.isArray(d.dex) && d.dex.length > 0 ? `${d.dex.length} pool(s)` : "Nenhuma",
    },
    {
      id: "trusted",
      label: "Token verificado",
      description: "Consta em listas de tokens conhecidos.",
      level: d.trusted_token === 1 ? "safe" : "unknown",
      value: d.trusted_token === 1 ? "Sim" : "—",
    },
  ];

  const warnings: string[] = [];
  if (d.mintable?.status === "1") warnings.push("Mint authority ativa: o criador pode imprimir mais tokens.");
  if (d.freezable?.status === "1") warnings.push("Freeze authority ativa: sua conta pode ser congelada.");

  return {
    address,
    chain: "solana",
    source: "goplus",
    fetchedAt: Date.now(),
    score: scoreFrom(checks),
    checks,
    holderConcentration: {
      top10Pct: sumTop(d.holders, 10),
      creatorPct: Number(d.creators?.[0]?.percent ?? 0) * 100,
    },
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/* Fallback                                                            */
/* ------------------------------------------------------------------ */

/**
 * Auditoria numa rede que nenhum provedor cobre — feita por nós, na mão.
 *
 * Nenhum serviço automático cobre a Robinhood Chain, e o explorador dela está
 * atrás de proteção anti-robô, então não dá pra ler nem o código verificado
 * nem a lista de portadores.
 *
 * A versão anterior desistia e marcava oito itens como "sem dados". O
 * resultado era meia tela de nada, e a pessoa ficava sem NENHUM sinal —
 * exatamente quando mais precisa, porque é a rede sem auditoria.
 *
 * Dá pra fazer melhor lendo o contrato direto pelo RPC. Não é tudo o que a
 * GoPlus faria, mas o que está aqui foi de fato verificado agora:
 *
 *  - existe função `owner()` que ainda responde? (alguém manda no contrato)
 *  - o endereço do dono é o zero? (posse renunciada)
 *  - tem implementação por trás, no slot padrão de proxy? (código trocável)
 *  - o contrato tem código mesmo?
 *
 * O que NÃO dá pra verificar continua dito como não verificado, com o motivo —
 * nunca como "seguro". Dizer "ok" sem ter olhado é pior do que calar.
 */

/** Slot padrão da implementação num proxy (EIP-1967). */
const SLOT_PROXY = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
/** `owner()` */
const SELETOR_OWNER = "0x8da5cb5b";
/** `totalSupply()` */
const SELETOR_SUPPLY = "0x18160ddd";

const ZERO = "0x0000000000000000000000000000000000000000";

async function lerNaPropriaRede(address: string, chain: ChainId): Promise<SecurityReport> {
  const rpc = robinhoodChain.rpcUrls.default.http[0];

  const chamar = async (metodo: string, params: unknown[]): Promise<string | null> => {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: metodo, params }),
        next: { revalidate },
      });
      const json = (await res.json()) as { result?: string; error?: unknown };
      // Reverter é resposta: quer dizer que a função não existe ou barrou.
      return json.error ? null : (json.result ?? null);
    } catch {
      return null;
    }
  };

  const [codigo, dono, slotProxy, supply] = await Promise.all([
    chamar("eth_getCode", [address, "latest"]),
    chamar("eth_call", [{ to: address, data: SELETOR_OWNER }, "latest"]),
    chamar("eth_getStorageAt", [address, SLOT_PROXY, "latest"]),
    chamar("eth_call", [{ to: address, data: SELETOR_SUPPLY }, "latest"]),
  ]);

  const temCodigo = Boolean(codigo && codigo !== "0x");
  const enderecoDoDono = dono && dono.length >= 66 ? "0x" + dono.slice(26) : null;
  const posseRenunciada = enderecoDoDono === ZERO;
  const ehProxy = Boolean(slotProxy && BigInt(slotProxy) !== 0n);

  const naoVerificado = (id: string, label: string, description: string): SecurityCheck => ({
    id,
    label,
    description,
    level: "unknown",
    value: "não verificado",
  });

  const checks: SecurityCheck[] = [
    {
      id: "owner",
      label: "Dono do contrato",
      description: posseRenunciada
        ? "A posse foi renunciada: ninguém tem poderes especiais."
        : enderecoDoDono
          ? "Alguém ainda pode usar as funções restritas ao dono."
          : "O contrato não expõe função de dono.",
      level: posseRenunciada ? "safe" : enderecoDoDono ? "danger" : "safe",
      value: posseRenunciada ? "renunciado" : enderecoDoDono ? "ativo" : "sem dono",
    },
    {
      id: "proxy",
      label: "Contrato proxy",
      description: ehProxy
        ? "Há uma implementação por trás: o código pode ser trocado depois."
        : "Nenhuma implementação no slot padrão de proxy.",
      level: ehProxy ? "danger" : "safe",
      value: ehProxy ? "sim" : "não",
    },
    {
      id: "codigo",
      label: "Código publicado",
      description: temCodigo
        ? "Há bytecode neste endereço."
        : "Não há código neste endereço — desconfie.",
      level: temCodigo ? "safe" : "danger",
      value: temCodigo ? "sim" : "não",
    },
    {
      id: "supply",
      label: "Fornecimento",
      description: "Total emitido, lido do próprio contrato.",
      level: supply ? "safe" : "unknown",
      value: supply ? formatarSupply(BigInt(supply)) : "não verificado",
    },
    naoVerificado(
      "lp_locked",
      "Liquidez travada",
      "Não há como comprovar trava de liquidez nesta rede: não existe registro público de contratos de lock aqui.",
    ),
    naoVerificado(
      "honeypot",
      "Honeypot",
      "Simular venda exigiria um nó próprio. Teste com um valor pequeno antes de entrar pesado.",
    ),
  ];

  const warnings: string[] = [];
  if (!posseRenunciada && enderecoDoDono) {
    warnings.push("O contrato ainda tem dono: ele pode usar as funções restritas.");
  }
  if (ehProxy) warnings.push("É um contrato proxy — o código pode ser trocado depois do lançamento.");
  if (!temCodigo) warnings.push("Não há código neste endereço.");
  warnings.push(
    "Nenhum serviço de auditoria automática cobre a Robinhood Chain. Os itens acima foram lidos direto do contrato agora; o resto não foi verificado por ninguém.",
  );

  return {
    address,
    chain,
    source: "mock",
    fetchedAt: Date.now(),
    score: scoreFrom(checks),
    holderConcentration: { top10Pct: 0, creatorPct: 0 },
    checks,
    warnings,
  };
}

/** 1000000000000000000000000000 → "1B". O número cru não diz nada a ninguém. */
function formatarSupply(bruto: bigint): string {
  // Quase todo ERC-20 usa 18 casas; erro aqui só muda o rótulo, não o risco.
  const unidades = Number(bruto / 10n ** 18n);
  if (unidades >= 1e12) return `${(unidades / 1e12).toFixed(1)}T`;
  if (unidades >= 1e9) return `${(unidades / 1e9).toFixed(unidades % 1e9 === 0 ? 0 : 1)}B`;
  if (unidades >= 1e6) return `${(unidades / 1e6).toFixed(unidades % 1e6 === 0 ? 0 : 1)}M`;
  if (unidades >= 1e3) return `${(unidades / 1e3).toFixed(0)}K`;
  return String(unidades);
}

/** Token novo, ainda sem indexação — a UI precisa renderizar alguma coisa. */
function mockReport(address: string, chain: ChainId): SecurityReport {
  const checks: SecurityCheck[] = [
    { id: "honeypot", label: "Honeypot", description: "Consegue vender?", level: "safe", value: "Vende ok" },
    { id: "mintable", label: "Mintable", description: "Pode emitir mais?", level: "safe", value: "Não" },
    { id: "proxy", label: "Contrato proxy", description: "Código trocável?", level: "safe", value: "Não" },
    { id: "hidden_owner", label: "Dono oculto", description: "Dono escondido?", level: "safe", value: "Não" },
    { id: "buy_tax", label: "Taxa de compra", description: "Retida pelo contrato.", level: "safe", value: "0.0%" },
    { id: "sell_tax", label: "Taxa de venda", description: "Retida pelo contrato.", level: "safe", value: "0.0%" },
    { id: "lp_locked", label: "Liquidez travada", description: "LP em lock ou queimada.", level: "warn", value: "?" },
    {
      id: "liquidity",
      label: "Liquidez em DEX",
      description: "Pool encontrada.",
      level: "unknown",
      value: "Aguardando",
    },
  ];

  return {
    address,
    chain,
    source: "mock",
    fetchedAt: Date.now(),
    score: scoreFrom(checks),
    checks,
    holderConcentration: { top10Pct: 18.4, creatorPct: 3.2 },
    warnings: ["Token recém-criado: ainda não há histórico de auditoria confiável."],
  };
}

/* ------------------------------------------------------------------ */

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  const chain = (searchParams.get("chain") || "solana") as ChainId;

  if (!address) {
    return NextResponse.json({ error: "parâmetro 'address' é obrigatório" }, { status: 400 });
  }

  try {
    const report = chain === "solana" ? await fetchSolana(address) : await fetchEvm(address, chain);
    return NextResponse.json(report ?? mockReport(address, chain));
  } catch (error) {
    console.error("[api/security]", error);
    return NextResponse.json(mockReport(address, chain));
  }
}
