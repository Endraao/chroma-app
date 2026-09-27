"use client";

import { useEffect, useState } from "react";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import type { Hex } from "viem";

import { Button } from "@/components/ui/Button";
import { robinhoodChain } from "@/lib/web3";

interface Contrato {
  nome: string;
  remetente: string;
  dados: Hex;
  previsto: `0x${string}`;
  nonce: number;
}

interface Publicado {
  endereco: string;
  hash: string;
}

/**
 * O que já foi publicado fica guardado no navegador.
 *
 * Sem isso, se a curva sair e o roteador falhar, recarregar a página e clicar
 * de novo publicaria uma SEGUNDA curva — pagando de novo e deixando um
 * contrato órfão com a carteira como autoridade.
 */
const CHAVE = "chroma_publicacao_4663";

function lerSalvo(): Record<string, Publicado> {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? "{}");
  } catch {
    return {};
  }
}

function salvar(valor: Record<string, Publicado>) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(valor));
  } catch {
    /* sem armazenamento: a tela ainda mostra o resultado */
  }
}

const VARIAVEL: Record<string, string> = {
  ChromaCurve: "NEXT_PUBLIC_CHROMA_CURVE_EVM",
  ChromaRouter: "NEXT_PUBLIC_CHROMA_ROUTER_EVM",
};

export function PublicarContratos() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: robinhoodChain.id });

  const [contratos, setContratos] = useState<Contrato[] | null>(null);
  const [publicados, setPublicados] = useState<Record<string, Publicado>>({});
  const [andamento, setAndamento] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setPublicados(lerSalvo());
    fetch("/api/dev/publicar")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setContratos(j.contratos);
      })
      .catch((e) => setErro(e.message));
  }, []);

  /*
   * A REDE é a fonte da verdade, não o navegador.
   *
   * Aconteceu na primeira publicação: a curva entrou na rede, mas a página
   * desistiu de esperar antes do recibo chegar e não gravou nada. Conferindo o
   * código no endereço previsto, o que já está publicado é reconhecido mesmo
   * sem registro local — e clicar de novo não cria uma segunda curva.
   */
  useEffect(() => {
    if (!contratos || !publicClient) return;
    let vivo = true;
    (async () => {
      const achados: Record<string, Publicado> = {};
      for (const c of contratos) {
        const codigo = await publicClient.getCode({ address: c.previsto }).catch(() => undefined);
        if (codigo && codigo !== "0x") achados[c.nome] = { endereco: c.previsto, hash: "" };
      }
      if (!vivo || Object.keys(achados).length === 0) return;
      setPublicados((antes) => {
        const juntos = { ...achados, ...antes };
        salvar(juntos);
        return juntos;
      });
    })();
    return () => {
      vivo = false;
    };
  }, [contratos, publicClient]);

  const remetente = contratos?.[0]?.remetente.toLowerCase();
  const carteiraCerta = !!address && address.toLowerCase() === remetente;
  const tudoPublicado = !!contratos && contratos.every((c) => publicados[c.nome]);

  async function publicar() {
    if (!contratos || !walletClient || !publicClient || !address) return;
    setErro(null);

    try {
      if (chainId !== robinhoodChain.id) {
        setAndamento("Trocando a MetaMask para a Robinhood Chain…");
        await switchChainAsync({ chainId: robinhoodChain.id });
      }

      let feitos = { ...publicados };

      /* Um por vez, na ordem do script: cada um precisa do anterior confirmado. */
      for (const c of contratos) {
        if (feitos[c.nome]) continue;

        /*
         * O endereço previsto só vale se a carteira estiver no mesmo nonce da
         * simulação. Se outra transação passou na frente, publicar agora poria
         * o contrato em outro lugar e a checagem acima deixaria de achá-lo.
         */
        const nonce = await publicClient.getTransactionCount({ address, blockTag: "pending" });
        if (nonce !== c.nonce) {
          throw new Error(
            `A carteira está na transação nº ${nonce}, mas a simulação do ${c.nome} contava com a nº ${c.nonce}. ` +
              "Rode a simulação do forge de novo antes de publicar.",
          );
        }

        setAndamento(`Confirme a publicação do ${c.nome} na MetaMask…`);
        const hash = await walletClient.sendTransaction({
          account: address,
          chain: robinhoodChain,
          to: null,
          data: c.dados,
        });

        setAndamento(`${c.nome} enviado. Esperando a rede confirmar…`);
        /*
         * Espera longa de propósito: com o padrão do viem a página desistiu
         * enquanto a curva já estava entrando na rede.
         */
        const recibo = await publicClient.waitForTransactionReceipt({
          hash,
          timeout: 10 * 60_000,
          pollingInterval: 3_000,
        });

        if (recibo.status !== "success" || !recibo.contractAddress) {
          throw new Error(`A rede recusou o ${c.nome} (transação ${hash}).`);
        }

        feitos = { ...feitos, [c.nome]: { endereco: recibo.contractAddress, hash } };
        setPublicados(feitos);
        salvar(feitos);
      }

      setAndamento(null);
    } catch (e) {
      setAndamento(null);
      const msg = e instanceof Error ? e.message : String(e);
      setErro(/reject|denied/i.test(msg) ? "Você recusou na MetaMask. Nada foi cobrado." : msg);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pt-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-50">Publicar contratos</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
          Ferramenta interna, só existe no seu computador. Publica a curva e o roteador da Chroma na
          Robinhood Chain. A MetaMask vai pedir duas confirmações, uma para cada contrato.
        </p>
      </header>

      {contratos && (
        <ul className="divide-y divide-ink-700 rounded-md border border-ink-700 bg-ink-900">
          {contratos.map((c) => {
            const p = publicados[c.nome];
            return (
              <li key={c.nome} className="flex items-center justify-between gap-4 px-4 py-3 text-[13px]">
                <span className="font-medium text-zinc-100">{c.nome}</span>
                {p ? (
                  <a
                    href={`https://robinhoodchain.blockscout.com/address/${p.endereco}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[12px] text-bull hover:underline"
                  >
                    {p.endereco}
                  </a>
                ) : (
                  <span className="text-zinc-500">
                    {(c.dados.length / 2 / 1024).toFixed(1)} KB · pendente
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!address && <p className="text-[13px] text-zinc-400">Conecte a MetaMask pelo menu do topo.</p>}

      {address && remetente && !carteiraCerta && (
        <p className="rounded-md border border-bear/35 bg-bear/10 px-3 py-2 text-[13px] text-bear">
          A carteira conectada é {address}. A publicação foi simulada para {remetente} — troque de
          conta na MetaMask.
        </p>
      )}

      {!tudoPublicado && (
        <Button
          variant="chroma"
          size="lg"
          disabled={!carteiraCerta || !walletClient || !!andamento || !contratos}
          onClick={publicar}
        >
          {andamento ? "Publicando…" : "Publicar"}
        </Button>
      )}

      {andamento && <p className="text-[13px] text-zinc-300">{andamento}</p>}
      {erro && <p className="text-[13px] text-bear">{erro}</p>}

      {tudoPublicado && contratos && (
        <div className="space-y-2">
          <p className="text-[13px] text-bull">Publicado. Estas linhas vão no .env.local e na Vercel:</p>
          <pre className="overflow-x-auto rounded-md border border-ink-700 bg-ink-900 p-3 font-mono text-[12px] text-zinc-200">
            {contratos.map((c) => `${VARIAVEL[c.nome] ?? c.nome}=${publicados[c.nome].endereco}`).join("\n")}
          </pre>
        </div>
      )}
    </div>
  );
}
