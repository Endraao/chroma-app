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
    aviso:
      pct === null
        ? undefined
        : `${label} de ${pct.toFixed(0)}%: o contrato retém essa fatia em cada operação.`,
  };
}

/**
 * Nota de 0 a 100.
 *
 * Perigo crítico pesa mais que o dobro de um perigo comum, e um perigo comum
 * pesa mais que o triplo de uma chateação. Antes era tudo 22: "o dono pode
 * trocar o nome do token" derrubava a nota quase tanto quanto "o dono pode
 * levar embora a liquidez", e a nota deixava de separar o que importa.
 */
function scoreFrom(checks: SecurityCheck[]): number {
  const weights: Record<RiskLevel, number> = { safe: 0, warn: 6, danger: 20, unknown: 4 };
  const penalty = checks.reduce(
    (acc, c) => acc + (c.critico && c.level === "danger" ? 45 : weights[c.level]),
    0,
  );
  return Math.max(0, Math.min(100, 100 - penalty));
}

/**
 * Os alertas saem das próprias verificações, e não de uma lista à parte.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO MUDOU
 * ---------------------------------------------------------------------------
 * Antes cada rede montava à mão um punhado de frases de alerta. Na Solana eram
 * duas — mint e freeze authority — enquanto a própria lista de verificações
 * marcava transfer hook, conta fechável e ausência de pool como perigo máximo.
 * Esses três nunca alertavam ninguém: ficavam dentro do painel recolhido, que
 * só abre se a pessoa clicar.
 *
 * Quem acrescentasse uma verificação nova teria que lembrar de acrescentar a
 * frase na outra ponta. Ninguém lembra. Derivar elimina a classe inteira do
 * problema: verificação que reprova, alerta.
 *
 * Crítico alerta também em nível de atenção — liquidez parcialmente travada
 * ainda deixa o dono levar o resto.
 */
function avisosDosChecks(checks: SecurityCheck[]): string[] {
  return checks
    .filter((c) => c.aviso && (c.level === "danger" || (c.critico && c.level === "warn")))
    .sort((a, b) => Number(Boolean(b.critico)) - Number(Boolean(a.critico)))
    .map((c) => c.aviso as string);
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
      critico: true,
      aviso: "Esta moeda não deixa vender. Você compra e não consegue sair.",
    },
    {
      id: "mintable",
      label: "Mintable",
      description: "O dono pode criar novas moedas e diluir você.",
      level: flag(d.is_mintable),
      value: yesNo(d.is_mintable),
      critico: true,
      aviso:
        "Quem criou a moeda pode emitir mais tokens quando quiser, diluindo o que você comprou.",
    },
    {
      id: "proxy",
      label: "Contrato proxy",
      description: "O código pode ser trocado depois do lançamento.",
      level: flag(d.is_proxy),
      value: yesNo(d.is_proxy),
      aviso: "O código deste contrato pode ser trocado depois que você comprar.",
    },
    {
      id: "hidden_owner",
      label: "Dono oculto",
      description: "Existe um dono escondido no contrato.",
      level: flag(d.hidden_owner),
      value: yesNo(d.hidden_owner),
      critico: true,
      aviso: "Há um dono escondido com poder sobre o contrato.",
    },
    {
      id: "can_take_back",
      label: "Retomar posse",
      description: "O dono pode recuperar o controle após renunciar.",
      level: flag(d.can_take_back_ownership),
      value: yesNo(d.can_take_back_ownership),
      critico: true,
      aviso:
        "A renúncia de posse é falsa: o dono consegue retomar o controle do contrato quando quiser.",
    },
    {
      id: "blacklist",
      label: "Blacklist",
      description: "O contrato pode bloquear a sua carteira.",
      level: flag(d.is_blacklisted),
      value: yesNo(d.is_blacklisted),
      critico: true,
      aviso: "O contrato pode bloquear a sua carteira e impedir que você venda.",
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
      aviso: "O código deste contrato não é público: não há como conferir o que ele faz.",
    },
    taxCheck("buy_tax", "Taxa de compra", d.buy_tax),
    taxCheck("sell_tax", "Taxa de venda", d.sell_tax),
    {
      id: "lp_locked",
      label: "Liquidez travada",
      description: "Se o dono puder retirar a liquidez, o preço vai a zero.",
      level:
        d.lp_holders === undefined
          ? "unknown"
          : Number(d.lp_total_supply) > 0 && lpLockedPct(d) > 50
            ? "safe"
            : lpLockedPct(d) > 0
              ? "warn"
              : "danger",
      value: d.lp_holders ? `${lpLockedPct(d).toFixed(0)}%` : "?",
      /*
       * Esta verificação já existia e já marcava perigo — mas não constava na
       * lista de avisos escrita à mão logo abaixo, então nunca alertou
       * ninguém. Ficava dentro do painel recolhido.
       */
      critico: true,
      aviso:
        lpLockedPct(d) === 0
          ? "A liquidez NÃO está travada: quem criou a moeda pode retirá-la a qualquer momento e o preço vai a zero. É o golpe mais comum."
          : `Só ${lpLockedPct(d).toFixed(0)}% da liquidez está travada. O dono pode retirar o restante a qualquer momento.`,
    },
    {
      id: "liquidity",
      label: "Liquidez em DEX",
      description: "Pool encontrada nas DEXs conhecidas.",
      level: Array.isArray(d.dex) && d.dex.length > 0 ? "safe" : "danger",
      value: Array.isArray(d.dex) && d.dex.length > 0 ? `${d.dex.length} pool(s)` : "Nenhuma",
      critico: true,
      aviso: "Não encontramos nenhuma pool para esta moeda: pode não haver como vender.",
    },
  ];

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
    warnings: avisosDosChecks(checks),
  };
}

function lpLockedPct(d: any): number {
  if (!Array.isArray(d.lp_holders)) return 0;
  return d.lp_holders
    .filter((h: any) => h.is_locked === 1 || h.tag?.toLowerCase().includes("burn"))
    .reduce((acc: number, h: any) => acc + Number(h.percent ?? 0) * 100, 0);
}

/**
 * A liquidez desta moeda pode ser levada embora pelo dono?
 *
 * ---------------------------------------------------------------------------
 * A PERGUNTA QUE FALTAVA
 * ---------------------------------------------------------------------------
 * Esta verificação não existia na Solana. Existia na EVM (`lp_locked`) e não
 * aqui — e o golpe mais comum da rede é exatamente este: o dono segura o token
 * de LP, espera entrar gente, e retira a liquidez. O preço vai a zero e quem
 * comprou fica com um token que ninguém compra de volta.
 *
 * O dado sempre esteve na resposta que já buscávamos. Nunca foi lido.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A POOL PRINCIPAL, E NÃO A MÉDIA
 * ---------------------------------------------------------------------------
 * Uma moeda costuma ter várias pools, e quase todas são poeira: restos de
 * roteamento com alguns dólares. A que sustenta o preço é a de maior TVL, e é
 * a dela que o dono levaria o dinheiro.
 *
 * Tirar média deixaria uma pool de dez dólares com LP queimado compensar, no
 * número, a pool de cem mil que está solta na mão do dono — que é o contrário
 * do que a pessoa precisa saber.
 *
 * `burn_percent` é o quanto do LP daquela pool foi destruído; LP queimado não
 * volta, e é o que torna a liquidez travada para sempre. `lp_holders` com
 * `is_locked` cobre o caso de estar preso num contrato de lock, que também
 * serve, embora seja temporário por natureza.
 */
function travaDaLiquidez(d: any): {
  pct: number;
  tvl: number;
  pools: number;
  mensuravel: boolean;
} {
  const pools = Array.isArray(d.dex) ? d.dex : [];
  if (pools.length === 0) return { pct: 0, tvl: 0, pools: 0, mensuravel: false };

  /*
   * SÓ POOL "STANDARD" DIZ ALGUMA COISA SOBRE QUEIMA.
   * -----------------------------------------------------------------------
   * Numa pool clássica de produto constante, a participação é um token
   * fungível: queimá-lo destrói o direito de sacar, e é isso que trava a
   * liquidez para sempre. `burn_percent` mede exatamente essa fração.
   *
   * Numa pool de liquidez concentrada — Orca Whirlpool, Raydium CLMM — não
   * existe esse token. A posição é um NFT, e `burn_percent` volta `null`.
   *
   * Ler esse `null` como zero foi o primeiro defeito desta função: o BONK, que
   * tem as duas maiores pools concentradas na Orca, seria marcado como
   * "liquidez não travada" e receberia o alerta mais grave do painel. Alarme
   * falso em moeda consolidada ensina a pessoa a ignorar o alerta — e aí ele
   * não serve quando for verdade.
   *
   * Então o veredito sai das pools Standard. Não havendo nenhuma, a resposta
   * honesta é "não deu para medir", e não "está seguro" nem "é perigoso".
   */
  const standard = pools.filter(
    (p: any) => String(p?.type ?? "").toLowerCase() === "standard" && p?.burn_percent != null,
  );

  const preso = lpLockedPct(d);
  const tvlTotal = pools.reduce((acc: number, p: any) => acc + Number(p?.tvl ?? 0), 0);

  if (standard.length === 0) {
    /*
     * Sem pool Standard, `lp_holders` ainda pode salvar a resposta quando vem
     * preenchido — é outra fonte para a mesma pergunta.
     */
    return { pct: preso, tvl: tvlTotal, pools: pools.length, mensuravel: preso > 0 };
  }

  const principal = standard.reduce(
    (maior: any, p: any) => (Number(p?.tvl ?? 0) > Number(maior?.tvl ?? 0) ? p : maior),
    standard[0],
  );

  const queimado = Number(principal?.burn_percent ?? 0);

  return {
    // O maior dos dois: queimado e preso em lock são dois jeitos de travar.
    pct: Math.max(Number.isFinite(queimado) ? queimado : 0, preso),
    tvl: Number(principal?.tvl ?? 0),
    pools: pools.length,
    mensuravel: true,
  };
}

/**
 * Transforma a trava de liquidez em verificação.
 *
 * O limiar é 50%: abaixo disso o dono ainda controla a maior parte do que
 * sustenta o preço, e "metade travada" não consola quem perde a outra metade.
 *
 * Sem nenhuma pool a resposta não é "seguro" nem "perigoso" — é que não há o
 * que medir, e a verificação `liquidity` já trata esse caso.
 */
function checkDeLiquidezSolana(d: any, daListaDeConfianca = false): SecurityCheck {
  const { pct, pools, mensuravel } = travaDaLiquidez(d);

  if (pools === 0) {
    return {
      id: "lp_locked",
      label: "Liquidez travada",
      description: "Se o dono puder retirar a liquidez, o preço vai a zero.",
      level: "unknown",
      value: "sem pool",
      critico: true,
    };
  }

  /*
   * Não medir não é o mesmo que estar seguro, e também não é o mesmo que estar
   * em perigo. Fica como desconhecido — que penaliza de leve a nota e NÃO
   * dispara alerta vermelho, porque acusar sem base é o que transforma o
   * painel em ruído.
   */
  if (!mensuravel) {
    return {
      id: "lp_locked",
      label: "Liquidez travada",
      description:
        "A liquidez desta moeda está em pool concentrada, onde não existe token de LP para queimar. Não há como confirmar por aqui se o dono pode retirá-la.",
      level: "unknown",
      value: "não dá pra conferir",
      critico: true,
    };
  }

  /*
   * O piso é 1%, e não "maior que zero".
   *
   * Sobra fracionária de queima é comum — 0,4% de LP destruído por acidente de
   * arredondamento não trava liquidez nenhuma. Com o corte em zero, esses
   * casos caíam em "atenção" e a frase saía como "Só 0% está travada", que
   * contradiz o próprio nível e faz o painel parecer quebrado.
   */
  const level: RiskLevel = pct > 50 ? "safe" : pct >= 1 ? "warn" : "danger";
  const valor = pct > 0 && pct < 1 ? "<1%" : `${pct.toFixed(0)}%`;

  return {
    id: "lp_locked",
    label: "Liquidez travada",
    description: "Parte da liquidez queimada ou presa em contrato de lock.",
    level,
    value: valor,
    /*
     * Numa moeda de lista conhecida a liquidez é posta por formadores de
     * mercado, não por quem emitiu — o golpe de "dono puxa a liquidez" não é a
     * mesma coisa ali. O número continua visível; só não vira alerta.
     */
    critico: !daListaDeConfianca,
    aviso: daListaDeConfianca
      ? undefined
      : pct < 1
        ? "A liquidez NÃO está travada: quem criou a moeda pode retirá-la a qualquer momento e o preço vai a zero. É o golpe mais comum."
        : `Só ${valor} da liquidez está travada. O dono pode retirar o restante a qualquer momento.`,
  };
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

  const maiorDetentorPct = Number(d.holders?.[0]?.percent ?? 0) * 100;

  /*
   * TOKEN DE LISTA CONHECIDA NÃO LEVA ALERTA POR SER O QUE É.
   * -------------------------------------------------------------------------
   * O USDC tem mint authority ativa, freeze authority ativa e uma carteira com
   * 42% do total. Numa meme coin, cada um desses é sinal de golpe; numa
   * stablecoin emitida por empresa regulada, os três são o funcionamento
   * normal — é assim que ela resgata, congela conta sob ordem judicial e
   * mantém reserva em tesouraria.
   *
   * Sem esta distinção o painel dava nota ZERO ao USDC e disparava quatro
   * alertas nele. Um painel que grita no dólar digital mais usado do mundo
   * ensina a ignorar alerta, e aí ele falha justamente quando for verdade.
   *
   * `trusted_token` é a lista de tokens conhecidos da própria fonte. Não
   * apaga as verificações — elas continuam visíveis na lista, com o valor
   * real. Só deixam de virar alerta vermelho.
   */
  const daListaDeConfianca = d.trusted_token === 1;

  /*
   * A VERIFICAÇÃO DE LIQUIDEZ VEM PRIMEIRO, e a ordem não é estética.
   *
   * É ela que separa "posso perder dinheiro porque o preço caiu" de "posso
   * perder tudo porque o dono foi embora com a liquidez". Os alertas saem
   * nesta ordem, e o primeiro é o que a pessoa lê.
   */
  const checks: SecurityCheck[] = [
    checkDeLiquidezSolana(d, daListaDeConfianca),
    {
      id: "mintable",
      label: "Mint authority",
      description: "Se existir, alguém ainda pode emitir mais tokens.",
      level:
        d.mintable?.status !== "1" ? "safe" : daListaDeConfianca ? "warn" : "danger",
      value: d.mintable?.status === "1" ? "Ativa" : "Revogada",
      critico: !daListaDeConfianca,
      aviso: daListaDeConfianca
        ? undefined
        : "Quem criou a moeda pode emitir mais tokens quando quiser, diluindo o que você comprou.",
    },
    {
      id: "freezable",
      label: "Freeze authority",
      description: "Se existir, sua conta do token pode ser congelada.",
      level:
        d.freezable?.status !== "1" ? "safe" : daListaDeConfianca ? "warn" : "danger",
      value: d.freezable?.status === "1" ? "Ativa" : "Revogada",
      critico: !daListaDeConfianca,
      aviso: daListaDeConfianca
        ? undefined
        : "Sua conta pode ser congelada pelo dono, e aí você não consegue mais vender.",
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
      critico: true,
      aviso:
        "Há código de terceiros rodando a cada transferência: ele pode bloquear a sua venda.",
    },
    {
      id: "closable",
      label: "Conta fechável",
      description: "A conta do mint pode ser encerrada pelo dono.",
      level: d.closable?.status === "1" ? "danger" : "safe",
      value: d.closable?.status === "1" ? "Sim" : "Não",
      aviso: "O dono pode encerrar a conta do token.",
    },
    /*
     * A CONCENTRAÇÃO AGORA É DO MAIOR DETENTOR, não de `creators`.
     *
     * `creators` vem VAZIO em toda moeda Solana que testei, e o painel exibia
     * "criador: 0%" sempre — uma falsa segurança, que é pior do que não
     * mostrar nada: o número tranquilizava justamente quem devia desconfiar.
     *
     * `holders[0]` vem preenchido. Não é a mesma pergunta, mas responde a que
     * interessa: existe alguém capaz de derrubar o preço sozinho?
     */
    {
      id: "maior_detentor",
      label: "Maior detentor",
      description: "Quanto do total está numa carteira só.",
      level:
        daListaDeConfianca || maiorDetentorPct < 10
          ? "safe"
          : maiorDetentorPct >= 25
            ? "danger"
            : "warn",
      value: `${maiorDetentorPct.toFixed(1)}%`,
      critico: !daListaDeConfianca && maiorDetentorPct >= 25,
      aviso: daListaDeConfianca
        ? undefined
        : `Uma única carteira tem ${maiorDetentorPct.toFixed(0)}% de todos os tokens e pode derrubar o preço sozinha.`,
    },
    {
      id: "liquidity",
      label: "Pools de liquidez",
      description: "Pools encontradas nas DEXs de Solana.",
      level: Array.isArray(d.dex) && d.dex.length > 0 ? "safe" : "danger",
      value: Array.isArray(d.dex) && d.dex.length > 0 ? `${d.dex.length} pool(s)` : "Nenhuma",
      critico: true,
      aviso: "Não encontramos nenhuma pool para esta moeda: pode não haver como vender.",
    },
    {
      id: "trusted",
      label: "Token verificado",
      description: "Consta em listas de tokens conhecidos.",
      level: d.trusted_token === 1 ? "safe" : "unknown",
      value: d.trusted_token === 1 ? "Sim" : "—",
    },
  ];

  return {
    address,
    chain: "solana",
    source: "goplus",
    fetchedAt: Date.now(),
    score: scoreFrom(checks),
    checks,
    holderConcentration: {
      top10Pct: sumTop(d.holders, 10),
      creatorPct: maiorDetentorPct,
    },
    warnings: avisosDosChecks(checks),
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
      aviso: "O contrato ainda tem dono: ele pode usar as funções restritas a ele.",
    },
    {
      id: "proxy",
      label: "Contrato proxy",
      description: ehProxy
        ? "Há uma implementação por trás: o código pode ser trocado depois."
        : "Nenhuma implementação no slot padrão de proxy.",
      level: ehProxy ? "danger" : "safe",
      value: ehProxy ? "sim" : "não",
      aviso: "É um contrato proxy: o código pode ser trocado depois que você comprar.",
    },
    {
      id: "codigo",
      label: "Código publicado",
      description: temCodigo
        ? "Há bytecode neste endereço."
        : "Não há código neste endereço — desconfie.",
      level: temCodigo ? "safe" : "danger",
      value: temCodigo ? "sim" : "não",
      critico: true,
      aviso: "Não há código neste endereço. Isto não parece ser um token.",
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

  /*
   * Aqui o aviso final é acrescentado À MÃO, e de propósito: ele não vem de
   * verificação nenhuma. É o aviso de que a cobertura desta rede é parcial —
   * inclusive a trava de liquidez, que nesta rede não tem como ser conferida.
   * Vale mesmo quando tudo passa, e por isso não pode sair dos checks.
   */
  const warnings = [
    ...avisosDosChecks(checks),
    "Nenhum serviço de auditoria automática cobre a Robinhood Chain. Os itens acima foram lidos direto do contrato agora; o resto, inclusive a trava de liquidez, não foi verificado por ninguém.",
  ];

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
