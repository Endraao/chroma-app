"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import { useTextos } from "@/components/IdiomaProvider";
import { Button } from "@/components/ui/Button";
import { traducoes } from "@/lib/idiomas";
import { PLATFORM_FEE_WALLET_SOL } from "@/lib/web3";

const TEXTOS = traducoes({
  en: {
    titulo: "Finish your launch",
    texto: "The last step of the launch (creator fee split) was not completed. Approve it in your wallet so your coin works like every Chroma coin.",
    botao: "Finish launch",
    aguardando: "Approve in your wallet…",
    erro: "Not completed. Try again.",
  },
  pt: {
    titulo: "Conclua o seu lançamento",
    texto: "A última etapa do lançamento (divisão da taxa de criador) não foi concluída. Aprove na carteira para a sua moeda funcionar como toda moeda da Chroma.",
    botao: "Concluir lançamento",
    aguardando: "Aprove na carteira…",
    erro: "Não foi concluído. Tente de novo.",
  },
  zh: {
    titulo: "完成你的发行",
    texto: "发行的最后一步（创作者费用分配）尚未完成。请在钱包中确认，让你的代币和所有 Chroma 代币一样运作。",
    botao: "完成发行",
    aguardando: "请在钱包中确认…",
    erro: "未完成，请重试。",
  },
});

/**
 * Só para o CRIADOR, com a carteira dele conectada, numa moeda da Solana
 * lançada pela pump.fun cuja divisão de taxa não existe na rede. Para todo
 * mundo mais, não desenha nada.
 */
export function ConcluirLancamento({ mint, criador }: { mint: string; criador: string }) {
  const t = useTextos(TEXTOS);
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [falta, setFalta] = useState(false);
  const [estado, setEstado] = useState<"parado" | "assinando" | "erro">("parado");

  const souCriador = Boolean(publicKey && criador && publicKey.toBase58() === criador);

  useEffect(() => {
    if (!souCriador) return;
    let cancelado = false;
    import("@/lib/pumpfun")
      .then(({ divisaoFeita }) => divisaoFeita(connection, new PublicKey(mint)))
      .then((feita) => !cancelado && setFalta(!feita))
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [souCriador, connection, mint]);

  if (!souCriador || !falta || !PLATFORM_FEE_WALLET_SOL) return null;

  const concluir = async () => {
    if (!publicKey) return;
    setEstado("assinando");
    try {
      const { transacaoDeDivisao } = await import("@/lib/pumpfun");
      const tx = await transacaoDeDivisao({
        conn: connection,
        criador: publicKey,
        mint: new PublicKey(mint),
        carteiraDaChroma: new PublicKey(PLATFORM_FEE_WALLET_SOL),
        compraSol: 0,
      });
      const assinatura = await sendTransaction(tx, connection);
      const bloco = await connection.getLatestBlockhash();
      const r = await connection.confirmTransaction({ signature: assinatura, ...bloco }, "confirmed");
      if (r.value.err) throw new Error("falhou");
      setFalta(false);
      setEstado("parado");
    } catch (e) {
      console.warn("[concluir-lancamento]", e);
      setEstado("erro");
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-marca/30 bg-marca/[0.05] p-3.5">
      <p className="text-[13px] font-semibold text-zinc-100">{t.titulo}</p>
      <p className="text-[11px] leading-relaxed text-zinc-400">{t.texto}</p>
      <Button variant="chroma" size="lg" className="w-full" disabled={estado === "assinando"} onClick={concluir}>
        {estado === "assinando" ? t.aguardando : t.botao}
      </Button>
      {estado === "erro" && <p className="text-[11px] text-bear">{t.erro}</p>}
    </div>
  );
}
