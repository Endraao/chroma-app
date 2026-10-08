"use client";

import { useIdioma, useTextos } from "@/components/IdiomaProvider";
import { traducoes, traduzirDoServidor } from "@/lib/idiomas";

 
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ChromaMark } from "@/components/ui/ChromaMark";
import { WalletRow, type WalletNetwork, type WalletOption } from "@/components/web3/WalletRow";
import { useChromaAccount } from "@/hooks/useChromaAccount";
import { useWalletOptions } from "@/hooks/useWalletOptions";
import { SOCIAL_LOGIN_ENABLED } from "@/lib/social-login";
import { chainIcon } from "@/lib/chain-icons";
import { sugerirApelidoDisponivel, suggestNickname } from "@/lib/nickname-suggestions";
import { CHAINS } from "@/lib/web3";
import { AbrirNaCarteira } from "@/components/web3/AbrirNaCarteira";
import { cn } from "@/lib/utils";

type View = "main" | "all" | "nickname";

/** Cada grupo de carteiras corresponde a uma rede da plataforma. */
const REDE = {
  solana: { chain: "solana" as const, label: CHAINS.solana.label, logo: chainIcon("solana") },
  evm: { chain: "robinhood" as const, label: CHAINS.robinhood.label, logo: chainIcon("robinhood") },
};

const TEXTOS = traducoes({
  en: {
    entrarTitulo: "Sign in to Chroma", entrarSub: "Non-custodial: Chroma never holds your keys.",
    carteiras: (rede: string) => `${rede} wallets`, carteirasSub: "Installed ones come first. The others open their install page.",
    apelidoTitulo: "Choose your nickname", apelidoSub: "It is the name that shows up in your referral link.",
    ouConecte: "or connect a wallet",
    nenhumaCarteira: "No wallet was found in this browser. The options above open the install page. After installing, reload this page.",
    aoEntrar: "By signing in you acknowledge that Chroma is a non-custodial interface: transactions come from your wallet and the platform never holds your funds. You can connect both networks at the same time.",
    maisCarteiras: "More wallets", buscar: "Search wallet", limpar: "clear", semNome: "No wallet with that name.",
    detectadas: "Detected", naoInstaladas: "Not installed",
    googleIndisponivel: "Google sign-in is not available yet. For now, connect with one of the wallets below.",
    google: "Continue with Google", emBreve: "soon",
    apelido: "Nickname", seuNome: "yourname", sortearOutro: "Suggest another", sortear: "shuffle",
    regras: (sub: React.ReactNode, link: React.ReactNode) => <>3 to 20 characters: letters, numbers and {sub} only. Your link will be {link}. You can change your nickname later in your profile, and old links keep working.</>,
    soUmNome: (forte: React.ReactNode) => <>It is just a name for the site. {forte} — no signature, no fee, no access to your funds.</>,
    naoPede: "Your wallet will not ask for anything",
    aguardando: "Waiting for signature…", registrar: "Register nickname", outraCarteira: "use another wallet",
  },
  pt: {
    entrarTitulo: "Entrar na Chroma", entrarSub: "Não-custodial: a Chroma nunca guarda suas chaves.",
    carteiras: (rede: string) => `Carteiras ${rede}`, carteirasSub: "As instaladas aparecem primeiro. As demais abrem a página de instalação.",
    apelidoTitulo: "Escolha seu apelido", apelidoSub: "É o nome que vai aparecer no seu link de indicação.",
    ouConecte: "ou conecte uma carteira",
    nenhumaCarteira: "Nenhuma carteira foi encontrada neste navegador. As opções acima abrem a página de instalação. Depois de instalar, recarregue esta página.",
    aoEntrar: "Ao entrar, você reconhece que a Chroma é uma interface não custodial: as transações saem da sua carteira e a plataforma nunca tem posse dos seus fundos. Você pode conectar as duas redes ao mesmo tempo.",
    maisCarteiras: "Mais carteiras", buscar: "Buscar carteira", limpar: "limpar", semNome: "Nenhuma carteira com esse nome.",
    detectadas: "Detectadas", naoInstaladas: "Não instaladas",
    googleIndisponivel: "A entrada com o Google ainda não está disponível. Por enquanto, entre com uma das carteiras abaixo.",
    google: "Continuar com o Google", emBreve: "em breve",
    apelido: "Apelido", seuNome: "seunome", sortearOutro: "Sortear outro", sortear: "sortear",
    regras: (sub: React.ReactNode, link: React.ReactNode) => <>3 a 20 caracteres, só letras, números e {sub}. Seu link fica {link}. Você pode trocar de apelido depois, no seu perfil, e os links antigos continuam funcionando.</>,
    soUmNome: (forte: React.ReactNode) => <>É só um nome para o site. {forte} — nenhuma assinatura, nenhuma taxa, nenhum acesso aos seus fundos.</>,
    naoPede: "Sua carteira não vai pedir nada",
    aguardando: "Aguardando assinatura…", registrar: "Registrar apelido", outraCarteira: "usar outra carteira",
  },
  zh: {
    entrarTitulo: "登录 Chroma", entrarSub: "非托管：Chroma 从不保管你的私钥。",
    carteiras: (rede: string) => `${rede} 钱包`, carteirasSub: "已安装的钱包排在前面，其余会打开安装页面。",
    apelidoTitulo: "选择你的昵称", apelidoSub: "这个名字会显示在你的推荐链接中。",
    ouConecte: "或连接钱包",
    nenhumaCarteira: "此浏览器中未检测到钱包。上方选项会打开安装页面，安装后请刷新本页。",
    aoEntrar: "登录即表示你了解 Chroma 是非托管界面：交易从你的钱包发出，平台从不持有你的资金。你可以同时连接两条网络。",
    maisCarteiras: "更多钱包", buscar: "搜索钱包", limpar: "清除", semNome: "没有找到该名称的钱包。",
    detectadas: "已检测到", naoInstaladas: "未安装",
    googleIndisponivel: "暂不支持 Google 登录，请先使用下方的钱包登录。",
    google: "使用 Google 继续", emBreve: "即将推出",
    apelido: "昵称", seuNome: "yourname", sortearOutro: "换一个", sortear: "随机",
    regras: (sub: React.ReactNode, link: React.ReactNode) => <>3 到 20 个字符，仅限字母、数字和 {sub}。你的链接将是 {link}。之后可以在个人资料中修改昵称，旧链接仍然有效。</>,
    soUmNome: (forte: React.ReactNode) => <>这只是站内名称。{forte} —— 无需签名、无需费用、不会访问你的资金。</>,
    naoPede: "你的钱包不会弹出任何请求",
    aguardando: "等待签名…", registrar: "注册昵称", outraCarteira: "使用其他钱包",
  },
});

/**
 * Entrada única da plataforma.
 *
 * As carteiras são agrupadas POR REDE, com o símbolo da rede em cima de cada
 * grupo e um "mais carteiras" próprio. Conectar a Phantom não te deixa operar
 * na Robinhood Chain, e conectar a MetaMask-EVM não te deixa comprar na
 * Solana — numa lista única a pessoa escolhe errado e acha que quebrou.
 */
export function SignInModal({
  open,
  onClose,
  rede,
}: {
  open: boolean;
  onClose: () => void;
  /** Só escolher a carteira desta rede (já logado, para assinar): abre na lista e não fecha sozinho. */
  rede?: WalletNetwork;
}) {
  const t = useTextos(TEXTOS);
  const account = useChromaAccount();
  const inicio: View = rede ? "all" : "main";
  const [view, setView] = useState<View>(inicio);
  const [escolhida, setScope] = useState<WalletNetwork>("solana");
  const scope = rede ?? escolhida;

  // Conectou e ainda não tem apelido: avança sozinho pra etapa do apelido.
  const step: View = account.needsNickname ? "nickname" : view;

  useEffect(() => {
    if (!rede && open && account.isSignedIn && account.account) onClose();
  }, [rede, open, account.isSignedIn, account.account, onClose]);

  // Volta pro começo sempre que reabre.
  useEffect(() => {
    if (!open) setView(inicio);
  }, [open]);

  // Esc fecha, e o fundo não rola enquanto o modal está aberto.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const titulo =
    step === "main"
      ? { title: t.entrarTitulo, subtitle: t.entrarSub }
      : step === "all"
        ? {
            title: t.carteiras(REDE[scope].label),
            subtitle: t.carteirasSub,
          }
        : {
            title: t.apelidoTitulo,
            subtitle: t.apelidoSub,
          };

  /*
   * Portal pro <body>, e não onde o componente está na árvore.
   *
   * O header usa `backdrop-blur`, e `backdrop-filter` transforma o elemento em
   * bloco de contenção pra descendentes `position: fixed`. Sem o portal, o
   * modal ficava preso dentro do header em vez de cobrir a tela.
   */
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="glass relative z-10 flex max-h-[88vh] w-full max-w-[400px] flex-col overflow-hidden">
        <header className="flex items-start gap-2 px-5 pb-3 pt-5">
          {step === "all" && !rede && (
            <button
              onClick={() => setView("main")}
              className="-ml-1.5 mt-0.5 rounded-lg px-1.5 py-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
              aria-label="Voltar"
            >
              ←
            </button>
          )}

          <div className="min-w-0 flex-1">
            {/* O cristal ancora a marca na entrada, como nos launchpads grandes. */}
            {step !== "all" && <ChromaMark size={44} className="group mb-2.5" />}
            <h2 className="text-lg font-bold text-zinc-50">{titulo.title}</h2>
            <p className="mt-0.5 text-[12px] leading-snug text-zinc-500">{titulo.subtitle}</p>
          </div>

          <button
            onClick={onClose}
            className="-mr-1.5 -mt-1 rounded-lg px-2 py-1 text-zinc-600 transition-colors hover:bg-white/5 hover:text-zinc-300"
            aria-label="Fechar"
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {step === "main" && (
            <MainStep
              onShowAll={(rede) => {
                setScope(rede);
                setView("all");
              }}
            />
          )}
          {step === "all" && <AllWalletsStep scope={scope} />}
          {step === "nickname" && <NicknameStep account={account} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Tela principal — um grupo por rede                                  */
/* ------------------------------------------------------------------ */

function MainStep({ onShowAll }: { onShowAll: (rede: WalletNetwork) => void }) {
  const t = useTextos(TEXTOS);
  const { solana, evm, hasAny } = useWalletOptions();

  return (
    <div className="space-y-4">
      <AbrirNaCarteira />
      {/* Google: só aparece quando o login social existir de verdade (pedido do dono, 05/10/2026). */}
      {SOCIAL_LOGIN_ENABLED && <GoogleRow />}

      {SOCIAL_LOGIN_ENABLED && <Divider>{t.ouConecte}</Divider>}

      <ChainGroup
        rede="solana"
        options={solana.featured}
        total={solana.all.length}
        onShowAll={() => onShowAll("solana")}
      />

      <ChainGroup
        rede="evm"
        options={evm.featured}
        total={evm.all.length}
        onShowAll={() => onShowAll("evm")}
      />

      {!hasAny && (
        <p className="rounded-xl border border-warn/25 bg-warn/[0.06] p-3 text-[12px] leading-snug text-warn">
          {t.nenhumaCarteira}
        </p>
      )}

      <p className="text-[11px] leading-relaxed text-zinc-600">
        {t.aoEntrar}
      </p>
    </div>
  );
}

function ChainGroup({
  rede,
  options,
  total,
  onShowAll,
}: {
  rede: WalletNetwork;
  options: WalletOption[];
  total: number;
  onShowAll: () => void;
}) {
  const t = useTextos(TEXTOS);
  const info = REDE[rede];

  return (
    <section>
      <div className="mb-1.5 flex items-center gap-2 px-1">
        <ChainLogo src={info.logo} label={info.label} />
        <span className="text-[12px] font-semibold text-zinc-300">{info.label}</span>
      </div>

      <div className="space-y-0.5">
        {options.map((option) => (
          <WalletRow key={option.key} option={option} />
        ))}
      </div>

      <button
        onClick={onShowAll}
        className="mt-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-[12px] font-semibold text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-200"
      >
        <span className="flex items-center gap-2.5">
          <GridIcon />
          {t.maisCarteiras}
        </span>
        <span className="flex items-center gap-2 text-[11px] font-normal text-zinc-600">
          {total}
          <span>›</span>
        </span>
      </button>
    </section>
  );
}

/** Símbolo da rede. Cai num ponto colorido se o logo não tiver sido baixado. */
function ChainLogo({ src, label }: { src?: string; label: string }) {
  const [broken, setBroken] = useState(false);

  if (!src || broken) {
    return <span className="size-4 shrink-0 rounded-full bg-chroma-gradient" aria-hidden />;
  }

  return (
    <img
      src={src}
      alt={label}
      width={16}
      height={16}
      onError={() => setBroken(true)}
      className="size-4 shrink-0 rounded-full object-contain"
    />
  );
}

/* ------------------------------------------------------------------ */
/* Lista completa de uma rede                                          */
/* ------------------------------------------------------------------ */

function AllWalletsStep({ scope }: { scope: WalletNetwork }) {
  const t = useTextos(TEXTOS);
  const opcoes = useWalletOptions();
  const { detected, notInstalled } = opcoes[scope];
  const [query, setQuery] = useState("");

  const filtrado = useMemo(() => {
    const termo = query.trim().toLowerCase();
    const bate = (name: string) => !termo || name.toLowerCase().includes(termo);
    return {
      detected: detected.filter((o) => bate(o.name)),
      notInstalled: notInstalled.filter((o) => bate(o.name)),
    };
  }, [detected, notInstalled, query]);

  const vazio = filtrado.detected.length + filtrado.notInstalled.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 transition-colors focus-within:border-marca/40">
        <SearchIcon />
        <input
          autoFocus
          value={query}
          placeholder={t.buscar}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-transparent text-[13px] text-zinc-100 outline-none placeholder:text-zinc-700"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="shrink-0 text-[11px] text-zinc-600 transition-colors hover:text-zinc-300"
          >
            {t.limpar}
          </button>
        )}
      </div>

      {vazio && (
        <p className="py-6 text-center text-[12px] text-zinc-600">{t.semNome}</p>
      )}

      <WalletGroup title={t.detectadas} options={filtrado.detected} />
      <WalletGroup title={t.naoInstaladas} options={filtrado.notInstalled} muted />
    </div>
  );
}

function WalletGroup({
  title,
  options,
  muted,
}: {
  title: string;
  options: WalletOption[];
  muted?: boolean;
}) {
  if (!options.length) return null;

  return (
    <section>
      <h3
        className={cn(
          "mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider",
          muted ? "text-zinc-700" : "text-zinc-500",
        )}
      >
        {title}
      </h3>
      <div className="space-y-0.5">
        {options.map((option) => (
          <WalletRow key={option.key} option={option} />
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Google                                                              */
/* ------------------------------------------------------------------ */

function GoogleRow() {
  const t = useTextos(TEXTOS);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <button
        onClick={() =>
          SOCIAL_LOGIN_ENABLED
            ? undefined
            : setMessage(t.googleIndisponivel)
        }
        className={cn(
          "flex w-full items-center justify-center gap-2.5 rounded-xl px-3 py-3 text-[14px] font-semibold transition-all",
          SOCIAL_LOGIN_ENABLED
            ? "bg-white text-zinc-900 hover:bg-zinc-100"
            : "border border-white/[0.08] bg-white/[0.03] text-zinc-500 hover:bg-white/[0.05]",
        )}
      >
        <GoogleMark />
        {t.google}
        {!SOCIAL_LOGIN_ENABLED && <Badge tone="warn">{t.emBreve}</Badge>}
      </button>

      {message && <p className="text-[11px] leading-snug text-warn">{message}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Apelido                                                             */
/* ------------------------------------------------------------------ */

function NicknameStep({ account }: { account: ReturnType<typeof useChromaAccount> }) {
  const t = useTextos(TEXTOS);
  const idioma = useIdioma();
  const [nickname, setNickname] = useState("");
  const [status, setStatus] = useState<{ available: boolean; reason: string | null } | null>(null);
  const [checking, setChecking] = useState(false);

  /*
   * Já entra preenchido com uma sugestão livre. Quem não liga aceita e segue;
   * quem liga apaga e escreve o seu. Sem isso a tela de apelido vira um
   * obstáculo entre conectar a carteira e usar o site.
   */
  const { checkAvailability } = account;
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const sugestao = await sugerirApelidoDisponivel(checkAvailability);
      if (!cancelado) setNickname((atual) => atual || sugestao);
    })();
    return () => {
      cancelado = true;
    };
  }, [checkAvailability]);

  // Consulta com atraso, pra não bater no servidor a cada tecla.
  useEffect(() => {
    if (!nickname.trim()) {
      setStatus(null);
      return;
    }
    setChecking(true);
    const timer = window.setTimeout(async () => {
      const result = await account.checkAvailability(nickname);
      setStatus(result);
      setChecking(false);
    }, 400);

    return () => {
      window.clearTimeout(timer);
      setChecking(false);
    };
  }, [nickname, account]);

  const canSubmit = Boolean(status?.available) && !account.claiming;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          {t.apelido}
        </label>
        <div className="flex items-center gap-1">
          <span className="text-lg font-bold text-zinc-600">@</span>
          <input
            autoFocus
            value={nickname}
            placeholder={t.seuNome}
            maxLength={20}
            onChange={(e) => setNickname(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && canSubmit && account.claim(nickname)}
            className="w-full bg-transparent text-lg font-semibold text-zinc-100 outline-none placeholder:text-zinc-700"
          />
          {checking && <span className="shrink-0 text-[11px] text-zinc-600">…</span>}
          {!checking && status?.available && <span className="shrink-0 text-marca">✓</span>}
          <button
            onClick={() => setNickname(suggestNickname())}
            title={t.sortearOutro}
            className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-zinc-600 transition-colors hover:bg-white/5 hover:text-marca"
          >
            {t.sortear}
          </button>
        </div>
      </div>

      {status && !status.available && status.reason && (
        <p className="text-[12px] text-bear">{traduzirDoServidor(status.reason, idioma)}</p>
      )}
      {account.error && <p className="text-[12px] text-bear">{traduzirDoServidor(account.error, idioma)}</p>}

      <p className="text-[11px] leading-relaxed text-zinc-600">
        {t.regras(<code>_</code>, <span className="text-marca">/?ref={nickname || t.seuNome}</span>)}
      </p>

      <div className="rounded-xl border border-white/[0.06] bg-ink-950/60 p-3 text-[11px] leading-relaxed text-zinc-500">
        {t.soUmNome(<strong className="text-zinc-300">{t.naoPede}</strong>)}
      </div>

      <Button
        variant="chroma"
        size="lg"
        className="w-full"
        disabled={!canSubmit}
        onClick={() => account.claim(nickname)}
      >
        {account.claiming ? t.aguardando : t.registrar}
      </Button>

      <button
        onClick={() => account.disconnectSolana?.()}
        className="w-full py-1 text-[11px] text-zinc-600 transition-colors hover:text-zinc-400"
      >
        {t.outraCarteira}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-0.5">
      <div className="h-px flex-1 bg-white/[0.08]" />
      <span className="text-[11px] text-zinc-600">{children}</span>
      <div className="h-px flex-1 bg-white/[0.08]" />
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8H1.4v3.1A12 12 0 0 0 12 24z"
      />
      <path fill="#FBBC05" d="M5.3 14.3a7.1 7.1 0 0 1 0-4.6V6.6H1.4a12 12 0 0 0 0 10.8l3.9-3.1z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l3.9 3.1A7.2 7.2 0 0 1 12 4.8z"
      />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-zinc-600" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
