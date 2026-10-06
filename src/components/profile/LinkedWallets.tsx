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
import { useDonoDaCarteira } from "@/hooks/useDonoDaCarteira";
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
    recebeEm: (m: string) => `paid in ${m}`, nenhuma: (r: string) => `Connect a compatible wallet to receive your ${r} referral fees`, falta: (e: string) => `${e} is connected — click Link and sign with your account wallet to finish`, deOutra: (e: string, n: string, r: string) => `${e} already belongs to @${n}. Connect another ${r} wallet to link it here.`,
    assinando: "Signing…", conectar: "Connect", trocarPraEsta: "Switch to this one", vinculada: "Linked", vincular: "Link", desvincular: "Unlink", desvinculando: "Unlinking…",
    confirmaDesvinculo: (e: string, r: string) => `Unlink ${e} from your account? It stops receiving your ${r} referral fees. You can link another wallet afterwards.`,
    unica: "This is your account's only wallet — link another one before unlinking it.",
    outraConectada: (e: string) => `${e} is connected, but this account already has a wallet here. Unlink the current one first to link it.`,
    umaAssinatura: "a signature", naoTransacao: "is not a transaction",
    explica: (a: React.ReactNode, b: React.ReactNode) => <>Linking asks for {a} from the wallet already on the account — that is how we confirm the new wallet is yours too. Signing a message {b}: it does not move funds nor grant any permission over them.</>,
  },
  pt: {
    naoAssina: "Esta carteira Solana não sabe assinar mensagens. Use a Phantom ou a Solflare.", escolhaApelido: "Escolha um apelido antes de vincular carteiras.",
    reconecte: (n: string) => `Reconecte sua carteira ${n} — é ela que autoriza a vinculação, porque já pertence a esta conta. Pode manter as duas conectadas ao mesmo tempo.`,
    conecteDaConta: "Conecte a carteira desta conta para autorizar a vinculação.",
    titulo: "Carteiras que recebem", vinculadaMin: "vinculada", ou: " ou ",
    aviso: (r: React.ReactNode) => <>Para vincular uma carteira nova, reconecte a sua {r} — é ela que autoriza, porque já pertence a esta conta. Você pode manter as duas conectadas ao mesmo tempo.</>,
    recebeEm: (m: string) => `recebe em ${m}`, nenhuma: (r: string) => `Conecte uma carteira compatível para receber suas taxas de indicação da rede ${r}`, falta: (e: string) => `${e} está conectada — clique em Vincular e assine com a carteira da sua conta pra terminar`, deOutra: (e: string, n: string, r: string) => `${e} já é da conta @${n}. Conecte outra carteira da ${r} pra vincular aqui.`,
    assinando: "Assinando…", conectar: "Conectar", trocarPraEsta: "Trocar pra esta", vinculada: "Vinculada", vincular: "Vincular", desvincular: "Desvincular", desvinculando: "Desvinculando…",
    confirmaDesvinculo: (e: string, r: string) => `Desvincular ${e} da sua conta? Ela deixa de receber suas taxas de indicação da ${r}. Depois você pode vincular outra carteira.`,
    unica: "Esta é a única carteira da conta — vincule outra antes de desvincular esta.",
    outraConectada: (e: string) => `${e} está conectada, mas a conta já tem uma carteira aqui. Desvincule a atual primeiro pra vincular esta.`,
    umaAssinatura: "uma assinatura", naoTransacao: "não é uma transação",
    explica: (a: React.ReactNode, b: React.ReactNode) => <>Vincular pede {a} da carteira que já está na conta — é assim que confirmamos que a carteira nova também é sua. Assinar uma mensagem {b}: não move fundos nem dá qualquer permissão sobre eles.</>,
  },
  zh: {
    naoAssina: "该 Solana 钱包无法签名消息，请使用 Phantom 或 Solflare。", escolhaApelido: "请先选择昵称再关联钱包。",
    reconecte: (n: string) => `请重新连接你的 ${n} 钱包 —— 它已属于该账户，由它授权关联。两个钱包可以同时保持连接。`,
    conecteDaConta: "请连接该账户的钱包以授权关联。",
    titulo: "收款钱包", vinculadaMin: "已关联", ou: " 或 ",
    aviso: (r: React.ReactNode) => <>要关联新钱包，请重新连接你的 {r} —— 它已属于该账户，由它授权。两个钱包可以同时保持连接。</>,
    recebeEm: (m: string) => `以 ${m} 收款`, nenhuma: (r: string) => `连接兼容的钱包以接收 ${r} 的推荐费用`, falta: (e: string) => `${e} 已连接——点击「关联」并用账户钱包签名即可完成`, deOutra: (e: string, n: string, r: string) => `${e} 已属于 @${n}。请连接另一个 ${r} 钱包来关联到这里。`,
    assinando: "签名中…", conectar: "连接", trocarPraEsta: "改用此钱包", vinculada: "已关联", vincular: "关联", desvincular: "取消关联", desvinculando: "取消中…",
    confirmaDesvinculo: (e: string, r: string) => `要从账户中取消关联 ${e} 吗？它将不再接收你在 ${r} 的推荐费用。之后你可以关联其他钱包。`,
    unica: "这是账户唯一的钱包——请先关联另一个钱包再取消关联。",
    outraConectada: (e: string) => `${e} 已连接，但账户在此已有钱包。请先取消关联当前钱包。`,
    umaAssinatura: "一次签名", naoTransacao: "不是交易",
    explica: (a: React.ReactNode, b: React.ReactNode) => <>关联需要账户中已有钱包的{a} —— 以此确认新钱包也属于你。签名消息{b}：不会转移资金，也不会授予任何权限。</>,
  },
});

export function LinkedWallets() {
  const t = useTextos(TEXTOS);
  const idioma = useIdioma();
  const account = useChromaAccount();
  // A rede cuja carteira falta conectar: a lista de carteiras DAQUELA rede.
  // Sem a rede, o modal via "já logado" e fechava na hora (05/10/2026).
  const [modalAberto, setModalAberto] = useState<ChainId | null>(null);
  const [ocupada, setOcupada] = useState<ChainId | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvou, setSalvou] = useState<ChainId | null>(null);

  const { signMessage: assinarSolana } = useWallet();
  const { signMessageAsync: assinarEvm } = useSignMessage();

  const nickname = account.account?.nickname ?? null;
  // Carteira conectada que já é de OUTRA conta: avisa e não oferece "Vincular".
  const donoConectada: Record<ChainId, string | null> = {
    solana: useDonoDaCarteira(account.carteiras.solana ? null : (account.conectadas.solana ?? null)),
    robinhood: useDonoDaCarteira(account.carteiras.robinhood ? null : (account.conectadas.robinhood ?? null)),
  };

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

  /** Tira da conta a carteira desta rede (assinada por uma carteira da conta). */
  async function desvincular(chain: ChainId) {
    const atual = account.carteiras[chain];
    if (!atual || !nickname) return;
    if (redesDaConta.length <= 1) {
      setErro(t.unica);
      return;
    }
    if (!account.assinante) {
      setErro(t.reconecte(redesDaConta.map((c) => CHAINS[c].label).join(" ou ")));
      return;
    }
    if (!window.confirm(t.confirmaDesvinculo(shortenAddress(atual, 4), CHAINS[chain].label))) return;
    setOcupada(chain);
    setErro(null);
    try {
      // eslint-disable-next-line react-hooks/purity
      const momento = Date.now();
      const mensagem = [
        "Chroma — unlink wallet",
        "",
        `Account: @${nickname}`,
        `Network: ${chain}`,
        `Time: ${new Date(momento).toISOString()}`,
        "",
        "Signing only proves this account is yours.",
        "It does not move funds or grant any permission over them.",
      ].join("\n");
      const assinatura = await assinar(mensagem);
      if (!assinatura) return;
      const res = await fetch("/api/account/unlink", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assinante: account.assinante, chain, mensagem, assinatura }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Não foi possível desvincular a carteira.");
      account.aplicarCarteiras(data.account.carteiras ?? {});
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErro(/reject|denied|User rejected/i.test(msg) ? null : msg);
    } finally {
      setOcupada(null);
    }
  }

  async function vincular(chain: ChainId) {
    const endereco = account.conectadas[chain];

    if (!endereco) {
      // Sem a carteira da rede conectada não há endereço pra vincular.
      setModalAberto(chain);
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
          // Sem diferenciar maiúsculas: o mesmo endereço EVM vem "checksum" de
          // um lado e em minúsculas do outro, e aparecia "Trocar pra esta" pra
          // própria carteira já vinculada.
          const deOutra = !vinculada && donoConectada[chain] && donoConectada[chain] !== nickname ? donoConectada[chain] : null;
          const precisaTrocar = Boolean(
            vinculada && conectada && vinculada.toLowerCase() !== conectada.toLowerCase(),
          );

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
                <div className="text-[11.5px] leading-snug text-zinc-500">
                  {vinculada ? (
                    <>
                      {shortenAddress(vinculada, 6)}
                      {precisaTrocar && conectada && (
                        <span className="block font-sans text-warn">{t.outraConectada(shortenAddress(conectada, 4))}</span>
                      )}
                    </>
                  ) : (
                    <span className="font-sans text-warn">
                      {deOutra && conectada
                        ? t.deOutra(shortenAddress(conectada, 4), deOutra, meta.label)
                        : conectada
                          ? t.falta(shortenAddress(conectada, 4))
                          : t.nenhuma(meta.label)}
                    </span>
                  )}
                </div>
              </div>

              {vinculada ? (
                /* Já ligada à conta: a única ação é desvincular (uma carteira por rede). */
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={ocupada === chain || redesDaConta.length <= 1}
                  title={redesDaConta.length <= 1 ? t.unica : undefined}
                  onClick={() => desvincular(chain)}
                >
                  {ocupada === chain ? t.desvinculando : t.desvincular}
                </Button>
              ) : (
                <Button
                  variant="chroma"
                  size="sm"
                  disabled={ocupada === chain || Boolean(deOutra)}
                  onClick={() => vincular(chain)}
                >
                  {ocupada === chain ? t.assinando : !conectada ? t.conectar : t.vincular}
                </Button>
              )}
            </div>
          );
        })}

        {erro && <p className="text-[12px] text-bear">{traduzirDoServidor(erro, idioma)}</p>}

        <p className="border-t border-white/[0.06] pt-3 text-[11px] leading-relaxed text-zinc-600">
          {t.explica(<strong className="text-zinc-400">{t.umaAssinatura}</strong>, <strong className="text-zinc-400">{t.naoTransacao}</strong>)}
        </p>
      </CardBody>

      <SignInModal
        open={modalAberto !== null && !account.conectadas[modalAberto]}
        onClose={() => setModalAberto(null)}
        rede={modalAberto === "solana" ? "solana" : "evm"}
      />
    </Card>
  );
}
