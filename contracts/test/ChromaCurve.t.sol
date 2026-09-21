// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ChromaCurve} from "../src/ChromaCurve.sol";
import {ChromaToken} from "../src/ChromaToken.sol";

/**
 * O que estes testes provam.
 *
 * Os mesmos fatos que os testes do programa da Solana provam, porque as duas
 * redes têm que se comportar igual: a divisão da taxa fecha exatamente, a
 * plataforma nunca cai abaixo do piso, a pausa nunca impede vender, ninguém se
 * auto-indica pra pagar menos, e fatiar uma ordem não rende mais que fazê-la de
 * uma vez.
 *
 * Esse último é o que pegou um bug real na versão em Rust — ver
 * `fatiar_a_ordem_nao_rende_mais`.
 */
contract ChromaCurveTest is Test {
    ChromaCurve internal curva;

    address internal autoridade = address(0xA1);
    address internal plataforma = address(0xB2);
    address internal criador = address(0xC3);
    address internal afiliado = address(0xD4);
    address internal trader = address(0xE5);

    // Os números da Robinhood Chain, iguais aos de `src/lib/fees.ts`.
    uint16 internal constant TOTAL = 120;
    uint16 internal constant AFILIADO = 30;
    uint16 internal constant PISO = 20;

    uint256 internal constant EMISSAO = 1_000_000_000 ether;
    uint256 internal constant A_VENDA = 793_100_000 ether;
    uint256 internal constant ETH_VIRTUAL = 30 ether;
    uint256 internal constant TOKEN_VIRTUAL = 1_073_000_000 ether;

    function setUp() public {
        /*
         * Limites de faixa baixos de propósito.
         *
         * A curva enche perto de 95 ETH. Faixas calibradas pra produção só
         * trocariam depois de ela fechar, e aí o teste nunca observaria a
         * troca — que é justamente o que ele existe pra observar.
         */
        uint256[4] memory limites = [uint256(0), 10 ether, 30 ether, 60 ether];
        uint16[4] memory faixas = [uint16(45), 55, 62, 70];

        curva = new ChromaCurve(
            autoridade,
            ChromaCurve.Parametros({
                carteiraDaPlataforma: plataforma,
                taxaTotalBps: TOTAL,
                taxaAfiliadoBps: AFILIADO,
                pisoDaPlataformaBps: PISO,
                limitesDasFaixas: limites,
                faixasDoCriadorBps: faixas,
                ethVirtualInicial: ETH_VIRTUAL,
                tokenVirtualInicial: TOKEN_VIRTUAL,
                tokenAVenda: A_VENDA,
                emissaoTotal: EMISSAO,
                taxaDeLancamento: 0
            })
        );

        vm.deal(trader, 1_000 ether);
        vm.deal(criador, 10 ether);
    }

    function _lancar() internal returns (address) {
        vm.prank(criador);
        return curva.lancar("Moeda de Teste", "TESTE", "https://exemplo.invalido/t.json");
    }

    /* ---------------------------------------------------------------- */
    /* Lançamento                                                       */
    /* ---------------------------------------------------------------- */

    function test_lancar_poe_a_emissao_inteira_na_curva() public {
        address moeda = _lancar();
        ChromaToken t = ChromaToken(moeda);

        assertEq(t.totalSupply(), EMISSAO, "emissao total");
        assertEq(t.balanceOf(address(curva)), EMISSAO, "tudo na curva");
        assertEq(t.balanceOf(criador), 0, "quem lancou nao leva nada");

        /*
         * Nada guardado pra quem lançou é o que impede o lançamento de já
         * começar com uma fatia pronta pra despejar em cima de quem comprou.
         */
        (address dono,,,, uint256 tokenReal,,,) = curva.curvas(moeda);
        assertEq(dono, criador, "o criador fica gravado");
        assertEq(tokenReal, A_VENDA, "e o que esta a venda e so a parte da curva");
    }

    function test_nome_e_simbolo_tem_teto() public {
        vm.prank(criador);
        vm.expectRevert(ChromaCurve.TextoLongoDemais.selector);
        curva.lancar("um nome muito maior do que trinta e dois bytes", "X", "u");

        vm.prank(criador);
        vm.expectRevert(ChromaCurve.TextoLongoDemais.selector);
        curva.lancar("ok", "SIMBOLOGRANDE", "u");
    }

    /* ---------------------------------------------------------------- */
    /* A divisão da taxa                                                */
    /* ---------------------------------------------------------------- */

    function test_compra_reparte_a_taxa_exatamente() public {
        address moeda = _lancar();
        uint256 gasto = 10 ether;

        vm.prank(trader);
        curva.comprar{value: gasto}(moeda, 0, afiliado);

        uint256 esperadoCriador = (gasto * 45) / 10_000; // primeira faixa
        uint256 esperadoAfiliado = (gasto * AFILIADO) / 10_000;
        uint256 esperadoTotal = (gasto * TOTAL) / 10_000;

        assertEq(criador.balance, 10 ether + esperadoCriador, "criador");
        assertEq(afiliado.balance, esperadoAfiliado, "afiliado");
        assertEq(
            plataforma.balance,
            esperadoTotal - esperadoCriador - esperadoAfiliado,
            "plataforma fica com o resto"
        );
    }

    function test_sem_afiliado_a_fatia_vai_pra_plataforma() public {
        address moeda = _lancar();
        uint256 gasto = 10 ether;

        vm.prank(trader);
        curva.comprar{value: gasto}(moeda, 0, address(0));

        uint256 total = (gasto * TOTAL) / 10_000;
        uint256 doCriador = (gasto * 45) / 10_000;

        assertEq(afiliado.balance, 0, "afiliado nao recebe");
        assertEq(plataforma.balance, total - doCriador, "plataforma absorve a fatia");
    }

    function test_ninguem_se_indica_pra_pagar_menos() public {
        address moeda = _lancar();

        vm.prank(trader);
        vm.expectRevert(ChromaCurve.AfiliadoEhOProprioTrader.selector);
        curva.comprar{value: 1 ether}(moeda, 0, trader);
    }

    function test_a_faixa_do_criador_sobe_com_o_volume() public {
        address moeda = _lancar();

        // Passa dos 10 ETH de volume acumulado pra entrar na segunda faixa.
        vm.prank(trader);
        curva.comprar{value: 12 ether}(moeda, 0, address(0));

        uint256 antes = criador.balance;

        vm.prank(trader);
        curva.comprar{value: 10 ether}(moeda, 0, address(0));

        // 55 bps, não mais 45.
        assertEq(criador.balance - antes, (10 ether * 55) / 10_000, "segunda faixa");
    }

    /* ---------------------------------------------------------------- */
    /* A curva                                                          */
    /* ---------------------------------------------------------------- */

    /**
     * O teste que pegou um bug de verdade na versão em Rust.
     *
     * Lá a reserva arredondava pra baixo, e dividir uma compra em mil rendia
     * mais tokens do que fazê-la de uma vez — ou seja, fatiar ordem era lucro,
     * e a diferença saía do bolso de quem comprava normalmente.
     */
    function test_fatiar_a_ordem_nao_rende_mais() public {
        address moedaA = _lancar();

        vm.prank(criador);
        address moedaB = curva.lancar("Outra", "OUTRA", "u");

        vm.prank(trader);
        uint256 deUmaVez = curva.comprar{value: 1 ether}(moedaA, 0, address(0));

        uint256 fatiado = 0;
        for (uint256 i = 0; i < 100; i++) {
            vm.prank(trader);
            fatiado += curva.comprar{value: 0.01 ether}(moedaB, 0, address(0));
        }

        assertLe(fatiado, deUmaVez, "fatiar nunca pode render mais");
    }

    function test_a_protecao_de_preco_aborta() public {
        address moeda = _lancar();

        uint256 previsto = curva.cotarCompra(moeda, 1 ether);

        vm.prank(trader);
        vm.expectRevert();
        curva.comprar{value: 1 ether}(moeda, previsto + 1, address(0));
    }

    function test_a_cotacao_bate_com_o_resultado() public {
        address moeda = _lancar();
        uint256 previsto = curva.cotarCompra(moeda, 3 ether);

        vm.prank(trader);
        uint256 recebido = curva.comprar{value: 3 ether}(moeda, 0, address(0));

        /*
         * Se divergisse, a proteção de preço recusaria compras legítimas — e a
         * tela mostraria um número que não acontece.
         */
        assertEq(recebido, previsto, "a tela promete o que a rede entrega");
    }

    function test_venda_devolve_eth_e_cobra_a_taxa() public {
        address moeda = _lancar();

        vm.prank(trader);
        uint256 tokens = curva.comprar{value: 5 ether}(moeda, 0, address(0));

        vm.prank(trader);
        ChromaToken(moeda).approve(address(curva), tokens);

        uint256 previsto = curva.cotarVenda(moeda, tokens);
        uint256 antes = trader.balance;

        vm.prank(trader);
        uint256 liquido = curva.vender(moeda, tokens, 0, address(0));

        assertEq(liquido, previsto, "a cotacao da venda tambem bate");
        assertEq(trader.balance, antes + liquido, "e o dinheiro chega");
    }

    function test_a_curva_enche_e_para_de_negociar() public {
        address moeda = _lancar();
        vm.deal(trader, 100_000 ether);

        // Compras grandes até o último token sair.
        for (uint256 i = 0; i < 40; i++) {
            (,,,, uint256 restam,, bool concluida,) = curva.curvas(moeda);
            if (concluida || restam == 0) break;

            vm.prank(trader);
            curva.comprar{value: 20 ether}(moeda, 0, address(0));
        }

        (,,,, uint256 tokenReal,, bool cheia,) = curva.curvas(moeda);
        assertTrue(cheia, "encheu");
        assertEq(tokenReal, 0, "nao sobrou token a venda");

        vm.prank(trader);
        vm.expectRevert(ChromaCurve.CurvaConcluida.selector);
        curva.comprar{value: 1 ether}(moeda, 0, address(0));
    }

    /* ---------------------------------------------------------------- */
    /* A pausa                                                          */
    /* ---------------------------------------------------------------- */

    function test_pausa_bloqueia_comprar_e_lancar() public {
        address moeda = _lancar();

        vm.prank(autoridade);
        curva.pausar(true);

        vm.prank(trader);
        vm.expectRevert(ChromaCurve.Pausado.selector);
        curva.comprar{value: 1 ether}(moeda, 0, address(0));

        vm.prank(criador);
        vm.expectRevert(ChromaCurve.Pausado.selector);
        curva.lancar("Nova", "NOVA", "u");
    }

    function test_pausa_NUNCA_bloqueia_a_venda() public {
        /*
         * O teste mais importante do arquivo, e o mesmo que existe do lado da
         * Solana. Uma trava que impede comprar protege quem ia entrar; a mesma
         * trava impedindo vender prende quem já está dentro. A saída fica
         * aberta inclusive — e principalmente — quando algo deu errado.
         */
        address moeda = _lancar();

        vm.prank(trader);
        uint256 tokens = curva.comprar{value: 5 ether}(moeda, 0, address(0));

        vm.prank(trader);
        ChromaToken(moeda).approve(address(curva), tokens);

        vm.prank(autoridade);
        curva.pausar(true);

        vm.prank(trader);
        uint256 liquido = curva.vender(moeda, tokens, 0, address(0));

        assertGt(liquido, 0, "vendeu mesmo pausado");
    }

    /* ---------------------------------------------------------------- */
    /* Limites da configuração                                          */
    /* ---------------------------------------------------------------- */

    function test_taxa_nao_passa_do_teto_gravado_no_codigo() public {
        uint256[4] memory limites = [uint256(0), 90 ether, 450 ether, 1_800 ether];
        uint16[4] memory faixas = [uint16(45), 55, 62, 70];

        vm.prank(autoridade);
        vm.expectRevert(ChromaCurve.TaxaAcimaDoTeto.selector);
        curva.configurar(
            ChromaCurve.Parametros({
                carteiraDaPlataforma: plataforma,
                taxaTotalBps: 201,
                taxaAfiliadoBps: AFILIADO,
                pisoDaPlataformaBps: PISO,
                limitesDasFaixas: limites,
                faixasDoCriadorBps: faixas,
                ethVirtualInicial: ETH_VIRTUAL,
                tokenVirtualInicial: TOKEN_VIRTUAL,
                tokenAVenda: A_VENDA,
                emissaoTotal: EMISSAO,
                taxaDeLancamento: 0
            })
        );
    }

    function test_configuracao_que_zeraria_a_plataforma_e_recusada() public {
        uint256[4] memory limites = [uint256(0), 90 ether, 450 ether, 1_800 ether];
        // 100 de criador + 30 de afiliado + 20 de piso não cabem em 120.
        uint16[4] memory faixas = [uint16(45), 55, 62, 100];

        vm.prank(autoridade);
        vm.expectRevert(ChromaCurve.PisoDaPlataformaViolado.selector);
        curva.configurar(
            ChromaCurve.Parametros({
                carteiraDaPlataforma: plataforma,
                taxaTotalBps: TOTAL,
                taxaAfiliadoBps: AFILIADO,
                pisoDaPlataformaBps: PISO,
                limitesDasFaixas: limites,
                faixasDoCriadorBps: faixas,
                ethVirtualInicial: ETH_VIRTUAL,
                tokenVirtualInicial: TOKEN_VIRTUAL,
                tokenAVenda: A_VENDA,
                emissaoTotal: EMISSAO,
                taxaDeLancamento: 0
            })
        );
    }

    function test_so_a_autoridade_configura_e_pausa() public {
        vm.prank(trader);
        vm.expectRevert(ChromaCurve.NaoAutorizado.selector);
        curva.pausar(true);
    }

    /* ---------------------------------------------------------------- */

    /** A divisão fecha pra qualquer valor, não só pros redondos que escolhi. */
    function testFuzz_a_divisao_sempre_fecha(uint96 gasto) public {
        vm.assume(gasto > 1_000_000 && gasto < 50 ether);

        address moeda = _lancar();
        vm.deal(trader, gasto);

        uint256 antesCriador = criador.balance;

        vm.prank(trader);
        curva.comprar{value: gasto}(moeda, 0, afiliado);

        uint256 total = (uint256(gasto) * TOTAL) / 10_000;

        assertEq(
            (criador.balance - antesCriador) + afiliado.balance + plataforma.balance,
            total,
            "as tres fatias fecham o total em qualquer valor"
        );
    }
}
