"use client";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";
import type { SecurityReport, TokenSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * "A leitura do Obsi" na página da moeda (16/10/2026).
 *
 * O mascote resume, na voz dele, a auditoria que a página já busca: liquidez,
 * mint/freeze, concentração, idade. Não é dado novo — é o mesmo relatório do
 * painel de segurança, dito em 3 ou 4 frases que qualquer pessoa entende. As
 * frases são dele (inglês, minúsculas), a moldura segue o idioma do site.
 */
const TEXTOS = traducoes({
  en: { titulo: "Obsi's read", carregando: "obsi is reading the chain…", aviso: "AI agent · not financial advice" },
  pt: { titulo: "A leitura do Obsi", carregando: "o obsi está lendo a rede…", aviso: "Agente de IA · não é conselho financeiro" },
  zh: { titulo: "Obsi 的解读", carregando: "Obsi 正在读取链上数据…", aviso: "AI 智能体 · 非投资建议" },
});

type Tom = "bom" | "atencao" | "perigo";

function lerAMoeda(token: TokenSummary, report: SecurityReport): { frases: string[]; tom: Tom } {
  const check = (id: string) => report.checks.find((c) => c.id === id);
  const naCurva = token.bondingProgress != null && token.bondingProgress < 100;
  const frases: string[] = [];
  let perigos = 0;
  let atencoes = 0;

  // Liquidez
  const lp = check("lp_locked");
  if (naCurva) {
    frases.push(`liquidity lives in the bonding curve (${Math.round(token.bondingProgress ?? 0)}% filled). nobody can pull it.`);
  } else if (lp?.level === "safe") {
    frases.push("liquidity is locked or burned. nobody can pull it ✅");
  } else if (lp?.level === "danger") {
    frases.push("liquidity is not locked. whoever holds it could pull it.");
    perigos++;
  }

  // Poderes do dono
  if (check("mintable")?.level === "danger") {
    frases.push("mint authority is still on: more tokens can be printed.");
    perigos++;
  }
  if (check("freezable")?.level === "danger") {
    frases.push("freeze authority is on: wallets could be frozen.");
    perigos++;
  }
  if (check("transfer_hook")?.level === "danger" || check("closable")?.level === "danger") {
    frases.push("there's custom code on transfers. selling could be blocked.");
    perigos++;
  }

  // Concentração (na curva o maior "holder" é a própria curva: vale o maior detentor de verdade)
  const top10 = report.holderConcentration.top10Pct;
  const dev = report.holderConcentration.creatorPct;
  if (!naCurva && !report.confiavel && top10 > 0) {
    if (top10 >= 50) {
      frases.push(`top 10 wallets hold ${top10.toFixed(0)}%. that's heavy.`);
      atencoes++;
    } else if (top10 <= 25) {
      frases.push(`holders look spread out (top 10: ${top10.toFixed(0)}%).`);
    } else {
      frases.push(`top 10 wallets hold ${top10.toFixed(0)}%.`);
    }
  } else if (naCurva) {
    const maior = check("maior_detentor");
    if (maior?.value && maior.value !== "—") frases.push(`biggest wallet outside the curve holds ${maior.value}.`);
    if (maior?.level === "danger" || maior?.level === "warn") atencoes++;
  }
  if (dev >= 5) {
    frases.push(`the dev still holds ${dev.toFixed(1)}%.`);
    atencoes++;
  }

  // Idade
  const minutos = Math.floor((Date.now() - token.createdAt) / 60_000);
  if (token.createdAt > 0 && minutos < 60) {
    frases.push(`born ${Math.max(1, minutos)} min ago. very early, very risky.`);
    atencoes++;
  }

  const tom: Tom = perigos > 0 ? "perigo" : atencoes > 0 ? "atencao" : "bom";
  const abertura = {
    bom: "looks clean from where i stand.",
    atencao: "a few things worth watching here.",
    perigo: "careful with this one.",
  }[tom];
  return { frases: [abertura, ...frases.slice(0, 4)], tom };
}

export function ObsiDaMoeda({ token, report, carregando }: { token: TokenSummary; report: SecurityReport | null; carregando: boolean }) {
  const t = useTextos(TEXTOS);
  const leitura = report && report.checks.length ? lerAMoeda(token, report) : null;
  if (!carregando && !leitura) return null;

  return (
    <section className="rounded-xl border border-marca/20 bg-gradient-to-b from-marca/[0.05] to-transparent p-3">
      <div className="mb-2 flex items-center gap-2">
        <img src="/obsi.webp" alt="Obsi" className="size-8 rounded-full border border-marca/40 object-cover shadow-[0_0_14px_rgba(34,211,238,.3)]" />
        <h3 className="text-[14px] font-black text-zinc-50">{t.titulo}</h3>
        {leitura && (
          <span
            className={cn(
              "ml-auto size-2 rounded-full",
              leitura.tom === "bom" ? "bg-bull" : leitura.tom === "atencao" ? "bg-warn" : "bg-bear",
            )}
          />
        )}
      </div>
      {leitura ? (
        <ul className="space-y-1 text-[13px] leading-snug text-zinc-200">
          {leitura.frases.map((f, i) => (
            <li key={i} className={i === 0 ? "font-semibold text-zinc-50" : undefined}>
              {f}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-zinc-500">{t.carregando}</p>
      )}
      <div className="mt-2 text-[10px] uppercase tracking-wider text-zinc-600">{t.aviso}</div>
    </section>
  );
}
