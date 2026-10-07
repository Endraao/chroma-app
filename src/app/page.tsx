import Link from "next/link";

import { idiomaAtual } from "@/lib/idioma-servidor";
import { traducoes } from "@/lib/idiomas";
import { CardDaMoeda } from "@/components/home/CardDaMoeda";
import { FaixaDeAbertura } from "@/components/home/FaixaDeAbertura";
import { formatUsd } from "@/lib/utils";
import { PainelDaChroma } from "@/components/home/PainelDaChroma";
import { SubindoAgora } from "@/components/home/SubindoAgora";
import { AoVivoProvider } from "@/components/home/AoVivo";
import { ListaEmAlta } from "@/components/home/ListaEmAlta";
import { ehMoedaSeria, pontuacaoEmAlta } from "@/lib/tokens";
import { ChainTabs } from "@/components/ui/ChainTabs";
import { listTokens, type SortKey } from "@/lib/tokens";
import { AtualizacaoAutomatica } from "@/components/home/AtualizacaoAutomatica";
import { FORA_DA_VITRINE, moedasDaChroma } from "@/lib/moedas-da-chroma";
import { CHAIN_IDS, CHAINS } from "@/lib/web3";
import { BannerPromocao } from "@/components/home/BannerPromocao";
import type { ChainId, TokenSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

const TEXTOS = traducoes({
  en: {
    abaChroma: "Created on Chroma", abaEmAlta: "🔥 Trending",
    abaRecentes: "Newest",
    abaAltas: "Top gainers",
    abaVolume: "24h volume",
    abaMcap: "Market cap",
    semDados:
      "Market data could not be loaded right now. The list below is only an example. Reload the page in a few seconds.",
    naoLanca: (rede: string) => (
      <>
        Creating coins on {rede} through Chroma is <strong>not available yet</strong>. You can still
        buy and sell here.
      </>
    ),
    verRede: (rede: string) => `See ${rede}`,
    lancadasTitulo: "Launched on Chroma",
    lancadasResumo:
      "Created here, on our bonding curve. The platform pays the creator and the referrer in the same transaction.",
    verTodas: "See all",
    maioresTitulo: "Biggest",
    maioresResumo: "Highest market cap on both networks.",
    mercadoTitulo: "Market",
    mercadoResumo: "Every listed coin. Use the filters to sort.",
    novasTitulo: "Just launched",
    novasResumo: "Coins created recently and still small. Risk is higher here.",
    vazioChroma: (rede: string) => `No coins created on Chroma on ${rede} yet.`,
    crieAPrimeira: "Create the first one",
    apareceAqui: "— it shows up here as soon as it is born.",
    vazio: "No coins on this network right now.",
    vazioLista: "The list comes from the live market and changes all the time.",
    verARede: (rede: string) => `See ${rede}`,
    todasAsRedes: "all networks",
    semSeparacao: (n: number) =>
      `${n} ${n === 1 ? "coin" : "coins"} listed in this filter. The biggest and just-launched sections appear when there are more coins.`,
  },
  pt: {
    abaChroma: "Criadas na Chroma", abaEmAlta: "🔥 Em alta",
    abaRecentes: "Recentes",
    abaAltas: "Maiores altas",
    abaVolume: "Volume 24h",
    abaMcap: "Market cap",
    semDados:
      "Não foi possível carregar os dados de mercado agora. A lista abaixo é apenas um exemplo. Recarregue a página em alguns segundos.",
    naoLanca: (rede: string) => (
      <>
        Ainda não é possível <strong>criar moedas</strong> na {rede} pela Chroma. Aqui você pode
        comprar e vender normalmente.
      </>
    ),
    verRede: (rede: string) => `Ver a ${rede}`,
    lancadasTitulo: "Lançadas na Chroma",
    lancadasResumo:
      "Criadas aqui, na nossa curva. A plataforma paga o criador e o afiliado na própria transação.",
    verTodas: "Ver todas",
    maioresTitulo: "Maiores",
    maioresResumo: "As de maior valor de mercado nas duas redes.",
    mercadoTitulo: "Mercado",
    mercadoResumo: "Todas as moedas listadas. Use os filtros para ordenar.",
    novasTitulo: "Recém-chegadas",
    novasResumo: "Moedas criadas há pouco tempo e ainda pequenas. O risco aqui é maior.",
    vazioChroma: (rede: string) => `Nenhuma moeda criada na Chroma na ${rede} ainda.`,
    crieAPrimeira: "Crie a primeira",
    apareceAqui: "— ela aparece aqui assim que nascer.",
    vazio: "Nenhuma moeda nessa rede agora.",
    vazioLista: "A lista vem do mercado ao vivo e muda o tempo todo.",
    verARede: (rede: string) => `Ver ${rede}`,
    todasAsRedes: "todas as redes",
    semSeparacao: (n: number) =>
      `${n} ${n === 1 ? "moeda listada" : "moedas listadas"} neste filtro. As seções de maiores e de recém-chegadas aparecem quando houver mais moedas.`,
  },
  zh: {
    abaChroma: "Chroma 发行", abaEmAlta: "🔥 热门",
    abaRecentes: "最新",
    abaAltas: "涨幅榜",
    abaVolume: "24小时交易量",
    abaMcap: "市值",
    semDados: "暂时无法加载市场数据。下方列表仅为示例，请稍后刷新页面。",
    naoLanca: (rede: string) => (
      <>
        暂不支持通过 Chroma 在 {rede} 上<strong>创建代币</strong>。你仍可以在这里正常买卖。
      </>
    ),
    verRede: (rede: string) => `查看 ${rede}`,
    lancadasTitulo: "Chroma 发行",
    lancadasResumo: "在我们的联合曲线上创建。平台在同一笔交易中向创建者和推荐人付款。",
    verTodas: "查看全部",
    maioresTitulo: "市值最高",
    maioresResumo: "两条网络中市值最高的代币。",
    mercadoTitulo: "市场",
    mercadoResumo: "所有上架代币，可使用筛选条件排序。",
    novasTitulo: "新上线",
    novasResumo: "刚创建、规模尚小的代币，风险更高。",
    vazioChroma: (rede: string) => `${rede} 上还没有在 Chroma 创建的代币。`,
    crieAPrimeira: "创建第一个",
    apareceAqui: "— 创建后会立即显示在这里。",
    vazio: "该网络暂时没有代币。",
    vazioLista: "列表来自实时市场，随时变化。",
    verARede: (rede: string) => `查看${rede}`,
    todasAsRedes: "全部网络",
    semSeparacao: (n: number) =>
      `此筛选下共有 ${n} 个代币。代币更多时，会显示"市值最高"和"新上线"栏目。`,
  },
});

/**
 * As abas da grade de Mercado. "chroma" não é ordenação: é o recorte das
 * moedas criadas AQUI, que as fontes de mercado nem conhecem enquanto estão
 * na curva. Fica em primeiro porque é o que só este site tem.
 */
type AbaDoMercado = SortKey | "chroma";

const SORTS: {
  key: AbaDoMercado;
  rotulo: "abaChroma" | "abaEmAlta" | "abaRecentes" | "abaAltas" | "abaVolume" | "abaMcap";
}[] = [
  { key: "hot", rotulo: "abaEmAlta" },
  { key: "new", rotulo: "abaRecentes" },
  { key: "gainers", rotulo: "abaAltas" },
  { key: "volume", rotulo: "abaVolume" },
  { key: "marketCap", rotulo: "abaMcap" },
];

/**
 * A vitrine, no formato da pump.fun: arte grande, grade densa, abas em cima.
 *
 * As moedas lançadas na Chroma ficam numa faixa própria no topo e a página se
 * atualiza sozinha a cada 10 s — quem lança aqui aparece pra todo mundo sem
 * ninguém precisar recarregar. O cadastro de uma moeda nova invalida o cache
 * (revalidateTag em /api/moedas), então o refresh seguinte já a traz.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; chain?: string; q?: string }>;
}) {
  const filtros = await searchParams;
  const sort = (filtros.sort as AbaDoMercado) || "hot";
  const ordem: SortKey = sort === "chroma" ? "new" : sort;
  const chain: ChainId | "todas" =
    filtros.chain === "todas"
      ? "todas"
      : CHAIN_IDS.includes(filtros.chain as ChainId)
        ? (filtros.chain as ChainId)
        : "todas"; // Sem rede na URL = todas as redes (pedido do dono, 04/10/2026).
  const busca = (filtros.q ?? "").trim().toLowerCase();

  const [principal, daCasa] = await Promise.all([
    listTokens(ordem, chain === "todas" ? null : chain),
    moedasDaChroma().catch(() => [] as TokenSummary[]),
  ]);

  // Todas as redes: o painel da Chroma não segue a rede escolhida.
  const lancadasNaChroma = daCasa.filter((t) => !FORA_DA_VITRINE.has(t.address.toLowerCase()));
  const daChromaNaRede = lancadasNaChroma.filter((t) => chain === "todas" || t.chain === chain);

  const { isDemo } = principal;
  // A coluna "Em alta" só com moeda séria (critério da fomo): ver ehMoedaSeria.
  const emAlta = principal.tokens.filter(ehMoedaSeria).sort((a, b) => pontuacaoEmAlta(b) - pontuacaoEmAlta(a)).slice(0, 40);
  const todasAsMoedas = sort === "chroma" ? daChromaNaRede : principal.tokens;
  // Busca do cabeçalho: nome, símbolo ou começo do endereço.
  const tokens = busca
    ? todasAsMoedas.filter(
        (t) =>
          t.name.toLowerCase().includes(busca) ||
          t.symbol.toLowerCase().includes(busca.replace(/^$/, "")) ||
          t.address.toLowerCase().startsWith(busca),
      )
    : todasAsMoedas;

  const linkCom = (params: { sort?: AbaDoMercado; chain?: ChainId | "todas" | null }) => {
    const proximoSort = params.sort ?? sort;
    const proximaChain = params.chain === undefined ? chain : params.chain;
    const q = new URLSearchParams();
    if (busca && params.chain === undefined) q.set("q", busca);
    if (proximoSort !== "hot") q.set("sort", proximoSort);
    if (proximaChain) q.set("chain", proximaChain);
    const s = q.toString();
    return s ? `/?${s}#mercado` : "/#mercado";
  };

  const idioma = await idiomaAtual();
  const t = TEXTOS[idioma];

  return (
    <div className="space-y-6 pt-2">
      <AtualizacaoAutomatica segundos={10} />

      {isDemo && (
        <div className="rounded border border-warn/30 bg-warn/[0.06] px-3 py-2 text-[12px] text-warn">
          {t.semDados}
        </div>
      )}

      {/* A faixa da marca, compacta: não empurra as moedas pra baixo da dobra. */}
      <FaixaDeAbertura
        idioma={idioma}
        quantidadeDeTokens={String(principal.tokens.length + lancadasNaChroma.length)}
        volumeTotal={formatUsd(principal.tokens.reduce((acc, t) => acc + t.volume24hUsd, 0))}
      />

      {/* O "post" da promoção do criador (pedido do dono, 03/10/2026). */}
      {/* Em tela larga a promoção mora dentro da abertura (CardPromocao). */}
      <div className="xl:hidden">
        <BannerPromocao idioma={idioma} />
      </div>

      {/* Criadas na Chroma — ao vivo, das duas redes */}
      <PainelDaChroma moedas={lancadasNaChroma} />

      <section id="mercado" className="scroll-mt-20">
        <div className="mb-4 flex flex-wrap items-center gap-y-2">
          {/* Categorias numa linha só: no celular deslizam pro lado em vez de quebrar. */}
          <div className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]">
            {SORTS.map((s) => (
              <Link
                key={s.key}
                href={linkCom({ sort: s.key })}
                className={
                  sort === s.key
                    ? "shrink-0 whitespace-nowrap rounded-md bg-bull px-3 py-1.5 text-[13px] font-bold text-black"
                    : "shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium text-zinc-400 transition-colors hover:bg-ink-800 hover:text-zinc-100"
                }
              >
                {t[s.rotulo]}
              </Link>
            ))}
          </div>
          <div className="w-full sm:ml-auto sm:w-auto">
            <ChainTabs ativa={chain} sort={sort} />
          </div>
        </div>

        {tokens.length === 0 && sort === "chroma" ? (
          <VazioDaChroma rede={chain === "todas" ? "Chroma" : CHAINS[chain].label} t={t} />
        ) : tokens.length === 0 ? (
          <Vazio
            t={t}
            href={linkCom({ chain: "todas" })}
            outraRede={t.todasAsRedes}
          />
        ) : (
          <AoVivoProvider tokens={[...emAlta.slice(0, 30), ...tokens.slice(0, 60)]}>
            {/* No celular a faixa corre em cima; no computador a lista fica fixa na esquerda (estilo fomo). */}
            <div className="lg:hidden">
              <SubindoAgora tokens={tokens} />
            </div>
            <div className="lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-5">
              <aside className="hidden lg:block">
                <div className="sticky top-20 space-y-4">
                  <ListaEmAlta tokens={emAlta} />
                </div>
              </aside>
              <Grade tokens={tokens} destaque={sort === "chroma"} />
            </div>
          </AoVivoProvider>
        )}
      </section>
    </div>
  );
}

function Grade({ tokens, destaque = false }: { tokens: TokenSummary[]; destaque?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {tokens.map((token) => (
        <CardDaMoeda key={token.address} token={token} destaque={destaque} />
      ))}
    </div>
  );
}

type T = (typeof TEXTOS)["en"];

function VazioDaChroma({ rede, t }: { rede: string; t: T }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900 px-6 py-12 text-center">
      <p className="text-[14px] font-semibold text-zinc-300">
        {t.vazioChroma(rede)}
      </p>
      <p className="mt-1 text-[12px] text-zinc-600">
        <Link href="/create" className="text-marca hover:underline">
          {t.crieAPrimeira}
        </Link>{" "}
        {t.apareceAqui}
      </p>
    </div>
  );
}

function Vazio({ href, outraRede, t }: { href: string; outraRede: string; t: T }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900 px-6 py-12 text-center">
      <p className="text-[14px] font-semibold text-zinc-300">{t.vazio}</p>
      <p className="mt-1 text-[12px] text-zinc-600">
        {t.vazioLista}{" "}
        <Link href={href} className="text-marca hover:underline">
          {t.verARede(outraRede)}
        </Link>
        .
      </p>
    </div>
  );
}
