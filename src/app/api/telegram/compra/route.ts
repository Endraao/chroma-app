import { NextResponse } from "next/server";

import { gravarNoCacheDoBanco, lerDoCacheDoBanco } from "@/lib/db";
import { getToken } from "@/lib/tokens";
import { formatPrice, formatUsd } from "@/lib/utils";

/**
 * BOT DE COMPRA NO TELEGRAM (pedido do dono, 07/10/2026) — o mesmo truque do
 * post do X, no canal onde as comunidades de memecoin vivem.
 *
 * - Num grupo, alguém manda o endereço (ou link) de uma moeda → o bot responde
 *   com nome, preço e MC e o botão "Buy in Telegram", que abre a compra da
 *   Chroma DENTRO do Telegram (mini app). Quem mandou ganha a indicação.
 * - No privado: /carteira <endereço> liga o Telegram da pessoa à carteira
 *   dela — é pra lá que vai a comissão.
 *
 * Variáveis na Vercel (o dono cria o bot no @BotFather):
 *   TELEGRAM_COMPRA_TOKEN   token do bot (secreto)
 *   TELEGRAM_COMPRA_BOT     @ do bot, sem o @ (ex.: ChromaBuyBot)
 *   TELEGRAM_COMPRA_APP     nome curto do mini app criado no @BotFather (/newapp)
 *   TELEGRAM_COMPRA_SEGREDO texto aleatório: assina o webhook e protege a configuração
 */
const TOKEN = process.env.TELEGRAM_COMPRA_TOKEN ?? "";
const BOT = process.env.TELEGRAM_COMPRA_BOT ?? "";
const APP = process.env.TELEGRAM_COMPRA_APP ?? "";
const SEGREDO = process.env.TELEGRAM_COMPRA_SEGREDO ?? "";
const SITE = "https://chromalaunch.fun";

const SOLANA = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
const EVM = /0x[0-9a-fA-F]{40}/;

async function tg(metodo: string, corpo: unknown) {
  return fetch(`https://api.telegram.org/bot${TOKEN}/${metodo}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(8000),
  }).then((r) => r.json()).catch(() => null);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function enderecoNoTexto(texto: string): string | null {
  const evm = texto.match(EVM)?.[0];
  if (evm) return evm;
  const candidatos = texto.match(SOLANA) ?? [];
  return candidatos.find((c) => c.length >= 32) ?? null;
}

const TEXTOS_PRIVADO = {
  inicio:
    "👋 <b>Chroma Buy Bot</b>\n\nAdd me to your group. When someone posts a coin address (Solana or Robinhood Chain), I reply with a <b>Buy in Telegram</b> button.\n\nWant to earn 0.30% of every trade your links bring? Send:\n<code>/carteira YOUR_WALLET_ADDRESS</code>",
  ligada: (c: string) => `✅ Done. Trades from the coins you share will pay <b>0.30%</b> to\n<code>${esc(c)}</code>\n\nPaid on-chain, in the same transaction. Track it at ${SITE}/ranking`,
  invalida: "That doesn't look like a Solana or Robinhood Chain wallet address.",
};

export async function POST(request: Request) {
  if (!TOKEN || !SEGREDO || request.headers.get("x-telegram-bot-api-secret-token") !== SEGREDO) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = (await request.json().catch(() => null)) as {
    message?: { message_id: number; text?: string; caption?: string; chat: { id: number; type: string }; from?: { id: number; is_bot?: boolean }; sender_chat?: { id: number } };
  } | null;
  const msg = update?.message;
  // Admin anônimo e canal postam "como bot" (GroupAnonymousBot) mas COM sender_chat:
  // esses valem. Bot de verdade (sem sender_chat) fica de fora — evita bot respondendo bot.
  if (!msg || (msg.from?.is_bot && !msg.sender_chat)) return NextResponse.json({ ok: true });
  const texto = (msg.text ?? msg.caption ?? "").trim();
  const privado = msg.chat.type === "private";

  if (privado && /^\/start\b/.test(texto)) {
    await tg("sendMessage", { chat_id: msg.chat.id, text: TEXTOS_PRIVADO.inicio, parse_mode: "HTML" });
    return NextResponse.json({ ok: true });
  }
  if (privado && /^\/carteira\b|^\/wallet\b/.test(texto)) {
    const c = texto.split(/\s+/)[1] ?? "";
    const valida = EVM.test(c) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(c);
    if (valida && msg.from) await gravarNoCacheDoBanco(`tg-carteira:${msg.from.id}`, { carteira: c, em: Date.now() });
    await tg("sendMessage", { chat_id: msg.chat.id, text: valida ? TEXTOS_PRIVADO.ligada(c) : TEXTOS_PRIVADO.invalida, parse_mode: "HTML" });
    return NextResponse.json({ ok: true });
  }

  const endereco = enderecoNoTexto(texto);
  if (!endereco) return NextResponse.json({ ok: true });
  const { token, isDemo } = await getToken(endereco).catch(() => ({ token: null, isDemo: true }));
  if (!token || isDemo) return NextResponse.json({ ok: true });

  // Indicação: quem mandou, se já ligou a carteira (vai no link como t<id>).
  const ligado = msg.from ? await lerDoCacheDoBanco<{ carteira: string }>(`tg-carteira:${msg.from.id}`).catch(() => null) : null;
  const ref = ligado && msg.from ? `__t${msg.from.id}` : "";
  const miniApp = BOT && APP ? `https://t.me/${BOT}/${APP}?startapp=${endereco}${ref}` : null;
  const naChroma = `${SITE}/token/${endereco}${ligado ? `?ref=${encodeURIComponent(ligado.carteira)}` : ""}`;
  const variacao = Number.isFinite(token.change24h) && token.change24h !== 0 ? ` · ${token.change24h >= 0 ? "▲" : "▼"} ${Math.abs(token.change24h).toFixed(2)}%` : "";

  await tg("sendMessage", {
    chat_id: msg.chat.id,
    reply_to_message_id: msg.message_id,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    text: `<b>${esc(token.name)}</b> ($${esc(token.symbol)})\n💲 $${formatPrice(token.priceUsd)} · MC ${formatUsd(token.marketCapUsd)}${variacao}\n<i>${token.chain === "solana" ? "Solana" : "Robinhood Chain"}</i>`,
    reply_markup: {
      inline_keyboard: [
        [
          ...(miniApp ? [{ text: "⚡ Buy in Telegram", url: miniApp }] : []),
          { text: "📈 Chart · Chroma", url: naChroma },
        ],
      ],
    },
  });
  return NextResponse.json({ ok: true });
}

/** GET ?configurar=SEGREDO → liga o webhook e os comandos do bot. ?info=SEGREDO → estado do webhook. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  if (SEGREDO && q.get("info") === SEGREDO) {
    const info = await tg("getWebhookInfo", {});
    return NextResponse.json(info);
  }
  // Diz O QUE falta (nunca o valor), pra configuração não virar adivinhação.
  const faltando = [
    !TOKEN && "TELEGRAM_COMPRA_TOKEN",
    !SEGREDO && "TELEGRAM_COMPRA_SEGREDO",
    !BOT && "TELEGRAM_COMPRA_BOT",
    !APP && "TELEGRAM_COMPRA_APP",
  ].filter(Boolean);
  if (faltando.length) return NextResponse.json({ ok: false, motivo: `faltando na Vercel: ${faltando.join(", ")}` }, { status: 401 });
  if (q.get("configurar") !== SEGREDO) return NextResponse.json({ ok: false, motivo: "a senha do link não confere com TELEGRAM_COMPRA_SEGREDO" }, { status: 401 });
  const webhook = await tg("setWebhook", {
    url: `${SITE}/api/telegram/compra`,
    secret_token: SEGREDO,
    allowed_updates: ["message"],
  });
  const comandos = await tg("setMyCommands", {
    commands: [
      { command: "start", description: "How it works" },
      { command: "carteira", description: "Link your wallet to earn 0.30% per trade" },
    ],
  });
  return NextResponse.json({ webhook, comandos });
}
