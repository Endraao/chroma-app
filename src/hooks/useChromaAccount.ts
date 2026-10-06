"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAccount as useWagmiAccount } from "wagmi";

import type { ChainId } from "@/lib/types";
import { refGuardado } from "@/hooks/useAffiliateTracking";

/**
 * A MetaMask devolve o endereço com maiúsculas do checksum e o arquivo pode ter
 * guardado em minúsculas. Comparar direto faria a conta parecer de outra
 * pessoa; em EVM o endereço é case-insensitive, na Solana não é.
 */
function mesmoEndereco(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  if (a.startsWith("0x") || b.startsWith("0x")) return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

export interface ChromaAccount {
  nickname: string;
  displayName: string;
  wallet: string;
  kind: "solana" | "evm";
  /** uma carteira por rede — é daqui que sai o endereço que recebe indicação */
  carteiras?: Partial<Record<ChainId, string>>;
  /** foto enviada pela pessoa; sem ela a interface gera uma a partir do endereço */
  avatar?: string;
  cover?: string;
  /** apelido de quem indicou a conta — gravado na criação, não muda */
  indicadoPor?: string | null;
}

/**
 * A identidade da pessoa na Chroma.
 *
 * A carteira continua sendo a fonte de verdade (é ela que recebe o dinheiro),
 * mas o apelido é o que aparece na interface e no link de indicação — divulgar
 * `chroma.app/?ref=joaozinho` funciona muito melhor do que divulgar
 * `chroma.app/?ref=9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin`.
 *
 * Registrar NÃO pede assinatura da carteira — é só um nome de exibição. Ver
 * `src/lib/accounts.ts` para o raciocínio e os limites disso.
 */
const EVENTO_CONTA = "chroma:conta";

export function useChromaAccount() {
  const { publicKey, disconnect: disconnectSolana, connected } = useWallet();
  const { address: evmAddress, isConnected: evmConnected } = useWagmiAccount();

  const [account, setAccount] = useState<ChromaAccount | null>(null);
  const [loading, setLoading] = useState(false);

  /**
   * Qual carteira já teve a busca de conta CONCLUÍDA.
   *
   * ---------------------------------------------------------------------------
   * POR QUE ISTO PRECISOU EXISTIR
   * ---------------------------------------------------------------------------
   * `needsNickname` era `isSignedIn && !loading && !account`, e isso abria o
   * modal de apelido em TODA recarga de página, para quem já tinha conta.
   *
   * A ordem dos acontecimentos num F5 é:
   *
   *   1. a carteira reconecta sozinha  → `isSignedIn` vira true
   *   2. o React renderiza             → `loading` ainda é false, `account` é null
   *   3. SÓ ENTÃO o efeito roda e começa a buscar a conta
   *
   * Entre o passo 2 e o 3 existe um quadro em que a expressão dava "true" —
   * não porque a pessoa não tem conta, mas porque ninguém ainda tinha
   * perguntado. O modal abria nesse quadro e não fechava mais.
   *
   * Comparar a chave resolvida com a chave atual resolve sem precisar de um
   * `setState` no corpo do efeito: quando a carteira muda, as duas param de
   * bater sozinhas, e "ainda não sei" é o estado natural.
   */
  const [chaveResolvida, setChaveResolvida] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enderecoSolana = publicKey?.toBase58() ?? null;
  const enderecoEvm = evmAddress ?? null;

  // A carteira Solana tem prioridade quando as duas estão conectadas.
  const wallet = enderecoSolana ?? enderecoEvm;
  const kind: "solana" | "evm" = publicKey ? "solana" : "evm";
  const isSignedIn = Boolean(wallet) && (connected || evmConnected);

  /** O que está conectado agora, por rede. Conectado ≠ vinculado à conta. */
  const conectadas: Partial<Record<ChainId, string>> = {};
  if (enderecoSolana) conectadas.solana = enderecoSolana;
  if (enderecoEvm) conectadas.robinhood = enderecoEvm;

  /* --- Carrega a conta de QUALQUER carteira conectada --------------- */
  /*
   * Pergunta pelas duas de uma vez. Perguntar só pela preferida faria quem
   * criou a conta com a MetaMask e depois conectou a Phantom ser tratado como
   * visitante sem conta — e a tela pediria um apelido que ele já tem.
   */
  const chaveDeBusca = [enderecoSolana, enderecoEvm].filter(Boolean).join(",");

  useEffect(() => {
    if (!chaveDeBusca) {
      setAccount(null);
      setChaveResolvida(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/account?wallet=${chaveDeBusca}`)
      .then(async (r) => {
        /*
         * Resposta de ERRO não é resposta "sem conta".
         *
         * Banco fora do ar, servidor com 500, rede caindo — em todos esses
         * casos a verdade é "não deu pra saber", e não "esta carteira nunca
         * registrou apelido". Tratar os dois igual é o que transformava uma
         * falha de infraestrutura num convite pra criar conta duplicada.
         *
         * Foi exatamente o que aconteceu: com a senha do banco recusada, o
         * site pedia apelido a cada F5 pra quem já tinha um — e o botão de
         * registrar não funcionava, porque a gravação falhava pelo mesmo
         * motivo. Trinta apelidos depois, o defeito ficou visível.
         */
        if (!r.ok) throw new Error(`conta: HTTP ${r.status}`);

        const data = (await r.json()) as ChromaAccount | null;
        if (cancelled) return;

        setAccount(data ?? null);
        setLoading(false);
        /* Só uma resposta BOA conta como "agora eu sei". */
        setChaveResolvida(chaveDeBusca);
      })
      .catch(() => {
        if (cancelled) return;
        setAccount(null);
        setLoading(false);
        /*
         * `chaveResolvida` fica como está — ou seja, diferente da chave atual.
         * `needsNickname` continua falso e o modal não aparece. A pessoa vê o
         * site normalmente; só as funções que dependem de conta ficam quietas
         * até o servidor voltar.
         */
      });

    return () => {
      cancelled = true;
    };
  }, [chaveDeBusca]);

  /* --- Verifica disponibilidade em tempo real ---------------------- */
  const checkAvailability = useCallback(async (nickname: string) => {
    if (!nickname.trim()) return null;
    try {
      const res = await fetch(`/api/account?check=${encodeURIComponent(nickname)}`);
      return (await res.json()) as { available: boolean; reason: string | null };
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const ouvir = (e: Event) => setAccount((e as CustomEvent<ChromaAccount>).detail);
    window.addEventListener(EVENTO_CONTA, ouvir);
    return () => window.removeEventListener(EVENTO_CONTA, ouvir);
  }, []);

  /* --- Registra o apelido ------------------------------------------ */
  const claim = useCallback(
    async (nickname: string): Promise<boolean> => {
      if (!wallet) {
        setError("Conecte uma carteira antes.");
        return false;
      }

      setClaiming(true);
      setError(null);

      try {
        /*
         * Sem assinatura de propósito: o apelido é só um nome de exibição.
         * Pedir pra assinar na primeira tela assusta quem está chegando —
         * parece que o site vai mexer nos fundos. Ver src/lib/accounts.ts.
         */
        const res = await fetch("/api/account", {
          method: "POST",
          headers: { "content-type": "application/json" },
          /*
           * O `?ref=` guardado no navegador viaja junto, e é AQUI que ele
           * deixa de ser temporário: a partir deste momento o vínculo mora na
           * conta e vale pras duas redes, em qualquer aparelho. Ver a nota em
           * `db.ts`.
           */
          body: JSON.stringify({ nickname, wallet, kind, indicadoPor: indicadorPermitido(refGuardado()) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Não foi possível concluir o registro.");

        setAccount(data.account);
        // Outras instâncias do hook (menu do topo, perfil) guardam a conta
        // em estado próprio: sem este aviso, mostravam o apelido antigo até
        // recarregar a página.
        window.dispatchEvent(new CustomEvent(EVENTO_CONTA, { detail: data.account }));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      } finally {
        setClaiming(false);
      }
    },
    [wallet, kind],
  );

  /**
   * Aplica a foto recém-enviada no estado local.
   *
   * O servidor já gravou quando isto é chamado; sem este passo a tela só
   * mostraria a imagem nova depois de um recarregamento, e a pessoa acharia
   * que o upload falhou.
   */
  const aplicarFoto = useCallback((campo: "avatar" | "cover", url: string) => {
    setAccount((atual) => (atual ? { ...atual, [campo]: url } : atual));
  }, []);

  /** Reflete na tela a carteira recém-vinculada, sem esperar um recarregamento. */
  const aplicarCarteiras = useCallback((carteiras: Partial<Record<ChainId, string>>) => {
    setAccount((atual) => (atual ? { ...atual, carteiras } : atual));
  }, []);

  /** O que aparece na interface: apelido se existir, senão o endereço encurtado. */
  const label = useMemo(() => {
    if (account) return `@${account.displayName}`;
    if (!wallet) return null;
    return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
  }, [account, wallet]);

  /** O identificador usado no link de indicação. */
  // Toda conta que entra neste navegador fica anotada (ver indicadorPermitido).
  // E o `?ref=` guardado só serve pra CRIAR conta: entrou numa conta (nova ou
  // antiga), ele já foi usado ou não vale mais — sai do navegador. Sem isso,
  // sair da conta A e criar a B herdava "indicada por A" (05/10/2026).
  useEffect(() => {
    if (!account?.nickname) return;
    anotarContaDoNavegador(account.nickname);
    try {
      window.localStorage.removeItem("chroma.affiliate");
    } catch {
      /* storage bloqueado */
    }
  }, [account?.nickname]);

  const referralId = account?.nickname ?? wallet ?? null;

  /*
   * Endereço conectado que JÁ pertence à conta.
   *
   * É ele que assina ao vincular uma carteira nova — é isso que prova que a
   * conta é sua. A carteira que está sendo vinculada não serve pra assinar:
   * qualquer um controla a própria carteira, então isso não provaria nada.
   */
  const assinante =
    Object.values(account?.carteiras ?? {}).find(
      (endereco) =>
        mesmoEndereco(endereco, enderecoSolana) || mesmoEndereco(endereco, enderecoEvm),
    ) ?? null;

  return {
    wallet,
    /**
     * TODAS as carteiras conectadas agora, separadas por vírgula.
     *
     * É a chave certa pra qualquer rota que precise achar a CONTA da pessoa —
     * e não só um endereço. Usar `wallet` sozinho abre um buraco: ele é o
     * endereço PREFERIDO (Solana ganha da EVM), e se justamente esse não
     * estiver vinculado, a busca não acha a conta que existe.
     *
     * Foi exatamente o que aconteceu no painel de afiliados: ele mandava
     * `wallet`, a Solana não estava vinculada, e a tela dizia "você não tem
     * carteira nesta rede" para as duas redes — inclusive pra que estava.
     */
    chaveDeBusca,
    kind,
    conectadas,
    carteiras: account?.carteiras ?? {},
    assinante,
    isSignedIn,
    account,
    label,
    referralId,
    /*
     * "Precisa escolher apelido" exige que a busca TENHA TERMINADO para esta
     * carteira. Sem a comparação de chave, isto era verdadeiro no quadro
     * entre a carteira reconectar e o efeito começar a buscar — e o modal
     * abria em toda recarga pra quem já tinha conta. Ver a nota em
     * `chaveResolvida`.
     */
    needsNickname: isSignedIn && chaveResolvida === chaveDeBusca && !account,
    loading,
    claiming,
    error,
    claim,
    aplicarFoto,
    aplicarCarteiras,
    checkAvailability,
    disconnectSolana,
  };
}

/*
 * AUTO-INDICAÇÃO NO MESMO NAVEGADOR (achado pelo dono, 05/10/2026).
 * ---------------------------------------------------------------------------
 * O `?ref=` fica guardado no navegador e não some ao sair da conta. Quem saía
 * da conta A e criava a conta B ali mesmo deixava B "indicada por A" — e
 * passava a ganhar comissão das próprias compras. Toda conta que já entrou
 * neste navegador fica anotada, e nenhuma delas pode indicar uma conta nova
 * criada aqui.
 */
const CONTAS_DO_NAVEGADOR = "chroma.contas-do-navegador";

function contasDoNavegador(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(CONTAS_DO_NAVEGADOR) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function anotarContaDoNavegador(apelido: string) {
  try {
    const lista = contasDoNavegador();
    const a = apelido.toLowerCase();
    if (!lista.includes(a)) window.localStorage.setItem(CONTAS_DO_NAVEGADOR, JSON.stringify([...lista, a].slice(-20)));
  } catch {
    /* storage bloqueado: segue sem a trava local */
  }
}

function indicadorPermitido(ref: string | null): string | null {
  if (!ref) return null;
  const r = ref.trim().replace(/^@/, "").toLowerCase();
  return contasDoNavegador().includes(r) ? null : ref;
}
