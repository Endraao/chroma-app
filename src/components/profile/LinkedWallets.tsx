"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useSignMessage } from "wagmi";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SignInModal } from "@/components/web3/SignInModal";
import { useChromaAccount } from "@/hooks/useChromaAccount";
import { chainIcon } from "@/lib/chain-icons";
import { MOEDA_DA_REDE } from "@/lib/affiliate-types";
import { CHAINS, CHAIN_IDS } from "@/lib/web3";
import { cn, shortenAddress } from "@/lib/utils";
import type { ChainId } from "@/lib/types";

/**
 * Uma carteira por rede, na mesma conta.
 *
 * Existe porque cada rede paga a indicação na própria moeda e num formato de
 * endereço diferente: comissão da Robinhood é ETH e vai pra um `0x…`, que não
 * existe na Solana. Com uma carteira só, a comissão da outra rede era
 * descartada em silêncio e ficava com a plataforma.
 *
 * Vincular EXIGE assinatura — a única operação de conta que exige. O motivo
 * está em `src/lib/wallet-auth.ts`: é a única que muda pra onde o dinheiro vai,
 * e sem prova qualquer um plugaria a própria carteira no apelido alheio.
 */
export function LinkedWallets() {
  const account = useChromaAccount();
  const [modalAberto, setModalAberto] = useState(false);
  const [ocupada, setOcupada] = useState<ChainId | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvou, setSalvou] = useState<ChainId | null>(null);

  const { signMessage: assinarSolana } = useWallet();
  const { signMessageAsync: assinarEvm } = useSignMessage();

  const nickname = account.account?.nickname ?? null;

  /**
   * Assina com a carteira que JÁ é da conta.
   *
   * Cada rede assina de um jeito: a Solana assina os bytes crus da mensagem, a
   * EVM usa `personal_sign`. O servidor confere de acordo com o formato do
   * endereço que assinou.
   */
  async function assinar(mensagem: string): Promise<string | null> {
    const assinanteEhSolana = account.assinante?.startsWith("0x") === false;

    if (assinanteEhSolana) {
      if (!assinarSolana) {
        setErro("Esta carteira Solana não sabe assinar mensagens. Use a Phantom ou a Solflare.");
        return null;
      }
      const bytes = await assinarSolana(new TextEncoder().encode(mensagem));
      return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    }

    return assinarEvm({ message: mensagem });
  }

  async function vincular(chain: ChainId) {
    const endereco = account.conectadas[chain];

    if (!endereco) {
      // Sem a carteira da rede conectada não há endereço pra vincular.
      setModalAberto(true);
      return;
    }
    if (!nickname || !account.assinante) {
      setErro("Escolha um apelido antes de vincular carteiras.");
      return;
    }

    setOcupada(chain);
    setErro(null);

    try {
      const momento = Date.now();
      const mensagem = [
        "Chroma — vincular carteira",
        "",
        `Conta: @${nickname}`,
        `Rede: ${chain}`,
        `Carteira: ${endereco}`,
        `Momento: ${new Date(momento).toISOString()}`,
        "",
        "Assinar apenas comprova que esta carteira é sua.",
        "Não move fundos e não dá permissão sobre eles.",
      ].join("\n");

      const assinatura = await assinar(mensagem);
      if (!assinatura) return;

      const res = await fetch("/api/account/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assinante: account.assinante,
          endereco,
          chain,
          mensagem,
          assinatura,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "não consegui vincular");

      account.aplicarCarteiras(data.account.carteiras ?? {});
      setSalvou(chain);
      setTimeout(() => setSalvou(null), 2500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Recusar na carteira é escolha da pessoa, não erro pra mostrar em vermelho.
      setErro(/reject|denied|User rejected/i.test(msg) ? null : msg);
    } finally {
      setOcupada(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Carteiras que recebem</CardTitle>
        {salvou && <Badge tone="safe">vinculada</Badge>}
      </CardHeader>

      <CardBody className="space-y-2">
        {CHAIN_IDS.map((chain) => {
          const meta = CHAINS[chain];
          const vinculada = account.carteiras[chain] ?? null;
          const conectada = account.conectadas[chain] ?? null;
          const precisaTrocar = Boolean(vinculada && conectada && vinculada !== conectada);

          return (
            <div
              key={chain}
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5",
                vinculada
                  ? "border-white/[0.06] bg-white/[0.02]"
                  : "border-warn/25 bg-warn/[0.05]",
              )}
            >
              <img
                src={chainIcon(chain)}
                alt=""
                width={22}
                height={22}
                className="size-[22px] shrink-0 rounded-full"
              />

              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-zinc-200">
                  {meta.label}{" "}
                  <span className="font-normal text-zinc-600">
                    · recebe em {MOEDA_DA_REDE[chain]}
                  </span>
                </div>
                <div className="tnum truncate text-[11px] text-zinc-500">
                  {vinculada ? (
                    shortenAddress(vinculada, 6)
                  ) : (
                    <span className="text-warn">
                      nenhuma — indicações nesta rede não são pagas
                    </span>
                  )}
                </div>
              </div>

              <Button
                variant={vinculada ? "ghost" : "chroma"}
                size="sm"
                disabled={ocupada === chain || (Boolean(vinculada) && !precisaTrocar)}
                onClick={() => vincular(chain)}
              >
                {ocupada === chain
                  ? "Assinando…"
                  : !conectada
                    ? "Conectar"
                    : precisaTrocar
                      ? "Trocar pra esta"
                      : vinculada
                        ? "Vinculada"
                        : "Vincular"}
              </Button>
            </div>
          );
        })}

        {erro && <p className="text-[12px] text-bear">{erro}</p>}

        <p className="border-t border-white/[0.06] pt-3 text-[11px] leading-relaxed text-zinc-600">
          Vincular pede <strong className="text-zinc-400">uma assinatura</strong> da carteira que já
          está na conta. É a única coisa aqui que pede — e pede porque é a única que muda pra onde o
          seu dinheiro vai. Assinar mensagem{" "}
          <strong className="text-zinc-400">não é transação</strong>: não move fundos nem dá
          permissão sobre eles.
        </p>
      </CardBody>

      <SignInModal open={modalAberto} onClose={() => setModalAberto(false)} />
    </Card>
  );
}
