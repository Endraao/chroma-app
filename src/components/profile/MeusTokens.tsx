"use client";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";

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

const TEXTOS = traducoes({
  en: { conecte: "Connect a wallet to see your tokens.", carregando: "Loading…", criados: "Created by you", nenhumaCriada: "You have not created any coin yet.", criarAgora: "Create now", naCarteira: "In your wallet", nenhumaNaCarteira: "No Chroma coins in your wallet." },
  pt: { conecte: "Conecte uma carteira para ver seus tokens.", carregando: "Carregando…", criados: "Criados por você", nenhumaCriada: "Você ainda não criou nenhuma moeda.", criarAgora: "Criar agora", naCarteira: "Na sua carteira", nenhumaNaCarteira: "Nenhuma moeda da Chroma na sua carteira." },
  zh: { conecte: "连接钱包以查看你的代币。", carregando: "加载中…", criados: "你创建的", nenhumaCriada: "你还没有创建任何代币。", criarAgora: "立即创建", naCarteira: "你钱包中的", nenhumaNaCarteira: "你的钱包中没有 Chroma 代币。" },
});

/**
 * As moedas da Chroma que são da pessoa: as que ela criou e as que carrega.
 *
 * `chaves` são as carteiras conectadas E as vinculadas à conta — quem lançou
 * com uma carteira e hoje está com outra conectada continua vendo o que criou.
 */
export function MeusTokens({ chaves }: { chaves: string[] }) {
  const t = useTextos(TEXTOS);
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
    return <p className="text-[13px] text-zinc-500">{t.conecte}</p>;
  }
  if (!dados) return <p className="text-[13px] text-zinc-500">{t.carregando}</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t.criados}</CardTitle>
        </CardHeader>
        <CardBody>
          {dados.criadas.length === 0 ? (
            <p className="text-[13px] text-zinc-500">
              {t.nenhumaCriada}{" "}
              <Link href="/create" className="text-marca hover:underline">
                {t.criarAgora}
              </Link>
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {dados.criadas.map((t) => (
                <TokenCard key={t.address} token={t} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.naCarteira}</CardTitle>
        </CardHeader>
        <CardBody>
          {dados.naCarteira.length === 0 ? (
            <p className="text-[13px] text-zinc-500">{t.nenhumaNaCarteira}</p>
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
                        {quantidade.toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
