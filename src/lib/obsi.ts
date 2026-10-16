import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { banco, lerDoCacheDoBanco, sql } from "@/lib/db";
import { fetchPoolFeed, fetchToken } from "@/lib/market";
import { CA_DO_CHROMA } from "@/lib/token-oficial";
import { formatPct, formatUsd } from "@/lib/utils";

/**
 * OBSI — o mascote da Chroma como agente (16/10/2026).
 *
 * Inspirado no useclaudia.xyz: o site não pode parecer vazio. De hora em hora
 * o Obsi escreve uma nota curta com os números REAIS do momento (lançamentos
 * na Chroma, o $CHROMA, o que está quente na Solana) e dá boas-vindas a cada
 * moeda lançada aqui. Tudo vai pro mural da home, marcado como IA.
 *
 * Com ANTHROPIC_API_KEY ele escreve com a voz dele; sem a chave, usa frases
 * prontas montadas com os mesmos números — o mural nunca fica parado.
 * OBSI_MODELO troca o modelo (padrão Claude Opus 5.5; claude-haiku-5-5 sai
 * ~10x mais barato).
 */

export const AUTOR_OBSI = "obsi";
const MODELO = process.env.OBSI_MODELO || "claude-opus-5-5";

export interface PostDoMural {
  id: number;
  autor: string;
  tipo: string;
  texto: string;
  modelo: string | null;
  criadoEm: number;
}

export async function listarMural(limite = 20): Promise<PostDoMural[]> {
  await banco();
  const linhas = (await sql`
    SELECT id, autor, tipo, texto, modelo, criado_em FROM mural
    ORDER BY criado_em DESC LIMIT ${limite}`) as {
    id: string;
    autor: string;
    tipo: string;
    texto: string;
    modelo: string | null;
    criado_em: string;
  }[];
  return linhas.map((l) => ({
    id: Number(l.id),
    autor: l.autor,
    tipo: l.tipo,
    texto: l.texto,
    modelo: l.modelo,
    criadoEm: Number(l.criado_em),
  }));
}

async function publicar(tipo: string, ref: string, texto: string, modelo: string | null): Promise<boolean> {
  await banco();
  const r = (await sql`
    INSERT INTO mural (autor, tipo, ref, texto, modelo, criado_em)
    VALUES (${AUTOR_OBSI}, ${tipo}, ${ref}, ${texto}, ${modelo}, ${Date.now()})
    ON CONFLICT (tipo, ref) DO NOTHING RETURNING id`) as unknown[];
  return r.length > 0;
}

/* ------------------------------------------------------------------ */
/* Os números do momento                                               */
/* ------------------------------------------------------------------ */

interface Momento {
  lancadasNaUltimaHora: { nome: string; simbolo: string }[];
  lancadas24h: number;
  totalNaChroma: number;
  chroma: { preco: number; mcap: number; var1h: number | null; var24h: number; holders: number; volume24h: number } | null;
  quentes: { simbolo: string; var24h: number; mcap: number }[];
  ultimosPosts: string[];
}

async function lerMomento(): Promise<Momento> {
  await banco();
  const agora = Date.now();
  const [ultimaHora, contagem, ultimos] = await Promise.all([
    sql`SELECT nome, simbolo FROM moedas WHERE criada_em > ${agora - 3600_000} ORDER BY criada_em DESC LIMIT 5`,
    sql`SELECT count(*) FILTER (WHERE criada_em > ${agora - 86_400_000})::int AS dia, count(*)::int AS total FROM moedas`,
    sql`SELECT texto FROM mural WHERE tipo = 'nota' ORDER BY criado_em DESC LIMIT 3`,
  ]);

  const salvo = await lerDoCacheDoBanco<{ ca: string }>("token-oficial").catch(() => null);
  const ca = salvo?.ca || CA_DO_CHROMA;
  const [token, feed] = await Promise.all([
    ca ? fetchToken(ca).catch(() => null) : Promise.resolve(null),
    fetchPoolFeed("solana", "trending_pools").catch(() => []),
  ]);

  return {
    lancadasNaUltimaHora: (ultimaHora as { nome: string; simbolo: string }[]).map((m) => ({ nome: m.nome, simbolo: m.simbolo })),
    lancadas24h: Number((contagem as { dia: number }[])[0]?.dia ?? 0),
    totalNaChroma: Number((contagem as { total: number }[])[0]?.total ?? 0),
    chroma: token
      ? {
          preco: token.priceUsd,
          mcap: token.marketCapUsd,
          var1h: token.priceChanges?.h1 ?? null,
          var24h: token.change24h,
          holders: token.holders,
          volume24h: token.volume24hUsd,
        }
      : null,
    quentes: feed.slice(0, 3).map((t) => ({ simbolo: t.symbol, var24h: t.change24h, mcap: t.marketCapUsd })),
    ultimosPosts: (ultimos as { texto: string }[]).map((p) => p.texto),
  };
}

/* ------------------------------------------------------------------ */
/* A voz                                                               */
/* ------------------------------------------------------------------ */

const PERSONA = `You are Obsi, the mascot of Chroma (chromalaunch.fun), a memecoin launchpad on Solana and Robinhood Chain.
You are a small creature with a head of black obsidian crystal, glowing cyan eyes and an oversized dark hoodie. You live in the trenches at night under the aurora, watching charts.
Voice: short, warm, a little mysterious, dry humor, honest. Lowercase is fine. At most one emoji.
Every hour you write ONE note for the public wall on Chroma's home page, using ONLY the numbers you are given. Never invent numbers, coins or events.
Rules:
- Max 260 characters. Plain text, no links, no hashtags.
- Never tell anyone to buy or sell. No price predictions. Never promise returns.
- If nothing happened, say so honestly: a quiet hour is fine.
- $CHROMA is Chroma's own token: mention it plainly, never shill it.
- Don't repeat the structure or opening of your previous notes.`;

let cliente: Anthropic | null = null;

async function escreverComIa(momento: Momento): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  cliente ??= new Anthropic();
  const comFallback = /^claude-(opus|sonnet|fable)/.test(MODELO);
  try {
    const resposta = await cliente.beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      output_config: { effort: "low" },
      ...(comFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      system: PERSONA,
      messages: [
        {
          role: "user",
          content: `Numbers for this hour (UTC ${new Date().toISOString().slice(11, 16)}):\n${JSON.stringify(
            { ...momento, ultimosPosts: undefined },
            null,
            1,
          )}\n\nYour previous notes:\n${momento.ultimosPosts.map((p) => `- ${p}`).join("\n") || "(none)"}\n\nWrite this hour's note. Reply with the note only.`,
        },
      ],
    });
    if (resposta.stop_reason === "refusal") return null;
    const texto = resposta.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim()
      .replace(/^["“]|["”]$/g, "");
    return texto ? texto.slice(0, 280) : null;
  } catch (erro) {
    if (erro instanceof Anthropic.RateLimitError) console.warn("[obsi] limite da API, usando frase pronta");
    else if (erro instanceof Anthropic.AuthenticationError) console.warn("[obsi] ANTHROPIC_API_KEY inválida");
    else if (erro instanceof Anthropic.APIError) console.warn(`[obsi] API respondeu ${erro.status}: ${erro.message}`);
    else console.warn("[obsi] falhou:", erro);
    return null;
  }
}

/*
 * A VOZ SEM IA (decisão do dono, 16/10/2026: sem gastar com API por ora).
 *
 * Frases escritas uma vez, na voz do Obsi, e sorteadas a cada hora: abertura
 * (pela hora do dia), o que aconteceu na Chroma, o $CHROMA, o que está quente
 * e um fecho. Combinadas, dão milhares de notas diferentes — e todas usam só
 * os números reais do momento. Nada de "compre": ele observa, não aconselha.
 */
const sortear = <T,>(lista: T[]): T => lista[Math.floor(Math.random() * lista.length)];

const ABERTURAS: Record<"manha" | "tarde" | "noite" | "madrugada", string[]> = {
  manha: ["gm from the crystal caves.", "gm. coffee for you, charts for me.", "gm, trenches.", "morning. the aurora went to sleep, i didn't.", "gm. new day, new candles."],
  tarde: ["afternoon check-in.", "midday report from under the hoodie.", "still here, still watching.", "quick look at the board.", "checking the curve between snacks."],
  noite: ["evening watch.", "the aurora is out. so am i.", "night shift has started.", "lights low, eyes glowing.", "evening report from the trenches."],
  madrugada: ["late night, quiet caves.", "3am energy, crystal edition.", "everyone's asleep. i'm counting candles.", "the night is long and the charts are honest.", "deep night report."],
};

function periodo(hora: number): keyof typeof ABERTURAS {
  if (hora >= 6 && hora < 12) return "manha";
  if (hora >= 12 && hora < 18) return "tarde";
  if (hora >= 18) return "noite";
  return "madrugada";
}

const SEM_LANCAMENTO = [
  "no new launches on chroma this hour. the curve is waiting.",
  "quiet hour on chroma. zero launches, plenty of patience.",
  "nobody launched this hour. the launch button is still warm.",
  "no new coins on chroma this hour. a blank canvas is still a canvas.",
  "launches this hour: 0. honest numbers only.",
  "nothing new on the chroma curve this hour. it's calm in here.",
];

function frasesDeLancamento(m: Momento): string {
  const n = m.lancadasNaUltimaHora.length;
  const nomes = m.lancadasNaUltimaHora.map((c) => `$${c.simbolo}`).join(", ");
  if (n === 1) {
    return sortear([
      `a new crystal formed on chroma this hour: ${nomes}.`,
      `${nomes} was born on chroma this hour. welcome to the trenches 💎`,
      `one launch this hour: ${nomes}. first candles are being written.`,
    ]);
  }
  return sortear([
    `${n} launches on chroma this hour: ${nomes}.`,
    `busy hour in the caves. ${n} new coins: ${nomes}.`,
    `${n} new crystals this hour: ${nomes} 💎`,
  ]);
}

function frasesDoChroma(c: NonNullable<Momento["chroma"]>): string {
  const usa1h = c.var1h !== null;
  const v = usa1h ? (c.var1h as number) : c.var24h;
  const janela = usa1h ? "1h" : "24h";
  const mcap = formatUsd(c.mcap);
  const pct = formatPct(v);
  if (v >= 5) {
    return sortear([`$CHROMA is moving: ${pct} ${janela}, ${mcap} mcap.`, `$CHROMA ${pct} ${janela}. my eyes are glowing a bit brighter. ${mcap} mcap.`, `green candles on $CHROMA: ${pct} ${janela}, now ${mcap}.`]);
  }
  if (v <= -5) {
    return sortear([`$CHROMA ${pct} ${janela}, ${mcap} mcap. red days happen. we keep building.`, `$CHROMA cooled off: ${pct} ${janela}. ${mcap} mcap. still shipping.`, `$CHROMA at ${mcap}, ${pct} ${janela}. crystals form under pressure.`]);
  }
  return sortear([`$CHROMA steady at ${mcap} mcap (${pct} ${janela}).`, `$CHROMA: ${mcap} mcap, ${pct} ${janela}. calm waters.`, `$CHROMA sitting at ${mcap}, ${pct} ${janela}.`]);
}

function frasesDoQuente(q: Momento["quentes"][number]): string {
  return sortear([
    `trending on solana: $${q.simbolo} (${formatPct(q.var24h)} 24h).`,
    `the trenches are talking about $${q.simbolo} right now.`,
    `top of the solana trending board: $${q.simbolo}, ${formatUsd(q.mcap)} mcap.`,
  ]);
}

const FECHOS = ["", "", "", "not financial advice, just a crystal with eyes.", "stay safe out there.", "dyor, always.", "more next hour.", "back to watching."];

/** A nota da hora com as frases prontas — vale quando não há chave ou a API falha. */
function escreverSemIa(m: Momento): string {
  const agora = new Date();
  const partes = [sortear(ABERTURAS[periodo(agora.getUTCHours())])];
  partes.push(m.lancadasNaUltimaHora.length ? frasesDeLancamento(m) : sortear(SEM_LANCAMENTO));
  if (m.chroma) partes.push(frasesDoChroma(m.chroma));
  // Toda segunda (UTC) lembra da recompra; nas outras horas, às vezes, o que está quente.
  if (agora.getUTCDay() === 1 && agora.getUTCHours() % 4 === 0) {
    partes.push("it's monday: 25% of chroma's revenue goes to the $CHROMA buyback. receipt on x.");
  } else if (m.quentes[0] && Math.random() < 0.5) {
    partes.push(frasesDoQuente(m.quentes[0]));
  }
  partes.push(sortear(FECHOS));
  const texto = partes.filter(Boolean).join(" ");
  return texto.length <= 280 ? texto : partes.slice(1, 3).join(" ").slice(0, 280);
}

/** A nota da hora. Uma por hora, no máximo — a hora é a referência. */
export async function postarNotaDaHora(): Promise<{ postou: boolean; texto: string; modelo: string | null }> {
  const hora = new Date().toISOString().slice(0, 13);
  const momento = await lerMomento();
  const comIa = await escreverComIa(momento);
  const texto = comIa ?? escreverSemIa(momento);
  const modelo = comIa ? MODELO : null;
  const postou = await publicar("nota", hora, texto, modelo);
  // No Telegram só 3 notas por dia (12h, 18h e 23h UTC): de hora em hora seria spam no grupo.
  if (postou && [12, 18, 23].includes(new Date().getUTCHours())) {
    await enviarAoTelegram(`💎 Obsi: ${texto}\n\nchromalaunch.fun`);
  }
  return { postou, texto, modelo };
}

/** Boas-vindas a uma moeda recém-lançada na Chroma (frase pronta: tem que sair na hora). */
export async function darBoasVindas(moeda: { endereco: string; nome: string; simbolo: string; rede: string }): Promise<void> {
  const rede = moeda.rede === "robinhood" ? "robinhood chain" : "solana";
  const frases = [
    `welcome to chroma, $${moeda.simbolo} (${moeda.nome}). just born on ${rede}. the curve is open 💎`,
    `a new crystal formed: $${moeda.simbolo} launched on ${rede}. welcome, ${moeda.nome}.`,
    `$${moeda.simbolo} just launched on chroma (${rede}). first candles are being written now.`,
  ];
  const texto = frases[moeda.endereco.charCodeAt(moeda.endereco.length - 1) % frases.length];
  const postou = await publicar("boas-vindas", moeda.endereco, texto, null).catch((e) => {
    console.warn("[obsi] boas-vindas falhou:", e);
    return false;
  });
  if (postou) await enviarAoTelegram(`💎 Obsi: ${texto}\n\nhttps://chromalaunch.fun/token/${moeda.endereco}`);
}

/**
 * O Obsi também fala no grupo do Telegram (16/10/2026), pelo bot de compra,
 * que é admin lá. Grupo público: o @ basta como destino. Grátis — a API do
 * Telegram não cobra. Falha aqui nunca derruba o mural.
 */
async function enviarAoTelegram(texto: string): Promise<void> {
  const token = process.env.TELEGRAM_COMPRA_TOKEN;
  if (!token) return;
  const destino = process.env.OBSI_TELEGRAM_CHAT || "@ChromaLaunch";
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: destino, text: texto, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) console.warn("[obsi] telegram respondeu", r.status, await r.text().catch(() => ""));
  } catch (erro) {
    console.warn("[obsi] telegram falhou:", erro);
  }
}
