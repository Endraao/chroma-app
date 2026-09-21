import { lerFoto } from "@/lib/media-store";

/**
 * Serve as fotos enviadas pelos usuários.
 *
 * O nome do arquivo é o hash do conteúdo, então a resposta pode ser cacheada
 * pra sempre: se a pessoa trocar de foto, o hash muda e a URL muda junto —
 * ninguém nunca vê a foto antiga por causa de cache.
 *
 * `nosniff` porque o navegador não deve adivinhar o tipo: o `Content-Type` sai
 * da assinatura real do arquivo (ver `image-probe.ts`), e deixar o navegador
 * reinterpretar isso é como um upload de imagem vira execução de script.
 *
 * Liberado pra qualquer origem porque quem mais vai buscar estes arquivos não
 * é o nosso site: são carteiras e exploradores lendo os metadados da moeda.
 * Sem isso o token apareceria sem nome e sem imagem na Phantom. Não há risco
 * em abrir: é conteúdo público e estático, servido sem cookie nem sessão.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ nome: string }> },
) {
  const { nome } = await params;
  const foto = await lerFoto(nome);
  if (!foto) return new Response("não encontrado", { status: 404 });

  return new Response(new Uint8Array(foto.bytes), {
    headers: {
      "content-type": foto.tipo,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-disposition": "inline",
      "access-control-allow-origin": "*",
    },
  });
}
