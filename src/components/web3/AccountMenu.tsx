"use client";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useDisconnect } from "wagmi";

import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { SignInModal } from "@/components/web3/SignInModal";
import { useChromaAccount } from "@/hooks/useChromaAccount";
import { useWalletBalance } from "@/hooks/useWalletBalance";
import { chainIcon } from "@/lib/chain-icons";
import { CHAINS, CHAIN_IDS } from "@/lib/web3";
import { cn, formatUsd, shortenAddress } from "@/lib/utils";

/**
 * O canto da conta: criar, saldo e avatar com menu.
 *
 * Substitui o par "não-custodial" + "Escolher apelido" que estava aqui antes.
 * Aquilo ocupava o espaço nobre do cabeçalho com um selo que ninguém clica e
 * um aviso de pendência; este bloco entrega as três ações que a pessoa logada
 * de fato usa — lançar moeda, conferir saldo e abrir o perfil.
 */
const TEXTOS = traducoes({
  en: { entrar: "Sign in", carteiraExterna: "external wallet", criar: "Create token", abrirMenu: "Open account menu", escolherApelido: "Choose a nickname", verPerfil: "View profile", suasRedes: "Your networks", esconderSaldo: "Hide balance", mostrarSaldo: "Show balance", naoPertence: "This wallet is not linked to your account yet", vincular: "link", conectar: "connect", emEth: "In ETH", emSol: "In SOL", emMoedas: "In coins", moeda: "coin", moedas: "coins", taxas: "Fees", indicacoes: "Referrals", sair: "Sign out" },
  pt: { entrar: "Entrar", carteiraExterna: "carteira externa", criar: "Criar token", abrirMenu: "Abrir menu da conta", escolherApelido: "Escolher apelido", verPerfil: "Ver perfil", suasRedes: "Suas redes", esconderSaldo: "Esconder saldo", mostrarSaldo: "Mostrar saldo", naoPertence: "Esta carteira ainda não pertence à sua conta", vincular: "vincular", conectar: "conectar", emEth: "Em ETH", emSol: "Em SOL", emMoedas: "Em moedas", moeda: "moeda", moedas: "moedas", taxas: "Taxas", indicacoes: "Indicações", sair: "Sair" },
  zh: { entrar: "登录", carteiraExterna: "外部钱包", criar: "创建代币", abrirMenu: "打开账户菜单", escolherApelido: "选择昵称", verPerfil: "查看资料", suasRedes: "你的网络", esconderSaldo: "隐藏余额", mostrarSaldo: "显示余额", naoPertence: "该钱包尚未关联到你的账户", vincular: "关联", conectar: "连接", emEth: "ETH 余额", emSol: "SOL 余额", emMoedas: "代币", moeda: "个代币", moedas: "个代币", taxas: "费用", indicacoes: "推荐", sair: "退出" },
});

export function AccountMenu() {
  const t = useTextos(TEXTOS);
  const [mounted, setMounted] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [saldoVisivel, setSaldoVisivel] = useState(true);

  const account = useChromaAccount();
  const { sol, eth, usd, emMoedas, quantasMoedas } = useWalletBalance();
  const { wallet: solanaWallet, disconnect: disconnectSolana } = useWallet();
  const { disconnect: disconnectEvm } = useDisconnect();
  const boxRef = useRef<HTMLDivElement>(null);

  // O estado da carteira só existe no browser: renderizar no servidor quebraria a hidratação.
  useEffect(() => setMounted(true), []);

  /*
   * Conectou e REALMENTE não tem conta: abre o modal na etapa do apelido.
   *
   * O `else` não é enfeite. Antes só existia o `if`, então se o modal abrisse
   * por engano — e abria, em toda recarga, por causa do defeito descrito em
   * `useChromaAccount` — ele nunca mais se fechava sozinho. A conta chegava
   * da rede um instante depois, `needsNickname` virava falso, e o modal
   * continuava lá pedindo um apelido a quem já tinha um.
   *
   * Era por isso que a mesma carteira acumulava dezenas de apelidos.
   */
  useEffect(() => {
    setModalOpen(account.needsNickname);
  }, [account.needsNickname]);

  // Fecha ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [menuOpen]);

  if (!mounted) return <div className="h-[38px] w-[150px] animate-pulse rounded-xl bg-ink-800" />;

  if (!account.isSignedIn) {
    return (
      <>
        <Button variant="chroma" size="sm" className="h-[38px]" onClick={() => setModalOpen(true)}>
          {t.entrar}
        </Button>
        <SignInModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    );
  }

  function sair() {
    disconnectSolana().catch(() => {});
    disconnectEvm();
    setMenuOpen(false);
  }

  const nomeCarteira = solanaWallet?.adapter.name ?? t.carteiraExterna;

  return (
    <div className="flex items-center gap-2" ref={boxRef}>
      {/* Criar token */}
      <Link
        href="/create"
        title={t.criar}
        className="grid size-[38px] place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-300 transition-colors hover:border-marca/40 hover:bg-marca/[0.08] hover:text-white"
      >
        <PlusIcon />
      </Link>

      {/* Saldo */}
      {usd !== null && (
        <Link
          href="/profile"
          className="tnum hidden h-[38px] items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-[13px] font-bold text-zinc-100 transition-colors hover:border-marca/40 sm:flex"
        >
          {saldoVisivel ? formatUsd(usd) : "••••"}
          <ChevronIcon />
        </Link>
      )}

      {/* Avatar */}
      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="block rounded-full ring-2 ring-transparent transition-all hover:ring-marca/40"
          aria-label={t.abrirMenu}
        >
          <Avatar seed={account.wallet ?? "chroma"} src={account.account?.avatar} size={38} />
        </button>

        {menuOpen && (
          <div className="panel absolute right-0 z-50 mt-2 w-[330px] overflow-hidden">
            {/* Identidade */}
            <Link
              href="/profile"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.04]"
            >
              <Avatar seed={account.wallet ?? "chroma"} src={account.account?.avatar} size={44} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold text-zinc-50">
                  {account.account ? `@${account.account.displayName}` : t.escolherApelido}
                </span>
                <span className="tnum block text-[12px] text-zinc-500">
                  {account.wallet ? shortenAddress(account.wallet, 4) : "—"}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-[12px] font-semibold text-zinc-400">
                {t.verPerfil} <span className="text-zinc-600">›</span>
              </span>
            </Link>

            {/*
              Uma linha por rede, e não "a carteira conectada".
              As duas podem estar conectadas ao mesmo tempo, e cada moeda usa a
              da rede dela — então o que importa é saber ONDE dá pra operar
              agora, não qual carteira ganhou a disputa de prioridade.
            */}
            <div className="border-y border-white/[0.06] bg-white/[0.015] px-4 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                  {t.suasRedes}
                </span>
                <button
                  onClick={() => setSaldoVisivel((v) => !v)}
                  title={saldoVisivel ? t.esconderSaldo : t.mostrarSaldo}
                  className="shrink-0 text-zinc-600 transition-colors hover:text-zinc-300"
                >
                  <EyeIcon aberto={saldoVisivel} />
                </button>
              </div>

              <div className="space-y-1.5">
                {CHAIN_IDS.map((id) => {
                  const conectada = account.conectadas[id];
                  /*
                   * CONECTADA ≠ VINCULADA, e a tela precisa dizer isso.
                   * -----------------------------------------------------
                   * `conectadas` é o que está plugado no navegador agora.
                   * `carteiras` é o que pertence à CONTA, no banco — e é
                   * só isso que recebe comissão de indicação.
                   *
                   * Esta lista mostrava as duas sob o título "Suas redes",
                   * sem separar. Uma carteira recém-conectada aparecia como
                   * se já fosse da conta, e o painel de indicação, logo ao
                   * lado, dizia "você não tem carteira nesta rede". Os dois
                   * estavam certos e pareciam se contradizer.
                   */
                  const vinculada = Boolean(account.carteiras?.[id]);
                  return (
                    <div key={id} className="flex items-center gap-2.5">
                      { }
                      <img
                        src={chainIcon(id)}
                        alt=""
                        width={18}
                        height={18}
                        className={cn(
                          "size-[18px] shrink-0 rounded-full transition-opacity",
                          !conectada && "opacity-35",
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-zinc-300">
                        {CHAINS[id].label}
                        {id === account.kind && account.kind === "solana" && (
                          <span className="pl-1.5 font-normal text-zinc-600">{nomeCarteira}</span>
                        )}
                      </span>
                      {conectada ? (
                        <span className="flex shrink-0 items-center gap-1.5">
                          {/*
                            Conectada mas FORA da conta: a comissão desta rede
                            não tem pra onde ir. O atalho leva direto pra tela
                            que resolve, em vez de deixar a pessoa procurar.
                          */}
                          {!vinculada && (
                            <Link
                              href="/profile?aba=conta"
                              onClick={() => setMenuOpen(false)}
                              title={t.naoPertence}
                              className="rounded-md border border-warn/40 px-1.5 py-0.5 text-[10px] font-bold text-warn transition-colors hover:bg-warn/10"
                            >
                              {t.vincular}
                            </Link>
                          )}
                          <span className="tnum text-[11px] text-zinc-500">
                            {shortenAddress(conectada, 3)}
                          </span>
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            setMenuOpen(false);
                            setModalOpen(true);
                          }}
                          className="shrink-0 rounded-md border border-marca/30 px-1.5 py-0.5 text-[10px] font-bold text-marca transition-colors hover:bg-marca/10"
                        >
                          {t.conectar}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/*
              Saldo detalhado: SOL e moedas em linhas separadas.

              O número de cima é a soma dos dois. Sem abrir aqui, quem comprou
              uma moeda não tinha como entender por que o total não mudou
              quando o SOL saiu da carteira — e a explicação é justamente que
              ele virou moeda.
            */}
            {(sol !== null || eth !== null) && (
              <div className="space-y-1.5 px-4 py-2.5 text-[12px]">
                {eth !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">{t.emEth}</span>
                    <span className="tnum font-semibold text-zinc-200">
                      {saldoVisivel ? `${eth.toFixed(5)} ETH` : "••••"}
                    </span>
                  </div>
                )}

                {sol !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">{t.emSol}</span>
                    <span className="tnum font-semibold text-zinc-200">
                      {saldoVisivel ? `${sol.toFixed(4)} SOL` : "••••"}
                    </span>
                  </div>
                )}

                {emMoedas !== null && emMoedas > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">
                      {t.emMoedas}
                      <span className="ml-1 text-zinc-600">
                        ({quantasMoedas} {quantasMoedas === 1 ? t.moeda : t.moedas})
                      </span>
                    </span>
                    <span className="tnum font-semibold text-zinc-200">
                      {saldoVisivel ? formatUsd(emMoedas) : "••••"}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Ações */}
            <div className="grid grid-cols-2 gap-1 border-t border-white/[0.06] p-1">
              <MenuItem href="/fees" onClick={() => setMenuOpen(false)} icon={<HelpIcon />}>
                {t.taxas}
              </MenuItem>
              <MenuItem href="/affiliate" onClick={() => setMenuOpen(false)} icon={<LinkIcon />}>
                {t.indicacoes}
              </MenuItem>
            </div>

            <div className="border-t border-white/[0.06] p-1">
              <button
                onClick={sair}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] font-semibold text-zinc-400 transition-colors hover:bg-white/5 hover:text-bear"
              >
                <ExitIcon />
                {t.sair}
              </button>
            </div>
          </div>
        )}
      </div>

      <SignInModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MenuItem({
  href,
  onClick,
  icon,
  children,
}: {
  href: string;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2.5 text-[13px] font-semibold text-zinc-400",
        "transition-colors hover:bg-white/5 hover:text-zinc-100",
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

const traco = { fill: "none", stroke: "currentColor", strokeWidth: 1.7 } as const;

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" {...traco}>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3 text-zinc-500" {...traco}>
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 text-marca" {...traco}>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M17 14h.01" strokeLinecap="round" />
    </svg>
  );
}

function EyeIcon({ aberto }: { aberto: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-4" {...traco}>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {!aberto && <path d="m4 20 16-16" strokeLinecap="round" />}
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" {...traco}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.2 2.4c-.5.2-.7.6-.7 1.1v.5M12 16.5h.01" strokeLinecap="round" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" {...traco}>
      <path d="M10 13a4 4 0 0 0 5.7.4l2.6-2.6a4 4 0 1 0-5.7-5.7l-1.5 1.5" strokeLinecap="round" />
      <path d="M14 11a4 4 0 0 0-5.7-.4l-2.6 2.6a4 4 0 1 0 5.7 5.7l1.5-1.5" strokeLinecap="round" />
    </svg>
  );
}

function ExitIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" {...traco}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" />
      <path d="m16 17 5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
