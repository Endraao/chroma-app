import type { Metadata } from "next";
import Link from "next/link";

import { idiomaAtual } from "@/lib/idioma-servidor";
import { ganhosDoDivulgador } from "@/lib/ranking-divulgadores";

/**
 * CARD "QUANTO EU GANHEI" (pedido do dono, 07/10/2026): quem ganha postando
 * mostra — e cada card é propaganda com prova. O X lê a imagem grande daqui.
 */
export const dynamic = "force-dynamic";

const SITE = "https://chromalaunch.fun";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const g = await ganhosDoDivulgador(decodeURIComponent(id)).catch(() => null);
  const sol = g?.semana?.ganhoSol ?? g?.total?.ganhoSol ?? 0;
  const titulo = `${g?.nome ?? "A promoter"} earned +${sol.toFixed(4)} SOL just by posting coins on X`;
  const imagem = `${SITE}/ganhos/${encodeURIComponent(id)}/imagem`;
  return {
    title: titulo,
    description: "No upfront payments: on Chroma, promoters earn from every trade their posts bring — verified on-chain.",
    openGraph: { title: titulo, images: imagem },
    twitter: { card: "summary_large_image", site: "@ChromaLaunch", title: titulo, images: [imagem] },
  };
}

const TEXTOS = {
  en: { postar: "Post my card on X", comecar: "Start earning →", tweet: "Earned this just by posting coins on X 👇 No upfront payments, paid per trade, verified on-chain." },
  pt: { postar: "Postar meu card no X", comecar: "Comece a ganhar →", tweet: "Earned this just by posting coins on X 👇 No upfront payments, paid per trade, verified on-chain." },
  zh: { postar: "把我的卡片发到 X", comecar: "开始赚钱 →", tweet: "Earned this just by posting coins on X 👇 No upfront payments, paid per trade, verified on-chain." },
};

export default async function CardDeGanhos({ params }: Props) {
  const { id } = await params;
  const t = TEXTOS[await idiomaAtual()];
  const url = `${SITE}/ganhos/${encodeURIComponent(id)}`;
  const postar = `https://x.com/intent/post?text=${encodeURIComponent(t.tweet)}&url=${encodeURIComponent(url)}`;
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-10">
      <img
        src={`/ganhos/${encodeURIComponent(id)}/imagem`}
        alt=""
        className="w-full rounded-2xl border border-white/[0.08]"
      />
      <div className="flex flex-wrap gap-2">
        <a href={postar} target="_blank" rel="noreferrer" className="rounded-xl bg-marca px-5 py-3 text-[14px] font-black text-black hover:opacity-90">
          {t.postar}
        </a>
        <Link href="/divulgar" className="rounded-xl border border-marca/40 px-5 py-3 text-[14px] font-bold text-marca hover:bg-marca/10">
          {t.comecar}
        </Link>
      </div>
    </main>
  );
}
