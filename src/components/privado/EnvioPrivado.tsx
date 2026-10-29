"use client";

import { useTextos } from "@/components/IdiomaProvider";
import { SaquePrivado } from "@/components/trading/SaquePrivado";
import { RequireChainWallet } from "@/components/web3/RequireChainWallet";
import { traducoes } from "@/lib/idiomas";

const TEXTOS = traducoes({
  en: {
    titulo: "Private send",
    sub: "Move SOL between wallets without leaving a link between them. Your SOL enters Cloak's privacy pool and comes out in the destination wallet: on-chain, nobody can tell who sent it.",
    passos: ["Connect your Solana wallet", "Paste the destination wallet and the amount", "Approve in your wallet and wait ~1 minute for the privacy proof"],
    aviso: "Non-custodial: Chroma never holds your SOL. Minimum 0.01 SOL. Cloak charges a small fee, shown before you send.",
  },
  pt: {
    titulo: "Envio privado",
    sub: "Mova SOL entre carteiras sem deixar ligação entre elas. O seu SOL entra no cofre de privacidade da Cloak e sai na carteira de destino: na rede, ninguém consegue saber quem enviou.",
    passos: ["Conecte a sua carteira Solana", "Cole a carteira de destino e o valor", "Aprove na carteira e espere ~1 minuto pela prova de privacidade"],
    aviso: "Sem custódia: a Chroma nunca segura o seu SOL. Mínimo de 0,01 SOL. A Cloak cobra uma taxa pequena, mostrada antes de enviar.",
  },
  zh: {
    titulo: "隐私转账",
    sub: "在钱包之间转移 SOL，不留下任何关联。你的 SOL 进入 Cloak 隐私池，再从目标钱包转出：链上没人能知道是谁发送的。",
    passos: ["连接你的 Solana 钱包", "粘贴目标钱包和金额", "在钱包中确认，等待约 1 分钟生成隐私证明"],
    aviso: "非托管：Chroma 从不持有你的 SOL。最低 0.01 SOL。Cloak 收取少量费用，发送前会显示。",
  },
});

export function EnvioPrivado() {
  const t = useTextos(TEXTOS);
  return (
    <main className="mx-auto max-w-xl space-y-5 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-[28px] font-black text-zinc-50">🔒 {t.titulo}</h1>
        <p className="text-[14px] leading-relaxed text-zinc-300">{t.sub}</p>
        <ol className="space-y-1 pt-1 text-[13px] text-zinc-400">
          {t.passos.map((p, i) => (
            <li key={p} className="flex gap-2">
              <span className="font-bold text-violet-300">{i + 1}.</span> {p}
            </li>
          ))}
        </ol>
      </header>

      <section className="rounded-xl border border-violet-400/25 bg-violet-400/[0.04] p-4">
        <RequireChainWallet chain="solana">
          <SaquePrivado modo="livre" />
        </RequireChainWallet>
      </section>

      <p className="text-[12px] text-zinc-500">{t.aviso}</p>
    </main>
  );
}
