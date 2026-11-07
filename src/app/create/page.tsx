"use client";

import { useTextos } from "@/components/IdiomaProvider";
import { traducoes } from "@/lib/idiomas";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { RequireChainWallet } from "@/components/web3/RequireChainWallet";
import { MediaDropzone, type MediaSpec, type SelectedMedia } from "@/components/ui/MediaDropzone";
import { useRouter } from "next/navigation";

import { useChromaAccount } from "@/hooks/useChromaAccount";
import { useLancarToken } from "@/hooks/useLancarToken";
import { chainIcon } from "@/lib/chain-icons";
import { PARTE_DA_CHROMA_BPS } from "@/lib/pumpfun";
import { useLancarTokenEvm } from "@/hooks/useLancarTokenEvm";
import { usePrecoNativo } from "@/hooks/usePrecoNativo";
import { CHAINS, CHAIN_IDS, REDE_PADRAO, podeLancarNaRede, EVENTO_DA_REDE, lerRedeEscolhida } from "@/lib/web3";
import { DEFAULT_PAIR, LIQUIDITY_PAIRS } from "@/lib/pairs";
import { SeletorDePar } from "@/components/create/SeletorDePar";
import {
  CHAIN_FEES,
  feeLabelFor,
} from "@/lib/fees";
import { cn, formatUsd } from "@/lib/utils";
import { imagemParaClonar, lerParaClonar } from "@/lib/clonar";
import { CURVA_CHROMA_DISPONIVEL, VARIANTES_DISPONIVEIS, type VarianteDaCurva } from "@/lib/meteora-dbc";

/**
 * Curva Clássica de volta e como PADRÃO (19/10/2026, pedido do dono): moeda da
 * curva da Chroma aparece na pump.fun com selo da Meteora e "não verificada" e
 * ninguém compra; a Clássica nasce nativa da pump.fun (a Chroma fica com 30% da
 * taxa de criador). A promoção do bônus do criador acabou.
 */
const MOSTRAR_CURVA_CLASSICA = true;

const TEXTO_CURVA = traducoes({
  en: {
    titulo: "Bonding curve",
    classica: "Pump.fun",
    chroma: "Meteora",
    variante: (p: string) => (p === "50" ? "50% · 2 min" : p.endsWith("c") ? `${parseInt(p)}% → 1% · 2 min` : `Anti-sniper ${p}%`),
    notaClassica: "The most traded curve on Solana. Graduates at ~85 SOL.",
    ganho: "Launching is free. You earn 30% of the trading fee on every trade of your coin (0.3% of each trade), on any app, forever. You approve a single transaction: the coin, its pool and your initial buy — your first buy pays the minimum fee, snipers pay more.",
    bonus: "Example: $100K volume → $500 to you · see the creator bonus →",
    notaChroma: (p: string) => `Free to launch. You earn 30% of the trading fee on every trade of your coin (0.3% of each trade), on any app, forever. Anti-sniper: ${p === "50" ? "every trade in the first 2 minutes pays 50%, then the normal 1%" : p.endsWith("c") ? `trades start at ${parseInt(p)}% and drop every second to the normal 1% within 2 minutes` : `bots that buy in the first second pay ${p}%, dropping to the normal 1% within 30 seconds`} — and your first buy goes in before anyone else, at 1%. Graduates to Meteora with locked liquidity.`,
  },
  pt: {
    titulo: "Curva de lançamento",
    classica: "Pump.fun",
    chroma: "Meteora",
    variante: (p: string) => (p === "50" ? "50% · 2 min" : p.endsWith("c") ? `${parseInt(p)}% → 1% · 2 min` : `Anti-robô ${p}%`),
    notaClassica: "A curva mais negociada da Solana. Gradua com ~85 SOL.",
    ganho: "Lançar é grátis. Você ganha 30% da taxa de toda negociação da sua moeda (0,3% de cada negócio), em qualquer app, pra sempre. Você aprova uma transação só: a moeda, a pool e a sua compra inicial — sua primeira compra paga a taxa mínima, robôs pagam mais.",
    bonus: "Exemplo: $100 mil de volume → $500 pra você · veja o bônus do criador →",
    notaChroma: (p: string) => `Lançar é grátis. Você ganha 30% da taxa de toda negociação da sua moeda (0,3% de cada negócio), em qualquer app, pra sempre. Anti-robô: ${p === "50" ? "todo negócio nos primeiros 2 minutos paga 50%, depois a taxa normal de 1%" : p.endsWith("c") ? `começa em ${parseInt(p)}% e cai a cada segundo até a taxa normal de 1% em 2 minutos` : `quem compra no primeiro segundo paga ${p}%, caindo até a taxa normal de 1% em 30 segundos`} — e a sua primeira compra entra antes de todo mundo, pagando 1%. Gradua pra Meteora com liquidez travada.`,
  },
  zh: {
    titulo: "联合曲线",
    classica: "Pump.fun",
    chroma: "Meteora",
    variante: (p: string) => (p === "50" ? "50% · 2 分钟" : p.endsWith("c") ? `${parseInt(p)}% → 1% · 2 分钟` : `防狙击 ${p}%`),
    notaClassica: "Solana 上交易最活跃的曲线。约 85 SOL 时毕业。",
    ganho: "发币免费。你的代币在任何应用上的每笔交易，你都永久获得 30% 的交易费（每笔交易的 0.3%）。你只需确认一笔交易：代币、资金池和你的首次买入——你的首次买入只付最低费用，狙击机器人支付更多。",
    bonus: "示例：交易量 10 万美元 → 你获得 500 美元 · 查看创作者奖金 →",
    notaChroma: (p: string) => `发币免费。你的代币在任何应用上的每笔交易，你都永久获得 30% 的交易费（每笔交易的 0.3%）。防狙击：${p === "50" ? "前 2 分钟内的每笔交易支付 50%，之后为正常的 1%" : p.endsWith("c") ? `从 ${parseInt(p)}% 开始每秒下降，2 分钟内降至正常的 1%` : `第一秒买入的机器人支付 ${p}%，30 秒内降至正常的 1%`}——你的首次买入先于所有人成交，只付 1%。毕业后迁移至 Meteora，流动性锁定。`,
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

const TEXTO_TELA = traducoes({
  en: {
    titulo: "Launch your coin", subtitulo: "It starts trading as soon as it is created, with its own page and a live chart.",
    revisao: "Review", suaMoeda: "Your coin", passoMoeda: "Your coin", passoMoedaSub: "This is how it shows up everywhere. It can't be changed later.",
    passoCurva: "Bonding curve", passoCurvaSub: "Where your coin starts trading.", passoTaxas: "Who gets the fees?", passoTaxasSub: "Your share of the trading fees.",
    passoCompra: "First buy (optional)", passoCompraSub: "Buy your own coin in the launch transaction.",
    rede: "Network", curva: "Curve", antiSniper: "Anti-sniper", taxasPara: "Fees go to", voce: "You", detentores: "Holders",
    primeiraCompra: "First buy", custo: "Launch cost", gratis: "Free",
  },
  pt: {
    titulo: "Lance sua moeda", subtitulo: "Ela começa a ser negociada assim que for criada, com página própria e gráfico ao vivo.",
    revisao: "Resumo", suaMoeda: "Sua moeda", passoMoeda: "Sua moeda", passoMoedaSub: "É assim que ela aparece em todo lugar. Não dá para mudar depois.",
    passoCurva: "Curva de lançamento", passoCurvaSub: "Onde a sua moeda começa a ser negociada.", passoTaxas: "Quem recebe as taxas?", passoTaxasSub: "Sua parte das taxas de negociação.",
    passoCompra: "Primeira compra (opcional)", passoCompraSub: "Compre sua própria moeda na transação de lançamento.",
    rede: "Rede", curva: "Curva", antiSniper: "Anti-sniper", taxasPara: "Taxas vão para", voce: "Você", detentores: "Detentores",
    primeiraCompra: "Primeira compra", custo: "Custo do lançamento", gratis: "Grátis",
  },
  zh: {
    titulo: "发行你的代币", subtitulo: "创建后即可交易，拥有专属页面和实时图表。",
    revisao: "概览", suaMoeda: "你的代币", passoMoeda: "你的代币", passoMoedaSub: "这是它在各处的显示方式，之后无法更改。",
    passoCurva: "联合曲线", passoCurvaSub: "你的代币从这里开始交易。", passoTaxas: "谁获得手续费？", passoTaxasSub: "你的交易手续费分成。",
    passoCompra: "首次买入（可选）", passoCompraSub: "在发行交易中买入你自己的代币。",
    rede: "网络", curva: "曲线", antiSniper: "防狙击", taxasPara: "手续费归", voce: "你", detentores: "持有者",
    primeiraCompra: "首次买入", custo: "发行费用", gratis: "免费",
  },
});

const TEXTOS = traducoes({
  en: {
    titulo: "Create token", subtitulo: "Create and trade in the same place: as soon as the coin is created it is available to buy and sell, with its own page and a live chart.",
    naoLanca: (rede: string, outra: string) => <><strong>Launching coins on {rede} is not available yet.</strong> On this network Chroma only buys and sells. To create your coin, use {outra}.</>,
    trocarPara: (rede: string) => `Switch to ${rede}`,
    imutavel: (agora: React.ReactNode) => <>The coin&apos;s data — image, banner and social links — can only be added {agora} and cannot be changed or edited after creation.</>,
    agora: "now", rede: "Network", gasEm: (s: string) => `gas in ${s}`, par: "Liquidity pair", parSub: "what your token is priced against",
    custo: (taxa: string) => <>Launching costs <strong>{taxa}</strong> + network fee. Your first buy is separate: it buys your own coin.</>,
    custoGratis: <>Launching is <strong>free</strong> — you only pay the Solana network costs (~0.015 SOL to create the coin&apos;s accounts). Your first buy is separate: it buys your own coin.</>,
    imagemFixa: "The image can't be changed after the coin is created.",
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
    ganhoPump: (p: number) => `You get ${100 - p}% of the creator fee from every trade of your coin, and Chroma keeps ${p}%. You approve a single transaction: creating the coin together with your initial buy — so you buy before anyone else.`,
    ganhoTexto: (base: string, topo: string) => `You receive ${base} of every trade of your coin, rising up to ${topo} as it gains volume — paid in the same transaction, at no extra cost to buyers.`,
    ganhoEvm: "You receive 0.70% of every trade of your coin. You approve a single transaction: creating the coin together with your initial buy — so you buy before anyone else.",
    taxaCriadorTitulo: "Creator tax (optional)", taxaCriadorNota: (total: string) => `Extra fee on every trade, paid entirely to you (0–10%). With the value you choose, traders pay ${total}% in total.`,
    verFaixas: "see the tiers",
    totalNaCarteira: (total: string) => <>Required balance: <strong>{total} SOL</strong>. Includes the creation of the coin&apos;s accounts on Solana (~0.015 SOL), your initial buy and the network fee. Launching itself is free.</>,
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
    custo: (taxa: string) => <>Lançar custa <strong>{taxa}</strong> + taxa de rede. A sua primeira compra é à parte: ela compra a sua própria moeda.</>,
    custoGratis: <>Lançar é <strong>grátis</strong> — você paga só os custos da rede Solana (~0,015 SOL pra criar as contas da moeda). A sua primeira compra é à parte: ela compra a sua própria moeda.</>,
    imagemFixa: "A imagem não pode ser trocada depois que a moeda for criada.",
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
    ganhoPump: (p: number) => `Você recebe ${100 - p}% da taxa de criador de cada operação da sua moeda, e a Chroma fica com ${p}%. Você aprova uma única transação: a criação da moeda junto com a sua compra inicial — assim você compra antes de todo mundo.`,
    ganhoTexto: (base: string, topo: string) => `Você recebe ${base} de cada operação da sua moeda, subindo até ${topo} conforme ela ganha volume — pago na mesma transação, sem cobrar nada a mais de quem compra.`,
    ganhoEvm: "Você recebe 0,70% de cada negociação da sua moeda. Você aprova uma única transação: a criação da moeda junto com a sua compra inicial — assim você compra antes de todo mundo.",
    taxaCriadorTitulo: "Taxa do criador (opcional)", taxaCriadorNota: (total: string) => `Taxa extra em cada negociação, paga toda para você (de 0 a 10%). Com o valor escolhido, quem negocia paga ${total}% no total.`,
    verFaixas: "ver as faixas",
    totalNaCarteira: (total: string) => <>Saldo necessário: <strong>{total} SOL</strong>. Inclui a criação das contas da moeda na Solana (~0,015 SOL), a sua compra inicial e a taxa de rede. O lançamento em si é grátis.</>,
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
    custo: (taxa: string) => <>发币费用 <strong>{taxa}</strong> + 网络费。你的首次买入是单独的：它买入你自己的代币。</>,
    custoGratis: <>发币<strong>免费</strong>——你只需支付 Solana 网络成本（创建代币账户约 0.015 SOL）。你的首次买入是单独的：它买入你自己的代币。</>,
    imagemFixa: "代币创建后，图片无法更改。",
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
    ganhoPump: (p: number) => `你获得代币每笔交易 ${100 - p}% 的创作者费用，Chroma 保留 ${p}%。你只需确认一笔交易：创建代币并同时完成首次买入——让你比任何人都先买入。`,
    ganhoTexto: (base: string, topo: string) => `你的代币每笔交易你都能获得 ${base}，随交易量增长最高到 ${topo} —— 在同一笔交易中支付，买家无需额外付费。`,
    ganhoEvm: "你的代币每笔交易你都能获得 0.70%。你只需确认一笔交易：创建代币并同时完成首次买入——让你比任何人都先买入。",
    taxaCriadorTitulo: "创作者税（可选）", taxaCriadorNota: (total: string) => `每笔交易的额外费用，全部归你（0–10%）。按你选择的数值，交易者总共支付 ${total}%。`,
    verFaixas: "查看档位",
    totalNaCarteira: (total: string) => <>所需余额：<strong>{total} SOL</strong>。包括在 Solana 上创建代币账户（约 0.015 SOL）、你的首次买入和网络费。发币本身免费。</>,
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
  const tt = useTextos(TEXTO_TELA);
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

  // A rede vem do seletor do topo: Solana, a não ser que a pessoa tenha escolhido outra.
  const [chain, setChain] = useState<ChainId>("solana");

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

  // Pra quem vão as recompensas de criador (taxa de criador de cada operação).
  const [recompensas, setRecompensas] = useState<"criador" | "detentores">("criador");
  // Padrão: a Clássica (pump.fun), 19/10/2026 — ver MOSTRAR_CURVA_CLASSICA.
  const [curva, setCurva] = useState<"pump" | "chroma">("pump");
  // A Meteora é só da equipe: aparece com /create?meteora=1.
  const [mostrarMeteora, setMostrarMeteora] = useState(false);
  // Dentro de "Lançar pela Meteora": anti-sniper de 10% ou de 25% (31/10/2026).
  const [variante, setVariante] = useState<VarianteDaCurva>("10");
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

  /*
   * Clonar (18/10/2026): veio do botão "Clonar" da página de uma moeda —
   * preenche nome, símbolo, descrição, links e imagem com os dados dela.
   */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("clonar") !== "1") return;
    const c = lerParaClonar();
    if (!c) return;
    setForm((f) => ({ ...f, name: c.name, symbol: c.symbol, description: c.description, website: c.website, twitter: c.twitter, telegram: c.telegram }));
    let cancelado = false;
    void imagemParaClonar(c.address, c.symbol).then((img) => {
      if (img && !cancelado) setMedia(img);
    });
    return () => {
      cancelado = true;
    };
  }, []);

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

  useEffect(() => {
    const busca = new URLSearchParams(window.location.search);
    setMostrarMeteora(busca.get("meteora") === "1");
    const daUrl = busca.get("chain") as ChainId | null;
    const inicial = daUrl && CHAIN_IDS.includes(daUrl) ? daUrl : lerRedeEscolhida();
    setChain(inicial);
    setPair(DEFAULT_PAIR[inicial]);
    const mudou = (e: Event) => selectChain((e as CustomEvent<ChainId>).detail);
    window.addEventListener(EVENTO_DA_REDE, mudou);
    return () => window.removeEventListener(EVENTO_DA_REDE, mudou);
  }, []);

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const ready =
    account.isSignedIn &&
    form.name.trim().length >= 2 &&
    form.symbol.trim().length >= 2 &&
    Boolean(media);

  async function lancarAgora() {
    if (!media) return;

    const resultado = await lancamento.lancar({
      nome: form.name.trim(),
      simbolo: form.symbol.trim(),
      descricao: form.description.trim() || undefined,
      site: form.website.trim() || undefined,
      twitter: form.twitter.trim() || undefined,
      telegram: form.telegram.trim() || undefined,
      arte: media.file,
      banner: null,
      compraInicial: form.initialBuy.trim() || undefined,
      recompensas: chain === "solana" && curva === "pump" ? recompensas : "criador",
      curva: chain === "solana" ? curva : undefined,
      variante: chain === "solana" && curva === "chroma" && VARIANTES_DISPONIVEIS.includes(variante) ? variante : "10",
      taxaDoCriador: chain === "robinhood" ? taxaDoCriadorNum : 0,
      par: chain === "solana" && pair === "USDC" ? "USDC" : "SOL",
    });

    // Vai direto para a página da moeda. Se faltou a compra inicial, o criador
    // conclui lá com um clique (ConcluirLancamento).
    if (!resultado) return;
    if ("avisoDeCompra" in resultado && resultado.avisoDeCompra) {
      router.push(`/token/${resultado.moeda}`);
      return;
    }
    router.push(`/token/${"mint" in resultado ? resultado.mint : resultado.moeda}`);
  }

  const naCurvaDaChroma = chain === "solana" && curva === "chroma" && CURVA_CHROMA_DISPONIVEL;
  const paraDetentores = chain === "solana" && !naCurvaDaChroma && recompensas === "detentores";
  let numero = 1;

  return (
    <div className="mx-auto max-w-[1120px] pt-2">
      <h1 className="text-[32px] font-bold tracking-tight text-zinc-50">{tt.titulo}</h1>
      <p className="mt-1 text-[15px] text-zinc-400">{tt.subtitulo}</p>

      {!podeLancarNaRede(chain) && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warn/30 bg-warn/[0.07] p-3">
          <p className="text-[13px] leading-relaxed text-warn">{t.naoLanca(meta.label, CHAINS[REDE_PADRAO].label)}</p>
          <Button variant="outline" size="sm" onClick={() => selectChain(REDE_PADRAO)}>
            {t.trocarPara(CHAINS[REDE_PADRAO].label)}
          </Button>
        </div>
      )}

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Passo numero={numero++} titulo={tt.passoMoeda} resumo={tt.passoMoedaSub}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t.simbolo}
                placeholder={t.simboloEx}
                value={form.symbol}
                maxLength={10}
                onChange={(v) => set("symbol", cortarEmBytes(v.toUpperCase(), 10))}
              />
              <Field label={t.nome} placeholder={t.nomeEx} value={form.name} onChange={(v) => set("name", cortarEmBytes(v, 32))} />
            </div>
            <MediaDropzone spec={COIN_MEDIA} value={media} onChange={setMedia} title={t.selecione} subtitle={t.arraste} />
            <Field label={t.descricao} placeholder={t.descricaoEx} value={form.description} multiline onChange={(v) => set("description", v)} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t.site} placeholder="https://" value={form.website} onChange={(v) => set("website", v)} />
              <Field label="X" placeholder="https://x.com/..." value={form.twitter} onChange={(v) => set("twitter", v)} />
              <Field label="Telegram" placeholder="https://t.me/..." value={form.telegram} onChange={(v) => set("telegram", v)} />
            </div>
          </Passo>

          {chain === "solana" && CURVA_CHROMA_DISPONIVEL && mostrarMeteora && (
            <Passo numero={numero++} titulo={tt.passoCurva} resumo={tt.passoCurvaSub}>
              <div className={cn("grid gap-2", MOSTRAR_CURVA_CLASSICA ? "grid-cols-2" : "grid-cols-1")}>
                {(MOSTRAR_CURVA_CLASSICA ? (["pump", "chroma"] as const) : (["chroma"] as const)).map((op) => (
                  <Opcao key={op} ativa={curva === op} onClick={() => setCurva(op)}>
                    {op === "pump" ? tc.classica : tc.chroma}
                  </Opcao>
                ))}
              </div>
              {curva === "chroma" && VARIANTES_DISPONIVEIS.length > 1 && (
                <div className="grid grid-cols-2 gap-2">
                  {VARIANTES_DISPONIVEIS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVariante(v)}
                      className={cn(
                        "rounded-xl border py-2 text-[13px] font-semibold transition-colors",
                        variante === v ? "border-marca/50 bg-marca/[0.08] text-marca" : "border-white/[0.08] text-zinc-400 hover:text-zinc-100",
                      )}
                    >
                      {tc.variante(v)}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[13px] leading-relaxed text-zinc-400">{curva === "pump" ? tc.notaClassica : tc.notaChroma(variante)}</p>
            </Passo>
          )}

          <Passo numero={numero++} titulo={t.par} resumo={t.parSub}>
            <SeletorDePar chain={chain} pares={pairs} valor={pair} onChange={setPair} />
          </Passo>

          <Passo numero={numero++} titulo={tt.passoTaxas} resumo={tt.passoTaxasSub}>
            {!naCurvaDaChroma && chain === "solana" && (
              <div className="grid grid-cols-2 gap-2">
                {(["criador", "detentores"] as const).map((op) => (
                  <Opcao key={op} ativa={recompensas === op} onClick={() => setRecompensas(op)}>
                    {op === "criador" ? tt.voce : tt.detentores}
                  </Opcao>
                ))}
              </div>
            )}
            <p className="text-[13px] leading-relaxed text-zinc-400">
              {chain !== "solana" ? t.ganhoEvm : naCurvaDaChroma ? tc.ganho : recompensas === "detentores" ? t.ganhoDetentores : t.ganhoPump(PARTE_DA_CHROMA_BPS / 100)}
            </p>
            {chain === "robinhood" && (
              <div className="space-y-1.5">
                <label className="block text-[13px] font-medium text-zinc-300">{t.taxaCriadorTitulo}</label>
                <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 focus-within:border-marca/50">
                  <input
                    inputMode="decimal"
                    value={taxaDoCriador}
                    onChange={(e) => setTaxaDoCriador(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 5))}
                    placeholder="0"
                    className="tnum min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-zinc-100 outline-none placeholder:text-zinc-600"
                  />
                  <span className="text-[13px] font-semibold text-zinc-500">%</span>
                </div>
                <p className="text-[12px] leading-relaxed text-zinc-500">
                  {t.taxaCriadorNota((1 + taxaDoCriadorNum).toLocaleString(undefined, { maximumFractionDigits: 2 }))}
                </p>
              </div>
            )}
          </Passo>

          <Passo numero={numero++} titulo={tt.passoCompra} resumo={tt.passoCompraSub}>
            <Field
              label={t.quanto(meta.nativeSymbol)}
              placeholder="0.5"
              value={form.initialBuy}
              onChange={(v) => set("initialBuy", v.replace(/[^0-9.]/g, ""))}
            />
            {compraInicial > 0 && (
              <p className="tnum text-[13px] text-zinc-400">{compraEmDolar !== null ? <>≈ {formatUsd(compraEmDolar)}</> : t.semDolar}</p>
            )}
            {chain === "solana" && curva === "chroma" && (
              <p className="rounded-xl border border-marca/25 bg-marca/[0.06] px-3 py-2 text-[13px] leading-relaxed text-zinc-300">
                {t.totalNaCarteira((0.016 + (compraInicial > 0 ? compraInicial : 0)).toFixed(3))}
              </p>
            )}
            <p className="text-[12px] leading-relaxed text-zinc-500">{t.naoCustodia}</p>
          </Passo>
        </div>

        <aside className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#0d1c33] to-[#0a1220] p-5 lg:sticky lg:top-20">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-zinc-400">{tt.revisao}</p>
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/[0.08] p-3">
            <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-white/5 text-[18px] font-bold text-marca">
              {media?.kind === "image" ? <img src={media.previewUrl} alt="" className="size-full object-cover" /> : "?"}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[17px] font-bold text-zinc-50">${form.symbol.trim() || "TICKER"}</p>
              <p className="truncate text-[14px] text-zinc-400">{form.name.trim() || tt.suaMoeda}</p>
            </div>
          </div>

          <dl className="mt-3 space-y-2.5 text-[14px]">
            <Linha nome={tt.rede}>
              <span className="flex items-center gap-1.5">
                <img src={chainIcon(chain)} alt="" width={16} height={16} className="size-4 rounded-full" />
                {meta.label}
              </span>
            </Linha>
            {chain === "solana" && <Linha nome={tt.curva}>{curva === "pump" ? tc.classica : tc.chroma}</Linha>}
            {naCurvaDaChroma && <Linha nome={tt.antiSniper}>{tc.variante(variante)}</Linha>}
            <Linha nome={tt.taxasPara}>{paraDetentores ? tt.detentores : chain === "solana" && !naCurvaDaChroma ? `${tt.voce} ${100 - PARTE_DA_CHROMA_BPS / 100}%` : tt.voce}</Linha>
            <Linha nome={tt.primeiraCompra}>{compraInicial > 0 ? `${compraInicial} ${meta.nativeSymbol}` : "—"}</Linha>
            <Linha nome={tt.custo}>
              <span className={launchFee > 0 ? undefined : "text-bull"}>{launchFee > 0 ? `${launchFee} ${meta.nativeSymbol}` : tt.gratis}</span>
            </Linha>
          </dl>

          {criadaSemCompra && (
            <div className="mt-3 rounded-xl border border-warn/30 bg-warn/[0.07] px-3 py-2 text-[12px] leading-relaxed text-warn">
              {criadaSemCompra.aviso}{" "}
              <Link href={`/token/${criadaSemCompra.moeda}`} className="font-bold underline">
                {t.abrirMoeda}
              </Link>
            </div>
          )}
          {lancamento.erro && (
            <div className="mt-3 rounded-xl border border-bear/30 bg-bear/[0.07] px-3 py-2 text-[12px] leading-relaxed text-bear">{lancamento.erro}</div>
          )}

          <div className="mt-4">
            <RequireChainWallet chain={chain}>
              <Button
                variant="chroma"
                size="lg"
                className="w-full"
                disabled={!ready || lancamento.ocupado || !redeDisponivel || !lancamento.carteiraConectada}
                onClick={lancarAgora}
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
          </div>

          <p className="mt-3 text-center text-[12px] leading-relaxed text-zinc-500">
            {launchFee > 0 ? t.taxaLancamento(launchFee, meta.nativeSymbol, meta.label) : t.semTaxa(meta.label)}{" "}
            <Link href="/fees" className="text-marca hover:underline">
              {t.verTaxas}
            </Link>
          </p>
        </aside>
      </div>
    </div>
  );
}

function Passo({ numero, titulo, resumo, children }: { numero: number; titulo: string; resumo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#0d1c33] to-[#0a1220] p-5">
      <div className="flex gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full border border-white/20 text-[13px] text-zinc-300">{numero}</span>
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold text-zinc-50">{titulo}</h2>
          <p className="text-[13px] text-zinc-400">{resumo}</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Opcao({ ativa, onClick, children }: { ativa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl py-3 text-[14px] font-bold transition-colors",
        ativa ? "bg-marca text-black" : "border border-white/[0.08] bg-black/30 text-zinc-300 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

function Linha({ nome, children }: { nome: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-zinc-400">{nome}</dt>
      <dd className="min-w-0 truncate font-semibold text-zinc-100">{children}</dd>
    </div>
  );
}

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
    "w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-[15px] text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-marca/50";

  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-zinc-300">{label}</span>
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

