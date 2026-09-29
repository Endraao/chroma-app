"use client";

import { useIdioma, useTextos } from "@/components/IdiomaProvider";
import { traducoes, traduzirDoServidor } from "@/lib/idiomas";

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
const TEXTOS = traducoes({
  en: {
    naoAssina: "This Solana wallet cannot sign messages. Use Phantom or Solflare.", escolhaApelido: "Choose a nickname before linking wallets.",
    reconecte: (n: string) => `Reconnect your ${n} wallet — it authorizes the link because it already belongs to this account. You can keep both connected at the same time.`,
    conecteDaConta: "Connect this account's wallet to authorize the link.",
    titulo: "Wallets that get paid", vinculadaMin: "linked", ou: " or ",
    aviso: (r: React.ReactNode) => <>To link a new wallet, reconnect your {r} — it authorizes, because it already belongs to this account. You can keep both connected at the same time.</>,
    recebeEm: (m: string) => `paid in ${m}`, nenhuma: "none — referrals on this network are not paid",
    assinando: "Signing…", conectar: "Connect", trocarPraEsta: "Switch to this one", vinculada: "Linked", vincular: "Link",
    umaAssinatura: "a signature", naoTransacao: "is not a transaction",
    explica: (a: React.ReactNode, b: React.ReactNode) => <>Linking asks for {a} from the wallet already on the account — that is how we confirm the new wallet is yours too. Signing a message {b}: it does not move funds nor grant any permission over them.</>,
  },
  pt: {
    naoAssina: "Esta carteira Solana não sabe assinar mensagens. Use a Phantom ou a Solflare.", escolhaApelido: "Escolha um apelido antes de vincular carteiras.",
    reconecte: (n: string) => `Reconecte sua carteira ${n} — é ela que autoriza a vinculação, porque já pertence a esta conta. Pode manter as duas conectadas ao mesmo tempo.`,
    conecteDaConta: "Conecte a carteira desta conta para autorizar a vinculação.",
    titulo: "Carteiras que recebem", vinculadaMin: "vinculada", ou: " ou ",
    aviso: (r: React.ReactNode) => <>Para vincular uma carteira nova, reconecte a sua {r} — é ela que autoriza, porque já pertence a esta conta. Você pode manter as duas conectadas ao mesmo tempo.</>,
    recebeEm: (m: string) => `recebe em ${m}`, nenhuma: "nenhuma — indicações nesta rede não são pagas",
    assinando: "Assinando…", conectar: "Conectar", trocarPraEsta: "Trocar pra esta", vinculada: "Vinculada", vincular: "Vincular",
    umaAssinatura: "uma assinatura", naoTransacao: "não é uma transação",
    explica: (a: React.ReactNode, b: React.ReactNode) => <>Vincular pede {a} da carteira que já está na conta — é assim que confirmamos que a carteira nova também é sua. Assinar uma mensagem {b}: não move fundos nem dá qualquer permissão sobre eles.</>,
  },
  zh: {
    naoAssina: "该 Solana 钱包无法签名消息，请使用 Phantom 或 Solflare。", escolhaApelido: "请先选择昵称再关联钱包。",
    reconecte: (n: string) => `请重新连接你的 ${n} 钱包 —— 它已属于该账户，由它授权关联。两个钱包可以同时保持连接。`,
    conecteDaConta: "请连接该账户的钱包以授权关联。",
    titulo: "收款钱包", vinculadaMin: "已关联", ou: " 或 ",
    aviso: (r: React.ReactNode) => <>要关联新钱包，请重新连接你的 {r} —— 它已属于该账户，由它授权。两个钱包可以同时保持连接。</>,
    recebeEm: (m: string) => `以 ${m} 收款`, nenhuma: "无 —— 该网络上的推荐不会获得报酬",
    assinando: "签名中…", conectar: "连接", trocarPraEsta: "改用此钱包", vinculada: "已关联", vincular: "关联",
    umaAssinatura: "一次签名", naoTransacao: "不是交易",
    explica: (a: React.ReactNode, b: React.ReactNode) => <>关联需要账户中已有钱包的{a} —— 以此确认新钱包也属于你。签名消息{b}：不会转移资金，也不会授予任何权限。</>,
  },
});

export function LinkedWallets() {
  const t = useTextos(TEXTOS);
  const idioma = useIdioma();
  const account = useChromaAccount();
  const [modalAberto, setModalAberto] = useState(false);
  const [ocupada, setOcupada] = useState<ChainId | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvou, setSalvou] = useState<ChainId | null>(null);

  const { signMessage: assinarSolana } = useWallet();
  const { signMessageAsync: assinarEvm } = useSignMessage();

  const nickname = account.account?.nickname ?? null;

  /** As redes cuja carteira já pertence à conta — as que podem autorizar. */
  const redesDaConta = Object.keys(account.carteiras ?? {}) as ChainId[];
  const temCarteiraNaConta = redesDaConta.length > 0;

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
        setErro(t.naoAssina);
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
    if (!nickname) {
      setErro(t.escolhaApelido);
      return;
    }

    /*
     * SEM ASSINANTE É UM PROBLEMA DIFERENTE, E PRECISA DE OUTRA FRASE.
     * -----------------------------------------------------------------------
     * `assinante` é uma carteira que está ao mesmo tempo NA CONTA e CONECTADA
     * agora. É ela que assina a autorização — a prova de que quem está
     * vinculando é o dono da conta.
     *
     * Antes as duas condições caíam na mesma mensagem, "escolha um apelido".
     * Isso criava um beco sem saída de verdade: quem já tinha apelido, tinha a
     * carteira da conta em OUTRA rede e a desconectava, clicava em Vincular e
     * era mandado resolver algo que já estava resolvido. Não havia como
     * descobrir o que faltava pela tela.
     *
     * A frase agora diz qual rede reconectar, porque é a única informação que
     * destrava a situação.
     */
    if (!account.assinante) {
      const nomes = redesDaConta.map((c) => CHAINS[c].label).join(" ou ");

      setErro(
        temCarteiraNaConta
          ? t.reconecte(nomes)
          : t.conecteDaConta,
      );
      return;
    }

    setOcupada(chain);
    setErro(null);

    try {
      /*
       * `Date.now()` aqui é impuro de propósito e não roda em render: esta
       * função só é chamada no clique. O carimbo de hora faz parte do que vai
       * ser assinado — é ele que impede reaproveitar uma assinatura antiga
       * (ver o prazo de validade em `src/lib/wallet-auth.ts`), então não pode
       * ser fixo nem vir de fora.
       */
      // eslint-disable-next-line react-hooks/purity
      const momento = Date.now();
      const mensagem = [
        "Chroma — link wallet",
        "",
        `Account: @${nickname}`,
        `Network: ${chain}`,
        `Wallet: ${endereco}`,
        `Time: ${new Date(momento).toISOString()}`,
        "",
        "Signing only proves this wallet is yours.",
        "It does not move funds or grant any permission over them.",
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
      if (!res.ok) throw new Error(data?.error ?? "Não foi possível vincular a carteira.");

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
        <CardTitle>{t.titulo}</CardTitle>
        {salvou && <Badge tone="safe">{t.vinculadaMin}</Badge>}
      </CardHeader>

      <CardBody className="space-y-2">
        {/*
          O AVISO VEM ANTES DO CLIQUE, não depois.
          -------------------------------------------------------------------
          Sem uma carteira da conta conectada, nenhum botão "Vincular" desta
          tela funciona — falta quem assine a autorização. Antes isso só
          aparecia como erro DEPOIS de clicar, e com a frase errada.

          Um botão que não pode funcionar precisa dizer isso antes de ser
          apertado; caso contrário a pessoa clica, não entende, e conclui que
          o site está quebrado.
        */}
        {nickname && !account.assinante && temCarteiraNaConta && (
          <div className="rounded-lg border border-warn/30 bg-warn/[0.07] px-3 py-2.5 text-[11.5px] leading-relaxed text-warn">
            {t.aviso(<strong>{redesDaConta.map((c) => CHAINS[c].label).join(t.ou)}</strong>)}
          </div>
        )}

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
                    · {t.recebeEm(MOEDA_DA_REDE[chain])}
                  </span>
                </div>
                <div className="tnum truncate text-[11px] text-zinc-500">
                  {vinculada ? (
                    shortenAddress(vinculada, 6)
                  ) : (
                    <span className="text-warn">
                      {t.nenhuma}
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
                  ? t.assinando
                  : !conectada
                    ? t.conectar
                    : precisaTrocar
                      ? t.trocarPraEsta
                      : vinculada
                        ? t.vinculada
                        : t.vincular}
              </Button>
            </div>
          );
        })}

        {erro && <p className="text-[12px] text-bear">{traduzirDoServidor(erro, idioma)}</p>}

        <p className="border-t border-white/[0.06] pt-3 text-[11px] leading-relaxed text-zinc-600">
          {t.explica(<strong className="text-zinc-400">{t.umaAssinatura}</strong>, <strong className="text-zinc-400">{t.naoTransacao}</strong>)}
        </p>
      </CardBody>

      <SignInModal open={modalAberto} onClose={() => setModalAberto(false)} />
    </Card>
  );
}
