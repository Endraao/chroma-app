import "server-only";

import { createHash } from "node:crypto";

import { banco, sql } from "@/lib/db";
import { escapar, pareceEmail, umaLinha } from "@/lib/validacao";

/*
 * A higiene de entrada vive em `validacao.ts`, sem importar nada — assim ela
 * roda em teste sem precisar de banco. Reexportada aqui pra que as rotas
 * continuem pedindo tudo a um módulo só.
 */
export { LIMITES, limpar, pareceCarteira, pareceEmail } from "@/lib/validacao";

/**
 * O que chega da rua: denúncia de moeda e mensagem de contato.
 *
 * ---------------------------------------------------------------------------
 * POR QUE OS DOIS MORAM JUNTOS
 * ---------------------------------------------------------------------------
 * São formulários diferentes, mas o problema é o mesmo: texto livre escrito
 * por qualquer pessoa da internet, que precisa virar linha de banco e e-mail
 * sem virar porta de entrada. As defesas — limite de tamanho, limite de
 * frequência, escape de HTML, IP anônimo — são idênticas, e duplicá-las era
 * garantir que uma das duas ia ficar para trás na próxima mudança.
 *
 * ---------------------------------------------------------------------------
 * A ORDEM É BANCO PRIMEIRO, E-MAIL DEPOIS
 * ---------------------------------------------------------------------------
 * Sempre. Se o e-mail falhar, a mensagem está salva e dá pra ler depois. Se
 * fosse só e-mail, um erro de chave ou cota estourada apagaria o pedido de
 * ajuda de alguém sem deixar rastro — e quem escreveu concluiria que foi
 * ignorado.
 *
 * ---------------------------------------------------------------------------
 * O IP NUNCA É GUARDADO CRU
 * ---------------------------------------------------------------------------
 * Endereço de IP é dado pessoal sob a LGPD e sob o GDPR. Precisamos dele só
 * pra uma pergunta: "esta mesma origem já mandou dez mensagens no último
 * minuto?". Um hash com sal responde isso e não permite voltar pro IP, então
 * é o que guardamos.
 */

/** Quantas mensagens a mesma origem pode mandar na janela abaixo. */
const TETO_POR_JANELA = 5;
const JANELA_MS = 10 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Identidade anônima de quem envia                                    */
/* ------------------------------------------------------------------ */

/**
 * O IP de quem chamou, atrás do proxy da Vercel.
 *
 * `x-forwarded-for` é uma LISTA quando há proxies encadeados, e o primeiro
 * item é o cliente original. Pegar a string inteira faria cada salto extra
 * virar uma "origem" nova — e o limite de frequência deixaria de valer pra
 * justamente quem passa por mais proxies.
 */
function ipDaRequisicao(req: Request): string {
  const encadeado = req.headers.get("x-forwarded-for");
  if (encadeado) return encadeado.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "desconhecido";
}

/**
 * O IP como hash irreversível, pra contar frequência sem guardar a pessoa.
 *
 * O sal vem do ambiente. Sem ele o hash ainda funciona pro limite, mas passa
 * a ser reversível por força bruta (IPv4 inteiro são 4 bilhões de tentativas,
 * o que é nada) — então avisa no log em produção em vez de fingir que está
 * tudo bem.
 */
export function origemAnonima(req: Request): string {
  const sal = process.env.RECADOS_SALT;
  if (!sal && process.env.NODE_ENV === "production") {
    console.warn(
      "[recados] RECADOS_SALT não configurado: o hash de IP fica reversível por força bruta.",
    );
  }
  return createHash("sha256")
    .update(`${sal ?? "chroma-sem-sal"}:${ipDaRequisicao(req)}`)
    .digest("hex")
    .slice(0, 32);
}

/* ------------------------------------------------------------------ */
/* Limite de frequência                                                */
/* ------------------------------------------------------------------ */

/**
 * A mesma origem já passou do teto nesta janela?
 *
 * A conta é feita NO BANCO, não em memória. Em função serverless cada
 * requisição pode nascer num processo novo, então um contador de módulo
 * zeraria sozinho e o limite não valeria nada justamente sob rajada — que é
 * quando ele precisa valer.
 *
 * O nome da tabela é interpolado, e isso é seguro porque o tipo do parâmetro
 * só admite dois literais: nada que venha da rua chega aqui.
 */
export async function passouDoLimite(tabela: "denuncias" | "mensagens", origem: string) {
  await banco();

  const desde = Date.now() - JANELA_MS;
  const linhas = (await sql.query(
    `SELECT COUNT(*)::int AS total FROM ${tabela} WHERE ip_hash = $1 AND criada_em > $2`,
    [origem, desde],
  )) as { total: number }[];

  return (linhas[0]?.total ?? 0) >= TETO_POR_JANELA;
}

/* ------------------------------------------------------------------ */
/* Aviso por e-mail                                                    */
/* ------------------------------------------------------------------ */

/**
 * Manda o aviso pela Resend, se estiver configurada.
 *
 * Por `fetch` puro, sem SDK: é uma chamada HTTP só, e o projeto já carregou
 * 102 vulnerabilidades por dependência que ninguém usava. Uma linha de rede
 * não justifica mais um pacote na árvore.
 *
 * Devolve se conseguiu. NUNCA lança: o chamador já salvou no banco, e derrubar
 * a resposta por causa do e-mail transformaria uma falha nossa em erro na tela
 * de quem só queria mandar uma mensagem.
 */
async function avisarPorEmail(assunto: string, corpoHtml: string, responderPara?: string | null) {
  const chave = process.env.RESEND_API_KEY;
  const destino = process.env.CONTATO_EMAIL_DESTINO;
  const remetente = process.env.CONTATO_EMAIL_REMETENTE ?? "Chroma <onboarding@resend.dev>";

  /* Sem configuração não é erro: o banco já guardou, isto aqui é conveniência. */
  if (!chave || !destino) return false;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: remetente,
        to: [destino],
        subject: umaLinha(assunto),
        html: corpoHtml,
        /*
         * Responder vai pra quem escreveu, não pro remetente técnico. Só
         * quando o endereço passou na validação — `reply_to` inválido faz a
         * Resend recusar a mensagem inteira.
         */
        ...(responderPara && pareceEmail(responderPara) ? { reply_to: responderPara } : {}),
      }),
    });

    if (!res.ok) {
      console.error("[recados] Resend recusou:", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (erro) {
    console.error("[recados] falha ao chamar a Resend:", erro);
    return false;
  }
}

/**
 * Aviso no TELEGRAM do dono (07/10/2026: denúncias e mensagens ficavam só no
 * banco — a Resend nunca foi configurada). Usa o mesmo bot dos pedidos de
 * bônus (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_DONO), que já está ligado.
 * Nunca lança, pelo mesmo motivo do e-mail.
 */
async function avisarNoTelegram(texto: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_DONO;
  if (!token || !chat) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: texto.slice(0, 3900), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(6000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Gravação                                                            */
/* ------------------------------------------------------------------ */

export interface DenunciaRecebida {
  token: string;
  rede: string | null;
  simbolo: string | null;
  motivo: string;
  detalhe: string | null;
  carteira: string | null;
}

/** Salva a denúncia e tenta avisar por e-mail. O banco é o que importa. */
export async function registrarDenuncia(d: DenunciaRecebida, origem: string): Promise<void> {
  await banco();

  await sql.query(
    `INSERT INTO denuncias (token, rede, simbolo, motivo, detalhe, carteira, ip_hash, criada_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [d.token, d.rede, d.simbolo, d.motivo, d.detalhe, d.carteira, origem, Date.now()],
  );

  await avisarNoTelegram(
    [
      `🚩 Denúncia: ${d.simbolo ?? d.token}`,
      `Motivo: ${d.motivo}`,
      d.detalhe ? `Detalhe: ${d.detalhe}` : "",
      `Moeda: https://chromalaunch.fun/token/${d.token}`,
      `Denunciante: ${d.carteira ?? "anônimo"}`,
    ].filter(Boolean).join(String.fromCharCode(10)),
  );

  const linha = (r: string, v: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#71717a">${r}</td><td style="padding:4px 0"><b>${escapar(v)}</b></td></tr>`;

  await avisarPorEmail(
    `[Chroma] Denúncia: ${umaLinha(d.simbolo ?? d.token, 40)} — ${umaLinha(d.motivo, 40)}`,
    `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#18181b">
       <h2 style="margin:0 0 12px">Moeda denunciada</h2>
       <table style="border-collapse:collapse">
         ${linha("Motivo", d.motivo)}
         ${linha("Token", d.token)}
         ${linha("Símbolo", d.simbolo ?? "—")}
         ${linha("Rede", d.rede ?? "—")}
         ${linha("Denunciante", d.carteira ?? "anônimo")}
       </table>
       ${d.detalhe ? `<p style="margin:16px 0 4px;color:#71717a">Detalhe:</p><pre style="white-space:pre-wrap;margin:0;padding:12px;background:#f4f4f5;border-radius:8px;font-family:inherit">${escapar(d.detalhe)}</pre>` : ""}
     </div>`,
  );
}

export interface MensagemRecebida {
  nome: string;
  email: string;
  carteira: string | null;
  assunto: string;
  texto: string;
}

/** Salva a mensagem de contato e tenta avisar por e-mail. */
export async function registrarMensagem(m: MensagemRecebida, origem: string): Promise<void> {
  await banco();

  const linhas = (await sql.query(
    `INSERT INTO mensagens (nome, email, carteira, assunto, texto, ip_hash, criada_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [m.nome, m.email, m.carteira, m.assunto, m.texto, origem, Date.now()],
  )) as { id: string }[];

  const noTelegram = await avisarNoTelegram(
    [`✉️ Mensagem no site: ${m.assunto}`, `De: ${m.nome} <${m.email}>`, m.carteira ? `Carteira: ${m.carteira}` : "", "", m.texto]
      .filter((x) => x !== null)
      .join(String.fromCharCode(10)),
  );

  const porEmail = await avisarPorEmail(
    `[Chroma] ${umaLinha(m.assunto, 60)} — ${umaLinha(m.nome, 40)}`,
    `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#18181b">
       <h2 style="margin:0 0 12px">${escapar(umaLinha(m.assunto, 120))}</h2>
       <p style="margin:0 0 4px;color:#71717a">
         De <b>${escapar(m.nome)}</b> &lt;${escapar(m.email)}&gt;
         ${m.carteira ? `<br>Carteira: <code>${escapar(m.carteira)}</code>` : ""}
       </p>
       <pre style="white-space:pre-wrap;margin:16px 0 0;padding:12px;background:#f4f4f5;border-radius:8px;font-family:inherit">${escapar(m.texto)}</pre>
     </div>`,
    m.email,
  );

  /*
   * Marca o envio pra distinguir, na hora de ler a tabela, "ninguém respondeu"
   * de "o aviso nunca chegou". São problemas diferentes com soluções
   * diferentes, e sem esta coluna os dois parecem iguais.
   */
  const enviou = porEmail || noTelegram;
  if (enviou && linhas[0]) {
    await sql.query(`UPDATE mensagens SET enviada = TRUE WHERE id = $1`, [linhas[0].id]);
  }
}
