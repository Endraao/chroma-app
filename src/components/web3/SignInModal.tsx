"use client";

 
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
import { cn } from "@/lib/utils";

type View = "main" | "all" | "nickname";

/** Cada grupo de carteiras corresponde a uma rede da plataforma. */
const REDE = {
  solana: { chain: "solana" as const, label: CHAINS.solana.label, logo: chainIcon("solana") },
  evm: { chain: "robinhood" as const, label: CHAINS.robinhood.label, logo: chainIcon("robinhood") },
};

/**
 * Entrada única da plataforma.
 *
 * As carteiras são agrupadas POR REDE, com o símbolo da rede em cima de cada
 * grupo e um "mais carteiras" próprio. Conectar a Phantom não te deixa operar
 * na Robinhood Chain, e conectar a MetaMask-EVM não te deixa comprar na
 * Solana — numa lista única a pessoa escolhe errado e acha que quebrou.
 */
export function SignInModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const account = useChromaAccount();
  const [view, setView] = useState<View>("main");
  const [scope, setScope] = useState<WalletNetwork>("solana");

  // Conectou e ainda não tem apelido: avança sozinho pra etapa do apelido.
  const step: View = account.needsNickname ? "nickname" : view;

  useEffect(() => {
    if (open && account.isSignedIn && account.account) onClose();
  }, [open, account.isSignedIn, account.account, onClose]);

  // Volta pro começo sempre que reabre.
  useEffect(() => {
    if (!open) setView("main");
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
      ? { title: "Entrar na Chroma", subtitle: "Não-custodial: a Chroma nunca guarda suas chaves." }
      : step === "all"
        ? {
            title: "Carteiras " + REDE[scope].label,
            subtitle: "Detectadas primeiro; o resto abre a página de instalação.",
          }
        : {
            title: "Escolha seu apelido",
            subtitle: "É o nome que vai aparecer no seu link de indicação.",
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
          {step === "all" && (
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
  const { solana, evm, hasAny } = useWalletOptions();

  return (
    <div className="space-y-4">
      <GoogleRow />

      <Divider>ou conecte uma carteira</Divider>

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
          Nenhuma carteira detectada neste navegador. As listadas abrem a página de instalação —
          depois de instalar, recarregue esta página.
        </p>
      )}

      <p className="text-[11px] leading-relaxed text-zinc-600">
        Ao entrar você concorda que a Chroma é um roteador não-custodial: as transações saem da sua
        carteira e a plataforma nunca tem posse dos seus fundos. Dá pra conectar as duas redes.
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
          Mais carteiras
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
      <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 transition-colors focus-within:border-chroma-violet/40">
        <SearchIcon />
        <input
          autoFocus
          value={query}
          placeholder="Buscar carteira"
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-transparent text-[13px] text-zinc-100 outline-none placeholder:text-zinc-700"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="shrink-0 text-[11px] text-zinc-600 transition-colors hover:text-zinc-300"
          >
            limpar
          </button>
        )}
      </div>

      {vazio && (
        <p className="py-6 text-center text-[12px] text-zinc-600">Nenhuma carteira com esse nome.</p>
      )}

      <WalletGroup title="Detectadas" options={filtrado.detected} />
      <WalletGroup title="Não instaladas" options={filtrado.notInstalled} muted />
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
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <button
        onClick={() =>
          SOCIAL_LOGIN_ENABLED
            ? undefined
            : setMessage(
                "Login com Google precisa de um provedor de embedded wallet (Privy, Web3Auth, Dynamic). Ainda não foi contratado — ver src/lib/social-login.ts.",
              )
        }
        className={cn(
          "flex w-full items-center justify-center gap-2.5 rounded-xl px-3 py-3 text-[14px] font-semibold transition-all",
          SOCIAL_LOGIN_ENABLED
            ? "bg-white text-zinc-900 hover:bg-zinc-100"
            : "border border-white/[0.08] bg-white/[0.03] text-zinc-500 hover:bg-white/[0.05]",
        )}
      >
        <GoogleMark />
        Continuar com o Google
        {!SOCIAL_LOGIN_ENABLED && <Badge tone="warn">em breve</Badge>}
      </button>

      {message && <p className="text-[11px] leading-snug text-warn">{message}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Apelido                                                             */
/* ------------------------------------------------------------------ */

function NicknameStep({ account }: { account: ReturnType<typeof useChromaAccount> }) {
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
          Apelido
        </label>
        <div className="flex items-center gap-1">
          <span className="text-lg font-bold text-zinc-600">@</span>
          <input
            autoFocus
            value={nickname}
            placeholder="seunome"
            maxLength={20}
            onChange={(e) => setNickname(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && canSubmit && account.claim(nickname)}
            className="w-full bg-transparent text-lg font-semibold text-zinc-100 outline-none placeholder:text-zinc-700"
          />
          {checking && <span className="shrink-0 text-[11px] text-zinc-600">…</span>}
          {!checking && status?.available && <span className="shrink-0 text-bull">✓</span>}
          <button
            onClick={() => setNickname(suggestNickname())}
            title="Sortear outro"
            className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-zinc-600 transition-colors hover:bg-white/5 hover:text-chroma-violet"
          >
            sortear
          </button>
        </div>
      </div>

      {status && !status.available && status.reason && (
        <p className="text-[12px] text-bear">{status.reason}</p>
      )}
      {account.error && <p className="text-[12px] text-bear">{account.error}</p>}

      <p className="text-[11px] leading-relaxed text-zinc-600">
        3 a 20 caracteres, só letras, números e <code>_</code>. Seu link fica{" "}
        <span className="text-chroma-violet">/?ref={nickname || "seunome"}</span>. Dá pra trocar
        depois no seu perfil — os links antigos continuam funcionando.
      </p>

      <div className="rounded-xl border border-white/[0.06] bg-ink-950/60 p-3 text-[11px] leading-relaxed text-zinc-500">
        É só um nome para o site.{" "}
        <strong className="text-zinc-300">Sua carteira não vai pedir nada</strong> — nenhuma
        assinatura, nenhuma taxa, nenhum acesso aos seus fundos.
      </div>

      <Button
        variant="chroma"
        size="lg"
        className="w-full"
        disabled={!canSubmit}
        onClick={() => account.claim(nickname)}
      >
        {account.claiming ? "Aguardando assinatura…" : "Registrar apelido"}
      </Button>

      <button
        onClick={() => account.disconnectSolana?.()}
        className="w-full py-1 text-[11px] text-zinc-600 transition-colors hover:text-zinc-400"
      >
        usar outra carteira
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
