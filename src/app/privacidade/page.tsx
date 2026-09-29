import type { Metadata } from "next";
import Link from "next/link";

import { Aviso, PaginaLegal } from "@/components/ui/PaginaLegal";
import { idiomaAtual } from "@/lib/idioma-servidor";
import { traducoes } from "@/lib/idiomas";

export const metadata: Metadata = {
  title: "Privacy Policy — Chroma",
  description: "What Chroma collects, why, who it shares it with and what your rights are.",
};

/**
 * Política de Privacidade.
 *
 * ---------------------------------------------------------------------------
 * ESCRITA A PARTIR DO CÓDIGO, NÃO DE UM MODELO
 * ---------------------------------------------------------------------------
 * Cada item desta página corresponde a algo que o site REALMENTE faz: as
 * tabelas em `src/lib/db.ts`, o hash de IP em `src/lib/recados.ts`, o
 * `localStorage` da barra lateral, as chamadas às fontes de mercado.
 *
 * Política copiada de modelo é pior que nenhuma: promete o que o código não
 * cumpre, e é exatamente isso que uma autoridade de proteção de dados procura
 * quando chega uma reclamação.
 *
 * Se o código mudar — nova tabela, novo provedor, novo dado coletado — esta
 * página muda junto. Não é documentação opcional; é declaração.
 */
const TEXTOS = traducoes({
  en: {"titulo":"Privacy Policy","atualizado":"Updated on September 28, 2026","resumo":"In short: we keep the minimum for the site to work. We never ask for and never have your private key or recovery phrase. We do not sell anyone's data."},
  pt: {"titulo":"Política de Privacidade","atualizado":"Atualizado em 28 de setembro de 2026","resumo":"Em resumo: guardamos o mínimo para o site funcionar. Nunca pedimos e nunca temos a sua chave privada ou frase de recuperação. Não vendemos dado de ninguém."},
  zh: {"titulo":"隐私政策","atualizado":"更新于 2026 年 9 月 28 日","resumo":"简而言之：我们只保存网站运行所需的最少数据。我们从不索要、也从不持有你的私钥或助记词。我们不出售任何人的数据。"},
});

const CORPO = { en: CorpoEn, pt: CorpoPt, zh: CorpoZh };

export default async function PrivacidadePage() {
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
        <strong>A Chroma nunca pede sua frase de recuperação ou chave privada.</strong> Nós não
        temos como ter acesso a elas, e não existe situação — suporte, recuperação, verificação,
        sorteio, migração — em que pedir isso seja legítimo. Quem pedir está tentando roubar
        você, mesmo usando o nosso nome.
      </Aviso>

      <h2>1. Quem é o responsável</h2>
      <p>
        A Chroma opera este site e é a controladora dos dados aqui descritos, nos termos da{" "}
        <strong>Lei Geral de Proteção de Dados (Lei 13.709/2018)</strong>. O canal para qualquer
        assunto de privacidade é a página de <Link href="/contato">Contato</Link>.
      </p>

      <h2>2. O que coletamos</h2>

      <h3>Quando você conecta a carteira</h3>
      <ul>
        <li>
          <strong>Endereço público da carteira.</strong> É informação pública da blockchain, mas
          guardamos para ligar a sua conta ao seu perfil e ao programa de afiliados.
        </li>
        <li>
          <strong>Apelido, nome de exibição, avatar e capa</strong>, se você escolher preencher.
        </li>
        <li>
          <strong>Eventos de afiliado</strong>: cliques em link de indicação e operações
          associadas, com valor, rede, moeda e identificador da transação — tudo já público na
          rede — para calcular a comissão devida a quem indicou.
        </li>
      </ul>

      <h3>Quando você lança uma moeda</h3>
      <ul>
        <li>Nome, símbolo, descrição e imagem que você enviar, e o endereço da carteira criadora.</li>
      </ul>

      <h3>Quando você escreve para nós ou denuncia uma moeda</h3>
      <ul>
        <li>Nome, e-mail e, opcionalmente, endereço de carteira pública que você informar.</li>
        <li>O texto que você escrever.</li>
        <li>
          Um <strong>hash do seu endereço de IP</strong> — não o IP em si. Explicado no item
          seguinte.
        </li>
      </ul>

      <h3>O que NÃO coletamos</h3>
      <ul>
        <li>
          <strong>Chave privada e frase de recuperação.</strong> Nunca. O site é não custodial e
          não tem como acessá-las.
        </li>
        <li>CPF, RG, endereço residencial, dados bancários ou de cartão.</li>
        <li>Não usamos publicidade comportamental nem rastreadores de terceiros para anúncio.</li>
      </ul>

      <h2>3. Por que guardamos um hash do IP, e não o IP</h2>
      <p>
        Endereço de IP é dado pessoal. Precisamos dele para uma única pergunta:{" "}
        <em>&quot;esta mesma origem já mandou muitas mensagens em poucos minutos?&quot;</em> — é o
        que impede o formulário de virar máquina de spam.
      </p>
      <p>
        Um <strong>hash com sal</strong> responde exatamente isso e{" "}
        <strong>não permite voltar ao endereço original</strong>. É o que guardamos. O IP em si
        não é gravado em nenhuma tabela nossa.
      </p>

      <h2>4. Bases legais</h2>
      <ul>
        <li>
          <strong>Execução de contrato</strong> (art. 7º, V): conta, perfil, cálculo de comissão
          de afiliado.
        </li>
        <li>
          <strong>Legítimo interesse</strong> (art. 7º, IX): segurança, prevenção a fraude e
          abuso, e moderação de conteúdo denunciado.
        </li>
        <li>
          <strong>Consentimento</strong> (art. 7º, I): o que você opta por preencher, como avatar
          ou carteira no formulário de contato.
        </li>
        <li>
          <strong>Cumprimento de obrigação legal</strong> (art. 7º, II), quando aplicável.
        </li>
      </ul>

      <h2>5. Com quem compartilhamos</h2>
      <p>
        <strong>Não vendemos dados.</strong> Compartilhamos apenas com os prestadores necessários
        para o site existir:
      </p>
      <ul>
        <li>
          <strong>Vercel</strong> — hospedagem e armazenamento de arquivos enviados.
        </li>
        <li>
          <strong>Neon</strong> — banco de dados.
        </li>
        <li>
          <strong>Resend</strong> — envio dos e-mails gerados pelos formulários, quando
          configurado.
        </li>
        <li>
          <strong>Provedores de RPC e fontes de dados de mercado</strong> — consultados para
          exibir preços, gráficos e auditorias. Ao carregar uma página, seu navegador pode se
          conectar diretamente a esses serviços, que então enxergam seu IP conforme as políticas
          deles.
        </li>
        <li>
          <strong>Carteiras</strong> (Phantom, MetaMask e afins) — extensões controladas por você
          e por seus próprios termos. Não temos acesso ao que está dentro delas.
        </li>
      </ul>
      <p>
        Alguns desses serviços operam fora do Brasil, o que implica{" "}
        <strong>transferência internacional de dados</strong>, feita com base nas hipóteses legais
        aplicáveis.
      </p>

      <h2>6. O que fica no seu navegador</h2>
      <p>
        Não usamos cookies de rastreamento ou de publicidade. Usamos um cookie que lembra o
        idioma escolhido e o{" "}
        <code>localStorage</code> do seu navegador para lembrar preferências de interface — como a
        barra lateral aberta ou fechada e o identificador de quem indicou você.
      </p>
      <p>
        Isso fica <strong>no seu dispositivo</strong> e pode ser apagado a qualquer momento nas
        configurações do navegador.
      </p>

      <h2>7. Por quanto tempo guardamos</h2>
      <ul>
        <li>
          <strong>Conta e perfil</strong>: enquanto a conta existir.
        </li>
        <li>
          <strong>Apelidos antigos</strong>: mantidos mesmo após troca, para que links de
          indicação já divulgados continuem funcionando e para que ninguém assuma o nome de
          outra pessoa.
        </li>
        <li>
          <strong>Eventos de afiliado</strong>: mantidos pelo prazo necessário ao acerto de
          comissões e a eventuais obrigações legais.
        </li>
        <li>
          <strong>Mensagens e denúncias</strong>: mantidas enquanto necessárias para tratar o
          caso e comprovar que agimos sobre ele.
        </li>
      </ul>

      <h2>8. Seus direitos</h2>
      <p>Pela LGPD, você pode a qualquer momento pedir:</p>
      <ul>
        <li>Confirmação de que tratamos dados seus, e acesso a eles.</li>
        <li>Correção de dado incompleto ou desatualizado.</li>
        <li>Anonimização, bloqueio ou eliminação de dado desnecessário ou excessivo.</li>
        <li>Portabilidade, informação sobre compartilhamento e revogação do consentimento.</li>
      </ul>
      <p>
        Peça pela página de <Link href="/contato">Contato</Link>. Respondemos no prazo legal.
      </p>

      <Aviso tom="neutro">
        <strong>Um limite honesto:</strong> o que está registrado na blockchain —
        transações, saldos, criação de tokens — é <strong>público e imutável</strong>. Nós podemos
        apagar o que está nos <em>nossos</em> bancos, mas ninguém, nem nós nem você, consegue
        apagar um registro da rede.
      </Aviso>

      <h2>9. Segurança</h2>
      <p>
        Usamos conexão criptografada, banco com acesso restrito, cabeçalhos de segurança, limites
        de frequência nos formulários e validação de tudo que chega do navegador. Ainda assim,
        nenhum sistema é inviolável — e a sua carteira continua sendo a parte mais sensível,
        protegida por você.
      </p>

      <h2>10. Menores de idade</h2>
      <p>
        O site não é destinado a menores de 18 anos e não coletamos dados de crianças e
        adolescentes de forma consciente. Se isso ocorrer, avise pela página de contato para que
        removamos.
      </p>

      <h2>11. Alterações</h2>
      <p>
        Esta política pode mudar conforme o site evolui. A data no topo indica a versão vigente.
        Mudanças relevantes serão sinalizadas no site.
      </p>
    </>
  );
}

function CorpoEn() {
  return (
    <>
      <Aviso>
        <strong>Chroma never asks for your recovery phrase or private key.</strong> We have no
        way to access them, and there is no situation — support, recovery, verification,
        giveaway, migration — in which asking for them is legitimate. Whoever asks is trying to
        rob you, even if they use our name.
      </Aviso>

      <h2>1. Who is responsible</h2>
      <p>
        Chroma operates this site and is the controller of the data described here, under
        Brazil&apos;s <strong>General Data Protection Law (LGPD, Law 13.709/2018)</strong>. The
        channel for any privacy matter is the <Link href="/contato">Contact</Link> page.
      </p>

      <h2>2. What we collect</h2>

      <h3>When you connect your wallet</h3>
      <ul>
        <li>
          <strong>Public wallet address.</strong> It is public blockchain information, but we
          store it to link your account to your profile and to the referral program.
        </li>
        <li>
          <strong>Nickname, display name, avatar and cover</strong>, if you choose to fill them in.
        </li>
        <li>
          <strong>Referral events</strong>: clicks on referral links and related trades, with
          amount, network, coin and transaction ID — all already public on-chain — to compute
          the commission owed to the referrer.
        </li>
      </ul>

      <h3>When you launch a coin</h3>
      <ul>
        <li>The name, symbol, description and image you submit, and the creator wallet address.</li>
      </ul>

      <h3>When you write to us or report a coin</h3>
      <ul>
        <li>Name, email and, optionally, the public wallet address you provide.</li>
        <li>The text you write.</li>
        <li>
          A <strong>hash of your IP address</strong> — not the IP itself. Explained in the next
          section.
        </li>
      </ul>

      <h3>What we do NOT collect</h3>
      <ul>
        <li>
          <strong>Private key and recovery phrase.</strong> Never. The site is non-custodial and
          has no way to access them.
        </li>
        <li>Government ID numbers, home address, bank or card details.</li>
        <li>We do not use behavioral advertising or third-party ad trackers.</li>
      </ul>

      <h2>3. Why we store a hash of the IP, not the IP</h2>
      <p>
        An IP address is personal data. We need it for a single question:{" "}
        <em>&quot;has this same source sent many messages in a few minutes?&quot;</em> — that is
        what keeps the form from becoming a spam machine.
      </p>
      <p>
        A <strong>salted hash</strong> answers exactly that and{" "}
        <strong>cannot be reversed to the original address</strong>. That is what we store. The
        IP itself is not written to any of our tables.
      </p>

      <h2>4. Legal bases</h2>
      <ul>
        <li>
          <strong>Performance of a contract</strong> (art. 7, V): account, profile, referral
          commission calculation.
        </li>
        <li>
          <strong>Legitimate interest</strong> (art. 7, IX): security, fraud and abuse
          prevention, and moderation of reported content.
        </li>
        <li>
          <strong>Consent</strong> (art. 7, I): what you choose to fill in, such as an avatar or a
          wallet in the contact form.
        </li>
        <li>
          <strong>Compliance with a legal obligation</strong> (art. 7, II), when applicable.
        </li>
      </ul>

      <h2>5. Who we share with</h2>
      <p>
        <strong>We do not sell data.</strong> We share only with the providers needed for the
        site to exist:
      </p>
      <ul>
        <li>
          <strong>Vercel</strong> — hosting and storage of uploaded files.
        </li>
        <li>
          <strong>Neon</strong> — database.
        </li>
        <li>
          <strong>Resend</strong> — sending emails generated by the forms, when configured.
        </li>
        <li>
          <strong>RPC providers and market data sources</strong> — queried to show prices,
          charts and audits. When a page loads, your browser may connect directly to these
          services, which then see your IP under their own policies.
        </li>
        <li>
          <strong>Wallets</strong> (Phantom, MetaMask and similar) — extensions controlled by you
          and by their own terms. We have no access to what is inside them.
        </li>
      </ul>
      <p>
        Some of these services operate outside Brazil, which implies an{" "}
        <strong>international data transfer</strong>, made under the applicable legal grounds.
      </p>

      <h2>6. What stays in your browser</h2>
      <p>
        We do not use tracking or advertising cookies. We use one cookie that remembers the
        language you chose, and your browser&apos;s <code>localStorage</code> to remember
        interface preferences — such as the sidebar being open or closed and the ID of whoever
        referred you.
      </p>
      <p>
        This stays <strong>on your device</strong> and can be erased at any time in your browser
        settings.
      </p>

      <h2>7. How long we keep it</h2>
      <ul>
        <li>
          <strong>Account and profile</strong>: while the account exists.
        </li>
        <li>
          <strong>Old nicknames</strong>: kept even after a change, so referral links already
          shared keep working and nobody can take over someone else&apos;s name.
        </li>
        <li>
          <strong>Referral events</strong>: kept for as long as needed to settle commissions and
          meet any legal obligations.
        </li>
        <li>
          <strong>Messages and reports</strong>: kept while needed to handle the case and to
          prove we acted on it.
        </li>
      </ul>

      <h2>8. Your rights</h2>
      <p>Under the LGPD, you may at any time request:</p>
      <ul>
        <li>Confirmation that we process your data, and access to it.</li>
        <li>Correction of incomplete or outdated data.</li>
        <li>Anonymization, blocking or deletion of unnecessary or excessive data.</li>
        <li>Portability, information about sharing, and withdrawal of consent.</li>
      </ul>
      <p>
        Ask through the <Link href="/contato">Contact</Link> page. We reply within the legal
        deadline.
      </p>

      <Aviso tom="neutro">
        <strong>An honest limit:</strong> what is recorded on the blockchain — transactions,
        balances, token creation — is <strong>public and immutable</strong>. We can erase what
        is in <em>our</em> databases, but nobody, neither we nor you, can erase a record from the
        network.
      </Aviso>

      <h2>9. Security</h2>
      <p>
        We use encrypted connections, a database with restricted access, security headers, rate
        limits on forms and validation of everything that comes from the browser. Still, no
        system is unbreakable — and your wallet remains the most sensitive part, protected by
        you.
      </p>

      <h2>10. Minors</h2>
      <p>
        The site is not intended for people under 18, and we do not knowingly collect data from
        children or teenagers. If that happens, let us know through the contact page so we can
        remove it.
      </p>

      <h2>11. Changes</h2>
      <p>
        This policy may change as the site evolves. The date at the top shows the version in
        force. Relevant changes will be flagged on the site.
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
        <strong>Chroma 永远不会索要你的助记词或私钥。</strong>我们无法访问它们，
        也不存在任何需要索要它们的正当情形 —— 客服、恢复、验证、抽奖、迁移都不例外。
        索要这些信息的人就是在试图盗窃你，即使他们使用我们的名称。
      </Aviso>

      <h2>1. 谁是负责方</h2>
      <p>
        Chroma 运营本网站，并依据巴西<strong>《通用数据保护法》（LGPD，第 13.709/2018 号法律）</strong>
        作为此处所述数据的控制者。任何隐私事务请通过<Link href="/contato">联系我们</Link>页面处理。
      </p>

      <h2>2. 我们收集什么</h2>

      <h3>当你连接钱包时</h3>
      <ul>
        <li>
          <strong>公开钱包地址。</strong>这是区块链上的公开信息，但我们会保存它，以便将你的账户与个人资料和推荐计划关联。
        </li>
        <li>
          <strong>昵称、显示名称、头像和封面</strong>，如果你选择填写。
        </li>
        <li>
          <strong>推荐事件</strong>：推荐链接的点击和相关交易，包括金额、网络、代币和交易 ID ——
          这些在链上都已公开 —— 用于计算应付给推荐人的佣金。
        </li>
      </ul>

      <h3>当你发行代币时</h3>
      <ul>
        <li>你提交的名称、代号、描述和图片，以及创建者钱包地址。</li>
      </ul>

      <h3>当你联系我们或举报代币时</h3>
      <ul>
        <li>你提供的姓名、邮箱以及（可选的）公开钱包地址。</li>
        <li>你写的内容。</li>
        <li>
          你的 <strong>IP 地址哈希值</strong> —— 而不是 IP 本身。下一节会解释原因。
        </li>
      </ul>

      <h3>我们不收集什么</h3>
      <ul>
        <li>
          <strong>私钥和助记词。</strong>永远不会。本网站是非托管的，无法访问它们。
        </li>
        <li>身份证件号码、住址、银行或银行卡信息。</li>
        <li>我们不使用行为广告，也不使用第三方广告追踪器。</li>
      </ul>

      <h2>3. 为什么我们保存 IP 的哈希值而不是 IP</h2>
      <p>
        IP 地址属于个人数据。我们只需要用它回答一个问题：
        <em>&quot;同一来源是否在几分钟内发送了大量消息？&quot;</em> —— 这可以防止表单被用来发送垃圾信息。
      </p>
      <p>
        <strong>加盐哈希</strong>正好能回答这个问题，并且<strong>无法还原出原始地址</strong>。
        这就是我们保存的内容。IP 本身不会写入我们的任何数据表。
      </p>

      <h2>4. 法律依据</h2>
      <ul>
        <li>
          <strong>履行合同</strong>（第 7 条第 V 款）：账户、个人资料、推荐佣金计算。
        </li>
        <li>
          <strong>合法利益</strong>（第 7 条第 IX 款）：安全、防止欺诈和滥用，以及审核被举报的内容。
        </li>
        <li>
          <strong>同意</strong>（第 7 条第 I 款）：你选择填写的内容，例如头像或联系表单中的钱包。
        </li>
        <li>
          <strong>履行法定义务</strong>（第 7 条第 II 款），如适用。
        </li>
      </ul>

      <h2>5. 我们与谁共享</h2>
      <p>
        <strong>我们不出售数据。</strong>我们只与网站运行所必需的服务商共享：
      </p>
      <ul>
        <li>
          <strong>Vercel</strong> —— 托管和上传文件的存储。
        </li>
        <li>
          <strong>Neon</strong> —— 数据库。
        </li>
        <li>
          <strong>Resend</strong> —— 在已配置时发送表单产生的邮件。
        </li>
        <li>
          <strong>RPC 提供商和市场数据源</strong> —— 用于显示价格、图表和审计。加载页面时，
          你的浏览器可能会直接连接这些服务，它们会依照各自的政策看到你的 IP。
        </li>
        <li>
          <strong>钱包</strong>（Phantom、MetaMask 等）—— 由你控制并受其自身条款约束的扩展程序。我们无法访问其中的内容。
        </li>
      </ul>
      <p>
        其中部分服务在巴西境外运营，这意味着存在<strong>国际数据传输</strong>，并依据适用的法律依据进行。
      </p>

      <h2>6. 保存在你浏览器中的内容</h2>
      <p>
        我们不使用追踪或广告 Cookie。我们使用一个 Cookie 记住你选择的语言，并使用浏览器的
        <code>localStorage</code> 记住界面偏好 —— 例如侧边栏的开关状态以及推荐你的人的标识。
      </p>
      <p>
        这些内容保存在<strong>你的设备上</strong>，你可以随时在浏览器设置中清除。
      </p>

      <h2>7. 保存期限</h2>
      <ul>
        <li>
          <strong>账户和个人资料</strong>：在账户存在期间。
        </li>
        <li>
          <strong>旧昵称</strong>：即使更换后也会保留，以便已分享的推荐链接继续有效，且他人无法冒用你的名称。
        </li>
        <li>
          <strong>推荐事件</strong>：在结算佣金及履行可能的法定义务所需的期限内保留。
        </li>
        <li>
          <strong>消息和举报</strong>：在处理案件并证明我们已采取行动所需的期间内保留。
        </li>
      </ul>

      <h2>8. 你的权利</h2>
      <p>根据 LGPD，你可以随时要求：</p>
      <ul>
        <li>确认我们是否处理你的数据，并访问这些数据。</li>
        <li>更正不完整或过时的数据。</li>
        <li>对不必要或过度的数据进行匿名化、封锁或删除。</li>
        <li>数据可携带、了解共享情况以及撤回同意。</li>
      </ul>
      <p>
        请通过<Link href="/contato">联系我们</Link>页面提出请求。我们会在法定期限内答复。
      </p>

      <Aviso tom="neutro">
        <strong>一个诚实的限制：</strong>记录在区块链上的内容 —— 交易、余额、代币创建 ——
        是<strong>公开且不可篡改</strong>的。我们可以删除<em>我们</em>数据库中的内容，
        但任何人，无论是我们还是你，都无法删除网络上的记录。
      </Aviso>

      <h2>9. 安全</h2>
      <p>
        我们使用加密连接、访问受限的数据库、安全响应头、表单频率限制，并验证来自浏览器的所有内容。
        尽管如此，没有任何系统是牢不可破的 —— 你的钱包仍然是最敏感的部分，需要由你来保护。
      </p>

      <h2>10. 未成年人</h2>
      <p>
        本网站不面向 18 岁以下人士，我们不会有意收集儿童和青少年的数据。如果发生这种情况，
        请通过联系页面告知我们以便删除。
      </p>

      <h2>11. 变更</h2>
      <p>
        本政策可能随网站发展而变更。顶部的日期表示当前有效的版本。重大变更会在网站上提示。
      </p>
      <p>
        <em>本译文仅为方便阅读而提供。如有分歧，以葡萄牙语版本为准。</em>
      </p>
    </>
  );
}
