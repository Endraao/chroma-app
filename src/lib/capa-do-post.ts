const SITE = "https://chromalaunch.fun";

/** Logo da moeda como data URI (só PNG/JPEG: o gerador de imagem não lê WebP). */
export async function logoEmDataUri(endereco: string): Promise<string | null> {
  try {
    const r = await fetch(`${SITE}/api/logo/${endereco}`, { signal: AbortSignal.timeout(6000) });
    const tipo = r.headers.get("content-type") ?? "";
    if (!r.ok || !/image\/(png|jpe?g)/.test(tipo)) return null;
    const b = Buffer.from(await r.arrayBuffer());
    return `data:${tipo};base64,${b.toString("base64")}`;
  } catch {
    return null;
  }
}

/** O X desiste se a imagem demora: fica guardada no CDN da Vercel. */
export const CACHE_DA_CAPA = { "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" };
