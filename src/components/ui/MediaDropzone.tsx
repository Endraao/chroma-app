"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/**
 * Seleção de arquivo por clique ou arrastar-e-soltar, com validação antes do envio.
 *
 * A validação é feita aqui, no navegador, porque é o único lugar onde dá pra
 * avisar a pessoa ANTES de ela gastar upload: tamanho, formato e — o que mais
 * pega — a resolução. Descobrir que a imagem tinha 400x400 só depois de
 * lançar a moeda seria péssimo, já que a mídia não pode ser trocada depois.
 *
 * Isso NÃO substitui validação no servidor. Qualquer coisa checada no browser
 * pode ser burlada; quando o upload real existir, o backend precisa repetir
 * todas as checagens.
 */

export interface MediaSpec {
  /** limite em megabytes para imagens */
  maxSizeMb: number;
  /** limite separado para vídeo, quando diferente do de imagem */
  maxVideoSizeMb?: number;
  /** tipos MIME aceitos */
  accept: string[];
  /** menor lado permitido, em pixels */
  minDimension?: number;
  /** proporção esperada (largura/altura) e tolerância */
  aspectRatio?: { value: number; tolerance: number; label: string };
}

export interface SelectedMedia {
  file: File;
  previewUrl: string;
  kind: "image" | "video";
  width: number;
  height: number;
}

interface Props {
  spec: MediaSpec;
  value: SelectedMedia | null;
  onChange: (media: SelectedMedia | null) => void;
  title: string;
  subtitle?: string;
  /** altura da área de soltar */
  className?: string;
}

/** Lê largura e altura sem enviar nada — só carregando o arquivo local. */
function readDimensions(file: File, url: string): Promise<{ width: number; height: number; kind: "image" | "video" }> {
  return new Promise((resolve, reject) => {
    if (file.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () =>
        resolve({ width: video.videoWidth, height: video.videoHeight, kind: "video" });
      video.onerror = () => reject(new Error("não consegui ler o vídeo"));
      video.src = url;
      return;
    }

    const image = new Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight, kind: "image" });
    image.onerror = () => reject(new Error("não consegui ler a imagem"));
    image.src = url;
  });
}

export function MediaDropzone({ spec, value, onChange, title, subtitle, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // URLs de preview seguram memória: precisam ser liberadas.
  useEffect(() => {
    return () => {
      if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
    };
  }, [value?.previewUrl]);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);

      if (!spec.accept.includes(file.type)) {
        setError(`Formato não aceito. Use: ${spec.accept.map(prettyType).join(", ")}.`);
        return;
      }

      // Imagem e vídeo têm limites diferentes (15 MB e 30 MB).
      const isVideo = file.type.startsWith("video/");
      const limitMb = isVideo ? (spec.maxVideoSizeMb ?? spec.maxSizeMb) : spec.maxSizeMb;
      const sizeMb = file.size / (1024 * 1024);

      if (sizeMb > limitMb) {
        setError(
          `${isVideo ? "Vídeo" : "Imagem"} de ${sizeMb.toFixed(1)} MB. O limite é ${limitMb} MB.`,
        );
        return;
      }

      const url = URL.createObjectURL(file);

      try {
        const { width, height, kind } = await readDimensions(file, url);

        // O mínimo de 1000x1000 vale pra imagem; vídeo tem regra própria (1080p).
        if (!isVideo && spec.minDimension && Math.min(width, height) < spec.minDimension) {
          setError(
            `Resolução ${width}x${height}. O mínimo é ${spec.minDimension}x${spec.minDimension}px.`,
          );
          URL.revokeObjectURL(url);
          return;
        }

        if (spec.aspectRatio && height > 0) {
          const ratio = width / height;
          const { value: expected, tolerance, label } = spec.aspectRatio;
          if (Math.abs(ratio - expected) > tolerance) {
            setError(
              `Proporção ${ratio.toFixed(2)}:1. O recomendado é ${label} — a imagem vai ser cortada.`,
            );
            // Aviso, não bloqueio: a proporção é recomendação, não requisito.
          }
        }

        onChange({ file, previewUrl: url, kind, width, height });
      } catch (err) {
        URL.revokeObjectURL(url);
        setError(err instanceof Error ? err.message : "arquivo inválido");
      }
    },
    [spec, onChange],
  );

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  if (value) {
    return (
      <div className="space-y-2">
        <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-ink-950">
          {value.kind === "video" ? (
            <video src={value.previewUrl} className="max-h-64 w-full object-contain" controls muted />
          ) : (
            <img src={value.previewUrl} alt="" className="max-h-64 w-full object-contain" />
          )}

          <button
            onClick={() => {
              URL.revokeObjectURL(value.previewUrl);
              onChange(null);
              setError(null);
            }}
            className="absolute right-2 top-2 rounded-lg bg-black/70 px-2 py-1 text-[11px] font-semibold text-zinc-300 backdrop-blur transition-colors hover:bg-black/90 hover:text-white"
          >
            trocar
          </button>
        </div>

        <div className="tnum flex items-center justify-between text-[11px] text-zinc-600">
          <span className="truncate pr-2">{value.file.name}</span>
          <span className="shrink-0">
            {value.width}×{value.height} · {(value.file.size / (1024 * 1024)).toFixed(1)} MB
          </span>
        </div>

        {error && <p className="text-[11px] leading-snug text-warn">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-all",
          dragging
            ? "border-chroma-violet bg-chroma-violet/[0.08]"
            : "border-white/[0.12] bg-white/[0.01] hover:border-chroma-violet/40 hover:bg-white/[0.03]",
          className,
        )}
      >
        <svg viewBox="0 0 24 24" className="size-6 text-zinc-600" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>

        <div>
          <div className="text-[13px] font-bold text-zinc-200">{title}</div>
          {subtitle && <div className="text-[12px] text-zinc-600">{subtitle}</div>}
        </div>

        <Button
          variant="buy"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
        >
          Selecionar arquivo
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={spec.accept.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          // Permite escolher o MESMO arquivo de novo depois de remover.
          e.target.value = "";
        }}
      />

      {error && <p className="text-[11px] leading-snug text-bear">{error}</p>}
    </div>
  );
}

function prettyType(mime: string): string {
  return "." + (mime.split("/")[1] ?? mime).replace("jpeg", "jpg").replace("quicktime", "mov");
}

/** Lista de requisitos, no mesmo formato que a Pump.fun mostra abaixo do campo. */
export function MediaSpecList({
  columns,
}: {
  columns: { icon: "file" | "image"; title: string; items: string[] }[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {columns.map((column) => (
        <div key={column.title}>
          <div className="mb-1.5 flex items-center gap-2">
            {column.icon === "file" ? <FileIcon /> : <ImageIcon />}
            <span className="text-[12px] font-bold text-zinc-300">{column.title}</span>
          </div>
          <ul className="space-y-1">
            {column.items.map((item) => (
              <li key={item} className="flex gap-1.5 text-[11px] leading-snug text-zinc-500">
                <span className="text-zinc-700">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}
