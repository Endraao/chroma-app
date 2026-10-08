/**
 * Resposta guardada no CDN da Vercel por alguns segundos e DIVIDIDA entre
 * todos os visitantes (08/10/2026: o plano grátis da Vercel pausou o site —
 * cada pessoa com a página aberta rodava as APIs de 3 em 3 segundos). Com
 * isso, 100 pessoas olhando a mesma moeda viram ~1 execução a cada poucos
 * segundos em vez de 100.
 *
 * `Vercel-CDN-Cache-Control` é a ordem que o CDN da Vercel segue com certeza
 * (o `s-maxage` no Cache-Control sozinho não estava sendo guardado).
 */
export function naCdn(segundos: number, velhoAte = segundos * 5): Record<string, string> {
  return {
    "cache-control": `public, max-age=0, s-maxage=${segundos}, stale-while-revalidate=${velhoAte}`,
    "cdn-cache-control": `max-age=${segundos}, stale-while-revalidate=${velhoAte}`,
    "vercel-cdn-cache-control": `max-age=${segundos}, stale-while-revalidate=${velhoAte}`,
  };
}
