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
 * painel de segurança, dito em 3 ou 4 frases que qualquer pessoa entende.
 * Desde 17/10/2026 as frases seguem o idioma do site, como o resto da página.
 */
const TEXTOS = traducoes({
  en: {
    titulo: "Obsi's read",
    carregando: "obsi is reading the chain…",
    aviso: "AI agent · not financial advice",
    bom: "looks clean from where i stand.",
    atencao: "a few things worth watching here.",
    perigo: "careful with this one.",
    naCurva: (pct: number) => `liquidity lives in the bonding curve (${pct}% filled). nobody can pull it.`,
    lpTravada: "liquidity is locked or burned. nobody can pull it ✅",
    lpSolta: "liquidity is not locked. whoever holds it could pull it.",
    mint: "mint authority is still on: more tokens can be printed.",
    freeze: "freeze authority is on: wallets could be frozen.",
    hook: "there's custom code on transfers. selling could be blocked.",
    top10Pesado: (p: string) => `top 10 wallets hold ${p}%. that's heavy.`,
    top10Espalhado: (p: string) => `holders look spread out (top 10: ${p}%).`,
    top10: (p: string) => `top 10 wallets hold ${p}%.`,
    maiorForaDaCurva: (v: string) => `biggest wallet outside the curve holds ${v}.`,
    dev: (p: string) => `the dev still holds ${p}%.`,
    nova: (min: number) => `born ${min} min ago. very early, very risky.`,
  },
  pt: {
    titulo: "A leitura do Obsi",
    carregando: "o obsi está lendo a rede…",
    aviso: "Agente de IA · não é conselho financeiro",
    bom: "daqui de onde eu estou, parece limpa.",
    atencao: "tem algumas coisas pra ficar de olho aqui.",
    perigo: "cuidado com essa.",
    naCurva: (pct: number) => `a liquidez fica na curva de lançamento (${pct}% preenchida). ninguém consegue tirar.`,
    lpTravada: "a liquidez está travada ou queimada. ninguém consegue tirar ✅",
    lpSolta: "a liquidez não está travada. quem tem ela pode retirar.",
    mint: "a autoridade de mint ainda está ligada: dá pra criar mais tokens.",
    freeze: "a autoridade de freeze está ligada: carteiras podem ser congeladas.",
    hook: "tem código próprio rodando nas transferências. a venda pode ser bloqueada.",
    top10Pesado: (p: string) => `as 10 maiores carteiras têm ${p}%. é concentrado.`,
    top10Espalhado: (p: string) => `os holders parecem bem distribuídos (top 10: ${p}%).`,
    top10: (p: string) => `as 10 maiores carteiras têm ${p}%.`,
    maiorForaDaCurva: (v: string) => `a maior carteira fora da curva tem ${v}.`,
    dev: (p: string) => `o dev ainda tem ${p}%.`,
    nova: (min: number) => `nasceu há ${min} min. muito cedo, muito arriscado.`,
  },
  zh: {
    titulo: "Obsi 的解读",
    carregando: "Obsi 正在读取链上数据…",
    aviso: "AI 智能体 · 非投资建议",
    bom: "从我这里看，挺干净的。",
    atencao: "这里有几件事值得留意。",
    perigo: "这个要小心。",
    naCurva: (pct: number) => `流动性在联合曲线里（已填充 ${pct}%），没人能撤走。`,
    lpTravada: "流动性已锁定或销毁，没人能撤走 ✅",
    lpSolta: "流动性没有锁定，持有者可以撤走。",
    mint: "铸币权限仍然开启：可以增发代币。",
    freeze: "冻结权限开启：钱包可能被冻结。",
    hook: "转账时会运行自定义代码，卖出可能被阻止。",
    top10Pesado: (p: string) => `前 10 大钱包持有 ${p}%，比较集中。`,
    top10Espalhado: (p: string) => `持有者看起来很分散（前 10：${p}%）。`,
    top10: (p: string) => `前 10 大钱包持有 ${p}%。`,
    maiorForaDaCurva: (v: string) => `曲线外最大的钱包持有 ${v}。`,
    dev: (p: string) => `开发者仍持有 ${p}%。`,
    nova: (min: number) => `${min} 分钟前诞生。非常早期，风险很高。`,
  },
});

type Tom = "bom" | "atencao" | "perigo";
type Frases = (typeof TEXTOS)["en"];

function lerAMoeda(token: TokenSummary, report: SecurityReport, f: Frases): { frases: string[]; tom: Tom } {
  const check = (id: string) => report.checks.find((c) => c.id === id);
  const naCurva = token.bondingProgress != null && token.bondingProgress < 100;
  const frases: string[] = [];
  let perigos = 0;
  let atencoes = 0;

  // Liquidez
  const lp = check("lp_locked");
  if (naCurva) {
    frases.push(f.naCurva(Math.round(token.bondingProgress ?? 0)));
  } else if (lp?.level === "safe") {
    frases.push(f.lpTravada);
  } else if (lp?.level === "danger") {
    frases.push(f.lpSolta);
    perigos++;
  }

  // Poderes do dono
  if (check("mintable")?.level === "danger") {
    frases.push(f.mint);
    perigos++;
  }
  if (check("freezable")?.level === "danger") {
    frases.push(f.freeze);
    perigos++;
  }
  if (check("transfer_hook")?.level === "danger" || check("closable")?.level === "danger") {
    frases.push(f.hook);
    perigos++;
  }

  // Concentração (na curva o maior "holder" é a própria curva: vale o maior detentor de verdade)
  const top10 = report.holderConcentration.top10Pct;
  const dev = report.holderConcentration.creatorPct;
  if (!naCurva && !report.confiavel && top10 > 0) {
    const p = top10.toFixed(0);
    if (top10 >= 50) {
      frases.push(f.top10Pesado(p));
      atencoes++;
    } else if (top10 <= 25) {
      frases.push(f.top10Espalhado(p));
    } else {
      frases.push(f.top10(p));
    }
  } else if (naCurva) {
    const maior = check("maior_detentor");
    if (maior?.value && maior.value !== "—") frases.push(f.maiorForaDaCurva(maior.value));
    if (maior?.level === "danger" || maior?.level === "warn") atencoes++;
  }
  if (dev >= 5) {
    frases.push(f.dev(dev.toFixed(1)));
    atencoes++;
  }

  // Idade
  const minutos = Math.floor((Date.now() - token.createdAt) / 60_000);
  if (token.createdAt > 0 && minutos < 60) {
    frases.push(f.nova(Math.max(1, minutos)));
    atencoes++;
  }

  const tom: Tom = perigos > 0 ? "perigo" : atencoes > 0 ? "atencao" : "bom";
  return { frases: [f[tom], ...frases.slice(0, 4)], tom };
}

export function ObsiDaMoeda({ token, report, carregando }: { token: TokenSummary; report: SecurityReport | null; carregando: boolean }) {
  const t = useTextos(TEXTOS);
  const leitura = report && report.checks.length ? lerAMoeda(token, report, t) : null;
  if (!carregando && !leitura) return null;

  return (
    <section className="fx-surgir rounded-xl border border-marca/20 bg-gradient-to-b from-marca/[0.05] to-transparent p-3">
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
          {leitura.frases.map((frase, i) => (
            <li key={i} className={i === 0 ? "font-semibold text-zinc-50" : undefined}>
              {frase}
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
