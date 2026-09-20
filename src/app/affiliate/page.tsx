"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EarningsPanel } from "@/components/profile/EarningsPanel";
import type { AffiliateSummary } from "@/lib/affiliate-types";
import { useChromaAccount } from "@/hooks/useChromaAccount";
import { feeLabel } from "@/lib/fees";
import { CHAINS } from "@/lib/web3";

/**
 * Página do programa de indicação.
 *
 * Explica como funciona e, pra quem está logado, mostra o MESMO painel de
 * ganhos do perfil — o componente é um só.
 *
 * Antes esta página tinha o próprio painel, com os próprios tipos e uma
 * estimativa de ganhos calculada por fora. Resultado: quando o formato da API
 * mudou, ela passou a ler um campo que não existia mais e mostrava zero em
 * silêncio, porque o TypeScript não checa JSON vindo de `fetch`. Duas telas
 * com o mesmo número são duas chances de divergir.
 */
export default function AffiliatePage() {
  const account = useChromaAccount();
  const [ganhos, setGanhos] = useState<AffiliateSummary | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [origem, setOrigem] = useState("");

  useEffect(() => setOrigem(window.location.origin), []);

  useEffect(() => {
    if (!account.wallet) return;
    fetch(`/api/affiliate?wallet=${account.wallet}`)
      .then((r) => r.json())
      .then(setGanhos)
      .catch(() => {});
  }, [account.wallet]);

  const link = account.referralId ? `${origem}/?ref=${account.referralId}` : "";

  async function copiar() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      /* clipboard bloqueado: o link segue visível no campo */
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pt-4">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-zinc-50">Programa de indicação</h1>
        <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-zinc-500">
          {feeLabel.affiliate} de cada swap feito pelo seu link cai na sua carteira dentro da própria
          transação. Sem saque, sem aprovação, sem valor mínimo.
        </p>
      </div>

      {account.isSignedIn ? (
        <>
          <EarningsPanel resumo={ganhos} />

          <Card>
            <CardHeader>
              <CardTitle>Seu link geral</CardTitle>
              <Badge tone={account.account ? "safe" : "warn"}>
                {account.account ? "ativo" : "sem apelido"}
              </Badge>
            </CardHeader>
            <CardBody className="space-y-2">
              <div className="flex gap-2">
                <input
                  readOnly
                  value={link || "—"}
                  onFocus={(e) => e.currentTarget.select()}
                  className="tnum min-w-0 flex-1 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-[12px] text-zinc-300 outline-none"
                />
                <Button variant="chroma" onClick={copiar} disabled={!link}>
                  {copiado ? "Copiado" : "Copiar"}
                </Button>
              </div>
              <p className="text-[11px] leading-relaxed text-zinc-600">
                Este link leva pra home. Pra divulgar uma moeda específica, use o botão{" "}
                <strong className="text-zinc-400">Compartilhar</strong> na página dela — funciona
                muito melhor, porque as pessoas compartilham a moeda, não a plataforma.
              </p>
            </CardBody>
          </Card>
        </>
      ) : (
        <Card>
          <CardBody className="space-y-2 py-8 text-center">
            <p className="text-[14px] font-semibold text-zinc-200">
              Faça login pra gerar o seu link
            </p>
            <p className="text-[12px] text-zinc-500">
              Clique em <strong className="text-zinc-300">Sign in</strong> no topo da página.
            </p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Como funciona</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 text-[13px] leading-relaxed text-zinc-400">
          <Passo n={1} titulo="Você divulga a moeda">
            Abra a moeda e clique em <strong className="text-zinc-300">Compartilhar</strong>. Sai um
            link com o seu apelido. Qualquer página da Chroma aceita{" "}
            <code className="text-chroma-violet">?ref=seuapelido</code>.
          </Passo>
          <Passo n={2} titulo="A pessoa fica marcada por 30 dias">
            A atribuição fica no navegador dela e vale pra qualquer moeda que ela operar na janela.
            Se ela chegar depois por outro link, o mais recente passa a valer.
          </Passo>
          <Passo n={3} titulo="Você recebe no mesmo bloco">
            A transferência da sua parte vai dentro da transação de swap. O dinheiro nunca passa pela
            plataforma — cada pagamento tem comprovante on-chain.
          </Passo>

          <p className="border-t border-white/[0.06] pt-3 text-[12px] text-zinc-600">
            A sua fatia sai da parte da plataforma, não do bolso de quem compra: o trader paga o
            mesmo com ou sem indicação. Ver{" "}
            <Link href="/fees" className="text-chroma-violet hover:text-chroma-cyan">
              todas as taxas
            </Link>
            . Vale nas duas redes — {CHAINS.solana.label} e {CHAINS.robinhood.label}.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function Passo({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-chroma-violet/15 text-[11px] font-bold text-chroma-violet">
        {n}
      </span>
      <div>
        <div className="text-[13px] font-semibold text-zinc-200">{titulo}</div>
        <div className="text-zinc-500">{children}</div>
      </div>
    </div>
  );
}
