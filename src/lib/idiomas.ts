/**
 * Os idiomas da Chroma, e o dicionário do que está traduzido.
 *
 * ---------------------------------------------------------------------------
 * TRÊS IDIOMAS, E O SITE INTEIRO EM CADA UM (28/09/2026)
 * ---------------------------------------------------------------------------
 * Eram oito, mas só a moldura (menu, rodapé, abertura) era traduzida: quem
 * escolhia türkçe via o resto em português. O dono decidiu: inglês como
 * padrão, português e chinês — e cada tela traduzida por completo.
 *
 * Os textos de cada tela moram no próprio componente, via `useTextos`
 * (cliente) ou `dicionario[idioma]` (servidor), com as três versões lado a
 * lado. Este arquivo guarda os da moldura.
 *
 * Para adicionar um idioma: acrescente a chave em `IDIOMAS` e uma entrada em
 * `DICIONARIO`. Nada mais no site precisa mudar.
 */

export const IDIOMAS = [
  { chave: "en", rotulo: "English", curto: "EN" },
  { chave: "pt", rotulo: "Português", curto: "PT" },
  { chave: "zh", rotulo: "中文", curto: "中文" },
] as const;

export type Idioma = (typeof IDIOMAS)[number]["chave"];

export const IDIOMA_PADRAO: Idioma = "en";

/** A chave do `localStorage`. Exportada pra o script anti-piscada do layout. */
export const CHAVE_DO_IDIOMA = "chroma:idioma";

export function ehIdioma(valor: string | null | undefined): valor is Idioma {
  return !!valor && IDIOMAS.some((i) => i.chave === valor);
}

/* ------------------------------------------------------------------ */
/* Dicionário                                                          */
/* ------------------------------------------------------------------ */

/**
 * As chaves são nomes do que a frase SIGNIFICA, não o texto em português.
 *
 * `navCriar` e não `criarToken`: quando o texto mudar de "Criar token" pra
 * "Lançar moeda", a chave continua a mesma e nenhuma tradução quebra.
 */
export interface Textos {
  navExplorar: string;
  navCriar: string;
  navAirdrop: string;
  navAfiliados: string;
  navTaxas: string;

  conectar: string;
  procurar: string;
  todasAsRedes: string;
  carteiraConectada: string;
  semCarteira: string;
  idioma: string;

  heroLinha: string;
  heroBotaoCriar: string;
  heroBotaoPontos: string;
  medidaTokens: string;
  medidaVolume: string;
  medidaRedes: string;

  rodapeAviso: string;
  rodapeTermos: string;
  rodapePrivacidade: string;
  rodapeTaxas: string;
  rodapeContato: string;
  rodapeAirdrop: string;
}

const en: Textos = {
  navExplorar: "Explore",
  navCriar: "Create token",
  navAirdrop: "Airdrop",
  navAfiliados: "Affiliates",
  navTaxas: "Fees",

  conectar: "Connect wallet",
  procurar: "Search",
  todasAsRedes: "All networks",
  carteiraConectada: "wallet connected",
  semCarteira: "no wallet",
  idioma: "Language",

  heroLinha:
    "Launch, trade and earn by referring — live charts, contract audit and commission paid in the same transaction.",
  heroBotaoCriar: "Create token",
  heroBotaoPontos: "Earn points",
  medidaTokens: "Tokens",
  medidaVolume: "24h volume",
  medidaRedes: "Networks",

  rodapeAviso:
    "Trading crypto carries risk of total loss. Coins listed here are created by users and are neither audited nor endorsed by Chroma. Nothing on this site is investment advice. Never share your recovery phrase.",
  rodapeTermos: "Terms of Use",
  rodapePrivacidade: "Privacy",
  rodapeTaxas: "Fees",
  rodapeContato: "Contact",
  rodapeAirdrop: "Airdrop",
};

const pt: Textos = {
  navExplorar: "Explorar",
  navCriar: "Criar token",
  navAirdrop: "Airdrop",
  navAfiliados: "Afiliados",
  navTaxas: "Taxas",

  conectar: "Conectar carteira",
  procurar: "Procurar",
  todasAsRedes: "Todas as redes",
  carteiraConectada: "carteira conectada",
  semCarteira: "sem carteira",
  idioma: "Idioma",

  heroLinha:
    "Lance, negocie e ganhe indicando — gráfico ao vivo, auditoria de contrato e comissão paga na mesma transação.",
  heroBotaoCriar: "Criar token",
  heroBotaoPontos: "Ganhar pontos",
  medidaTokens: "Tokens",
  medidaVolume: "Volume 24h",
  medidaRedes: "Redes",

  rodapeAviso:
    "Negociar criptomoedas envolve risco de perda total. Moedas exibidas aqui são criadas por usuários e não são auditadas nem endossadas pela Chroma. Nada neste site é recomendação de investimento. Nunca compartilhe sua frase de recuperação.",
  rodapeTermos: "Termos de Uso",
  rodapePrivacidade: "Privacidade",
  rodapeTaxas: "Taxas",
  rodapeContato: "Contato",
  rodapeAirdrop: "Airdrop",
};

const zh: Textos = {
  navExplorar: "探索",
  navCriar: "创建代币",
  navAirdrop: "空投",
  navAfiliados: "推广伙伴",
  navTaxas: "费用",

  conectar: "连接钱包",
  procurar: "搜索",
  todasAsRedes: "全部网络",
  carteiraConectada: "钱包已连接",
  semCarteira: "未连接钱包",
  idioma: "语言",

  heroLinha:
    "发行、交易并通过推荐赚取收益 — 实时图表、合约审计，佣金在同一笔交易中支付。",
  heroBotaoCriar: "创建代币",
  heroBotaoPontos: "赚取积分",
  medidaTokens: "代币",
  medidaVolume: "24小时交易量",
  medidaRedes: "网络",

  rodapeAviso:
    "加密货币交易存在全额亏损风险。此处展示的代币由用户创建，未经 Chroma 审计或背书。本站内容均不构成投资建议。切勿泄露您的助记词。",
  rodapeTermos: "使用条款",
  rodapePrivacidade: "隐私政策",
  rodapeTaxas: "费用",
  rodapeContato: "联系我们",
  rodapeAirdrop: "空投",
};

export const DICIONARIO: Record<Idioma, Textos> = { en, pt, zh };

/**
 * Declara os textos de uma tela nos três idiomas.
 *
 * O inglês define o formato; português e chinês TÊM que ter as mesmas chaves
 * — faltou uma, o TypeScript não compila. É a garantia de que nenhuma tela
 * volta a aparecer meio traduzida.
 */
export function traducoes<T>(d: { en: T; pt: NoInfer<T>; zh: NoInfer<T> }): Record<Idioma, T> {
  return d;
}

export function textos(idioma: Idioma): Textos {
  return DICIONARIO[idioma] ?? DICIONARIO[IDIOMA_PADRAO];
}
