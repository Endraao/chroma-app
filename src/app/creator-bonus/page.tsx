import { redirect } from "next/navigation";

/**
 * /creator-bonus — a promoção do bônus do criador ACABOU (19/10/2026, pedido
 * do dono: "acabou o tempo da promoção e ninguém aproveitou"). Links antigos
 * (posts, Docs) caem na home. As regras ficaram no histórico do git e em
 * lib/bonus-criador.ts (o /admin/bonus segue pra pedidos já feitos).
 */
export default function CreatorBonus() {
  redirect("/");
}
