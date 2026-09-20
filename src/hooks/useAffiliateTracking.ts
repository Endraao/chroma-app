"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { detectChainFromAddress } from "@/lib/utils";
import { REDE_DO_ENDERECO } from "@/lib/chains";
import type { ChainId } from "@/lib/types";

const STORAGE_KEY = "chroma.affiliate";

/**
 * ---------------------------------------------------------------------------
 * POLÍTICA DE ATRIBUIÇÃO — mexa aqui, não espalhado pelo código
 * ---------------------------------------------------------------------------
 * Hoje: janela de 30 dias, ÚLTIMO CLIQUE vence, e vale para a plataforma
 * inteira (todas as moedas), não só para a moeda do link clicado.
 *
 * As três decisões, e o que está em jogo em cada uma:
 *
 * JANELA (30 dias)
 *   Mais longa recompensa quem traz usuário; mais curta recompensa quem traz
 *   a operação. Os terminais de trade grandes usam atribuição longa ou
 *   permanente, porque o valor deles está em trazer o trader, não o trade.
 *
 * ÚLTIMO CLIQUE
 *   Se a pessoa chega por outro link depois, o novo promotor assume. É o que
 *   o divulgador espera ao espalhar o link dele, e evita que o primeiro
 *   promotor da história fique com a pessoa pra sempre.
 *
 * ESCOPO (plataforma inteira)
 *   Quem entrou por um link paga indicação em QUALQUER moeda que operar na
 *   janela, não só na moeda divulgada.
 *
 *   Isso não encarece nada pro trader: a fatia do afiliado sai da parte da
 *   plataforma, e o total que ele paga é o mesmo com ou sem indicação. É
 *   custo de aquisição da plataforma, não taxa extra do usuário.
 *
 *   Se um dia a escolha for pagar só na moeda divulgada, o caminho é guardar
 *   `landedOn` (já é gravado) e comparar com o token da operação na hora de
 *   montar a transação.
 *
 * REDE
 *   O que fica guardado é o REF (o apelido), não um endereço. O endereço é
 *   resolvido na hora do swap, pela rede da moeda — porque cada rede paga num
 *   endereço diferente: comissão da Robinhood é ETH e vai pra um `0x…`.
 *
 *   A versão anterior guardava um endereço só, capturado na chegada. Se ele
 *   fosse EVM e a pessoa operasse na Solana, `safePublicKey` devolvia null,
 *   o afiliado sumia e a fatia ia pra plataforma — sem erro, sem aviso, e o
 *   divulgador nunca entendia por que não recebia.
 */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface StoredAffiliate {
  /** o que veio na URL: apelido ou endereço. É a chave — o endereço sai dele. */
  ref: string;
  /** como mostrar na tela (@apelido ou endereço encurtado) */
  label: string;
  capturedAt: number;
  landedOn: string;
}

/** Cliques já reportados nesta aba — ver a trava dentro do efeito. */
const reportedClicks = new Set<string>();

function read(): StoredAffiliate | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAffiliate;
    if (!parsed?.ref || Date.now() - parsed.capturedAt > TTL_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function shorten(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * Resolve o que veio em `?ref=`.
 *
 * Aceita as duas formas: apelido (`?ref=joaozinho`) e endereço de carteira.
 * O apelido é o caminho normal, porque é o que o divulgador espalha; o
 * endereço continua valendo pra quem pegou o link antes de ter apelido, e
 * pra não quebrar links já divulgados.
 *
 * Aqui só confere que o ref EXISTE e pega o nome de exibição. O endereço fica
 * pra depois, porque ele depende da rede da moeda que a pessoa vai operar.
 */
async function conferirRef(ref: string): Promise<{ label: string } | null> {
  if (detectChainFromAddress(ref) !== "unknown") {
    return { label: shorten(ref) };
  }

  try {
    const res = await fetch(`/api/account?nickname=${encodeURIComponent(ref)}`);
    if (!res.ok) return null;
    const account = (await res.json()) as { displayName: string };
    return { label: `@${account.displayName}` };
  } catch {
    return null;
  }
}

/**
 * Endereço que recebe a comissão NESTA rede.
 *
 * Devolve null quando não há — e null é uma resposta legítima: a pessoa pode
 * não ter vinculado carteira nessa rede ainda. Nesse caso a fatia fica com a
 * plataforma, e é o painel do promotor que precisa avisá-lo, não esta função
 * inventar um endereço.
 */
async function enderecoDoRef(ref: string, chain: ChainId): Promise<string | null> {
  const redeDoRef = REDE_DO_ENDERECO(ref);
  if (redeDoRef) {
    // Ref é um endereço cru: só vale na rede dele.
    return redeDoRef === chain ? ref : null;
  }

  try {
    const res = await fetch(
      `/api/account?nickname=${encodeURIComponent(ref)}&chain=${chain}`,
    );
    if (!res.ok) return null;
    const account = (await res.json()) as { wallet: string | null };
    return account.wallet ?? null;
  } catch {
    return null;
  }
}

/**
 * @param chain rede da moeda que está sendo operada. Sem ela o hook só entrega
 * o rótulo — é o caso do aviso no topo do site, que não vai pagar nada.
 */
export function useAffiliateTracking(chain?: ChainId) {
  const searchParams = useSearchParams();
  const [entry, setEntry] = useState<StoredAffiliate | null>(null);
  const [affiliate, setAffiliate] = useState<string | null>(null);

  useEffect(() => {
    const ref = searchParams.get("ref")?.trim();

    if (!ref) {
      setEntry(read());
      return;
    }

    let cancelled = false;

    (async () => {
      const resolved = await conferirRef(ref);
      if (cancelled || !resolved) {
        // Apelido inexistente: mantém a atribuição anterior, se houver.
        if (!cancelled) setEntry(read());
        return;
      }

      const next: StoredAffiliate = {
        ref,
        label: resolved.label,
        capturedAt: Date.now(),
        landedOn: window.location.pathname,
      };

      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* modo anônimo / storage bloqueado: segue só em memória nesta sessão */
      }
      setEntry(next);

      /*
       * Um clique = um registro. Sem esta trava o contador inflaria: o hook é
       * usado por mais de um componente na mesma tela, e o StrictMode do React
       * ainda roda cada efeito duas vezes em desenvolvimento.
       */
      const guard = `${ref}:${window.location.pathname}`;
      if (!reportedClicks.has(guard)) {
        reportedClicks.add(guard);
        void fetch("/api/affiliate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            event: "click",
            ref,
            landedOn: next.landedOn,
          }),
        }).catch(() => {});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  /*
   * Resolve o endereço só quando se sabe a rede — e refaz se a pessoa abrir
   * uma moeda de outra rede sem recarregar a página.
   */
  useEffect(() => {
    if (!entry || !chain) {
      setAffiliate(null);
      return;
    }

    let cancelled = false;
    void enderecoDoRef(entry.ref, chain).then((endereco) => {
      if (!cancelled) setAffiliate(endereco);
    });

    return () => {
      cancelled = true;
    };
  }, [entry, chain]);

  return {
    /** endereço que recebe a comissão NESTA rede — é este que entra na transação */
    affiliate,
    /** o que mostrar na tela: @apelido, ou endereço encurtado */
    affiliateLabel: entry?.label ?? null,
    /** quem indicou; existe mesmo quando não há endereço pra essa rede */
    affiliateRef: entry?.ref ?? null,
    hasAffiliate: Boolean(entry?.ref),
    clear: () => {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {}
      setEntry(null);
    },
    buildReferralLink: (referralId: string, path = "/") =>
      `${typeof window !== "undefined" ? window.location.origin : ""}${path}?ref=${referralId}`,
  };
}
