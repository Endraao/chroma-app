"use client";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";

import { useState } from "react";
import Link from "next/link";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { RequireChainWallet } from "@/components/web3/RequireChainWallet";
import { Badge } from "@/components/ui/Badge";
import { MediaDropzone, MediaSpecList, type MediaSpec, type SelectedMedia } from "@/components/ui/MediaDropzone";
import { useRouter } from "next/navigation";

import { useChromaAccount } from "@/hooks/useChromaAccount";
import { useLancarToken } from "@/hooks/useLancarToken";
import { chainIcon } from "@/lib/chain-icons";
import { PARTE_DA_CHROMA_BPS } from "@/lib/pumpfun";
import { useLancarTokenEvm } from "@/hooks/useLancarTokenEvm";
import { usePrecoNativo } from "@/hooks/usePrecoNativo";
import { CHAINS, CHAIN_IDS, REDE_PADRAO, podeLancarNaRede } from "@/lib/web3";
import { DEFAULT_PAIR, LIQUIDITY_PAIRS } from "@/lib/pairs";
import { SeletorDePar } from "@/components/create/SeletorDePar";
import {
  CHAIN_FEES,
  feeLabelFor,
} from "@/lib/fees";
import { cn, formatUsd } from "@/lib/utils";
import { CURVA_CHROMA_DISPONIVEL } from "@/lib/meteora-dbc";

const TEXTO_CURVA = traducoes({
  en: {
    titulo: "Bonding curve",
    classica: "Classic",
    chroma: "Chroma Curve · new",
    notaClassica: "The most traded curve on Solana. Graduates at ~85 SOL.",
    notaChroma: "You earn 40% of the trading fee on every trade of your coin, on any app, forever. Snipers pay up to 25% in the first 2 minutes; your first buy pays the minimum. Graduates to Meteora with locked liquidity.",
  },
  pt: {
    titulo: "Curva de lançamento",
    classica: "Clássica",
    chroma: "Curva da Chroma · nova",
    notaClassica: "A curva mais negociada da Solana. Gradua com ~85 SOL.",
    notaChroma: "Você ganha 40% da taxa de toda negociação da sua moeda, em qualquer app, pra sempre. Robôs pagam até 25% nos primeiros 2 minutos; sua primeira compra paga o mínimo. Gradua pra Meteora com liquidez travada.",
  },
  zh: {
    titulo: "联合曲线",
    classica: "经典",
    chroma: "Chroma 曲线 · 新",
    notaClassica: "Solana 上交易最活跃的曲线。约 85 SOL 时毕业。",
    notaChroma: "你的代币在任何应用上的每笔交易，你都永久获得 40% 的交易费。前 2 分钟狙击机器人最高支付 25%；你的首次买入只付最低费用。毕业后迁移至 Meteora，流动性锁定。",
  },
});
import type { ChainId } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Requisitos de mídia                                                 */
/* ------------------------------------------------------------------ */

const COIN_MEDIA: MediaSpec = {
  maxSizeMb: 15,
  maxVideoSizeMb: 30,
  accept: ["image/jpeg", "image/png", "image/gif", "video/mp4"],
  minDimension: 200,
};

/**
 * Atalhos comuns; o slider cobre o resto até o teto de 10%.
 * Valores fixos, não derivados do padrão — senão mudar o padrão pra 0
 * duplicaria o primeiro botão.
 */

const BANNER_MEDIA: MediaSpec = {
  maxSizeMb: 4.5,
  accept: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  aspectRatio: { value: 3, tolerance: 0.35, label: "3:1" },
};

const TEXTOS = traducoes({
  en: {
    titulo: "Create token", subtitulo: "Create and trade in the same place: as soon as the coin is created it is available to buy and sell, with its own page and a live chart.",
    naoLanca: (rede: string, outra: string) => <><strong>Launching coins on {rede} is not available yet.</strong> On this network Chroma only buys and sells. To create your coin, use {outra}.</>,
    trocarPara: (rede: string) => `Switch to ${rede}`,
    imutavel: (agora: React.ReactNode) => <>The coin&apos;s data — image, banner and social links — can only be added {agora} and cannot be changed or edited after creation.</>,
    agora: "now", rede: "Network", gasEm: (s: string) => `gas in ${s}`, par: "Liquidity pair", parSub: "what your token is priced against",
    midia: "Image or video", obrigatorio: "required", selecione: "Select the video or image you want to upload.", arraste: "or drag and drop it here.",
    tamanho: "File size and type", img15: "Image — max 15 MB. '.jpg', '.gif' or '.png' recommended.", video30: "Video — max 30 MB. '.mp4' recommended.",
    resolucao: "Resolution and aspect ratio", img1000: "Image — at least 200x200px; 1000x1000px and 1:1 ratio recommended.", video1080: "Video — 16:9 or 9:16, 1080p or higher recommended.",
    addBanner: "Add banner", opcional: "optional", carregarBanner: "Upload banner",
    bannerTexto: "Shown on the coin page, besides the coin image. Images or animated GIFs up to 4.5 MB; larger images are resized automatically, GIFs are not. 3:1 ratio, 1500x500px recommended. You can only do this when creating the coin and cannot change it later.",
    carregarArquivo: "Upload file…", bannerTamanho: "Image — max 4.5 MB (larger images are resized automatically, GIFs are not). Formats: '.jpg', '.png', '.webp' or '.gif'.",
    bannerResolucao: "3:1 aspect ratio, 1500x500px recommended.",
    identidade: "Identity", nome: "Coin name", nomeEx: "e.g. Turbo Cat", simbolo: "Ticker", simboloEx: "e.g. TURBO", descricao: "Description", descricaoEx: "What is this token?",
    redesSociais: "Social links", opcionalFixo: "optional · cannot be edited later", site: "Website",
    recompensasTitulo: "Send creator rewards to", recCriador: "Creator", recDetentores: "Holders",
    recCriadorNota: "The creator fee from every trade goes to your wallet.",
    recDetentoresNota: "The creator fee from every trade is shared among everyone holding the coin — a reason for people to buy and hold. You do not receive the creator fee in this mode.",
    ganhoDetentores: "As a holder you also get your share of the rewards for as long as you hold the coin — just like everyone else.",
    recSoSolana: "Sending rewards to holders is available for Solana launches. On Robinhood Chain, rewards go to the creator.",
    ganhoTitulo: "What you earn as the creator",
    ganhoPump: (_p: number) => `You keep 100% of the creator fee from every trade of your coin. You approve a single transaction: creating the coin together with your initial buy — so you buy before anyone else.`,
    ganhoTexto: (base: string, topo: string) => `You receive ${base} of every trade of your coin, rising up to ${topo} as it gains volume — paid in the same transaction, at no extra cost to buyers.`,
    ganhoEvm: "You receive 0.70% of every trade of your coin. You approve a single transaction: creating the coin together with your initial buy — so you buy before anyone else.",
    taxaCriadorTitulo: "Creator tax (optional)", taxaCriadorNota: (total: string) => `Extra fee on every trade, paid entirely to you — up to 10%. Traders pay ${total}% in total.`,
    verFaixas: "see the tiers",
    compraInicial: "Initial buy", quanto: (s: string) => `How much do you want to buy at launch (in ${s})`, semDolar: "dollar price unavailable right now",
    segundaConfirmacao: "your wallet asks for a second confirmation for this buy, right after creating",
    naoCustodia: "Chroma is non-custodial: the coin is yours and the transaction comes from your wallet. The initial buy pays the same price as anyone else — there is no token reserve for the creator. What you buy here shows up in the security panel as creator concentration.",
    abrirMoeda: "Open the coin",
    emBreve: (rede: string) => `Launching on ${rede} coming soon`, facaLogin: "Sign in to create", conecteCarteira: (rede: string) => `Connect your ${rede} wallet`,
    envieImagem: "Upload the image or video", preenchaNome: "Fill in name and symbol", criar: "Create and open the curve",
    taxaLancamento: (fee: number, s: string, rede: string) => `Launch fee: ${fee} ${s}, paid on submission. Plus the ${rede} network fee.`,
    semTaxa: (rede: string) => `Launching has no Chroma fee — only the ${rede} network fee, paid from your wallet.`,
    semLimite: "There is no limit on how many tokens you can launch.", verTaxas: "see all fees",
    etapas: { parado: "", "publicando-arte": "Publishing the art…", "aprovar-unica": "Approve the launch in your wallet…", "aprovar-tudo": "Step 1 of 2 — approve creating the coin and your buy…", finalizando: "Step 2 of 2 — approve the fees in your wallet…", "aguardando-assinatura": "Step 1 of 2 — approve creating the coin in your wallet…", confirmando: "Confirming on the network…", comprando: "Coin created. Approve the initial buy…", dividindo: "Step 2 of 2 — approve the initial buy and fee split in your wallet…", pronto: "Done!" } as Record<string, string>,
  },
  pt: {
    titulo: "Criar token", subtitulo: "Criação e negociação no mesmo lugar: assim que a moeda é criada, ela já fica disponível para compra e venda, com página própria e gráfico ao vivo.",
    naoLanca: (rede: string, outra: string) => <><strong>Lançar moedas na {rede} ainda não está disponível.</strong> Nesta rede a Chroma faz só compra e venda. Para criar a sua moeda, use a {outra}.</>,
    trocarPara: (rede: string) => `Trocar para ${rede}`,
    imutavel: (agora: React.ReactNode) => <>Os dados da moeda — imagem, banner e links de redes sociais — só podem ser adicionados {agora} e não poderão ser alterados nem editados depois da criação.</>,
    agora: "agora", rede: "Rede", gasEm: (s: string) => `gás em ${s}`, par: "Par de liquidez", parSub: "contra o que seu token é cotado",
    midia: "Imagem ou vídeo", obrigatorio: "obrigatório", selecione: "Selecione o vídeo ou a imagem que deseja enviar.", arraste: "ou arraste e solte aqui.",
    tamanho: "Tamanho e tipo do arquivo", img15: "Imagem — máximo 15 MB. Recomenda-se o formato '.jpg', '.gif' ou '.png'.", video30: "Vídeo — máximo 30 MB. Formato '.mp4' recomendado.",
    resolucao: "Resolução e proporção da tela", img1000: "Imagem — mínimo 200x200px; 1000x1000px e proporção 1:1 recomendadas.", video1080: "Vídeo — Formato 16:9 ou 9:16, resolução 1080p ou superior recomendada.",
    addBanner: "Adicionar banner", opcional: "opcional", carregarBanner: "Carregar banner",
    bannerTexto: "Isso será exibido na página da moeda, além da imagem da moeda. Imagens ou GIFs animados de até 4,5 MB; imagens maiores são redimensionadas automaticamente, GIFs não. Proporção de 3:1, 1500x500px recomendado. Você só pode fazer isso ao criar a moeda e não poderá alterar posteriormente.",
    carregarArquivo: "Carregar arquivo…", bannerTamanho: "Imagem — máximo 4,5 MB (imagens maiores são redimensionadas automaticamente, GIFs não). Formatos: '.jpg', '.png', '.webp' ou '.gif'.",
    bannerResolucao: "Proporção de aspecto 3:1, resolução recomendada de 1500x500px.",
    identidade: "Identidade", nome: "Nome da moeda", nomeEx: "Ex: Gato Turbo", simbolo: "Ticker", simboloEx: "Ex: TURBO", descricao: "Descrição", descricaoEx: "O que é esse token?",
    redesSociais: "Redes sociais", opcionalFixo: "opcional · não editável depois", site: "Site",
    recompensasTitulo: "Enviar recompensas do criador para", recCriador: "Criador", recDetentores: "Detentores",
    recCriadorNota: "A taxa de criador de cada operação vai para a sua carteira.",
    recDetentoresNota: "A taxa de criador de cada operação é dividida entre todos que seguram a moeda — um motivo pra comprar e segurar. Nesse modo você não recebe a taxa de criador.",
    ganhoDetentores: "Como detentor, você também recebe a sua parte das recompensas enquanto segurar a moeda — igual a todo mundo.",
    recSoSolana: "Enviar as recompensas aos detentores está disponível nos lançamentos da Solana. Na Robinhood Chain, as recompensas vão para o criador.",
    ganhoTitulo: "O que você ganha como criador",
    ganhoPump: (_p: number) => `Você fica com 100% da taxa de criador de cada operação da sua moeda. Você aprova uma única transação: a criação da moeda junto com a sua compra inicial — assim você compra antes de todo mundo.`,
    ganhoTexto: (base: string, topo: string) => `Você recebe ${base} de cada operação da sua moeda, subindo até ${topo} conforme ela ganha volume — pago na mesma transação, sem cobrar nada a mais de quem compra.`,
    ganhoEvm: "Você recebe 0,70% de cada negociação da sua moeda. Você aprova uma única transação: a criação da moeda junto com a sua compra inicial — assim você compra antes de todo mundo.",
    taxaCriadorTitulo: "Taxa do criador (opcional)", taxaCriadorNota: (total: string) => `Taxa extra em cada negociação, paga toda para você — até 10%. Quem negocia paga ${total}% no total.`,
    verFaixas: "ver as faixas",
    compraInicial: "Compra inicial", quanto: (s: string) => `Quanto você quer comprar no lançamento (em ${s})`, semDolar: "cotação do dólar indisponível agora",
    segundaConfirmacao: "a carteira pede uma segunda confirmação para esta compra, logo depois de criar",
    naoCustodia: "A Chroma não faz custódia: a moeda é sua e a transação sai da sua carteira. A compra inicial paga o mesmo preço que qualquer outra pessoa — não existe reserva de tokens para o criador. O que você comprar aqui aparece no painel de segurança como concentração do criador.",
    abrirMoeda: "Abrir a moeda",
    emBreve: (rede: string) => `Lançar na ${rede} em breve`, facaLogin: "Faça login para criar", conecteCarteira: (rede: string) => `Conecte sua carteira ${rede}`,
    envieImagem: "Envie a imagem ou o vídeo", preenchaNome: "Preencha nome e símbolo", criar: "Criar e abrir a curva",
    taxaLancamento: (fee: number, s: string, rede: string) => `Taxa de lançamento: ${fee} ${s}, paga no envio. Mais a taxa de rede da ${rede}.`,
    semTaxa: (rede: string) => `Lançar não tem taxa da Chroma — só a taxa de rede da ${rede}, paga da sua carteira.`,
    semLimite: "Não há limite de quantos tokens você pode lançar.", verTaxas: "ver todas as taxas",
    etapas: { parado: "", "publicando-arte": "Publicando a arte…", "aprovar-unica": "Aprove o lançamento na sua carteira…", "aprovar-tudo": "Etapa 1 de 2 — aprove a criação e a sua compra…", finalizando: "Etapa 2 de 2 — aprove as taxas na carteira…", "aguardando-assinatura": "Etapa 1 de 2 — aprove a criação da moeda na carteira…", confirmando: "Confirmando na rede…", comprando: "Moeda criada. Aprove a compra inicial…", dividindo: "Etapa 2 de 2 — aprove na carteira a compra inicial e a divisão das taxas…", pronto: "Pronto!" } as Record<string, string>,
  },
  zh: {
    titulo: "创建代币", subtitulo: "发行与交易一站完成：代币创建后立即可以买卖，拥有独立页面和实时图表。",
    naoLanca: (rede: string, outra: string) => <><strong>暂不支持在 {rede} 上发行代币。</strong>在该网络 Chroma 只提供买卖。要创建代币，请使用 {outra}。</>,
    trocarPara: (rede: string) => `切换到 ${rede}`,
    imutavel: (agora: React.ReactNode) => <>代币资料 —— 图片、横幅和社交链接 —— 只能{agora}添加，创建后无法修改或编辑。</>,
    agora: "现在", rede: "网络", gasEm: (s: string) => `以 ${s} 支付 Gas`, par: "流动性交易对", parSub: "你的代币以什么计价",
    midia: "图片或视频", obrigatorio: "必填", selecione: "选择要上传的视频或图片。", arraste: "或拖放到这里。",
    tamanho: "文件大小与类型", img15: "图片 —— 最大 15 MB，推荐 '.jpg'、'.gif' 或 '.png'。", video30: "视频 —— 最大 30 MB，推荐 '.mp4'。",
    resolucao: "分辨率与比例", img1000: "图片 —— 至少 200x200px，推荐 1000x1000px、1:1。", video1080: "视频 —— 16:9 或 9:16，推荐 1080p 或更高。",
    addBanner: "添加横幅", opcional: "可选", carregarBanner: "上传横幅",
    bannerTexto: "显示在代币页面上，与代币图片一起展示。图片或动图最大 4.5 MB；较大的图片会自动缩放，GIF 不会。推荐 3:1 比例、1500x500px。只能在创建时设置，之后无法修改。",
    carregarArquivo: "上传文件…", bannerTamanho: "图片 —— 最大 4.5 MB（较大图片会自动缩放，GIF 不会）。格式：'.jpg'、'.png'、'.webp' 或 '.gif'。",
    bannerResolucao: "3:1 比例，推荐 1500x500px。",
    identidade: "基本信息", nome: "代币名称", nomeEx: "例如：Turbo Cat", simbolo: "Ticker", simboloEx: "例如：TURBO", descricao: "简介", descricaoEx: "这个代币是什么？",
    redesSociais: "社交链接", opcionalFixo: "可选 · 之后无法修改", site: "官网",
    recompensasTitulo: "创作者奖励发送给", recCriador: "创作者", recDetentores: "持有人",
    recCriadorNota: "每笔交易的创作者费用都会进入你的钱包。",
    recDetentoresNota: "每笔交易的创作者费用会分配给所有持有该代币的人 —— 让大家有理由买入并持有。此模式下你不会获得创作者费用。",
    ganhoDetentores: "作为持有人，只要你持有该代币，也能和其他人一样获得你的那份奖励。",
    recSoSolana: "将奖励发送给持有人仅适用于 Solana 发行。在 Robinhood Chain 上，奖励归创作者所有。",
    ganhoTitulo: "作为创建者你能获得什么",
    ganhoPump: (_p: number) => `你保留代币每笔交易 100% 的创作者费用。你只需确认一笔交易：创建代币并同时完成首次买入——让你比任何人都先买入。`,
    ganhoTexto: (base: string, topo: string) => `你的代币每笔交易你都能获得 ${base}，随交易量增长最高到 ${topo} —— 在同一笔交易中支付，买家无需额外付费。`,
    ganhoEvm: "你的代币每笔交易你都能获得 0.70%。你只需确认一笔交易：创建代币并同时完成首次买入——让你比任何人都先买入。",
    taxaCriadorTitulo: "创作者税（可选）", taxaCriadorNota: (total: string) => `每笔交易的额外费用，全部归你——最高 10%。交易者总共支付 ${total}%。`,
    verFaixas: "查看档位",
    compraInicial: "首次买入", quanto: (s: string) => `发行时想买入多少（以 ${s} 计）`, semDolar: "暂时无法获取美元报价",
    segundaConfirmacao: "创建后钱包会立即请求第二次确认以完成这笔买入",
    naoCustodia: "Chroma 不托管资产：代币属于你，交易从你的钱包发出。首次买入与其他人价格相同 —— 没有为创建者预留代币。你在这里买入的部分会在安全面板中显示为创建者持仓集中度。",
    abrirMoeda: "打开代币",
    emBreve: (rede: string) => `${rede} 发行即将推出`, facaLogin: "登录后创建", conecteCarteira: (rede: string) => `连接你的 ${rede} 钱包`,
    envieImagem: "请上传图片或视频", preenchaNome: "请填写名称和代号", criar: "创建并开启曲线",
    taxaLancamento: (fee: number, s: string, rede: string) => `发行费：${fee} ${s}，提交时支付。另加 ${rede} 网络手续费。`,
    semTaxa: (rede: string) => `发行不收 Chroma 费用 —— 只需从钱包支付 ${rede} 网络手续费。`,
    semLimite: "发行代币数量不限。", verTaxas: "查看全部费用",
    etapas: { parado: "", "publicando-arte": "正在上传图片…", "aprovar-unica": "请在钱包中确认发行…", "aprovar-tudo": "第 1 步，共 2 步 —— 确认创建代币和你的买入…", finalizando: "第 2 步，共 2 步 —— 在钱包中确认费用…", "aguardando-assinatura": "第 1 步，共 2 步 —— 请在钱包中确认创建代币…", confirmando: "网络确认中…", comprando: "代币已创建，请确认首次买入…", dividindo: "第 2 步，共 2 步 —— 请在钱包中确认首次买入和费用分配…", pronto: "完成！" } as Record<string, string>,
  },
});


export default function CreateTokenPage() {
  const t = useTextos(TEXTOS);
  const tc = useTextos(TEXTO_CURVA);
  const account = useChromaAccount();
  const router = useRouter();

  /*
   * UM HOOK POR REDE, e a tela escolhe qual usar.
   * ---------------------------------------------------------------------
   * As duas redes assinam de jeitos incompatíveis: a Solana monta uma
   * transação com `@solana/web3.js` e um par de chaves novo que precisa
   * assinar junto; a EVM chama uma função de contrato pelo wagmi e lê o
   * endereço da moeda no recibo.
   *
   * Tentar unificar isso num hook só significaria um corpo cheio de `if
   * (chain === ...)` em volta de bibliotecas diferentes. Dois hooks com a
   * MESMA forma de retorno — `lancar`, `etapa`, `erro`, `ocupado`,
   * `carteiraConectada` — deixam a tela tratar os dois igual.
   *
   * Os dois são chamados sempre, porque hook não pode ser condicional; o
   * que não está em uso simplesmente fica parado.
   */
  const lancamentoSolana = useLancarToken();
  const lancamentoEvm = useLancarTokenEvm();

  const [chain, setChain] = useState<ChainId>(REDE_PADRAO);

  /*
   * A partir daqui a tela não sabe mais em que rede está: ela fala com
   * `lancamento`, e quem é `lancamento` depende da rede escolhida. Assim o
   * botão, a mensagem de erro e o texto de etapa continuam com um caminho só.
   */
  const lancamento = chain === "solana" ? lancamentoSolana : lancamentoEvm;

  /*
   * Duas condições diferentes, e a tela precisa das duas.
   *
   * `podeLancarNaRede` é a regra do produto: na Solana o programa da curva não
   * está publicado, então criar moeda não existe ali — só negociar.
   *
   * `lancamentoEvm.disponivel` é a realidade do ambiente: mesmo na Robinhood,
   * enquanto os contratos não estiverem no ar com os endereços configurados,
   * não há o que chamar.
   */
  const redeDisponivel = podeLancarNaRede(chain) && (chain === "solana" || lancamentoEvm.disponivel);

  const [pair, setPair] = useState(DEFAULT_PAIR.solana);
  const [media, setMedia] = useState<SelectedMedia | null>(null);
  const [banner, setBanner] = useState<SelectedMedia | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  // Pra quem vão as recompensas de criador (taxa de criador de cada operação).
  const [recompensas, setRecompensas] = useState<"criador" | "detentores">("criador");
  const [curva, setCurva] = useState<"pump" | "chroma">("pump");
  // Robinhood: taxa extra do criador (0 a 10%), igual à da plataforma de lançamento.
  const [taxaDoCriador, setTaxaDoCriador] = useState("");
  const taxaDoCriadorNum = Math.max(0, Math.min(10, Number(taxaDoCriador.replace(",", ".")) || 0));
  const [form, setForm] = useState({
    name: "",
    symbol: "",
    description: "",
    website: "",
    twitter: "",
    telegram: "",
    initialBuy: "",
  });

  const meta = CHAINS[chain];
  const pairs = LIQUIDITY_PAIRS[chain];
  const precoNativo = usePrecoNativo(chain);
  const compraInicial = Number(form.initialBuy);
  const compraEmDolar =
    precoNativo !== null && compraInicial > 0 ? compraInicial * precoNativo : null;

  /*
   * A moeda nasceu mas a compra inicial não aconteceu. A tela FICA aqui e diz
   * isso, com link pra moeda — ir direto pra página dela esconderia que o que
   * a pessoa pediu não foi feito.
   */
  const [criadaSemCompra, setCriadaSemCompra] = useState<{ moeda: string; aviso: string } | null>(null);

  const launchFee = CHAIN_FEES[chain].launchFee;
  const chainLabels = feeLabelFor(chain);

  function selectChain(next: ChainId) {
    setChain(next);
    setPair(DEFAULT_PAIR[next]); // o par da rede anterior não existe na nova
  }

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const ready =
    account.isSignedIn &&
    form.name.trim().length >= 2 &&
    form.symbol.trim().length >= 2 &&
    Boolean(media);

  return (
    <div className="mx-auto max-w-2xl space-y-4 pt-4">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-zinc-50">{t.titulo}</h1>
        <p className="mt-1 text-[13px] text-zinc-500">
          {t.subtitulo}
        </p>
      </div>

      {/*
        A REDE QUE NÃO LANÇA AVISA ANTES DO FORMULÁRIO.
        ------------------------------------------------------------------
        Antes isso só aparecia no texto do botão, lá embaixo — depois de a
        pessoa escolher a rede, preencher nome, símbolo, enviar imagem e
        rolar a página inteira. Descobrir no fim que aquela rede não lança é
        trabalho jogado fora.

        O aviso leva junto o botão que resolve, em vez de só informar.
      */}
      {!podeLancarNaRede(chain) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warn/30 bg-warn/[0.07] p-3">
          <p className="text-[12px] leading-relaxed text-warn">
            {t.naoLanca(meta.label, CHAINS[REDE_PADRAO].label)}
          </p>
          <Button variant="outline" size="sm" onClick={() => selectChain(REDE_PADRAO)}>
            {t.trocarPara(CHAINS[REDE_PADRAO].label)}
          </Button>
        </div>
      )}

      {/* Rede */}
      <Card>
        <CardHeader>
          <CardTitle>{t.rede}</CardTitle>
        </CardHeader>
        <CardBody className="grid grid-cols-2 gap-2">
          {CHAIN_IDS.map((id) => (
            <button
              key={id}
              onClick={() => selectChain(id)}
              className={cn(
                "rounded-xl border px-3 py-3 text-left transition-all",
                chain === id
                  ? "border-marca/50 bg-marca/10"
                  : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14]",
              )}
            >
              <div className={cn("flex items-center gap-2 text-sm font-bold", chain === id ? "text-marca" : "text-zinc-300")}>
                <img src={chainIcon(id)} alt="" width={18} height={18} className="size-[18px] rounded-full" />
                {CHAINS[id].label}
              </div>
              <div className="text-[11px] text-zinc-600">{t.gasEm(CHAINS[id].nativeSymbol)}</div>
            </button>
          ))}
        </CardBody>
      </Card>

      {/* Par de liquidez */}
      <Card>
        <CardHeader>
          <CardTitle>{t.par}</CardTitle>
          <span className="text-[11px] text-zinc-600">{t.parSub}</span>
        </CardHeader>
        <CardBody className="space-y-2">
          {/*
            Lista suspensa com busca, e não mais uma pilha de cartões.

            Com três opções a pilha era o formato certo: tudo à vista, sem
            clique. Com setenta ativos tokenizados na Robinhood, a mesma pilha
            vira uma página de rolagem antes do formulário e empurra o resto
            pra fora da tela.
          */}
          <SeletorDePar chain={chain} pares={pairs} valor={pair} onChange={setPair} />

        </CardBody>
      </Card>

      {/* Aviso de imutabilidade — logo acima da mídia, que é o que não dá pra trocar depois */}
      <p className="px-1 text-[11px] leading-relaxed text-zinc-200">
        {t.imutavel(<strong>{t.agora}</strong>)}
      </p>

      {/* Mídia da moeda */}
      <Card>
        <CardHeader>
          <CardTitle>{t.midia}</CardTitle>
          <Badge tone="danger">{t.obrigatorio}</Badge>
        </CardHeader>
        <CardBody className="space-y-4">
          <MediaDropzone
            spec={COIN_MEDIA}
            value={media}
            onChange={setMedia}
            title={t.selecione}
            subtitle={t.arraste}
          />

          <MediaSpecList
            columns={[
              {
                icon: "file",
                title: t.tamanho,
                items: [t.img15, t.video30],
              },
              {
                icon: "image",
                title: t.resolucao,
                items: [t.img1000, t.video1080],
              },
            ]}
          />
        </CardBody>
      </Card>

      {/* Banner */}
      <Card>
        <button
          onClick={() => setShowBanner((v) => !v)}
          className="flex w-full items-center gap-2 px-4 py-3 text-left"
        >
          <svg viewBox="0 0 24 24" className="size-4 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
          <span className="text-[13px] font-semibold text-marca">{t.addBanner}</span>
          <span className="text-[12px] text-zinc-600">({t.opcional})</span>
          <span className={cn("ml-auto text-zinc-600 transition-transform", showBanner && "rotate-180")}>⌄</span>
        </button>

        {showBanner && (
          <CardBody className="space-y-4 border-t border-white/[0.06]">
            <div>
              <div className="text-[13px] font-bold text-zinc-200">{t.carregarBanner}</div>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                {t.bannerTexto}
              </p>
            </div>

            <MediaDropzone
              spec={BANNER_MEDIA}
              value={banner}
              onChange={setBanner}
              title={t.carregarArquivo}
            />

            <MediaSpecList
              columns={[
                {
                  icon: "file",
                  title: t.tamanho,
                  items: [t.bannerTamanho],
                },
                {
                  icon: "image",
                  title: t.resolucao,
                  items: [t.bannerResolucao],
                },
              ]}
            />
          </CardBody>
        )}
      </Card>

      {/* Identidade */}
      <Card>
        <CardHeader>
          <CardTitle>{t.identidade}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <Field
            label={t.nome}
            placeholder={t.nomeEx}
            value={form.name}
            onChange={(v) => set("name", cortarEmBytes(v, 32))}
          />
          <Field
            label={t.simbolo}
            placeholder={t.simboloEx}
            value={form.symbol}
            maxLength={10}
            onChange={(v) => set("symbol", cortarEmBytes(v.toUpperCase(), 10))}
          />
          <Field
            label={t.descricao}
            placeholder={t.descricaoEx}
            value={form.description}
            multiline
            onChange={(v) => set("description", v)}
          />
        </CardBody>
      </Card>

      {/* Redes sociais */}
      <Card>
        <CardHeader>
          <CardTitle>{t.redesSociais}</CardTitle>
          <span className="text-[11px] text-zinc-600">{t.opcionalFixo}</span>
        </CardHeader>
        <CardBody className="space-y-3">
          <Field label={t.site} placeholder="https://" value={form.website} onChange={(v) => set("website", v)} />
          <Field label="X (Twitter)" placeholder="https://x.com/..." value={form.twitter} onChange={(v) => set("twitter", v)} />
          <Field label="Telegram" placeholder="https://t.me/..." value={form.telegram} onChange={(v) => set("telegram", v)} />
        </CardBody>
      </Card>

      {/*
        O QUE O CRIADOR RECEBE, DE VERDADE (28/09/2026).
        Aqui havia um controle de "taxa de criador" (0–10%) e uma opção de
        dividir recompensas com detentores. Nenhum dos dois era enviado ao
        contrato: o criador recebe a fatia fixa das faixas, e é isso que a
        tela diz agora.
      */}
      {/*
        Em qual curva a moeda nasce, na Solana. A Curva da Chroma (Meteora DBC)
        dá ao criador metade da taxa de TODA negociação, em qualquer site, e
        tem taxa anti-robô nos primeiros 2 minutos (ver lib/meteora-dbc.ts).
        Ao usuário nunca se fala o nome de quem opera a curva clássica.
      */}
      {chain === "solana" && CURVA_CHROMA_DISPONIVEL && (
        <Card>
          <CardHeader>
            <CardTitle>{tc.titulo}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/[0.06] p-1">
              {(["pump", "chroma"] as const).map((op) => (
                <button
                  key={op}
                  type="button"
                  onClick={() => setCurva(op)}
                  className={cn(
                    "rounded-lg py-2.5 text-[13px] font-bold transition-colors",
                    curva === op ? "bg-ink-700 text-zinc-50" : "text-zinc-500 hover:text-zinc-200",
                  )}
                >
                  {op === "pump" ? tc.classica : tc.chroma}
                </button>
              ))}
            </div>
            <p className="text-[11.5px] leading-relaxed text-zinc-500">
              {curva === "pump" ? tc.notaClassica : tc.notaChroma}
            </p>
          </CardBody>
        </Card>
      )}

      {/* Recompensas do criador: pro criador ou pros detentores */}
      <Card>
        <CardHeader>
          <CardTitle>{t.recompensasTitulo}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2">
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/[0.06] p-1">
            {(["criador", "detentores"] as const).map((op) => {
              const bloqueada = op === "detentores" && chain !== "solana";
              return (
                <button
                  key={op}
                  type="button"
                  disabled={bloqueada}
                  onClick={() => setRecompensas(op)}
                  className={cn(
                    "rounded-lg py-2.5 text-[13px] font-bold transition-colors",
                    (chain === "solana" ? recompensas : "criador") === op
                      ? "bg-ink-700 text-zinc-50"
                      : "text-zinc-500 hover:text-zinc-200",
                    bloqueada && "cursor-not-allowed opacity-40 hover:text-zinc-500",
                  )}
                >
                  {op === "criador" ? t.recCriador : t.recDetentores}
                </button>
              );
            })}
          </div>
          <p className="text-[11.5px] leading-relaxed text-zinc-500">
            {chain !== "solana"
              ? t.recSoSolana
              : recompensas === "criador"
                ? t.recCriadorNota
                : t.recDetentoresNota}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.ganhoTitulo}</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-[12px] leading-relaxed text-zinc-400">
            {chain === "solana" ? (
              recompensas === "detentores" ? t.ganhoDetentores : t.ganhoPump(PARTE_DA_CHROMA_BPS / 100)
            ) : (
              // Robinhood (curva da Pons, conferido na rede em 30/09/2026): 1% por
              // negociação, 70% disso vai pro criador = 0,70% de cada operação.
              t.ganhoEvm
            )}
          </p>
          {chain === "robinhood" && (
            <div className="mt-3 space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{t.taxaCriadorTitulo}</label>
              <div className="flex items-center gap-2 rounded-lg border border-ink-600 bg-ink-950/60 px-3 py-2 focus-within:border-marca/50">
                <input
                  inputMode="decimal"
                  value={taxaDoCriador}
                  onChange={(e) => setTaxaDoCriador(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 5))}
                  placeholder="0"
                  className="tnum min-w-0 flex-1 bg-transparent text-[15px] font-bold text-zinc-100 outline-none placeholder:text-zinc-700"
                />
                <span className="text-[13px] font-bold text-zinc-500">%</span>
              </div>
              <p className="text-[11px] leading-relaxed text-zinc-500">
                {t.taxaCriadorNota((1 + taxaDoCriadorNum).toLocaleString(undefined, { maximumFractionDigits: 2 }))}
              </p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Compra inicial */}
      <Card>
        <CardHeader>
          <CardTitle>{t.compraInicial}</CardTitle>
          <span className="text-[11px] text-zinc-600">{t.opcional}</span>
        </CardHeader>
        <CardBody className="space-y-3">
          <Field
            label={t.quanto(meta.nativeSymbol)}
            placeholder="0.5"
            value={form.initialBuy}
            onChange={(v) => set("initialBuy", v.replace(/[^0-9.]/g, ""))}
          />
          {compraInicial > 0 && (
            <p className="tnum -mt-1 text-[12px] text-zinc-400">
              {compraEmDolar !== null ? <>≈ {formatUsd(compraEmDolar)}</> : t.semDolar}
            </p>
          )}
          <p className="text-[11px] leading-relaxed text-zinc-500">
            {t.naoCustodia}
          </p>
        </CardBody>
      </Card>

      {criadaSemCompra && (
        <div className="rounded-xl border border-warn/30 bg-warn/[0.07] px-4 py-3 text-[12px] leading-relaxed text-warn">
          {criadaSemCompra.aviso}{" "}
          <Link href={`/token/${criadaSemCompra.moeda}`} className="font-bold underline">
            {t.abrirMoeda}
          </Link>
        </div>
      )}

      {lancamento.erro && (
        <div className="rounded-xl border border-bear/30 bg-bear/[0.07] px-4 py-3 text-[12px] leading-relaxed text-bear">
          {lancamento.erro}
        </div>
      )}

      {/*
        Carteira da rede escolhida não conectada nesta aba (mesmo que já
        vinculada à conta): em vez de um botão travado, o botão de conectar.
      */}
      <RequireChainWallet chain={chain}>
      <Button
        variant="chroma"
        size="lg"
        className="w-full"
        disabled={
          !ready ||
          lancamento.ocupado ||
          !redeDisponivel ||
          !lancamento.carteiraConectada
        }
        onClick={async () => {
          if (!media) return;

          const resultado = await lancamento.lancar({
            nome: form.name.trim(),
            simbolo: form.symbol.trim(),
            descricao: form.description.trim() || undefined,
            site: form.website.trim() || undefined,
            twitter: form.twitter.trim() || undefined,
            telegram: form.telegram.trim() || undefined,
            arte: media.file,
            banner: banner?.file ?? null,
            compraInicial: form.initialBuy.trim() || undefined,
            recompensas: chain === "solana" && curva === "pump" ? recompensas : "criador",
            curva: chain === "solana" ? curva : undefined,
            taxaDoCriador: chain === "robinhood" ? taxaDoCriadorNum : 0,
            par: chain === "solana" && pair === "USDC" ? "USDC" : "SOL",
          });

          /*
           * Vai direto pra página da moeda. A pessoa acabou de criar algo e
           * quer VER — deixá-la no formulário preenchido, sem saber se deu
           * certo, é o pior desfecho possível.
           */
          /*
           * Cada rede nomeia a moeda de um jeito: na Solana o endereço se
           * chama `mint`, na EVM é o endereço do contrato do token. A tela
           * precisa do endereço, não do nome que cada rede dá a ele.
           */
          if (!resultado) return;
          if ("avisoDeCompra" in resultado && resultado.avisoDeCompra) {
            // Sem mensagem de erro: vai para a moeda, onde o criador conclui
            // a última etapa com um clique (ConcluirLancamento).
            router.push(`/token/${resultado.moeda}`);
            return;
          }
          router.push(`/token/${"mint" in resultado ? resultado.mint : resultado.moeda}`);
        }}
      >
        {lancamento.ocupado
          ? t.etapas[lancamento.etapa]
          : !redeDisponivel
            ? t.emBreve(meta.label)
            : !account.isSignedIn
              ? t.facaLogin
              : !lancamento.carteiraConectada
                ? t.conecteCarteira(meta.label)
                : !media
                  ? t.envieImagem
                  : !ready
                    ? t.preenchaNome
                    : t.criar}
      </Button>
      </RequireChainWallet>

      <p className="pb-4 text-center text-[11px] leading-relaxed text-zinc-600">
        {launchFee > 0 ? (
          <>{t.taxaLancamento(launchFee, meta.nativeSymbol, meta.label)}</>
        ) : (
          <>{t.semTaxa(meta.label)}</>
        )}{" "}
        {t.semLimite}{" "}
        <Link href="/fees" className="text-marca hover:text-chroma-cyan">
          {t.verTaxas}
        </Link>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Corta o texto no limite de BYTES do contrato, não de letras.
 *
 * O contrato da Robinhood aceita nome de até 32 bytes, e letra com acento
 * ocupa 2. `maxLength` conta letras, então "Ação Coração Brasileira Oficial"
 * passaria pelo campo e seria recusada pelo contrato — que foi um dos
 * suspeitos do primeiro lançamento que falhou sem explicação (27/09/2026).
 */
function cortarEmBytes(texto: string, limite: number): string {
  const codificador = new TextEncoder();
  let saida = "";
  for (const letra of texto) {
    if (codificador.encode(saida + letra).length > limite) break;
    saida += letra;
  }
  return saida;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
}) {
  const className =
    "w-full rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-700 focus:border-marca/40";

  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
      {multiline ? (
        <textarea
          rows={3}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cn(className, "resize-none")}
        />
      ) : (
        <input
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
          className={className}
        />
      )}
    </label>
  );
}

/* ------------------------------------------------------------------ */

