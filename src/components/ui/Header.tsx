"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AccountMenu } from "@/components/web3/AccountMenu";
import { ChromaMark } from "@/components/ui/ChromaMark";
import { SeletorDeIdioma } from "@/components/ui/SeletorDeIdioma";
import { SeletorDeRede } from "@/components/ui/SeletorDeRede";
import { BuscaDeMoedas } from "@/components/ui/BuscaDeMoedas";
import { textos, type Idioma } from "@/lib/idiomas";
import { cn } from "@/lib/utils";

/*
 * O rótulo é uma CHAVE do dicionário, não o texto. Ver `src/lib/idiomas.ts`:
 * quando "Criar token" virar "Lançar moeda", a chave continua a mesma e
 * nenhuma tradução quebra junto.
 *
 * O AIRDROP NÃO ESTÁ AQUI de propósito — ele é um botão, não um item de menu,
 * e vem depois da lista. Ver o comentário na renderização.
 */
const NAV = [
  { href: "/", chave: "navExplorar" },
  { href: "/create", chave: "navCriar" },
  { href: "/affiliate", chave: "navAfiliados" },
  { href: "/ranking", chave: "navRanking" },
  { href: "/fees", chave: "navTaxas" },
] as const;

export function Header({ idioma }: { idioma: Idioma }) {
  const t = textos(idioma);
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Trocar de página fecha o menu — senão ele fica aberto sobre a nova tela.
  useEffect(() => setAberto(false), [pathname]);

  // Fecha ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAberto(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [aberto]);

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-2 px-3 sm:gap-4 sm:px-4 lg:gap-6 lg:px-6">
        <Link href="/" className="group flex shrink-0 items-center gap-2 sm:gap-2.5">
          <ChromaMark size={32} />
          {/*
            O nome na ALTURA do desenho, não num tamanho de menu.

            `leading-none` é o que torna isso possível: com entrelinha padrão a
            caixa do texto ganharia uns 40% de folga acima e abaixo, e o nome
            pareceria menor que o cristal mesmo tendo a mesma fonte. Sem a
            folga, a altura da caixa é a altura das letras.

            O valor foi medido contra o cristal de 38px, não chutado — ver a
            nota de tamanho no componente `ChromaMark`.
          */}
          <span className="text-[24px] font-bold leading-none tracking-tight text-zinc-100 sm:text-[38px]">
            Chroma
          </span>
        </Link>

        <BuscaDeMoedas />

        {/* Navegação em telas largas */}
        <nav className="hidden items-center gap-1 xl:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                pathname === item.href
                  ? "bg-white/[0.06] text-zinc-100"
                  : "text-zinc-500 hover:bg-white/5 hover:text-zinc-100",
              )}
            >
              {t[item.chave]}
            </Link>
          ))}

          {/*
            O AIRDROP É BOTÃO, E VEM POR ÚLTIMO.
            -------------------------------------------------------------
            Por último e destacado não são pedidos que brigam entre si —
            eles se reforçam. No meio da fileira, um item colorido lê como
            "item selecionado" e some entre os vizinhos; no fim, depois de
            quatro links cinzas iguais, ele é a única coisa com cor na
            sequência e o olho vai direto.

            O ponto pulsando é o mesmo recurso do "ao vivo" da régua de
            estado: diz que tem coisa acontecendo AGORA, que é exatamente o
            que uma temporada aberta precisa comunicar.
          */}
          <Link
            href="/airdrop"
            className={cn(
              "group/airdrop relative ml-1.5 flex shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-lg px-3 py-1.5",
              "text-[13px] font-bold transition-all duration-200",
              "border border-marca/40 text-marca",
              "hover:border-marca/70 hover:bg-marca/[0.12] hover:shadow-[0_0_14px_-2px_rgba(34,211,238,.45)]",
              pathname === "/airdrop" && "border-marca/70 bg-marca/[0.12]",
            )}
          >
            {/*
              O brilho que atravessa o botão a cada poucos segundos.
              `-skew-x-12` dá o ângulo de reflexo; sem ele seria uma barra
              reta passando, que lê como carregamento, não como brilho.
            */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 -left-full w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-[passar-brilho_4.5s_ease-in-out_infinite]"
            />
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-marca opacity-70" />
              <span className="relative inline-flex size-1.5 rounded-full bg-marca" />
            </span>
            <span className="relative">{t.navAirdrop}</span>
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {/*
            Rede e idioma antes da carteira, e nessa ordem.

            São as duas escolhas que mudam O QUE a pessoa vê; a carteira muda
            o que ela pode FAZER. Quem chega decide primeiro se entende a
            página e se ela mostra a rede certa — conectar vem depois disso.

            No celular os dois encolhem pro símbolo e a sigla, mas não somem:
            escondê-los deixaria quem abre pelo telefone sem jeito de trocar
            de idioma, que é justamente quem mais precisa.
          */}
          {/*
            Suspense em volta SÓ do seletor de rede, e isso não é detalhe.

            Ele lê `useSearchParams`, que suspende na renderização do
            servidor. Sem a fronteira aqui, o React empurraria o cabeçalho
            INTEIRO pra dentro do `<div hidden>` que ele usa enquanto espera —
            e já aconteceu antes neste projeto: o site respondia 200, o HTML
            tinha tudo, e a tela abria vazia.

            O reserva tem a mesma largura do botão pronto, senão o cabeçalho
            dá um salto quando ele aparece.
          */}
          {/* No celular a troca de rede fica nas abas da página (não cabe aqui). */}
          <div className="hidden sm:block">
            <Suspense fallback={<ReservaDoSeletor />}>
              <SeletorDeRede />
            </Suspense>
          </div>

          <SeletorDeIdioma atual={idioma} />

          <AccountMenu />

          {/*
            No celular a navegação some do cabeçalho por falta de espaço. Sem
            este botão não havia como chegar em Criar token, Afiliados ou Taxas
            — as páginas existiam e eram inalcançáveis pelo telefone.
          */}
          <div className="relative xl:hidden" ref={boxRef}>
            <button
              onClick={() => setAberto((v) => !v)}
              aria-label="Abrir menu"
              aria-expanded={aberto}
              className="grid size-[38px] place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-300 transition-colors hover:border-marca/40 hover:text-white"
            >
              <MenuIcon aberto={aberto} />
            </button>

            {aberto && (
              <div className="panel absolute right-0 z-50 mt-2 w-64 p-1">
                {/* A busca do cabeçalho não cabe no celular: mora aqui. */}
                <div className="p-1.5">
                  <BuscaDeMoedas movel />
                </div>
                {NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "block rounded-lg px-3 py-2.5 text-[14px] font-semibold transition-colors",
                      pathname === item.href
                        ? "bg-marca/15 text-marca"
                        : "text-zinc-300 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    {t[item.chave]}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * O espaço que o seletor de rede vai ocupar, enquanto ele não chega.
 *
 * Mesma altura e largura aproximada do botão pronto — um reserva menor faria
 * o cabeçalho inteiro deslizar pro lado no instante em que o seletor aparece,
 * que é o tipo de tremida que o olho percebe sem saber nomear.
 */
function ReservaDoSeletor() {
  return (
    <div
      aria-hidden
      className="h-9 w-[46px] rounded-lg border border-ink-700 bg-ink-800/60 sm:w-[112px]"
    />
  );
}

function MenuIcon({ aberto }: { aberto: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      {aberto ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
    </svg>
  );
}
