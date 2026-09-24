/**
 * Os idiomas da Chroma, e o dicionário do que está traduzido.
 *
 * ---------------------------------------------------------------------------
 * COMO A LISTA FOI ESCOLHIDA
 * ---------------------------------------------------------------------------
 * Não é "os idiomas mais falados do mundo" — seria hindi, bengali e árabe no
 * topo, e nenhum deles é onde se negocia meme coin. A lista cruza adoção de
 * cripto (índice Chainalysis 2025) com onde o volume de token novo de fato
 * acontece:
 *
 *   - inglês     — a língua franca de cripto; ninguém opera sem ela
 *   - 中文        — BSC e lançamento de meme coin; é literalmente o público
 *                  do site que serviu de referência pra esta tela
 *   - português  — Brasil é 5º em adoção global, e é o nosso mercado de casa
 *   - español    — América Latina inteira
 *   - türkçe     — Turquia aparece no topo em adoção por habitante, ano após
 *                  ano, puxada por inflação
 *   - русский    — comunidade enorme e muito ativa em token novo
 *   - tiếng việt — Vietnã tem a MAIOR taxa de posse do mundo (~31%)
 *   - 한국어       — Coreia move volume desproporcional em altcoin
 *
 * Índia é 1º no índice, e mesmo assim não tem hindi aqui: quem opera cripto
 * lá usa inglês na prática. Colocar hindi seria custo de tradução sem leitor.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTÁ TRADUZIDO, E O QUE NÃO ESTÁ
 * ---------------------------------------------------------------------------
 * Traduzido: a moldura do site — menu, cabeçalho, rodapé, abertura da home e
 * os rótulos do airdrop. É o que um visitante novo lê antes de decidir ficar.
 *
 * Não traduzido ainda: termos de uso, privacidade, formulários e as telas de
 * criação e afiliado. São textos longos, e texto legal mal traduzido é pior
 * que texto legal em outra língua.
 *
 * Isso é deliberado e vale entender: a maior parte da tela de uma launchpad é
 * DADO — símbolo, preço, variação, volume. Número não tem idioma. Traduzir a
 * moldura resolve a maior fatia da experiência de quem chega.
 *
 * Para adicionar um idioma: acrescente a chave em `IDIOMAS` e uma entrada em
 * `DICIONARIO`. Nada mais no site precisa mudar.
 */

export const IDIOMAS = [
  { chave: "en", rotulo: "English", curto: "EN" },
  { chave: "zh", rotulo: "中文", curto: "中文" },
  { chave: "pt", rotulo: "Português", curto: "PT" },
  { chave: "es", rotulo: "Español", curto: "ES" },
  { chave: "tr", rotulo: "Türkçe", curto: "TR" },
  { chave: "ru", rotulo: "Русский", curto: "RU" },
  { chave: "vi", rotulo: "Tiếng Việt", curto: "VI" },
  { chave: "ko", rotulo: "한국어", curto: "KO" },
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

const es: Textos = {
  navExplorar: "Explorar",
  navCriar: "Crear token",
  navAirdrop: "Airdrop",
  navAfiliados: "Afiliados",
  navTaxas: "Comisiones",

  conectar: "Conectar billetera",
  procurar: "Buscar",
  todasAsRedes: "Todas las redes",
  carteiraConectada: "billetera conectada",
  semCarteira: "sin billetera",
  idioma: "Idioma",

  heroLinha:
    "Lanza, opera y gana recomendando — gráfico en vivo, auditoría de contrato y comisión pagada en la misma transacción.",
  heroBotaoCriar: "Crear token",
  heroBotaoPontos: "Ganar puntos",
  medidaTokens: "Tokens",
  medidaVolume: "Volumen 24h",
  medidaRedes: "Redes",

  rodapeAviso:
    "Operar con criptomonedas conlleva riesgo de pérdida total. Las monedas aquí mostradas son creadas por usuarios y no están auditadas ni respaldadas por Chroma. Nada en este sitio es asesoramiento de inversión. Nunca compartas tu frase de recuperación.",
  rodapeTermos: "Términos de Uso",
  rodapePrivacidade: "Privacidad",
  rodapeTaxas: "Comisiones",
  rodapeContato: "Contacto",
  rodapeAirdrop: "Airdrop",
};

const tr: Textos = {
  navExplorar: "Keşfet",
  navCriar: "Token oluştur",
  navAirdrop: "Airdrop",
  navAfiliados: "Ortaklar",
  navTaxas: "Ücretler",

  conectar: "Cüzdan bağla",
  procurar: "Ara",
  todasAsRedes: "Tüm ağlar",
  carteiraConectada: "cüzdan bağlı",
  semCarteira: "cüzdan yok",
  idioma: "Dil",

  heroLinha:
    "Oluşturun, işlem yapın ve davet ederek kazanın — canlı grafik, sözleşme denetimi ve aynı işlemde ödenen komisyon.",
  heroBotaoCriar: "Token oluştur",
  heroBotaoPontos: "Puan kazan",
  medidaTokens: "Token",
  medidaVolume: "24s hacim",
  medidaRedes: "Ağlar",

  rodapeAviso:
    "Kripto işlemleri tamamen kayıp riski taşır. Burada listelenen coinler kullanıcılar tarafından oluşturulur; Chroma tarafından denetlenmez veya onaylanmaz. Bu sitedeki hiçbir şey yatırım tavsiyesi değildir. Kurtarma ifadenizi asla paylaşmayın.",
  rodapeTermos: "Kullanım Koşulları",
  rodapePrivacidade: "Gizlilik",
  rodapeTaxas: "Ücretler",
  rodapeContato: "İletişim",
  rodapeAirdrop: "Airdrop",
};

const ru: Textos = {
  navExplorar: "Обзор",
  navCriar: "Создать токен",
  navAirdrop: "Аирдроп",
  navAfiliados: "Партнёрам",
  navTaxas: "Комиссии",

  conectar: "Подключить кошелёк",
  procurar: "Поиск",
  todasAsRedes: "Все сети",
  carteiraConectada: "кошелёк подключён",
  semCarteira: "нет кошелька",
  idioma: "Язык",

  heroLinha:
    "Запускайте, торгуйте и зарабатывайте на рефералах — живой график, аудит контракта и комиссия в той же транзакции.",
  heroBotaoCriar: "Создать токен",
  heroBotaoPontos: "Получать баллы",
  medidaTokens: "Токены",
  medidaVolume: "Объём 24ч",
  medidaRedes: "Сети",

  rodapeAviso:
    "Торговля криптовалютой связана с риском полной потери средств. Монеты здесь создаются пользователями и не проверяются и не одобряются Chroma. Ничто на этом сайте не является инвестиционной рекомендацией. Никогда не сообщайте свою сид-фразу.",
  rodapeTermos: "Условия использования",
  rodapePrivacidade: "Конфиденциальность",
  rodapeTaxas: "Комиссии",
  rodapeContato: "Контакты",
  rodapeAirdrop: "Аирдроп",
};

const vi: Textos = {
  navExplorar: "Khám phá",
  navCriar: "Tạo token",
  navAirdrop: "Airdrop",
  navAfiliados: "Đối tác",
  navTaxas: "Phí",

  conectar: "Kết nối ví",
  procurar: "Tìm kiếm",
  todasAsRedes: "Tất cả mạng",
  carteiraConectada: "ví đã kết nối",
  semCarteira: "chưa có ví",
  idioma: "Ngôn ngữ",

  heroLinha:
    "Phát hành, giao dịch và kiếm tiền bằng giới thiệu — biểu đồ trực tiếp, kiểm toán hợp đồng và hoa hồng trả ngay trong cùng giao dịch.",
  heroBotaoCriar: "Tạo token",
  heroBotaoPontos: "Kiếm điểm",
  medidaTokens: "Token",
  medidaVolume: "KL 24h",
  medidaRedes: "Mạng",

  rodapeAviso:
    "Giao dịch tiền mã hoá có rủi ro mất toàn bộ vốn. Các đồng coin hiển thị ở đây do người dùng tạo ra, không được Chroma kiểm toán hay bảo chứng. Không nội dung nào trên trang này là lời khuyên đầu tư. Tuyệt đối không chia sẻ cụm từ khôi phục của bạn.",
  rodapeTermos: "Điều khoản sử dụng",
  rodapePrivacidade: "Quyền riêng tư",
  rodapeTaxas: "Phí",
  rodapeContato: "Liên hệ",
  rodapeAirdrop: "Airdrop",
};

const ko: Textos = {
  navExplorar: "탐색",
  navCriar: "토큰 생성",
  navAirdrop: "에어드랍",
  navAfiliados: "제휴",
  navTaxas: "수수료",

  conectar: "지갑 연결",
  procurar: "검색",
  todasAsRedes: "전체 네트워크",
  carteiraConectada: "지갑 연결됨",
  semCarteira: "지갑 없음",
  idioma: "언어",

  heroLinha:
    "발행하고, 거래하고, 추천으로 수익을 얻으세요 — 실시간 차트, 컨트랙트 감사, 같은 트랜잭션에서 지급되는 수수료.",
  heroBotaoCriar: "토큰 생성",
  heroBotaoPontos: "포인트 적립",
  medidaTokens: "토큰",
  medidaVolume: "24시간 거래량",
  medidaRedes: "네트워크",

  rodapeAviso:
    "암호화폐 거래에는 전액 손실 위험이 있습니다. 여기에 표시된 코인은 사용자가 생성한 것으로 Chroma가 감사하거나 보증하지 않습니다. 이 사이트의 어떤 내용도 투자 조언이 아닙니다. 복구 문구는 절대 공유하지 마세요.",
  rodapeTermos: "이용약관",
  rodapePrivacidade: "개인정보",
  rodapeTaxas: "수수료",
  rodapeContato: "문의",
  rodapeAirdrop: "에어드랍",
};

export const DICIONARIO: Record<Idioma, Textos> = { en, zh, pt, es, tr, ru, vi, ko };

export function textos(idioma: Idioma): Textos {
  return DICIONARIO[idioma] ?? DICIONARIO[IDIOMA_PADRAO];
}
