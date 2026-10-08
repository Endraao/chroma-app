/**
 * O app do X no ANDROID não abre a janela de compra dentro do post (o "player
 * card" vira só uma capa que não responde ao toque — testado pelo dono em
 * 08/10/2026). Por isso o texto do post leva também um link comum, que no
 * Android dá pra tocar e abre a mesma janela (/p/…) em tela cheia. O cartão
 * continua vindo do ÚLTIMO link (o /e/…), que o X põe no fim do post.
 */
export function linkDoCelular(linkDoPost: string): string {
  return linkDoPost.replace("/e/", "/p/");
}

export function comLinkDoCelular(texto: string, linkDoPost: string): string {
  return `${texto}\n\n📱 Android: ${linkDoCelular(linkDoPost)}`;
}
