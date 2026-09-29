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

/* ------------------------------------------------------------------ */
/* Mensagens que chegam prontas do servidor                            */
/* ------------------------------------------------------------------ */

/**
 * As rotas da API respondem erros em português. Em vez de ensinar cada rota
 * a ler o idioma, a tela traduz a frase conhecida na hora de mostrar — e o
 * que não estiver aqui passa como veio.
 */
const DO_SERVIDOR: Record<string, { en: string; zh: string }> = {
  "Preencha nome, e-mail e mensagem.": { en: "Fill in name, email and message.", zh: "请填写姓名、邮箱和消息。" },
  "E-mail inválido.": { en: "Invalid email.", zh: "邮箱无效。" },
  "Escreva um pouco mais na mensagem.": { en: "Please write a bit more in the message.", zh: "请在消息中多写一些内容。" },
  "Endereço de carteira inválido.": { en: "Invalid wallet address.", zh: "钱包地址无效。" },
  "Você enviou muitas mensagens em pouco tempo. Tente novamente mais tarde.": { en: "You sent too many messages in a short time. Please try again later.", zh: "你在短时间内发送了太多消息，请稍后再试。" },
  "A assinatura não confere. Tente novamente.": { en: "The signature does not match. Try again.", zh: "签名不匹配，请重试。" },
  "A assinatura é inválida ou expirou. Tente novamente.": { en: "The signature is invalid or expired. Try again.", zh: "签名无效或已过期，请重试。" },
  "Apelido não encontrado.": { en: "Nickname not found.", zh: "未找到该昵称。" },
  "Escolha um apelido antes de trocar as fotos.": { en: "Choose a nickname before changing your photos.", zh: "请先选择昵称再更换照片。" },
  "Escolha um apelido antes de vincular outra carteira.": { en: "Choose a nickname before linking another wallet.", zh: "请先选择昵称再关联其他钱包。" },
  "Esta carteira ainda não tem conta na Chroma.": { en: "This wallet has no Chroma account yet.", zh: "该钱包还没有 Chroma 账户。" },
  "Esta carteira já pertence a outra conta.": { en: "This wallet already belongs to another account.", zh: "该钱包已属于其他账户。" },
  "Este apelido já está em uso.": { en: "This nickname is already taken.", zh: "该昵称已被使用。" },
  "Este apelido é reservado. Escolha outro.": { en: "This nickname is reserved. Choose another one.", zh: "该昵称为保留名称，请换一个。" },
  "Este endereço não pertence a esta rede.": { en: "This address does not belong to this network.", zh: "该地址不属于此网络。" },
  "Muitas tentativas. Aguarde um minuto e tente novamente.": { en: "Too many attempts. Wait a minute and try again.", zh: "尝试次数过多，请等待一分钟后重试。" },
  "Nenhum arquivo foi enviado.": { en: "No file was uploaded.", zh: "没有上传文件。" },
  "Não encontramos a conta para vincular.": { en: "We could not find the account to link.", zh: "找不到要关联的账户。" },
  "Não foi possível salvar a imagem.": { en: "Could not save the image.", zh: "无法保存图片。" },
  "Não foi possível salvar a sua conta.": { en: "Could not save your account.", zh: "无法保存你的账户。" },
  "Não foi possível salvar as fotos.": { en: "Could not save the photos.", zh: "无法保存照片。" },
  "Não foi possível vincular a carteira.": { en: "Could not link the wallet.", zh: "无法关联钱包。" },
  "Não foi possível concluir o registro.": { en: "Could not complete the registration.", zh: "无法完成注册。" },
  "O apelido precisa ter de 3 a 20 caracteres, usando só letras, números e _.": { en: "The nickname must be 3 to 20 characters, using only letters, numbers and _.", zh: "昵称需为 3 到 20 个字符，只能使用字母、数字和 _。" },
  "Conecte uma carteira antes.": { en: "Connect a wallet first.", zh: "请先连接钱包。" },
  "Conecte uma carteira da Robinhood Chain antes.": { en: "Connect a Robinhood Chain wallet first.", zh: "请先连接 Robinhood Chain 钱包。" },
};

export function traduzirDoServidor(mensagem: string | null | undefined, idioma: Idioma): string | null {
  if (!mensagem) return mensagem ?? null;
  if (idioma === "pt") return mensagem;
  return DO_SERVIDOR[mensagem]?.[idioma] ?? mensagem;
}
