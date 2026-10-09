/** TESTE (09/10/2026): entra na /teste-carteira por redirecionamento em JavaScript, igual ao /e3 de hoje. */
export function GET() {
  const html = `<!doctype html><html><head><meta name="robots" content="noindex"><script>location.replace("/teste-carteira");</script></head><body style="background:#07070a"></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
