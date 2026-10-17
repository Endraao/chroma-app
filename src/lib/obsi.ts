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
  /** A mesma nota nas 3 línguas do site (só as frases prontas têm). */
  textos: Partial<Record<"en" | "pt" | "zh", string>> | null;
  modelo: string | null;
  criadoEm: number;
}

export async function listarMural(limite = 20): Promise<PostDoMural[]> {
  await banco();
  const linhas = (await sql`
    SELECT id, autor, tipo, texto, textos, modelo, criado_em FROM mural
    ORDER BY criado_em DESC LIMIT ${limite}`) as {
    id: string;
    autor: string;
    tipo: string;
    texto: string;
    textos: Partial<Record<"en" | "pt" | "zh", string>> | null;
    modelo: string | null;
    criado_em: string;
  }[];
  return linhas.map((l) => ({
    id: Number(l.id),
    autor: l.autor,
    tipo: l.tipo,
    texto: l.texto,
    textos: l.textos,
    modelo: l.modelo,
    criadoEm: Number(l.criado_em),
  }));
}

async function publicar(
  tipo: string,
  ref: string,
  texto: string,
  modelo: string | null,
  textos: Record<string, string> | null = null,
): Promise<boolean> {
  await banco();
  const r = (await sql`
    INSERT INTO mural (autor, tipo, ref, texto, textos, modelo, criado_em)
    VALUES (${AUTOR_OBSI}, ${tipo}, ${ref}, ${texto}, ${textos ? JSON.stringify(textos) : null}, ${modelo}, ${Date.now()})
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
 *
 * Cada frase existe nas 3 línguas do site, na mesma posição (17/10/2026: "o
 * site não traduz as falas do Obsi"). O sorteio escolhe a POSIÇÃO uma vez e
 * as três versões saem juntas — a nota é a mesma em qualquer idioma.
 */
type Lingua = "en" | "pt" | "zh";
export type TextoTri = Record<Lingua, string>;
const tri = (en: string, pt: string, zh: string): TextoTri => ({ en, pt, zh });

const sortear = <T,>(lista: T[]): T => lista[Math.floor(Math.random() * lista.length)];
const VAZIO = tri("", "", "");

function juntar(partes: TextoTri[]): TextoTri {
  const uma = (l: Lingua) => partes.map((p) => p[l]).filter(Boolean).join(l === "zh" ? "" : " ");
  return { en: uma("en"), pt: uma("pt"), zh: uma("zh") };
}

const ABERTURAS: Record<"manha" | "tarde" | "noite" | "madrugada", TextoTri[]> = {
  manha: [
    tri("gm from the crystal caves.", "bom dia das cavernas de cristal.", "来自水晶洞穴的早安。"),
    tri("gm. coffee for you, charts for me.", "bom dia. café pra você, gráfico pra mim.", "早安。你喝咖啡，我看图表。"),
    tri("gm, trenches.", "bom dia, trincheiras.", "早安，战壕。"),
    tri("morning. the aurora went to sleep, i didn't.", "manhã. a aurora foi dormir, eu não.", "早上好。极光睡了，我没睡。"),
    tri("gm. new day, new candles.", "bom dia. dia novo, velas novas.", "早安。新的一天，新的K线。"),
  ],
  tarde: [
    tri("afternoon check-in.", "passando pra dar notícias da tarde.", "下午打卡。"),
    tri("midday report from under the hoodie.", "relatório do meio-dia, direto do capuz.", "来自卫衣下的午间报告。"),
    tri("still here, still watching.", "ainda aqui, ainda de olho.", "我还在，还在看着。"),
    tri("quick look at the board.", "uma olhada rápida no quadro.", "快速看一眼行情。"),
    tri("checking the curve between snacks.", "conferindo a curva entre um lanche e outro.", "边吃零食边看曲线。"),
  ],
  noite: [
    tri("evening watch.", "plantão da noite.", "傍晚值班。"),
    tri("the aurora is out. so am i.", "a aurora apareceu. eu também.", "极光出来了，我也出来了。"),
    tri("night shift has started.", "começou o turno da noite.", "夜班开始了。"),
    tri("lights low, eyes glowing.", "luz baixa, olhos brilhando.", "灯光调暗，眼睛发亮。"),
    tri("evening report from the trenches.", "relatório da noite, direto das trincheiras.", "来自战壕的晚间报告。"),
  ],
  madrugada: [
    tri("late night, quiet caves.", "madrugada, cavernas em silêncio.", "深夜，洞穴很安静。"),
    tri("3am energy, crystal edition.", "energia de 3 da manhã, edição cristal.", "凌晨三点的能量，水晶版。"),
    tri("everyone's asleep. i'm counting candles.", "todo mundo dormindo. eu contando velas.", "大家都睡了，我在数K线。"),
    tri("the night is long and the charts are honest.", "a noite é longa e os gráficos são honestos.", "夜很长，图表很诚实。"),
    tri("deep night report.", "relatório da madrugada.", "深夜报告。"),
  ],
};

function periodo(hora: number): keyof typeof ABERTURAS {
  if (hora >= 6 && hora < 12) return "manha";
  if (hora >= 12 && hora < 18) return "tarde";
  if (hora >= 18) return "noite";
  return "madrugada";
}

const SEM_LANCAMENTO: TextoTri[] = [
  tri("no new launches on chroma this hour. the curve is waiting.", "nenhum lançamento na chroma nesta hora. a curva está esperando.", "这一小时 Chroma 没有新发行。曲线在等待。"),
  tri("quiet hour on chroma. zero launches, plenty of patience.", "hora calma na chroma. zero lançamentos, muita paciência.", "Chroma 安静的一小时。零发行，满满耐心。"),
  tri("nobody launched this hour. the launch button is still warm.", "ninguém lançou nesta hora. o botão de lançar ainda está quentinho.", "这一小时没人发行。发行按钮还是热的。"),
  tri("no new coins on chroma this hour. a blank canvas is still a canvas.", "nenhuma moeda nova na chroma nesta hora. tela em branco ainda é tela.", "这一小时 Chroma 没有新币。空白画布也是画布。"),
  tri("launches this hour: 0. honest numbers only.", "lançamentos nesta hora: 0. só números honestos.", "本小时发行：0。只说真实数字。"),
  tri("nothing new on the chroma curve this hour. it's calm in here.", "nada novo na curva da chroma nesta hora. está calmo por aqui.", "这一小时 Chroma 曲线上没有新东西。这里很平静。"),
];

function frasesDeLancamento(m: Momento): TextoTri {
  const n = m.lancadasNaUltimaHora.length;
  const nomes = m.lancadasNaUltimaHora.map((c) => `$${c.simbolo}`).join(", ");
  if (n === 1) {
    return sortear([
      tri(`a new crystal formed on chroma this hour: ${nomes}.`, `um cristal novo se formou na chroma nesta hora: ${nomes}.`, `这一小时 Chroma 上形成了一颗新水晶：${nomes}。`),
      tri(`${nomes} was born on chroma this hour. welcome to the trenches 💎`, `${nomes} nasceu na chroma nesta hora. bem-vinda às trincheiras 💎`, `${nomes} 这一小时在 Chroma 诞生。欢迎来到战壕 💎`),
      tri(`one launch this hour: ${nomes}. first candles are being written.`, `um lançamento nesta hora: ${nomes}. as primeiras velas estão sendo escritas.`, `本小时一次发行：${nomes}。第一根K线正在写下。`),
    ]);
  }
  return sortear([
    tri(`${n} launches on chroma this hour: ${nomes}.`, `${n} lançamentos na chroma nesta hora: ${nomes}.`, `这一小时 Chroma 有 ${n} 次发行：${nomes}。`),
    tri(`busy hour in the caves. ${n} new coins: ${nomes}.`, `hora movimentada nas cavernas. ${n} moedas novas: ${nomes}.`, `洞穴里忙碌的一小时。${n} 个新币：${nomes}。`),
    tri(`${n} new crystals this hour: ${nomes} 💎`, `${n} cristais novos nesta hora: ${nomes} 💎`, `本小时 ${n} 颗新水晶：${nomes} 💎`),
  ]);
}

function frasesDoChroma(c: NonNullable<Momento["chroma"]>): TextoTri {
  const usa1h = c.var1h !== null;
  const v = usa1h ? (c.var1h as number) : c.var24h;
  const j = usa1h ? "1h" : "24h";
  const mc = formatUsd(c.mcap);
  const p = formatPct(v);
  if (v >= 5) {
    return sortear([
      tri(`$CHROMA is moving: ${p} ${j}, ${mc} mcap.`, `$CHROMA se mexendo: ${p} em ${j}, ${mc} de market cap.`, `$CHROMA 在动：${j} ${p}，市值 ${mc}。`),
      tri(`$CHROMA ${p} ${j}. my eyes are glowing a bit brighter. ${mc} mcap.`, `$CHROMA ${p} em ${j}. meus olhos estão brilhando um pouco mais. ${mc} de market cap.`, `$CHROMA ${j} ${p}。我的眼睛更亮了一点。市值 ${mc}。`),
      tri(`green candles on $CHROMA: ${p} ${j}, now ${mc}.`, `velas verdes no $CHROMA: ${p} em ${j}, agora ${mc}.`, `$CHROMA 出现绿K：${j} ${p}，现在 ${mc}。`),
    ]);
  }
  if (v <= -5) {
    return sortear([
      tri(`$CHROMA ${p} ${j}, ${mc} mcap. red days happen. we keep building.`, `$CHROMA ${p} em ${j}, ${mc} de market cap. dia vermelho acontece. a gente segue construindo.`, `$CHROMA ${j} ${p}，市值 ${mc}。红色的日子总会有，我们继续建设。`),
      tri(`$CHROMA cooled off: ${p} ${j}. ${mc} mcap. still shipping.`, `$CHROMA esfriou: ${p} em ${j}. ${mc} de market cap. seguimos entregando.`, `$CHROMA 降温了：${j} ${p}。市值 ${mc}。我们照常交付。`),
      tri(`$CHROMA at ${mc}, ${p} ${j}. crystals form under pressure.`, `$CHROMA em ${mc}, ${p} em ${j}. cristais se formam sob pressão.`, `$CHROMA 市值 ${mc}，${j} ${p}。水晶在压力下形成。`),
    ]);
  }
  return sortear([
    tri(`$CHROMA steady at ${mc} mcap (${p} ${j}).`, `$CHROMA estável em ${mc} de market cap (${p} em ${j}).`, `$CHROMA 稳定在市值 ${mc}（${j} ${p}）。`),
    tri(`$CHROMA: ${mc} mcap, ${p} ${j}. calm waters.`, `$CHROMA: ${mc} de market cap, ${p} em ${j}. águas calmas.`, `$CHROMA：市值 ${mc}，${j} ${p}。风平浪静。`),
    tri(`$CHROMA sitting at ${mc}, ${p} ${j}.`, `$CHROMA parado em ${mc}, ${p} em ${j}.`, `$CHROMA 停在 ${mc}，${j} ${p}。`),
  ]);
}

function frasesDoQuente(q: Momento["quentes"][number]): TextoTri {
  const p = formatPct(q.var24h);
  const mc = formatUsd(q.mcap);
  return sortear([
    tri(`trending on solana: $${q.simbolo} (${p} 24h).`, `em alta na solana: $${q.simbolo} (${p} em 24h).`, `Solana 热门：$${q.simbolo}（24h ${p}）。`),
    tri(`the trenches are talking about $${q.simbolo} right now.`, `as trincheiras estão falando de $${q.simbolo} agora.`, `战壕里现在都在聊 $${q.simbolo}。`),
    tri(`top of the solana trending board: $${q.simbolo}, ${mc} mcap.`, `no topo da lista de alta da solana: $${q.simbolo}, ${mc} de market cap.`, `Solana 热门榜第一：$${q.simbolo}，市值 ${mc}。`),
  ]);
}

const FECHOS: TextoTri[] = [
  VAZIO,
  VAZIO,
  VAZIO,
  tri("not financial advice, just a crystal with eyes.", "não é conselho financeiro, só um cristal com olhos.", "非投资建议，只是一颗有眼睛的水晶。"),
  tri("stay safe out there.", "se cuida por aí.", "注意安全。"),
  tri("dyor, always.", "faça sua própria pesquisa, sempre.", "永远自己做研究。"),
  tri("more next hour.", "mais na próxima hora.", "下个小时见。"),
  tri("back to watching.", "voltando a observar.", "继续观察。"),
];

const RECOMPRA = tri(
  "it's monday: 25% of chroma's revenue goes to the $CHROMA buyback. receipt on x.",
  "é segunda: 25% da receita da chroma vai pra recompra do $CHROMA. comprovante no x.",
  "今天是周一：Chroma 收入的 25% 用于回购 $CHROMA，凭证发在 X 上。",
);

/** A nota da hora com as frases prontas — vale quando não há chave ou a API falha. */
function escreverSemIa(m: Momento): TextoTri {
  const agora = new Date();
  const partes = [sortear(ABERTURAS[periodo(agora.getUTCHours())])];
  partes.push(m.lancadasNaUltimaHora.length ? frasesDeLancamento(m) : sortear(SEM_LANCAMENTO));
  if (m.chroma) partes.push(frasesDoChroma(m.chroma));
  // Toda segunda (UTC) lembra da recompra; nas outras horas, às vezes, o que está quente.
  if (agora.getUTCDay() === 1 && agora.getUTCHours() % 4 === 0) partes.push(RECOMPRA);
  else if (m.quentes[0] && Math.random() < 0.5) partes.push(frasesDoQuente(m.quentes[0]));
  partes.push(sortear(FECHOS));
  const nota = juntar(partes);
  return nota.en.length <= 280 ? nota : juntar(partes.slice(1, 3));
}

/** A nota da hora. Uma por hora, no máximo — a hora é a referência. */
export async function postarNotaDaHora(): Promise<{ postou: boolean; texto: string; modelo: string | null }> {
  const hora = new Date().toISOString().slice(0, 13);
  const momento = await lerMomento();
  const comIa = await escreverComIa(momento);
  // A nota da IA sai só em inglês (é a voz dela); as prontas saem nas 3 línguas.
  const textos: TextoTri | null = comIa ? null : escreverSemIa(momento);
  const texto = comIa ?? textos!.en;
  const modelo = comIa ? MODELO : null;
  const postou = await publicar("nota", hora, texto, modelo, textos);
  // No Telegram só 3 notas por dia (12h, 18h e 23h UTC): de hora em hora seria spam no grupo.
  if (postou && [12, 18, 23].includes(new Date().getUTCHours())) {
    await enviarAoTelegram(`💎 Obsi: ${texto}\n\nchromalaunch.fun`);
  }
  return { postou, texto, modelo };
}

/** Boas-vindas a uma moeda recém-lançada na Chroma (frase pronta: tem que sair na hora). */
export async function darBoasVindas(moeda: { endereco: string; nome: string; simbolo: string; rede: string }): Promise<void> {
  const rede = moeda.rede === "robinhood" ? "robinhood chain" : "solana";
  const s = `$${moeda.simbolo}`;
  const frases = [
    tri(`welcome to chroma, ${s} (${moeda.nome}). just born on ${rede}. the curve is open 💎`, `bem-vinda à chroma, ${s} (${moeda.nome}). acabou de nascer na ${rede}. a curva está aberta 💎`, `欢迎来到 Chroma，${s}（${moeda.nome}）。刚在 ${rede} 诞生，曲线已开放 💎`),
    tri(`a new crystal formed: ${s} launched on ${rede}. welcome, ${moeda.nome}.`, `um cristal novo se formou: ${s} lançada na ${rede}. bem-vinda, ${moeda.nome}.`, `一颗新水晶形成了：${s} 在 ${rede} 发行。欢迎，${moeda.nome}。`),
    tri(`${s} just launched on chroma (${rede}). first candles are being written now.`, `${s} acabou de ser lançada na chroma (${rede}). as primeiras velas estão sendo escritas.`, `${s} 刚在 Chroma（${rede}）发行，第一根K线正在写下。`),
  ];
  const textos = frases[moeda.endereco.charCodeAt(moeda.endereco.length - 1) % frases.length];
  const postou = await publicar("boas-vindas", moeda.endereco, textos.en, null, textos).catch((e) => {
    console.warn("[obsi] boas-vindas falhou:", e);
    return false;
  });
  if (postou) await enviarAoTelegram(`💎 Obsi: ${textos.en}\n\nhttps://chromalaunch.fun/token/${moeda.endereco}`);
}

/**
 * O Obsi também fala no grupo do Telegram (16/10/2026), pelo bot de compra,
 * que é admin lá. Grupo público: o @ basta como destino. Grátis — a API do
 * Telegram não cobra. Falha aqui nunca derruba o mural.
 */
async function enviarAoTelegram(texto: string): Promise<void> {
  const token = process.env.TELEGRAM_COMPRA_TOKEN;
  if (!token) return;
  // Desligado por padrão (16/10/2026: o dono quer foco no site). Pra religar: OBSI_TELEGRAM_CHAT=@ChromaLaunch.
  const destino = process.env.OBSI_TELEGRAM_CHAT;
  if (!destino) return;
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
