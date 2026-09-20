import { NextResponse } from "next/server";

import { salvarMetadados, salvarMidiaDaMoeda } from "@/lib/media-store";
import { montarMetadados, recusarMetadados, type DadosDaMoeda } from "@/lib/token-metadata";
import { ESPECS_DA_MOEDA } from "@/lib/token-media";

/**
 * POST /api/token-media — guarda a arte da moeda e publica os metadados.
 *
 * É o passo ANTES da transação de criação. A transação grava uma URL de
 * metadados de forma imutável, então o arquivo precisa existir e estar certo
 * antes de qualquer coisa ir pra rede. Fazer na ordem contrária significaria
 * um token publicado apontando pro vazio, sem conserto.
 *
 * Recebe `multipart/form-data` com os campos do formulário, o arquivo `coin` e
 * opcionalmente `banner`. Devolve a URL dos metadados, que é o que a transação
 * vai carregar.
 */

/** Teto absoluto do corpo, antes de olhar o conteúdo. */
const MAIOR_LIMITE_MB =
  Math.max(...Object.values(ESPECS_DA_MOEDA).map((e) => e.maxVideoMb ?? e.maxMb)) + 5;

const LIMITE = { janelaMs: 60_000, max: 10 };
const acessos = new Map<string, { contagem: number; expiraEm: number }>();

function excedeuLimite(request: Request): boolean {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "local";

  const agora = Date.now();
  const atual = acessos.get(ip);

  if (!atual || atual.expiraEm <= agora) {
    acessos.set(ip, { contagem: 1, expiraEm: agora + LIMITE.janelaMs });
    return false;
  }
  atual.contagem++;
  return atual.contagem > LIMITE.max;
}

/**
 * De onde o arquivo será lido por quem está de fora.
 *
 * A carteira que abrir os metadados não tem como resolver um caminho relativo.
 * Em produção isto vem da variável de ambiente; em desenvolvimento, do próprio
 * pedido — o que é suficiente pra testar em devnet a partir desta máquina.
 */
function baseDoSite(request: Request): string {
  const configurada = process.env.NEXT_PUBLIC_SITE_URL;
  if (configurada) return configurada;
  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  if (excedeuLimite(request)) {
    return NextResponse.json({ error: "muitas tentativas; espere um minuto" }, { status: 429 });
  }

  const tamanho = Number(request.headers.get("content-length") ?? 0);
  if (tamanho > MAIOR_LIMITE_MB * 1024 * 1024) {
    return NextResponse.json(
      { error: `Arquivo grande demais. O limite é ${MAIOR_LIMITE_MB} MB.` },
      { status: 413 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "envio inválido" }, { status: 400 });
  }

  const texto = (campo: string) => {
    const v = form.get(campo);
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };

  const arquivoDaMoeda = form.get("coin");
  if (!(arquivoDaMoeda instanceof File)) {
    return NextResponse.json({ error: "envie a imagem ou o vídeo da moeda" }, { status: 400 });
  }

  const dadosBase = {
    name: texto("name") ?? "",
    symbol: texto("symbol") ?? "",
    description: texto("description"),
    website: texto("website"),
    twitter: texto("twitter"),
    telegram: texto("telegram"),
    creator: texto("creator"),
  };

  /*
   * Os textos são conferidos ANTES de gravar qualquer arquivo. Guardar a
   * imagem e só então descobrir que o nome tem 40 caracteres deixaria lixo no
   * disco a cada tentativa.
   */
  const problema = recusarMetadados({ ...dadosBase, image: "x" });
  if (problema) return NextResponse.json({ error: problema }, { status: 400 });

  try {
    const bytesDaMoeda = new Uint8Array(await arquivoDaMoeda.arrayBuffer());
    const arte = await salvarMidiaDaMoeda("coin", bytesDaMoeda);
    if (!arte.ok) return NextResponse.json({ error: arte.erro }, { status: 400 });

    const ehVideo = arte.url.endsWith(".mp4");

    let banner: string | undefined;
    const arquivoDoBanner = form.get("banner");
    if (arquivoDoBanner instanceof File && arquivoDoBanner.size > 0) {
      const salvo = await salvarMidiaDaMoeda(
        "banner",
        new Uint8Array(await arquivoDoBanner.arrayBuffer()),
      );
      if (!salvo.ok) return NextResponse.json({ error: salvo.erro }, { status: 400 });
      banner = salvo.url;
    }

    /*
     * Vídeo entra nos dois campos de propósito: `image` é o que qualquer lugar
     * consegue mostrar (a carteira desenha o primeiro quadro), e
     * `animation_url` é o que os que sabem tocar vídeo usam. Preencher só um
     * deixaria a moeda sem imagem em metade dos lugares.
     */
    const dados: DadosDaMoeda = {
      ...dadosBase,
      image: arte.url,
      animationUrl: ehVideo ? arte.url : undefined,
      banner,
    };

    const metadados = montarMetadados(dados, baseDoSite(request));
    const publicado = await salvarMetadados(metadados);

    return NextResponse.json({
      ok: true,
      metadataUrl: `${baseDoSite(request)}${publicado.url}`,
      imageUrl: `${baseDoSite(request)}${arte.url}`,
      bannerUrl: banner ? `${baseDoSite(request)}${banner}` : null,
      metadata: metadados,
    });
  } catch (error) {
    console.error("[api/token-media] falha:", error);
    return NextResponse.json({ error: "não consegui guardar a mídia" }, { status: 500 });
  }
}
