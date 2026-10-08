"use client";

import { useEffect, useState } from "react";

import { useIdioma, useTextos } from "@/components/IdiomaProvider";
import { Button } from "@/components/ui/Button";
import type { useChromaAccount } from "@/hooks/useChromaAccount";
import { traducoes, traduzirDoServidor } from "@/lib/idiomas";
import { suggestNickname } from "@/lib/nickname-suggestions";

const TEXTOS = traducoes({
  en: { semApelido: "no nickname", trocar: "Change", escolher: "Choose", sortear: "shuffle", salvando: "Saving…", salvar: "Save", cancelar: "Cancel" },
  pt: { semApelido: "sem apelido", trocar: "Trocar", escolher: "Escolher", sortear: "sortear", salvando: "Salvando…", salvar: "Salvar", cancelar: "Cancelar" },
  zh: { semApelido: "未设置昵称", trocar: "更改", escolher: "选择", sortear: "随机", salvando: "保存中…", salvar: "保存", cancelar: "取消" },
});

/**
 * Mostrar e trocar o apelido da conta.
 *
 * Vive em dois lugares — perfil e página de indicação — porque o apelido É o
 * link de indicação: quem vai divulgar quer ajustar o nome ali mesmo, sem
 * caçar a aba certa do perfil. Um componente só garante que as duas telas
 * validem e salvem do mesmo jeito.
 */
export function EditorDeApelido({
  account,
  onSalvo,
}: {
  account: ReturnType<typeof useChromaAccount>;
  onSalvo?: () => void;
}) {
  const t = useTextos(TEXTOS);
  const idioma = useIdioma();
  const [editando, setEditando] = useState(false);
  const [nickname, setNickname] = useState("");
  const [status, setStatus] = useState<{ available: boolean; reason: string | null } | null>(null);
  const [checking, setChecking] = useState(false);

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
      onSalvo?.();
    }
  }

  if (!editando) {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-xl font-bold text-zinc-100">
          @{atual ?? <span className="text-zinc-600">{t.semApelido}</span>}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setNickname(atual ?? suggestNickname());
            setEditando(true);
          }}
        >
          {atual ? t.trocar : t.escolher}
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="flex items-center gap-1">
          <span className="text-lg font-bold text-zinc-600">@</span>
          <input
            autoFocus
            value={nickname}
            maxLength={20}
            onChange={(e) => setNickname(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && podeSalvar && salvar()}
            className="w-full bg-transparent text-lg font-semibold text-zinc-100 outline-none"
          />
          {checking && <span className="shrink-0 text-[11px] text-zinc-600">…</span>}
          {!checking && status?.available && <span className="shrink-0 text-marca">✓</span>}
          <button
            onClick={() => setNickname(suggestNickname())}
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

      <div className="flex gap-2">
        <Button variant="chroma" className="flex-1" disabled={!podeSalvar} onClick={salvar}>
          {account.claiming ? t.salvando : t.salvar}
        </Button>
        <Button variant="ghost" onClick={() => setEditando(false)}>
          {t.cancelar}
        </Button>
      </div>
    </>
  );
}
