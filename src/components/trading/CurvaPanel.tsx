"use client";

import { Button } from "@/components/ui/Button";
import { useCurvaAtual } from "@/components/trading/CurvaProvider";
import { useMigrarCurva } from "@/hooks/useMigrarCurva";
import { formatUnits } from "@/lib/utils";

/**
 * O quanto falta pra curva encher.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO É A INFORMAÇÃO PRINCIPAL DE UMA MOEDA NOSSA
 * ---------------------------------------------------------------------------
 * Enquanto a moeda está na curva ela não existe em DEX nenhuma: não há pool,
 * não há livro de ofertas, e o gráfico é só o histórico das compras. O número
 * que de fato governa a decisão de quem está olhando é OUTRO — quanto falta pra
 * curva encher.
 *
 * É o que separa "moeda nova como tantas" de "moeda prestes a virar". Sem isso
 * na tela, a pessoa não tem como saber em que ponto da vida daquela moeda ela
 * está chegando.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A CONTA É EM TOKENS E NÃO EM SOL
 * ---------------------------------------------------------------------------
 * A curva fecha quando o último token à venda sai, não quando junta um valor
 * redondo de SOL. Medir em SOL daria um número aproximado que muda de sentido
 * conforme o preço anda; medir em tokens vendidos é exato e é o mesmo critério
 * que o programa usa pra marcar a curva como concluída.
 */

const DECIMAIS_SOL = 9;

export function CurvaPanel() {
  const { curva, carregando, progresso, mint } = useCurvaAtual();

  /*
   * O hook fica ANTES do `return null` de propósito: React não aceita hook
   * condicional. Com a curva ausente ele simplesmente nunca é acionado, porque
   * o botão que o chama não chega a ser desenhado.
   */
  const migracao = useMigrarCurva(mint ?? "");

  /*
   * Enquanto carrega, nada é desenhado. Um esqueleto piscando em toda moeda de
   * mainnet — que é a imensa maioria e nunca vai ter curva — seria barulho na
   * tela pra prometer algo que não vem.
   */
  if (carregando || !curva || progresso === null) return null;

  const { estado, config } = curva;

  const aVenda = config.tokenAVendaInicial;
  const vendidos = aVenda > estado.tokenReal ? aVenda - estado.tokenReal : 0n;

  const solDentro = formatUnits(estado.solReal, DECIMAIS_SOL);
  const concluida = estado.concluida;

  return (
    <div className="overflow-hidden rounded-2xl border border-chroma-cyan/25 bg-chroma-cyan/[0.05]">
      <div className="flex items-baseline justify-between px-3.5 pt-3">
        <span className="text-[13px] font-bold text-zinc-100">
          {estado.migrada ? "Liquidez na Raydium" : concluida ? "Curva cheia" : "Curva da Chroma"}
        </span>
        <span className="tnum text-[13px] font-bold text-chroma-cyan">
          {progresso.toFixed(1).replace(".", ",")}%
        </span>
      </div>

      <div className="px-3.5 pb-1 pt-2.5">
        <div className="h-2 overflow-hidden rounded-full bg-ink-950">
          <div
            className="h-full rounded-full bg-chroma-gradient transition-[width] duration-500 ease-out"
            style={{ width: `${Math.min(100, Math.max(progresso, progresso > 0 ? 1.5 : 0))}%` }}
          />
        </div>
      </div>

      <div className="tnum flex items-center justify-between px-3.5 pb-2.5 pt-2 text-[11px] text-zinc-500">
        <span>
          {solDentro.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} SOL na curva
        </span>
        <span>
          {compacto(vendidos)} de {compacto(aVenda)} tokens
        </span>
      </div>

      <p className="border-t border-white/[0.06] px-3.5 py-2.5 text-[11px] leading-relaxed text-zinc-500">
        {estado.migrada ? (
          <>
            A curva foi concluída e a liquidez migrou para uma pool na Raydium.
            O token de LP foi <span className="text-bull">queimado</span>, então
            ninguém — nem quem lançou, nem a Chroma — consegue retirar essa
            liquidez.
          </>
        ) : concluida ? (
          <>
            Todos os tokens à venda foram comprados. Agora a liquidez migra para
            uma pool na Raydium e o token de LP é queimado. Qualquer pessoa pode
            executar esse último passo — inclusive você.
          </>
        ) : (
          <>
            O preço sobe a cada compra, seguindo a fórmula da curva: não existe
            livro de ofertas nem ninguém do outro lado. Quem vende, vende de
            volta para a própria curva, até que ela seja concluída.
          </>
        )}
      </p>

      {/*
        O BOTÃO SÓ APARECE NA JANELA EM QUE ELE FAZ ALGUMA COISA.
        -------------------------------------------------------------------
        Curva ainda enchendo: migrar seria recusado pelo programa. Já migrada:
        a segunda tentativa também é recusada (o teste cobre isso). Então o
        botão vive só no intervalo entre "cheia" e "migrada" — que é
        exatamente quando a moeda fica travada esperando alguém agir.
      */}
      {concluida && !estado.migrada && (
        <div className="space-y-2 border-t border-white/[0.06] px-3.5 py-3">
          <Button
            variant="chroma"
            size="md"
            className="w-full"
            onClick={migracao.migrar}
            disabled={!migracao.podeMigrar || migracao.fase === "executando"}
          >
            {migracao.fase === "executando"
              ? "Migrando…"
              : migracao.fase === "pronta"
                ? "Liquidez migrada"
                : "Migrar para a Raydium"}
          </Button>

          {migracao.passo && (
            <p className="tnum text-center text-[11px] text-zinc-500">{migracao.passo}</p>
          )}

          {!migracao.podeMigrar && (
            <p className="text-center text-[11px] text-zinc-600">
              Conecte uma carteira Solana para executar.
            </p>
          )}

          {migracao.erro && (
            <p className="text-[11px] leading-relaxed text-bear">{migracao.erro}</p>
          )}

          {migracao.assinatura && (
            <a
              href={`https://solscan.io/tx/${migracao.assinatura}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-[11px] font-semibold text-marca hover:underline"
            >
              ver a transação
            </a>
          )}

          <p className="text-[11px] leading-relaxed text-zinc-600">
            São duas assinaturas na sua carteira. Você paga só a taxa de rede: o custo da pool sai
            do SOL que já está na curva, e você não recebe nada por executar.
          </p>
        </div>
      )}
    </div>
  );
}

/** 793.100.000 vira "793,1M". Número inteiro aqui não cabe e não informa. */
function compacto(bruto: bigint): string {
  const n = Number(bruto) / 1e6; // a moeda da curva tem 6 casas

  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace(".", ",")}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".", ",")}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(".", ",")}K`;
  return n.toFixed(0);
}
