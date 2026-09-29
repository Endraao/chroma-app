import type { Metadata } from "next";
import Link from "next/link";

import { Aviso, PaginaLegal } from "@/components/ui/PaginaLegal";
import { idiomaAtual } from "@/lib/idioma-servidor";
import { traducoes } from "@/lib/idiomas";

export const metadata: Metadata = {
  title: "Terms of Use — Chroma",
  description: "Chroma's rules of use: risks, responsibilities and conduct.",
};

/**
 * Termos de Uso.
 *
 * ---------------------------------------------------------------------------
 * ISTO NÃO É PEÇA JURÍDICA PRONTA
 * ---------------------------------------------------------------------------
 * É um ponto de partida honesto, escrito em português que dá pra entender, e
 * cobre o que de fato acontece neste site. Antes de escalar o projeto — ou de
 * assinar qualquer contrato de terceiro que exija termos específicos — isto
 * precisa passar por um advogado de verdade.
 *
 * A seção de conduta proibida existe por dois motivos ao mesmo tempo: é o que
 * a licença do gráfico do TradingView exige do licenciado (cláusula 2.7), e é
 * o que nos separa de responder pelo que um usuário publicar aqui.
 */
const TEXTOS = traducoes({
  en: {"titulo":"Terms of Use","atualizado":"Updated on September 22, 2026","resumo":"In short: Chroma is a tool, not a broker. We never have your key or your money. Any coin here can go to zero, including through a scam by whoever created it. Only use what you can afford to lose entirely."},
  pt: {"titulo":"Termos de Uso","atualizado":"Atualizado em 22 de setembro de 2026","resumo":"Em resumo: a Chroma é uma ferramenta, não uma corretora. Nós nunca temos a sua chave nem o seu dinheiro. Qualquer moeda aqui pode ir a zero, inclusive por golpe de quem a criou. Use apenas o que você pode perder por inteiro."},
  zh: {"titulo":"使用条款","atualizado":"更新于 2026 年 9 月 22 日","resumo":"简而言之：Chroma 是一个工具，而不是经纪商。我们永远不会持有你的私钥或资金。这里的任何代币都可能归零，包括因创建者诈骗而归零。只投入你能承受全部亏损的资金。"},
});

const CORPO = { en: CorpoEn, pt: CorpoPt, zh: CorpoZh };

export default async function TermosPage() {
  const idioma = await idiomaAtual();
  const t = TEXTOS[idioma];
  const Corpo = CORPO[idioma];
  return (
    <PaginaLegal titulo={t.titulo} atualizadoEm={t.atualizado} resumo={t.resumo}>
      <Corpo />
    </PaginaLegal>
  );
}

function CorpoPt() {
  return (
    <>
      <Aviso>
        <strong>Aviso de risco.</strong> Negociar criptomoedas — em especial moedas
        criadas por usuários, sem empresa, sem produto e sem histórico — pode resultar na{" "}
        <strong>perda total do valor aplicado</strong>. Não existe garantia, fundo
        garantidor, reembolso ou estorno. Uma transação enviada à rede é definitiva.
      </Aviso>

      <h2>1. O que é a Chroma</h2>
      <p>
        A Chroma é uma interface — um site — que permite visualizar dados de mercado, criar
        tokens e montar transações de troca nas redes <strong>Solana</strong> e{" "}
        <strong>Robinhood Chain</strong>. Ao usar o site, você concorda com estes Termos. Se não
        concordar, não use o site.
      </p>

      <h2>2. Não somos corretora, custodiante ou consultoria</h2>
      <p>
        A Chroma é <strong>não custodial</strong>. Isso significa, de forma concreta:
      </p>
      <ul>
        <li>Nós nunca temos a sua chave privada nem a sua frase de recuperação.</li>
        <li>Nós nunca guardamos, movemos ou bloqueamos o seu dinheiro.</li>
        <li>Toda transação é assinada pela sua carteira, por você, no seu dispositivo.</li>
        <li>Não temos como desfazer, cancelar ou reverter o que você assinou.</li>
      </ul>
      <p>
        Nada neste site é recomendação de investimento, oferta pública, consultoria financeira
        ou análise de valores mobiliários. Números, gráficos, listas de &quot;moedas em alta&quot;
        e resultados de auditoria automática são <strong>informação, não conselho</strong>.
      </p>

      <Aviso tom="neutro">
        <strong>Ninguém da Chroma vai pedir a sua frase de recuperação ou chave privada.</strong>{" "}
        Nunca. Em nenhum canal, por nenhum motivo, nem para &quot;recuperar&quot; nem para
        &quot;validar&quot; nada. Qualquer pessoa que peça isso está tentando roubar você —
        mesmo que use o nosso nome, o nosso logo ou o nosso endereço.
      </Aviso>

      <h2>3. Moedas são criadas por usuários</h2>
      <p>
        Qualquer pessoa pode lançar um token na Chroma, e a maior parte das moedas exibidas aqui
        vem de fontes públicas das redes. Nós <strong>não criamos, não auditamos manualmente,
        não endossamos e não garantimos</strong> nenhuma delas.
      </p>
      <p>
        A presença de uma moeda no site — inclusive em listas de destaque, ordenadas por volume
        ou por variação — <strong>não é aprovação</strong>. É apenas o reflexo do que está
        acontecendo na rede.
      </p>
      <p>
        Se você encontrar conteúdo abusivo, criminoso ou fraudulento, use o botão de denúncia na
        página da moeda ou fale com a gente em <Link href="/contato">Contato</Link>.
      </p>

      <h2>4. Conduta proibida</h2>
      <p>Ao usar a Chroma, você concorda em não:</p>
      <ul>
        <li>
          Usar o site, seus dados, seus gráficos ou seu conteúdo <strong>para fins comerciais</strong>{" "}
          sem obter antes a licença necessária dos respectivos titulares.
        </li>
        <li>
          Usar o site de qualquer forma que viole lei ou regulamento aplicável, local ou
          internacional.
        </li>
        <li>
          Publicar, lançar ou transmitir conteúdo discriminatório, de ódio, difamatório,
          assediante, ameaçador, sexual, obsceno, fraudulento ou que viole direitos de terceiros —
          inclusive no nome, no símbolo, na descrição ou na imagem de um token.
        </li>
        <li>
          Se passar por outra pessoa, marca, projeto ou empresa, ou sugerir vínculo, patrocínio ou
          endosso que não exista.
        </li>
        <li>
          Manipular mercado, operar de forma coordenada para enganar terceiros, ou usar a
          plataforma para aplicar golpes.
        </li>
        <li>
          Raspar, copiar em massa, espelhar ou revender os dados e o conteúdo do site; fazer
          engenharia reversa; contornar medidas de segurança; ou sobrecarregar a infraestrutura.
        </li>
        <li>Enviar código malicioso ou interferir no funcionamento do site.</li>
      </ul>

      <h2>5. Moderação e remoção</h2>
      <p>
        Podemos, a nosso critério e sem aviso prévio, <strong>ocultar ou remover do site</strong>{" "}
        qualquer moeda, imagem, texto ou conta que viole estes Termos ou que exponha terceiros a
        risco.
      </p>
      <p>
        Uma ressalva importante e honesta: remover algo <strong>do nosso site</strong> não apaga
        nada <strong>da blockchain</strong>. O token continua existindo na rede e pode continuar
        sendo negociado em outros lugares. Nosso alcance é a vitrine, não o registro público.
      </p>

      <h2>6. Taxas</h2>
      <p>
        A Chroma cobra uma taxa sobre as operações realizadas pela interface, informada na tela
        antes de você assinar a transação e detalhada em <Link href="/fees">Taxas</Link>.
      </p>
      <p>
        Além dela existem custos que <strong>não são nossos e não recebemos</strong>: a taxa da
        rede, a taxa do protocolo de liquidez e o deslizamento de preço. Em valores pequenos
        esses custos fixos pesam muito — uma operação de poucos dólares pode perder uma fração
        significativa só em custo de rede.
      </p>

      <h2>7. Dados de mercado</h2>
      <p>
        Preços, gráficos, volumes, liquidez, número de portadores e resultados de auditoria vêm
        de <strong>fontes externas e da própria rede</strong>, e são fornecidos &quot;como
        estão&quot;. Podem atrasar, divergir entre si, conter erro ou ficar indisponíveis.
      </p>
      <p>
        Nós nos esforçamos para que estejam corretos, mas <strong>não garantimos exatidão</strong>{" "}
        e não respondemos por decisão tomada com base neles. Confira sempre na rede antes de
        operar valores relevantes.
      </p>

      <h2>8. Disponibilidade</h2>
      <p>
        O site é oferecido &quot;como está&quot; e &quot;conforme disponível&quot;. Podemos
        alterar, suspender ou encerrar qualquer parte dele a qualquer momento. Dependemos de
        serviços de terceiros — provedores de RPC, fontes de dados, hospedagem — e a queda de
        qualquer um deles pode derrubar funções do site.
      </p>

      <h2>9. Propriedade intelectual</h2>
      <p>
        A marca Chroma, o código e o desenho do site são nossos. Conteúdo de terceiros exibido
        aqui — dados de mercado, bibliotecas de gráfico, logotipos de moedas — pertence aos
        respectivos titulares e é usado conforme as licenças aplicáveis.
      </p>

      <h2>10. Limitação de responsabilidade</h2>
      <p>
        Na máxima extensão permitida pela lei, a Chroma não responde por perdas de qualquer
        natureza decorrentes de: variação de preço; golpe, fraude ou abandono praticado por
        criadores de tokens; falha, atraso ou erro de dados de terceiros; indisponibilidade de
        rede ou de provedor; comprometimento da sua carteira ou do seu dispositivo; ou decisões
        de investimento tomadas por você.
      </p>

      <h2>11. Quem pode usar</h2>
      <p>
        Você declara ter <strong>pelo menos 18 anos</strong>, capacidade civil, e não estar
        sujeito a sanções internacionais nem residir em jurisdição onde o uso deste serviço seja
        proibido. É sua responsabilidade verificar a legalidade do uso no seu país, inclusive
        quanto a obrigações tributárias.
      </p>

      <h2>12. Alterações</h2>
      <p>
        Estes Termos podem mudar. A data de atualização no topo indica a versão vigente, e o uso
        continuado do site após a mudança significa concordância com a nova versão.
      </p>

      <h2>13. Lei aplicável</h2>
      <p>
        Estes Termos são regidos pelas leis da <strong>República Federativa do Brasil</strong>.
        Fica eleito o foro do domicílio do usuário consumidor para dirimir controvérsias, na
        forma da lei.
      </p>

      <h2>14. Contato</h2>
      <p>
        Dúvida, problema, denúncia ou assunto jurídico: use a página de{" "}
        <Link href="/contato">Contato</Link>. Também tratamos ali os pedidos relacionados à{" "}
        <Link href="/privacidade">Política de Privacidade</Link>.
      </p>
    </>
  );
}

function CorpoEn() {
  return (
    <>
      <Aviso>
        <strong>Risk warning.</strong> Trading crypto — especially coins created by users, with
        no company, no product and no track record — can result in the{" "}
        <strong>total loss of the amount invested</strong>. There is no guarantee, no guarantee
        fund, no refund and no chargeback. A transaction sent to the network is final.
      </Aviso>

      <h2>1. What Chroma is</h2>
      <p>
        Chroma is an interface — a website — that lets you view market data, create tokens and
        build swap transactions on the <strong>Solana</strong> and{" "}
        <strong>Robinhood Chain</strong> networks. By using the site you agree to these Terms. If
        you do not agree, do not use the site.
      </p>

      <h2>2. We are not a broker, custodian or advisor</h2>
      <p>
        Chroma is <strong>non-custodial</strong>. In concrete terms, this means:
      </p>
      <ul>
        <li>We never have your private key or your recovery phrase.</li>
        <li>We never hold, move or freeze your money.</li>
        <li>Every transaction is signed by your wallet, by you, on your device.</li>
        <li>We have no way to undo, cancel or reverse what you signed.</li>
      </ul>
      <p>
        Nothing on this site is an investment recommendation, public offering, financial advice
        or securities analysis. Numbers, charts, &quot;trending coins&quot; lists and automated
        audit results are <strong>information, not advice</strong>.
      </p>

      <Aviso tom="neutro">
        <strong>Nobody from Chroma will ever ask for your recovery phrase or private key.</strong>{" "}
        Ever. On no channel, for no reason, not to &quot;recover&quot; and not to
        &quot;validate&quot; anything. Anyone who asks is trying to rob you — even if they use
        our name, our logo or our address.
      </Aviso>

      <h2>3. Coins are created by users</h2>
      <p>
        Anyone can launch a token on Chroma, and most coins shown here come from public network
        sources. We <strong>do not create, manually audit, endorse or guarantee</strong> any of
        them.
      </p>
      <p>
        A coin appearing on the site — including in featured lists sorted by volume or price
        change — <strong>is not an approval</strong>. It only reflects what is happening on the
        network.
      </p>
      <p>
        If you find abusive, criminal or fraudulent content, use the report button on the
        coin&apos;s page or reach us through <Link href="/contato">Contact</Link>.
      </p>

      <h2>4. Prohibited conduct</h2>
      <p>By using Chroma, you agree not to:</p>
      <ul>
        <li>
          Use the site, its data, its charts or its content <strong>for commercial purposes</strong>{" "}
          without first obtaining the required license from the respective owners.
        </li>
        <li>Use the site in any way that violates applicable local or international law or regulation.</li>
        <li>
          Publish, launch or transmit content that is discriminatory, hateful, defamatory,
          harassing, threatening, sexual, obscene, fraudulent or that infringes third-party
          rights — including in a token&apos;s name, symbol, description or image.
        </li>
        <li>
          Impersonate another person, brand, project or company, or suggest an affiliation,
          sponsorship or endorsement that does not exist.
        </li>
        <li>
          Manipulate the market, trade in a coordinated way to deceive others, or use the
          platform to run scams.
        </li>
        <li>
          Scrape, bulk-copy, mirror or resell the site&apos;s data and content; reverse
          engineer it; bypass security measures; or overload the infrastructure.
        </li>
        <li>Send malicious code or interfere with the site&apos;s operation.</li>
      </ul>

      <h2>5. Moderation and removal</h2>
      <p>
        We may, at our discretion and without prior notice, <strong>hide or remove from the site</strong>{" "}
        any coin, image, text or account that violates these Terms or exposes others to risk.
      </p>
      <p>
        An important and honest caveat: removing something <strong>from our site</strong> does
        not delete anything <strong>from the blockchain</strong>. The token keeps existing on the
        network and may keep trading elsewhere. Our reach is the storefront, not the public
        record.
      </p>

      <h2>6. Fees</h2>
      <p>
        Chroma charges a fee on trades made through the interface, shown on screen before you
        sign the transaction and detailed in <Link href="/fees">Fees</Link>.
      </p>
      <p>
        On top of it there are costs that <strong>are not ours and that we do not receive</strong>:
        the network fee, the liquidity protocol fee and price slippage. On small amounts these
        fixed costs weigh a lot — a trade of a few dollars can lose a significant fraction in
        network costs alone.
      </p>

      <h2>7. Market data</h2>
      <p>
        Prices, charts, volumes, liquidity, holder counts and audit results come from{" "}
        <strong>external sources and the network itself</strong>, and are provided &quot;as
        is&quot;. They may be delayed, disagree with each other, contain errors or be
        unavailable.
      </p>
      <p>
        We work to keep them correct, but <strong>we do not guarantee accuracy</strong> and are
        not responsible for decisions made based on them. Always check on-chain before trading
        significant amounts.
      </p>

      <h2>8. Availability</h2>
      <p>
        The site is provided &quot;as is&quot; and &quot;as available&quot;. We may change,
        suspend or shut down any part of it at any time. We depend on third-party services — RPC
        providers, data sources, hosting — and an outage of any of them may take down site
        features.
      </p>

      <h2>9. Intellectual property</h2>
      <p>
        The Chroma brand, code and site design are ours. Third-party content shown here — market
        data, chart libraries, coin logos — belongs to their respective owners and is used under
        the applicable licenses.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Chroma is not liable for losses of any kind
        arising from: price changes; scams, fraud or abandonment by token creators; failure,
        delay or error in third-party data; network or provider outages; compromise of your
        wallet or device; or investment decisions made by you.
      </p>

      <h2>11. Who may use it</h2>
      <p>
        You state that you are <strong>at least 18 years old</strong>, have legal capacity, are
        not subject to international sanctions and do not reside in a jurisdiction where using
        this service is prohibited. It is your responsibility to check that your use is legal in
        your country, including tax obligations.
      </p>

      <h2>12. Changes</h2>
      <p>
        These Terms may change. The update date at the top shows the version in force, and
        continued use of the site after a change means you accept the new version.
      </p>

      <h2>13. Governing law</h2>
      <p>
        These Terms are governed by the laws of the <strong>Federative Republic of Brazil</strong>.
        Disputes shall be settled in the courts of the consumer user&apos;s domicile, as provided
        by law.
      </p>

      <h2>14. Contact</h2>
      <p>
        Questions, problems, reports or legal matters: use the{" "}
        <Link href="/contato">Contact</Link> page. We also handle requests related to the{" "}
        <Link href="/privacidade">Privacy Policy</Link> there.
      </p>
      <p>
        <em>This translation is provided for convenience. In case of divergence, the Portuguese version prevails.</em>
      </p>
    </>
  );
}

function CorpoZh() {
  return (
    <>
      <Aviso>
        <strong>风险提示。</strong>交易加密货币 —— 尤其是由用户创建、没有公司、没有产品、没有历史记录的代币 ——
        可能导致<strong>投入资金全部亏损</strong>。没有任何担保、保障基金、退款或撤销。
        发送到网络的交易是最终的。
      </Aviso>

      <h2>1. Chroma 是什么</h2>
      <p>
        Chroma 是一个界面 —— 一个网站 —— 让你可以查看市场数据、创建代币，并在{" "}
        <strong>Solana</strong> 和 <strong>Robinhood Chain</strong> 网络上构建兑换交易。
        使用本网站即表示你同意本条款。如果不同意，请不要使用本网站。
      </p>

      <h2>2. 我们不是经纪商、托管方或投资顾问</h2>
      <p>
        Chroma 是<strong>非托管</strong>的。具体来说，这意味着：
      </p>
      <ul>
        <li>我们永远不会持有你的私钥或助记词。</li>
        <li>我们永远不会保管、转移或冻结你的资金。</li>
        <li>每笔交易都由你本人在你的设备上用你的钱包签名。</li>
        <li>我们无法撤销、取消或逆转你已签名的内容。</li>
      </ul>
      <p>
        本网站的任何内容都不构成投资建议、公开发行、财务咨询或证券分析。数字、图表、&quot;热门代币&quot;列表和自动审计结果
        都是<strong>信息，而非建议</strong>。
      </p>

      <Aviso tom="neutro">
        <strong>Chroma 的任何人都不会向你索要助记词或私钥。</strong>{" "}
        永远不会。无论通过任何渠道、出于任何理由，无论是为了&quot;恢复&quot;还是&quot;验证&quot;。
        任何索要这些信息的人都是在试图盗窃你 —— 即使他们使用我们的名称、标志或网址。
      </Aviso>

      <h2>3. 代币由用户创建</h2>
      <p>
        任何人都可以在 Chroma 上发行代币，这里显示的大多数代币来自网络的公开数据源。我们
        <strong>不创建、不人工审计、不背书，也不担保</strong>其中任何一个。
      </p>
      <p>
        代币出现在网站上 —— 包括按交易量或涨跌幅排序的精选列表 —— <strong>并不代表认可</strong>。
        它只是反映了网络上正在发生的事情。
      </p>
      <p>
        如果你发现滥用、犯罪或欺诈内容，请使用代币页面上的举报按钮，或通过
        <Link href="/contato">联系我们</Link>页面告诉我们。
      </p>

      <h2>4. 禁止的行为</h2>
      <p>使用 Chroma 即表示你同意不会：</p>
      <ul>
        <li>
          未事先获得相关权利人的必要许可，<strong>将本网站、其数据、图表或内容用于商业目的</strong>。
        </li>
        <li>以任何违反适用的本地或国际法律法规的方式使用本网站。</li>
        <li>
          发布、发行或传播歧视性、仇恨、诽谤、骚扰、威胁、色情、淫秽、欺诈或侵犯第三方权利的内容 ——
          包括在代币的名称、代号、描述或图片中。
        </li>
        <li>冒充他人、品牌、项目或公司，或暗示不存在的关联、赞助或背书。</li>
        <li>操纵市场、以协同方式交易以欺骗他人，或利用平台实施诈骗。</li>
        <li>抓取、批量复制、镜像或转售本网站的数据和内容；进行逆向工程；绕过安全措施；或使基础设施过载。</li>
        <li>发送恶意代码或干扰本网站的运行。</li>
      </ul>

      <h2>5. 审核与移除</h2>
      <p>
        对于违反本条款或使他人面临风险的任何代币、图片、文字或账户，我们可以自行决定并在不事先通知的情况下
        <strong>从网站上隐藏或移除</strong>。
      </p>
      <p>
        一个重要且诚实的说明：从<strong>我们的网站</strong>移除内容，并不会从<strong>区块链</strong>上删除任何东西。
        代币仍然存在于网络上，并可能继续在其他地方交易。我们能管理的是展示页面，而不是公共记录。
      </p>

      <h2>6. 费用</h2>
      <p>
        Chroma 对通过界面进行的交易收取费用，在你签名交易前会显示在屏幕上，详情见
        <Link href="/fees">费用</Link>页面。
      </p>
      <p>
        此外还有<strong>不属于我们、我们也不会收到</strong>的成本：网络费、流动性协议费和价格滑点。
        在小额交易中这些固定成本占比很大 —— 几美元的交易仅网络成本就可能损失相当大的比例。
      </p>

      <h2>7. 市场数据</h2>
      <p>
        价格、图表、交易量、流动性、持有人数和审计结果来自<strong>外部数据源和网络本身</strong>，
        按&quot;现状&quot;提供。它们可能延迟、彼此不一致、包含错误或暂时不可用。
      </p>
      <p>
        我们努力确保其准确，但<strong>不保证准确性</strong>，也不对基于这些数据做出的决定负责。
        交易较大金额前，请务必在链上核实。
      </p>

      <h2>8. 可用性</h2>
      <p>
        本网站按&quot;现状&quot;和&quot;可用&quot;状态提供。我们可以随时更改、暂停或关闭其任何部分。
        我们依赖第三方服务 —— RPC 提供商、数据源、托管服务 —— 其中任何一个中断都可能导致网站功能不可用。
      </p>

      <h2>9. 知识产权</h2>
      <p>
        Chroma 品牌、代码和网站设计归我们所有。这里显示的第三方内容 —— 市场数据、图表库、代币标志 ——
        归各自的权利人所有，并依照适用的许可使用。
      </p>

      <h2>10. 责任限制</h2>
      <p>
        在法律允许的最大范围内，Chroma 不对以下原因造成的任何损失负责：价格波动；代币创建者的诈骗、欺诈或弃置；
        第三方数据的故障、延迟或错误；网络或服务商中断；你的钱包或设备被入侵；或你自己做出的投资决定。
      </p>

      <h2>11. 谁可以使用</h2>
      <p>
        你声明你<strong>年满 18 周岁</strong>、具有完全民事行为能力、不受国际制裁，且不居住在禁止使用本服务的司法管辖区。
        你有责任确认在你所在国家使用本服务是合法的，包括纳税义务。
      </p>

      <h2>12. 变更</h2>
      <p>
        本条款可能会变更。顶部的更新日期表示当前有效的版本，变更后继续使用本网站即表示你接受新版本。
      </p>

      <h2>13. 适用法律</h2>
      <p>
        本条款受<strong>巴西联邦共和国</strong>法律管辖。争议依法由消费者用户住所地法院解决。
      </p>

      <h2>14. 联系</h2>
      <p>
        疑问、问题、举报或法律事务：请使用<Link href="/contato">联系我们</Link>页面。
        与<Link href="/privacidade">隐私政策</Link>相关的请求也在那里处理。
      </p>
      <p>
        <em>本译文仅为方便阅读而提供。如有分歧，以葡萄牙语版本为准。</em>
      </p>
    </>
  );
}
