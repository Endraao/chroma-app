/** TESTE (09/10/2026): entra na /teste-carteira por redirecionamento do servidor (302). */
export function GET(req: Request) {
  return Response.redirect(new URL("/teste-carteira", req.url), 302);
}
