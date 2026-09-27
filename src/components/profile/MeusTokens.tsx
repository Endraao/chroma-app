"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { TokenCard } from "@/components/ui/TokenCard";
import { formatUsd } from "@/lib/utils";
import type { TokenSummary } from "@/lib/types";

interface Resposta {
  criadas: TokenSummary[];
  naCarteira: { token: TokenSummary; quantidade: number; valorUsd: number }[];
}

/**
 * As moedas da Chroma que são da pessoa: as que ela criou e as que carrega.
 *
 * `chaves` são as carteiras conectadas E as vinculadas à conta — quem lançou
 * com uma carteira e hoje está com outra conectada continua vendo o que criou.
 */
export function MeusTokens({ chaves }: { chaves: string[] }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const chave = [...new Set(chaves)].join(",");

  useEffect(() => {
    if (!chave) return;
    let cancelado = false;
    fetch(`/api/moedas/minhas?carteiras=${chave}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => !cancelado && j && setDados(j))
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [chave]);

  if (!chave) {
    return <p className="text-[13px] text-zinc-500">Conecte uma carteira para ver seus tokens.</p>;
  }
  if (!dados) return <p className="text-[13px] text-zinc-500">Carregando…</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Criados por você</CardTitle>
        </CardHeader>
        <CardBody>
          {dados.criadas.length === 0 ? (
            <p className="text-[13px] text-zinc-500">
              Você ainda não criou nenhuma moeda.{" "}
              <Link href="/create" className="text-marca hover:underline">
                Criar agora
              </Link>
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {dados.criadas.map((t) => (
                <TokenCard key={t.address} token={t} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Na sua carteira</CardTitle>
        </CardHeader>
        <CardBody>
          {dados.naCarteira.length === 0 ? (
            <p className="text-[13px] text-zinc-500">Nenhuma moeda da Chroma na sua carteira.</p>
          ) : (
            <ul className="divide-y divide-ink-700">
              {dados.naCarteira.map(({ token, quantidade, valorUsd }) => (
                <li key={token.address}>
                  <Link
                    href={`/token/${token.address}`}
                    className="flex items-center justify-between gap-3 py-2.5 text-[13px] hover:text-white"
                  >
                    <span className="font-semibold text-zinc-100">
                      {token.name} <span className="text-zinc-500">${token.symbol}</span>
                    </span>
                    <span className="tnum text-right">
                      <span className="block text-zinc-200">{formatUsd(valorUsd)}</span>
                      <span className="block text-[11px] text-zinc-500">
                        {quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
