"use client";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";

import { useRef, useState } from "react";

import {
  ESPECS,
  avisoDeCorte,
  formatosLegiveis,
  recusar,
  resumoDaEspec,
  type CampoDeFoto,
} from "@/lib/profile-media";
import { cn } from "@/lib/utils";

export interface RecadoDaFoto {
  tipo: "erro" | "aviso";
  texto: string;
}

/**
 * Botão de trocar foto, por cima da própria foto.
 *
 * Fica sobreposto ao avatar e à capa porque é ali que a pessoa procura — um
 * botão "trocar foto" numa aba de configurações longe da imagem obriga a
 * adivinhar qual das duas vai mudar.
 *
 * A validação acontece duas vezes de propósito. Aqui, no navegador, pra avisar
 * na hora e não gastar upload à toa; e de novo no servidor, que é a regra de
 * verdade — ver `src/lib/media-store.ts`. As duas leem a MESMA especificação
 * (`src/lib/profile-media.ts`), então nunca discordam.
 *
 * O recado de erro NÃO é desenhado aqui. A primeira versão mostrava um balão
 * posicionado por cima, e ele saía cortado: o card do perfil tem
 * `overflow-hidden` pra arredondar a capa, então qualquer coisa que escape da
 * caixa é aparada. Em vez de brigar com isso, o componente reporta o recado e
 * quem manda na tela decide onde ele cabe.
 */
export function PhotoPicker({
  campo,
  wallet,
  onSaved,
  onRecado,
  className,
  children,
}: {
  campo: CampoDeFoto;
  wallet: string;
  /** recebe a URL nova assim que o servidor confirma */
  onSaved: (url: string) => void;
  /** erro ou aviso pra exibir em algum lugar que caiba; null limpa */
  onRecado: (recado: RecadoDaFoto | null) => void;
  className?: string;
  /** o rótulo do botão */
  children: React.ReactNode;
}) {
  const espec = ESPECS[campo];
  const inputRef = useRef<HTMLInputElement>(null);

  const [enviando, setEnviando] = useState(false);

  /** Mede a imagem sem enviar nada: só carregando o arquivo local. */
  function medir(url: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("Não foi possível abrir esta imagem."));
      img.src = url;
    });
  }

  async function escolher(file: File) {
    onRecado(null);

    const url = URL.createObjectURL(file);
    try {
      const { width, height } = await medir(url);

      const motivo = recusar(espec, {
        mime: file.type,
        bytes: file.size,
        width,
        height,
      });
      if (motivo) {
        onRecado({ tipo: "erro", texto: motivo });
        return;
      }

      const corte = avisoDeCorte(espec, { width, height });
      if (corte) onRecado({ tipo: "aviso", texto: corte });

      await enviar(file);
    } catch (e) {
      onRecado({
        tipo: "erro",
        texto: e instanceof Error ? e.message : "Não foi possível ler esta imagem.",
      });
    } finally {
      URL.revokeObjectURL(url);
      // Zera o input pra escolher o MESMO arquivo de novo disparar o evento.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function enviar(file: File) {
    setEnviando(true);
    try {
      const form = new FormData();
      form.append("wallet", wallet);
      form.append("campo", campo);
      form.append("file", file);

      const res = await fetch("/api/account/photo", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Não foi possível salvar a imagem.");

      onSaved(data.url as string);
    } catch (e) {
      onRecado({ tipo: "erro", texto: e instanceof Error ? e.message : "falha no envio" });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={enviando}
        onClick={() => inputRef.current?.click()}
        title={`${espec.rotulo} — ${resumoDaEspec(espec)}`}
        className={cn(
          "grid place-items-center rounded-full bg-ink-950/70 text-zinc-100 backdrop-blur-sm",
          "border border-white/20 transition-colors hover:bg-ink-950/90 hover:border-marca/60",
          "disabled:cursor-wait disabled:opacity-60",
          className,
        )}
      >
        {enviando ? <Spinner /> : children}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={espec.aceita.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void escolher(file);
        }}
      />
    </>
  );
}

/**
 * Linha com as medidas, pra mostrar ao lado do botão.
 *
 * Fica visível antes de abrir o seletor de arquivo: descobrir a resolução certa
 * só depois de a imagem ser recusada é o pior jeito de saber.
 */
const ROTULOS = traducoes({
  en: { avatar: "Profile photo", cover: "Cover photo", ate: "up to" },
  pt: { avatar: "Foto de perfil", cover: "Foto de capa", ate: "até" },
  zh: { avatar: "头像", cover: "封面", ate: "最大" },
});

export function EspecDaFoto({ campo, className }: { campo: CampoDeFoto; className?: string }) {
  const espec = ESPECS[campo];
  const r = useTextos(ROTULOS);
  return (
    <span className={cn("text-[11px] text-zinc-600", className)}>
      {r[campo]}: <strong className="font-semibold text-zinc-500">{resumoDaEspec(espec).replace("até", r.ate)}</strong>{" "}
      · {formatosLegiveis(espec)}
    </span>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 animate-spin" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
