import Link from "next/link";

import { FaixaDeAbertura } from "@/components/home/FaixaDeAbertura";
import { idiomaAtual } from "@/lib/idioma-servidor";
import { LinhaDeMoeda } from "@/components/home/LinhaDeMoeda";
import { MoedasQuentes } from "@/components/home/MoedasQuentes";
import { Secao } from "@/components/home/Secao";
import { TokenCard } from "@/components/ui/TokenCard";
import { ChainTabs } from "@/components/ui/ChainTabs";
import { listTokens, type SortKey } from "@/lib/tokens";
import { moedasDaChroma } from "@/lib/moedas-da-chroma";
import { CHAIN_IDS, CHAINS, REDE_PADRAO, podeLancarNaRede } from "@/lib/web3";
import type { ChainId, TokenSummary } from "@/lib/types";
import { formatUsd } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "new", label: "Recentes" },
  { key: "gainers", label: "Maiores altas" },
  { key: "volume", label: "Volume 24h" },
  { key: "marketCap", label: "Market cap" },
];

/*
 * Quantas moedas cada zona mostra.
 *
 * As faixas de cima e de baixo são VITRINE: existem pra dar uma direção a quem
 * chegou sem saber o que procurar. Se crescerem demais viram só mais uma lista
 * completa, e aí a pessoa volta a encarar a mesma parede de cartão que a
 * página tinha antes — só que três vezes.
 */
const QUANTAS_MAIORES = 5;
const QUANTAS_QUENTES = 8;
const QUANTAS_NOVAS = 9;
/** As da casa cabem numa linha e meia; passar disso vira lista, não vitrine. */
const QUANTAS_DA_CASA = 10;

/**
 * A partir de quantas moedas vale separar em zonas.
 *
 * Com uma lista curta, "as maiores" e "o mercado" seriam praticamente as
 * mesmas moedas, repetidas em dois lugares da tela — o que faz o site parecer
 * cheio quando na verdade está vazio. Abaixo desse número a home volta a ser
 * uma grade só, que é o formato honesto pra pouca coisa.
 */
const MINIMO_PRA_SEPARAR = 12;

export default async function HomePage({
  searchParams,
}: {
  /** Promise desde o Next 16. */
  searchParams: Promise<{ sort?: string; chain?: string }>;
}) {
  const filtros = await searchParams;
  const sort = (filtros.sort as SortKey) || "new";

  /*
   * Rede vinda da URL, e não do estado da carteira: assim o link que a pessoa
   * compartilha abre a mesma lista pra quem receber. A carteira conectada só
   * decide qual aba vem MARCADA — ver ChainTabs.
   */
  /*
   * A rede padrão é a ROBINHOOD, e ela vem de `REDE_PADRAO`.
   *
   * É a rede onde a plataforma funciona por inteiro: swap na curva, comissão
   * de afiliado na própria transação e, principalmente, LANÇAMENTO. Na Solana
   * o programa da curva ainda não está publicado, então criar moeda não
   * acontece — só negociar o que já existe.
   *
   * Abrir na rede onde o launchpad não funciona faria a primeira tela do site
   * prometer o que ele não entrega.
   *
   * O parâmetro continua mandando: quem chegar por um link com `?chain=` vê o
   * que o link pediu, e é isso que mantém link de indicação funcionando.
   */
  const chain: ChainId = CHAIN_IDS.includes(filtros.chain as ChainId)
    ? (filtros.chain as ChainId)
    : REDE_PADRAO;

  /*
   * Quatro leituras da mesma lista.
   *
   * Parece caro e não é: `listTokens` busca uma vez e ordena em memória, e a
   * busca em si tem cache. O que muda entre as quatro chamadas é só a ordem —
   * então sai uma requisição de rede, não quatro.
   *
   * O filtro de REDE entra nas quatro; o de ORDENAÇÃO, só na do meio. As
   * faixas de cima e de baixo têm critério próprio, e mudariam de sentido se
   * obedecessem ao botão de ordenação da grade central.
   */
  const [principal, porValor, porVolume, porIdade, daCasa] = await Promise.all([
    listTokens(sort, chain),
    listTokens("marketCap", chain),
    listTokens("volume", chain),
    listTokens("new", chain),
    /*
     * As moedas LANÇADAS AQUI vêm por outro caminho, e precisam vir.
     *
     * Enquanto estão na curva elas não existem em DEX nenhuma, então nenhuma
     * fonte de mercado as conhece — `listTokens` nunca as traria. Preço e
     * capitalização saem da conta da curva, lida direto da rede.
     *
     * Uma falha aqui não derruba a home: sem elas a página continua sendo a
     * vitrine de mercado que já era.
     */
    moedasDaChroma().catch(() => [] as TokenSummary[]),
  ]);

  /*
   * Filtradas pela rede escolhida, como todo o resto da página.
   *
   * Misturar redes só nesta faixa faria a pessoa clicar numa moeda que a
   * carteira dela não consegue negociar, vindo de uma tela que diz estar
   * filtrada.
   */
  const lancadasNaChroma = daCasa.filter((t) => t.chain === chain);

  const { tokens, isDemo } = principal;
  const totalVolume = tokens.reduce((acc, t) => acc + t.volume24hUsd, 0);

  const separar = tokens.length >= MINIMO_PRA_SEPARAR;

  const maiores = separar ? porValor.tokens.slice(0, QUANTAS_MAIORES) : [];
  const quentes = porVolume.tokens.slice(0, QUANTAS_QUENTES);

  /*
   * As recém-chegadas não repetem quem já apareceu como "maior".
   *
   * Uma moeda nova E gigante é rara, mas acontece — e quando acontece ela
   * abriria e fecharia a página, o que faz a vitrine inteira parecer ter três
   * moedas. Tirando as repetidas, a faixa de baixo cumpre o que promete: o que
   * ainda é pequeno.
   */
  const jaEmDestaque = new Set(maiores.map((t) => t.address));
  const novas = separar
    ? porIdade.tokens.filter((t) => !jaEmDestaque.has(t.address)).slice(0, QUANTAS_NOVAS)
    : [];

  /** Preserva a rede ao trocar de ordenação, e vice-versa. */
  const linkCom = (params: { sort?: SortKey; chain?: ChainId | null }) => {
    const proximoSort = params.sort ?? sort;
    const proximaChain = params.chain === undefined ? chain : params.chain;
    const q = new URLSearchParams();
    if (proximoSort !== "new") q.set("sort", proximoSort);
    if (proximaChain) q.set("chain", proximaChain);
    const s = q.toString();
    return s ? `/?${s}#mercado` : "/#mercado";
  };

  return (
    <div className="space-y-5">
      <FaixaDeAbertura
        idioma={await idiomaAtual()}
        quantidadeDeTokens={String(tokens.length)}
        volumeTotal={formatUsd(totalVolume)}
      />

      {isDemo && (
        <div className="rounded border border-warn/30 bg-warn/[0.06] px-3 py-2 text-[12px] text-warn">
          Não foi possível carregar os dados de mercado agora. A lista abaixo é apenas um exemplo.
          Recarregue a página em alguns segundos.
        </div>
      )}

      {/*
        O QUE A REDE ESCOLHIDA NÃO FAZ, DITO ANTES DA LISTA.
        ------------------------------------------------------------------
        Só aparece na Solana, e só porque lá o lançamento não existe ainda.
        Quem está na Robinhood não vê aviso nenhum — repetir para todo mundo
        o que vale para uma rede é o tipo de recado que as pessoas aprendem a
        pular, e aí ele não serve quando importa.
      */}
      {!podeLancarNaRede(chain) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded border border-warn/30 bg-warn/[0.06] px-3 py-2 text-[12px] text-warn">
          <span>
            Ainda não é possível <strong>criar moedas</strong> na {CHAINS[chain].label} pela Chroma.
            Aqui você pode comprar e vender normalmente.
          </span>
          <Link
            href={`/?chain=${REDE_PADRAO}`}
            className="font-semibold underline underline-offset-2 hover:text-warn/80"
          >
            Ver a {CHAINS[REDE_PADRAO].label}
          </Link>
        </div>
      )}

      {/*
        A barra lateral fica FORA da faixa de abertura de propósito: ela precisa
        acompanhar a rolagem da vitrine, e pra isso o topo dela tem que estar na
        mesma altura em que a vitrine começa.
      */}
      <div className="flex items-start gap-5">
        <MoedasQuentes tokens={quentes} />

        <div className="min-w-0 flex-1 space-y-8">
          {/*
            LANÇADAS NA CHROMA VÊM PRIMEIRO, acima das de mercado.
            ----------------------------------------------------------------
            São as únicas moedas do site que nasceram aqui: a plataforma tem
            a curva delas, recebe a taxa de criador e paga o afiliado na
            própria transação. Todo o resto da vitrine é mercado de fora,
            listado por conveniência.

            Se ainda não houver nenhuma, a faixa simplesmente não aparece —
            uma seção vazia anunciando "lançadas aqui" diria a verdade mais
            desanimadora possível na primeira tela.
          */}
          {lancadasNaChroma.length > 0 && (
            <>
              <Secao
                titulo="Lançadas na Chroma"
                resumo="Criadas aqui, na nossa curva. A plataforma paga o criador e o afiliado na própria transação."
                cor="#a78bfa"
              >
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {lancadasNaChroma.slice(0, QUANTAS_DA_CASA).map((token) => (
                    <TokenCard key={token.address} token={token} />
                  ))}
                </div>
              </Secao>

              <div className="aresta" />
            </>
          )}

          {maiores.length > 0 && (
            <Secao
              titulo="Maiores"
              resumo="As de maior valor de mercado nas duas redes."
              cor="#fbbf24"
              acao={{ rotulo: "Ver todas", href: linkCom({ sort: "marketCap" }) }}
            >
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {maiores.map((token) => (
                  <TokenCard key={token.address} token={token} />
                ))}
              </div>
            </Secao>
          )}

          {maiores.length > 0 && <div className="aresta" />}

          <div id="mercado" className="scroll-mt-20">
            <Secao
              titulo="Mercado"
              resumo="Todas as moedas listadas. Use os filtros para ordenar."
              cor="#22d3ee"
            >
              <ChainTabs ativa={chain} sort={sort} />

              <div className="mb-3 flex flex-wrap items-center gap-1">
                {SORTS.map((s) => (
                  <Link key={s.key} href={linkCom({ sort: s.key })}>
                    <span
                      className={
                        /*
                         * Aba sublinhada, não pílula colorida. A pílula
                         * preenchida competia com os cartões logo abaixo; o
                         * sublinhado marca a escolha sem virar mais um bloco
                         * de cor na tela.
                         */
                        sort === s.key
                          ? "inline-flex border-b-2 border-marca px-2.5 pb-1.5 pt-1 text-[13px] font-semibold text-zinc-100"
                          : "inline-flex border-b-2 border-transparent px-2.5 pb-1.5 pt-1 text-[13px] font-medium text-zinc-500 transition-colors hover:text-zinc-200"
                      }
                    >
                      {s.label}
                    </span>
                  </Link>
                ))}
              </div>

              {tokens.length === 0 ? (
                <Vazio
                  href={linkCom({ chain: chain === "solana" ? "robinhood" : "solana" })}
                  outraRede={CHAINS[chain === "solana" ? "robinhood" : "solana"].label}
                />
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                  {tokens.map((token) => (
                    <TokenCard key={token.address} token={token} />
                  ))}
                </div>
              )}
            </Secao>
          </div>

          {novas.length > 0 && (
            <>
              <div className="aresta" />

              <Secao
                titulo="Recém-chegadas"
                resumo="Moedas criadas há pouco tempo e ainda pequenas. O risco aqui é maior."
                cor="#34d399"
                acao={{ rotulo: "Ver todas", href: linkCom({ sort: "new" }) }}
              >
                {/*
                  Linha em vez de cartão.

                  Moeda de meia hora de vida não tem gráfico, não tem holder e
                  muitas vezes nem arte decente — um cartão grande aqui seria um
                  quadrado vazio. A linha mostra o pouco que existe (nome, valor,
                  idade) sem fingir que existe mais.
                */}
                <div className="brilho relative overflow-hidden rounded-lg border border-ink-700 bg-ink-900 p-1">
                  <div className="relative z-[1] grid gap-0.5 sm:grid-cols-2 xl:grid-cols-3">
                    {novas.map((token) => (
                      <LinhaDeMoeda key={token.address} token={token} metrica="idade" />
                    ))}
                  </div>
                </div>
              </Secao>
            </>
          )}

          {!separar && tokens.length > 0 && <SemSeparacao tokens={tokens} />}
        </div>
      </div>
    </div>
  );
}

/**
 * A lista vazia manda pra OUTRA rede, não mais pra "as duas".
 *
 * O destino "todas as redes" deixou de existir quando a home passou a abrir
 * em Solana. Um link pra um filtro que não existe mais devolveria a pessoa
 * exatamente pra lista vazia de onde ela saiu.
 */
function Vazio({ href, outraRede }: { href: string; outraRede: string }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900 px-6 py-12 text-center">
      <p className="text-[14px] font-semibold text-zinc-300">Nenhuma moeda nessa rede agora.</p>
      <p className="mt-1 text-[12px] text-zinc-600">
        A lista vem do mercado ao vivo e muda o tempo todo.{" "}
        <Link href={href} className="text-marca hover:underline">
          Ver a rede {outraRede}
        </Link>
        .
      </p>
    </div>
  );
}

/**
 * O aviso de que a vitrine está curta.
 *
 * Preferi dizer isso a preencher a página com as mesmas moedas repetidas em
 * três faixas. Mercado magro é informação útil pra quem vai operar — e um site
 * que esconde isso com layout está mentindo por omissão.
 */
function SemSeparacao({ tokens }: { tokens: TokenSummary[] }) {
  return (
    <p className="text-[11px] text-zinc-600">
      {tokens.length} {tokens.length === 1 ? "moeda listada" : "moedas listadas"} neste filtro. As
      seções de maiores e de recém-chegadas aparecem quando houver mais moedas.
    </p>
  );
}
