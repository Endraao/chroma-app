import type { Metadata } from "next";
import Link from "next/link";

import { Aviso, PaginaLegal } from "@/components/ui/PaginaLegal";

export const metadata: Metadata = {
  title: "Política de Privacidade — Chroma",
  description: "O que a Chroma coleta, por quê, com quem compartilha e quais são os seus direitos.",
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
export default function PrivacidadePage() {
  return (
    <PaginaLegal
      titulo="Política de Privacidade"
      atualizadoEm="22 de setembro de 2026"
      resumo="Em resumo: guardamos o mínimo para o site funcionar. Nunca pedimos e nunca temos a sua chave privada ou frase de recuperação. Não vendemos dado de ninguém."
    >
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
        Não usamos cookies de rastreamento ou de publicidade. Usamos o{" "}
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
    </PaginaLegal>
  );
}
