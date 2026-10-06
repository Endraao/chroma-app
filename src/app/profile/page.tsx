"use client";

import { useIdioma, useTextos } from "@/components/IdiomaProvider";
import { traducoes, traduzirDoServidor } from "@/lib/idiomas";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { CoverArt } from "@/components/ui/CoverArt";
import { LinkedWallets } from "@/components/profile/LinkedWallets";
import {
  PhotoPicker,
  EspecDaFoto,
  type RecadoDaFoto,
} from "@/components/profile/PhotoPicker";
import { EarningsPanel } from "@/components/profile/EarningsPanel";
import { MeusTokens } from "@/components/profile/MeusTokens";
import { EditorDeApelido } from "@/components/profile/EditorDeApelido";
import type { AffiliateSummary } from "@/lib/affiliate-types";
import { useChromaAccount } from "@/hooks/useChromaAccount";
import { useWalletBalance } from "@/hooks/useWalletBalance";
import { suggestNickname } from "@/lib/nickname-suggestions";
import { chainIcon } from "@/lib/chain-icons";
import { CHAINS } from "@/lib/web3";
import { cn, formatUsd, shortenAddress } from "@/lib/utils";

type Aba = "tokens" | "indicacoes" | "conta";

const TEXTOS = traducoes({
  en: {
    perfil: "Profile", indicadoPor: "Account referral:", nenhumaIndicacao: "none", botaoEntrar: "Sign in", cliqueEm: (b: React.ReactNode) => <>Click {b} at the top of the page.</>, trocarCapa: "Change cover", semApelido: "No nickname",
    saldo: "Balance", fecharAviso: "Close notice", abaTokens: "My tokens", abaIndicacoes: "Referrals", abaConta: "Account",
    seuLink: "Your link", copiado: "Copied", copiar: "Copy", compartilhar: "Share",
    linkGeral: (b: React.ReactNode) => <>This is your general link. To promote a specific coin, use the {b} button on its page: the link already carries your referral.</>,
    apelido: "Nickname", salvo: "saved", semApelidoMin: "no nickname", trocar: "Change", escolher: "Choose", sortear: "shuffle",
    salvando: "Saving…", salvar: "Save", cancelar: "Cancel", tamanhoFotos: "Photo sizes",
    fotoAutomatica: "Until you upload a photo, Chroma creates one automatically from your address. To change it, use the camera buttons at the top of this page.",
    naoQuebra: "does not break the links you already shared",
    trocarApelido: (b: React.ReactNode) => <>Changing your nickname {b}: old ones keep pointing to your wallet and nobody else can register them. The change needs no signature and costs no fee.</>,
  },
  pt: {
    perfil: "Perfil", indicadoPor: "Indicação da conta:", nenhumaIndicacao: "nenhuma", botaoEntrar: "Entrar", cliqueEm: (b: React.ReactNode) => <>Clique em {b} no topo da página.</>, trocarCapa: "Trocar capa", semApelido: "Sem apelido",
    saldo: "Saldo", fecharAviso: "Fechar aviso", abaTokens: "Meus tokens", abaIndicacoes: "Indicações", abaConta: "Conta",
    seuLink: "Seu link", copiado: "Copiado", copiar: "Copiar", compartilhar: "Compartilhar",
    linkGeral: (b: React.ReactNode) => <>Este é o seu link geral. Para divulgar uma moeda específica, use o botão {b} na página dela: o link já sai com a sua indicação.</>,
    apelido: "Apelido", salvo: "salvo", semApelidoMin: "sem apelido", trocar: "Trocar", escolher: "Escolher", sortear: "sortear",
    salvando: "Salvando…", salvar: "Salvar", cancelar: "Cancelar", tamanhoFotos: "Tamanho das fotos",
    fotoAutomatica: "Enquanto você não envia uma foto, a Chroma cria uma automaticamente a partir do seu endereço. Para trocar, use os botões de câmera no topo desta página.",
    naoQuebra: "não quebra os links que você já divulgou",
    trocarApelido: (b: React.ReactNode) => <>Trocar de apelido {b}: os antigos continuam apontando para a sua carteira e ninguém mais pode registrá-los. A troca não exige assinatura nem cobra taxa.</>,
  },
  zh: {
    perfil: "个人资料", indicadoPor: "账户推荐人：", nenhumaIndicacao: "无", botaoEntrar: "登录", cliqueEm: (b: React.ReactNode) => <>点击页面顶部的 {b}。</>, trocarCapa: "更换封面", semApelido: "未设置昵称",
    saldo: "余额", fecharAviso: "关闭提示", abaTokens: "我的代币", abaIndicacoes: "推荐", abaConta: "账户",
    seuLink: "你的链接", copiado: "已复制", copiar: "复制", compartilhar: "分享",
    linkGeral: (b: React.ReactNode) => <>这是你的通用链接。要推广某个代币，请在其页面使用 {b} 按钮：链接会自动带上你的推荐。</>,
    apelido: "昵称", salvo: "已保存", semApelidoMin: "未设置昵称", trocar: "更改", escolher: "选择", sortear: "随机",
    salvando: "保存中…", salvar: "保存", cancelar: "取消", tamanhoFotos: "照片尺寸",
    fotoAutomatica: "在你上传照片之前，Chroma 会根据你的地址自动生成一张。要更换，请使用页面顶部的相机按钮。",
    naoQuebra: "不会让你已分享的链接失效",
    trocarApelido: (b: React.ReactNode) => <>更换昵称{b}：旧昵称仍指向你的钱包，其他人无法注册。更换无需签名，也不收费。</>,
  },
});

/**
 * A página inteira precisa de uma fronteira de Suspense por causa do
 * `useSearchParams` lá dentro — ele suspende na renderização do servidor.
 *
 * Aqui a fronteira pode abraçar tudo, ao contrário do que vale pra barra de
 * categorias: esta é uma página, não um pedaço de moldura, então não existe
 * conteúdo irmão pra ser arrastado junto pro `<div hidden>` enquanto espera.
 */
export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <Perfil />
    </Suspense>
  );
}

function Perfil() {
  const t = useTextos(TEXTOS);
  const idioma = useIdioma();
  const account = useChromaAccount();
  const { sol, eth, usd } = useWalletBalance();

  /*
   * A ABA VEM DA URL, e isso conserta um botão que não fazia nada.
   * ---------------------------------------------------------------------------
   * O aviso "você não tem carteira nesta rede", no painel de indicação, tem um
   * botão "Vincular" que aponta pra `/profile?aba=conta`. Só que esta página
   * abria SEMPRE em "indicações", ignorando o parâmetro.
   *
   * Resultado: clicar em Vincular navegava, a tela parecia não mudar nada, e o
   * aviso continuava ali. Era impossível descobrir pela interface que a
   * ferramenta de vincular estava na outra aba.
   */
  const parametros = useSearchParams();
  const pedida = parametros.get("aba");
  const [aba, setAba] = useState<Aba>(
    pedida === "conta" || pedida === "indicacoes" ? pedida : "tokens",
  );
  const [ganhos, setGanhos] = useState<AffiliateSummary | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [origem, setOrigem] = useState("");
  /*
   * O recado das fotos mora aqui, e não dentro do botão que o gerou: o card
   * tem `overflow-hidden` pra arredondar a capa, então balão posicionado por
   * cima sai cortado. Em fluxo normal, embaixo do cabeçalho, ele cabe sempre.
   */
  const [recado, setRecado] = useState<RecadoDaFoto | null>(null);

  useEffect(() => setOrigem(window.location.origin), []);

  useEffect(() => {
    if (!account.chaveDeBusca) return;
    /*
     * Manda TODAS as carteiras conectadas, não só a preferida.
     *
     * As métricas são por CARTEIRA — é ela que recebe, o apelido é só a
     * fachada —, mas a BUSCA pela conta precisa das duas. Com `account.wallet`
     * a consulta usava o endereço da Solana (que tem prioridade), e se ele não
     * estivesse vinculado, a rota não achava a conta que existe. Ver a nota em
     * `/api/affiliate`.
     */
    fetch(`/api/affiliate?wallet=${account.chaveDeBusca}`)
      .then((r) => r.json())
      .then(setGanhos)
      .catch(() => {});
    // Refaz quando a conta nasce ou ganha carteira: a primeira busca pode
    // ter saído no meio da criação da conta e voltado "sem carteira".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.chaveDeBusca, account.account?.nickname, Object.values(account.carteiras ?? {}).join(",")]);

  if (!account.isSignedIn) {
    return (
      <div className="mx-auto max-w-lg pt-16 text-center">
        <h1 className="text-2xl font-black tracking-tight text-zinc-50">{t.perfil}</h1>
        <p className="mt-2 text-[13px] text-zinc-500">
          {t.cliqueEm(<strong className="text-zinc-300">{t.botaoEntrar}</strong>)}
        </p>
      </div>
    );
  }

  const rede = account.kind === "solana" ? CHAINS.solana : CHAINS.robinhood;
  const link = account.referralId ? `${origem}/?ref=${account.referralId}` : "";

  async function copiar() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {}
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pt-4">
      {/* Capa + identidade */}
      <Card className="overflow-hidden">
        {/*
          Toda conta já nasce com capa e avatar desenhados a partir do próprio
          endereço — ninguém cai numa faixa cinza vazia. Os botões de trocar
          ficam por cima da imagem, que é onde a pessoa procura.
        */}
        <div className="group relative h-32 overflow-hidden sm:h-40">
          <CoverArt seed={account.wallet ?? "chroma"} src={account.account?.cover} />

          {account.wallet && (
            <div className="absolute right-3 top-3">
              <PhotoPicker
                campo="cover"
                wallet={account.wallet}
                onSaved={(url) => account.aplicarFoto("cover", url)}
                onRecado={setRecado}
                className="h-8 gap-1.5 px-3 text-[12px] font-semibold"
              >
                <span className="flex items-center gap-1.5">
                  <CameraIcon /> {t.trocarCapa}
                </span>
              </PhotoPicker>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-4 px-5 pb-5">
          <div className="relative -mt-10">
            <Avatar
              seed={account.wallet ?? "chroma"}
              src={account.account?.avatar}
              size={80}
              className="ring-4 ring-ink-900"
            />
            {account.wallet && (
              <PhotoPicker
                campo="avatar"
                wallet={account.wallet}
                onSaved={(url) => account.aplicarFoto("avatar", url)}
                onRecado={setRecado}
                className="absolute -bottom-0.5 -right-0.5 size-7"
              >
                <CameraIcon />
              </PhotoPicker>
            )}
          </div>

          <div className="min-w-0 flex-1 pb-1">
            <h1 className="truncate text-xl font-black tracking-tight text-zinc-50">
              {account.account ? `@${account.account.displayName}` : t.semApelido}
            </h1>
            {/* Sempre visível: sem indicação diz "nenhuma" — escondida, parecia que não existia. */}
            {account.account && (
              <p className="mt-0.5 text-[12px] text-zinc-500">
                {t.indicadoPor}{" "}
                {account.account.indicadoPor ? (
                  <span className="font-semibold text-zinc-300">@{account.account.indicadoPor}</span>
                ) : (
                  <span className="text-zinc-600">{t.nenhumaIndicacao}</span>
                )}
              </p>
            )}
            {/* Todas as carteiras da conta, uma por rede (antes só a principal). */}
            <div className="tnum mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-zinc-500">
              {(Object.entries(account.account?.carteiras ?? {}) as [keyof typeof CHAINS, string][]).length > 0 ? (
                (Object.entries(account.account?.carteiras ?? {}) as [keyof typeof CHAINS, string][]).map(([rede, endereco]) => (
                  <span key={rede} className="flex items-center gap-1.5">
                    <img src={chainIcon(rede)} alt="" width={14} height={14} className="size-3.5 rounded-full" />
                    {shortenAddress(endereco, 5)}
                  </span>
                ))
              ) : (
                <span className="flex items-center gap-1.5">
                  <img
                    src={chainIcon(account.kind === "solana" ? "solana" : "robinhood")}
                    alt=""
                    width={14}
                    height={14}
                    className="size-3.5 rounded-full"
                  />
                  {account.wallet ? shortenAddress(account.wallet, 5) : "—"} · {rede.label}
                </span>
              )}
            </div>
          </div>

          <div className="pb-1 text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              {t.saldo}
            </div>
            <div className="tnum text-xl font-black text-zinc-50">
              {usd !== null ? formatUsd(usd) : "—"}
            </div>
            {eth !== null && (
              <div className="tnum text-[11px] text-zinc-600">{eth.toFixed(5)} ETH</div>
            )}
            {sol !== null && (
              <div className="tnum text-[11px] text-zinc-600">{sol.toFixed(4)} SOL</div>
            )}
          </div>
        </div>

        {recado && (
          <div
            className={cn(
              "mx-5 mb-5 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[12px] leading-relaxed",
              recado.tipo === "erro"
                ? "border-bear/30 bg-bear/[0.07] text-bear"
                : "border-warn/30 bg-warn/[0.07] text-warn",
            )}
          >
            <span className="flex-1">{traduzirDoServidor(recado.texto, idioma)}</span>
            <button
              onClick={() => setRecado(null)}
              aria-label={t.fecharAviso}
              className="shrink-0 px-1 opacity-60 transition-opacity hover:opacity-100"
            >
              ×
            </button>
          </div>
        )}
      </Card>

      {/* Abas */}
      <div className="flex gap-1">
        {(
          [
            ["tokens", t.abaTokens],
            ["indicacoes", t.abaIndicacoes],
            ["conta", t.abaConta],
          ] as [Aba, string][]
        ).map(([id, rotulo]) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
              aba === id
                ? "bg-marca/20 text-marca"
                : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200",
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aba === "tokens" ? (
        <MeusTokens
          chaves={[
            ...Object.values(account.conectadas),
            ...Object.values(account.carteiras),
          ].filter((c): c is string => Boolean(c))}
        />
      ) : aba === "indicacoes" ? (
        <>
          <EarningsPanel resumo={ganhos} />

          <Card>
            <CardHeader>
              <CardTitle>{t.seuLink}</CardTitle>
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
                  {copiado ? t.copiado : t.copiar}
                </Button>
              </div>
              <p className="text-[11px] leading-relaxed text-zinc-600">
                {t.linkGeral(<strong className="text-zinc-400">{t.compartilhar}</strong>)}
              </p>
            </CardBody>
          </Card>
        </>
      ) : (
        <div className="space-y-4">
          <LinkedWallets />
          <ContaTab account={account} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ContaTab({ account }: { account: ReturnType<typeof useChromaAccount> }) {
  const t = useTextos(TEXTOS);
  const [salvo, setSalvo] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.apelido}</CardTitle>
        {salvo && <Badge tone="safe">{t.salvo}</Badge>}
      </CardHeader>

      <CardBody className="space-y-3">
        <EditorDeApelido
          account={account}
          onSalvo={() => {
            setSalvo(true);
            setTimeout(() => setSalvo(false), 2500);
          }}
        />

        {/*
          As medidas ficam escritas aqui, e não só no aviso de erro: descobrir a
          resolução certa depois de a imagem ser recusada é o pior jeito de
          saber. Os números vêm de src/lib/profile-media.ts, o mesmo arquivo que
          o servidor usa pra recusar — tela e regra não têm como divergir.
        */}
        <div className="space-y-1 border-t border-white/[0.06] pt-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
            {t.tamanhoFotos}
          </div>
          <EspecDaFoto campo="avatar" className="block" />
          <EspecDaFoto campo="cover" className="block" />
          <p className="pt-1 text-[11px] leading-relaxed text-zinc-600">
            {t.fotoAutomatica}
          </p>
        </div>

        {/*
          Ponto de confiança: o apelido antigo continua resolvendo pra mesma
          carteira. Quem já espalhou o link não perde nada ao trocar de nome, e
          ninguém pode pegar o apelido largado pra se passar por você.
        */}
        <p className="border-t border-white/[0.06] pt-3 text-[11px] leading-relaxed text-zinc-600">
          {t.trocarApelido(<strong className="text-zinc-400">{t.naoQuebra}</strong>)}
        </p>
      </CardBody>
    </Card>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2a1 1 0 0 0 .84-.46l.92-1.42A1 1 0 0 1 9.3 4.7h5.4a1 1 0 0 1 .84.46l.92 1.42a1 1 0 0 0 .84.46h2.2A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
      <circle cx="12" cy="13" r="3.4" />
    </svg>
  );
}
