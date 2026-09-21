"use client";

import { useEffect, useState } from "react";

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
import type { AffiliateSummary } from "@/lib/affiliate-types";
import { useChromaAccount } from "@/hooks/useChromaAccount";
import { useWalletBalance } from "@/hooks/useWalletBalance";
import { suggestNickname } from "@/lib/nickname-suggestions";
import { chainIcon } from "@/lib/chain-icons";
import { CHAINS } from "@/lib/web3";
import { cn, formatUsd, shortenAddress } from "@/lib/utils";

type Aba = "indicacoes" | "conta";

export default function ProfilePage() {
  const account = useChromaAccount();
  const { sol, usd } = useWalletBalance();

  const [aba, setAba] = useState<Aba>("indicacoes");
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
    if (!account.wallet) return;
    // As métricas são por CARTEIRA: é ela que recebe, o apelido é só a fachada.
    fetch(`/api/affiliate?wallet=${account.wallet}`)
      .then((r) => r.json())
      .then(setGanhos)
      .catch(() => {});
  }, [account.wallet]);

  if (!account.isSignedIn) {
    return (
      <div className="mx-auto max-w-lg pt-16 text-center">
        <h1 className="text-2xl font-black tracking-tight text-zinc-50">Perfil</h1>
        <p className="mt-2 text-[13px] text-zinc-500">
          Clique em <strong className="text-zinc-300">Sign in</strong> no topo da página.
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
                  <CameraIcon /> Trocar capa
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
              {account.account ? `@${account.account.displayName}` : "Sem apelido"}
            </h1>
            <div className="tnum mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-zinc-500">
              <span>{account.wallet ? shortenAddress(account.wallet, 5) : "—"}</span>
              <span>·</span>
              <span className="flex items-center gap-1.5">
                { }
                <img
                  src={chainIcon(account.kind === "solana" ? "solana" : "robinhood")}
                  alt=""
                  width={14}
                  height={14}
                  className="size-3.5 rounded-full"
                />
                {rede.label}
              </span>
            </div>
          </div>

          <div className="pb-1 text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              Saldo
            </div>
            <div className="tnum text-xl font-black text-zinc-50">
              {usd !== null ? formatUsd(usd) : "—"}
            </div>
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
            <span className="flex-1">{recado.texto}</span>
            <button
              onClick={() => setRecado(null)}
              aria-label="Fechar aviso"
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
            ["indicacoes", "Indicações"],
            ["conta", "Conta"],
          ] as [Aba, string][]
        ).map(([id, rotulo]) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
              aba === id
                ? "bg-chroma-violet/20 text-chroma-violet"
                : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200",
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aba === "indicacoes" ? (
        <>
          <EarningsPanel resumo={ganhos} />

          <Card>
            <CardHeader>
              <CardTitle>Seu link</CardTitle>
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
                  {copiado ? "Copiado" : "Copiar"}
                </Button>
              </div>
              <p className="text-[11px] leading-relaxed text-zinc-600">
                Este é o link geral. Pra divulgar uma moeda específica, use o botão{" "}
                <strong className="text-zinc-400">Compartilhar</strong> na página dela — funciona
                muito melhor, porque as pessoas compartilham a moeda, não a plataforma.
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
  const [editando, setEditando] = useState(false);
  const [nickname, setNickname] = useState("");
  const [status, setStatus] = useState<{ available: boolean; reason: string | null } | null>(null);
  const [checking, setChecking] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const atual = account.account?.displayName ?? null;
  const { checkAvailability } = account;

  // Consulta com atraso, pra não bater no servidor a cada tecla.
  useEffect(() => {
    if (!editando || !nickname.trim() || nickname === atual) {
      setStatus(null);
      return;
    }
    setChecking(true);
    const timer = window.setTimeout(async () => {
      setStatus(await checkAvailability(nickname));
      setChecking(false);
    }, 400);

    return () => {
      window.clearTimeout(timer);
      setChecking(false);
    };
  }, [nickname, editando, atual, checkAvailability]);

  const podeSalvar = Boolean(status?.available) && !account.claiming && nickname !== atual;

  async function salvar() {
    if (await account.claim(nickname)) {
      setEditando(false);
      setSalvo(true);
      setTimeout(() => setSalvo(false), 2500);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Apelido</CardTitle>
        {salvo && <Badge tone="safe">salvo</Badge>}
      </CardHeader>

      <CardBody className="space-y-3">
        {!editando ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-xl font-bold text-zinc-100">
              @{atual ?? <span className="text-zinc-600">sem apelido</span>}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setNickname(atual ?? suggestNickname());
                setEditando(true);
              }}
            >
              {atual ? "Trocar" : "Escolher"}
            </Button>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex items-center gap-1">
                <span className="text-lg font-bold text-zinc-600">@</span>
                <input
                  autoFocus
                  value={nickname}
                  maxLength={20}
                  onChange={(e) =>
                    setNickname(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                  }
                  onKeyDown={(e) => e.key === "Enter" && podeSalvar && salvar()}
                  className="w-full bg-transparent text-lg font-semibold text-zinc-100 outline-none"
                />
                {checking && <span className="shrink-0 text-[11px] text-zinc-600">…</span>}
                {!checking && status?.available && <span className="shrink-0 text-bull">✓</span>}
                <button
                  onClick={() => setNickname(suggestNickname())}
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

            <div className="flex gap-2">
              <Button variant="chroma" className="flex-1" disabled={!podeSalvar} onClick={salvar}>
                {account.claiming ? "Salvando…" : "Salvar"}
              </Button>
              <Button variant="ghost" onClick={() => setEditando(false)}>
                Cancelar
              </Button>
            </div>
          </>
        )}

        {/*
          As medidas ficam escritas aqui, e não só no aviso de erro: descobrir a
          resolução certa depois de a imagem ser recusada é o pior jeito de
          saber. Os números vêm de src/lib/profile-media.ts, o mesmo arquivo que
          o servidor usa pra recusar — tela e regra não têm como divergir.
        */}
        <div className="space-y-1 border-t border-white/[0.06] pt-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
            Tamanho das fotos
          </div>
          <EspecDaFoto campo="avatar" className="block" />
          <EspecDaFoto campo="cover" className="block" />
          <p className="pt-1 text-[11px] leading-relaxed text-zinc-600">
            Sem foto enviada, a Chroma desenha uma a partir do seu endereço — por isso todo perfil
            já tem avatar e capa. Pra trocar, use os botões de câmera no topo desta página.
          </p>
        </div>

        {/*
          Ponto de confiança: o apelido antigo continua resolvendo pra mesma
          carteira. Quem já espalhou o link não perde nada ao trocar de nome, e
          ninguém pode pegar o apelido largado pra se passar por você.
        */}
        <p className="border-t border-white/[0.06] pt-3 text-[11px] leading-relaxed text-zinc-600">
          Trocar de apelido{" "}
          <strong className="text-zinc-400">não quebra os links já divulgados</strong>: os antigos
          continuam apontando pra sua carteira, e ninguém mais pode registrá-los. Não pede assinatura
          nem taxa nenhuma.
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
