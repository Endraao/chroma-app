import type { Metadata } from "next";
import Link from "next/link";

import { Aviso, PaginaLegal } from "@/components/ui/PaginaLegal";

export const metadata: Metadata = {
  title: "Termos de Uso — Chroma",
  description: "As regras de uso da Chroma: riscos, responsabilidades e conduta.",
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
export default function TermosPage() {
  return (
    <PaginaLegal
      titulo="Termos de Uso"
      atualizadoEm="22 de setembro de 2026"
      resumo="Em resumo: a Chroma é uma ferramenta, não uma corretora. Nós nunca temos a sua chave nem o seu dinheiro. Qualquer moeda aqui pode ir a zero, inclusive por golpe de quem a criou. Use apenas o que você pode perder por inteiro."
    >
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
    </PaginaLegal>
  );
}
