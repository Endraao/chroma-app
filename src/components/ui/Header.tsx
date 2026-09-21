"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AccountMenu } from "@/components/web3/AccountMenu";
import { ChromaMark } from "@/components/ui/ChromaMark";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Explorar" },
  { href: "/create", label: "Criar token" },
  { href: "/affiliate", label: "Afiliados" },
  { href: "/fees", label: "Taxas" },
];

export function Header() {
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
      <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-4 px-4 lg:gap-6 lg:px-6">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5">
          <ChromaMark size={38} />
          <span className="text-[17px] font-bold tracking-tight text-zinc-100">Chroma</span>
        </Link>

        {/* Navegação em telas largas */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                pathname === item.href
                  ? "bg-white/[0.06] text-zinc-100"
                  : "text-zinc-500 hover:bg-white/5 hover:text-zinc-100",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <AccountMenu />

          {/*
            No celular a navegação some do cabeçalho por falta de espaço. Sem
            este botão não havia como chegar em Criar token, Afiliados ou Taxas
            — as páginas existiam e eram inalcançáveis pelo telefone.
          */}
          <div className="relative md:hidden" ref={boxRef}>
            <button
              onClick={() => setAberto((v) => !v)}
              aria-label="Abrir menu"
              aria-expanded={aberto}
              className="grid size-[38px] place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-300 transition-colors hover:border-marca/40 hover:text-white"
            >
              <MenuIcon aberto={aberto} />
            </button>

            {aberto && (
              <div className="panel absolute right-0 z-50 mt-2 w-56 p-1">
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
                    {item.label}
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
