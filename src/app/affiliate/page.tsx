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
    if (!account.chaveDeBusca) return;
    /*
     * Manda TODAS as carteiras conectadas, não só a preferida.
     *
     * Com `account.wallet` a busca usava o endereço da Solana (que tem
     * prioridade); se ele não estivesse vinculado à conta, a rota não achava
     * nada e o painel dizia "você não tem carteira nesta rede" para as DUAS.
     */
    fetch(`/api/affiliate?wallet=${account.chaveDeBusca}`)
      .then((r) => r.json())
      .then(setGanhos)
      .catch(() => {});
  }, [account.chaveDeBusca]);

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
          {feeLabel.affiliate} de cada swap feito por quem você trouxe cai na sua carteira{" "}
          <strong className="text-zinc-300">dentro da própria transação</strong>. Sem saque, sem
          aprovação, sem valor mínimo.
        </p>
      </div>

      {account.isSignedIn ? (
        <>
          {/*
            O LINK VEM ANTES DOS GANHOS, e a ordem é a mensagem.
            ---------------------------------------------------------------
            Antes o painel de ganhos abria a página. Pra quem ainda não
            indicou ninguém — que é todo mundo no começo — isso significava
            abrir numa tela de zeros, e o link, que é a única coisa acionável
            aqui, ficava embaixo dela.

            Ganhos são consequência; o link é a ação. A ação vem primeiro.
          */}
          <Card>
            <CardHeader>
              <CardTitle>Seu link de indicação</CardTitle>
              <Badge tone={account.account ? "safe" : "warn"}>
                {account.account ? "ativo" : "sem apelido"}
              </Badge>
            </CardHeader>
            <CardBody className="space-y-3">
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

              {/*
                A promoção explicada AQUI, colada no link.

                Num bloco separado lá embaixo ela não era lida: quem abre esta
                página quer copiar o link e sair. Se o motivo pra divulgar não
                estiver ao lado do botão de copiar, ele não chega em ninguém.
              */}
              <div className="grid gap-2 sm:grid-cols-3">
                <Promessa
                  titulo={`${feeLabel.affiliate} de cada swap`}
                  texto="Toda compra e toda venda de quem você trouxe, para sempre."
                />
                <Promessa
                  titulo="Cai sozinho na carteira"
                  texto="Na mesma transação do swap. O valor nunca passa pela plataforma."
                />
                <Promessa
                  titulo="Vale nas duas redes"
                  texto="Solana e Robinhood Chain, mesmo que a pessoa use uma carteira em cada."
                />
              </div>

              <p className="text-[11px] leading-relaxed text-zinc-600">
                Este link abre a página inicial. Para divulgar uma moeda específica, use o botão{" "}
                <strong className="text-zinc-400">Compartilhar</strong> na página dela: o link já
                sai com a sua indicação.
              </p>
            </CardBody>
          </Card>

          <EarningsPanel resumo={ganhos} />
        </>
      ) : (
        <Card>
          <CardBody className="space-y-2 py-8 text-center">
            <p className="text-[14px] font-semibold text-zinc-200">
              Entre para gerar o seu link
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
            <code className="text-marca">?ref=seuapelido</code>.
          </Passo>
          <Passo n={2} titulo="A indicação fica registrada na conta dela">
            Assim que a pessoa escolhe um apelido, a indicação passa a valer em qualquer aparelho — e
            também na {CHAINS.robinhood.label}, mesmo que ela use outra carteira lá.{" "}
            <strong className="text-zinc-300">A primeira indicação é a que vale</strong>: um link que
            chegar depois não substitui a sua.
          </Passo>
          <Passo n={3} titulo="Você recebe na hora">
            A sua parte é transferida dentro da própria transação de swap. O valor nunca passa pela
            plataforma, e cada pagamento fica registrado na blockchain.
          </Passo>

          <p className="border-t border-white/[0.06] pt-3 text-[12px] text-zinc-600">
            A sua fatia sai da parte da plataforma, não do bolso de quem compra: o trader paga o
            mesmo com ou sem indicação. Ver{" "}
            <Link href="/fees" className="text-marca hover:text-chroma-cyan">
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
      <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-marca/15 text-[11px] font-bold text-marca">
        {n}
      </span>
      <div>
        <div className="text-[13px] font-semibold text-zinc-200">{titulo}</div>
        <div className="text-zinc-500">{children}</div>
      </div>
    </div>
  );
}

/**
 * Um dos três motivos pra divulgar, ao lado do botão de copiar.
 *
 * Cartão curto e sem ícone: a informação é a FRASE. Ícone aqui só somaria
 * ruído visual a um bloco que precisa ser lido em dois segundos, entre copiar
 * o link e sair da página.
 */
function Promessa({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-lg border border-marca/20 bg-marca/[0.05] px-3 py-2.5">
      <div className="text-[12px] font-bold text-marca">{titulo}</div>
      <div className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{texto}</div>
    </div>
  );
}
