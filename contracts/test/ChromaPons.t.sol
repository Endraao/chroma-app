// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ChromaPons, IPonsFactory, IERC20Minimo} from "../src/ChromaPons.sol";

/**
 * Testes numa CÓPIA da Robinhood Chain de verdade, com a fábrica da Pons
 * publicada. Nada é enviado pra rede: o fork roda local.
 *
 *   forge test --match-contract ChromaPonsTest -vv
 */
contract ChromaPonsTest is Test {
    address constant FABRICA = 0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e;

    ChromaPons pons;
    address autoridade = makeAddr("autoridade");
    address plataforma = makeAddr("plataforma");
    address criador = makeAddr("criador");
    address trader = makeAddr("trader");
    address indicador = makeAddr("indicador");

    uint256 constant TAXA_LANCAMENTO = 0.0005 ether;

    function setUp() public {
        vm.createSelectFork("robinhood");
        pons = new ChromaPons(FABRICA, autoridade, plataforma, 95, 30, TAXA_LANCAMENTO, 60);
        vm.deal(criador, 10 ether);
        vm.deal(trader, 10 ether);
    }

    function _params(string memory nome) internal pure returns (IPonsFactory.TokenParams memory p) {
        p.name = nome;
        p.symbol = "TST";
        p.logo = "https://chromalaunch.fun/api/media/teste.jpg";
        p.description = "teste";
        p.creatorFeeRecipient = address(0xdead); // o contrato tem de sobrescrever
    }

    function _lancar(uint256 compra) internal returns (address moeda, address curva, uint256 tokens) {
        uint256 taxaPons = IPonsFactory(FABRICA).launchFee();
        vm.prank(criador);
        (moeda, curva, tokens) =
            pons.lancar{value: taxaPons + TAXA_LANCAMENTO + compra}(_params("Chroma Teste"), 0, 0);
    }

    function test_LancaCompraETaxaEmUmaTransacao() public {
        uint256 plataformaAntes = plataforma.balance;
        uint256 criadorAntes = criador.balance;
        (address moeda, address curva, uint256 tokens) = _lancar(0.01 ether);

        IPonsFactory.LaunchedToken memory l = IPonsFactory(FABRICA).getLaunchedToken(moeda);
        assertTrue(l.exists, "moeda registrada na Pons");
        assertEq(l.curve, curva);
        assertEq(l.creatorFeeRecipient, criador, "taxa de criador vai pra quem lancou");
        assertGt(tokens, 0, "compra do criador");
        assertEq(IERC20Minimo(moeda).balanceOf(criador), tokens, "tokens na carteira do criador");
        assertEq(plataforma.balance - plataformaAntes, TAXA_LANCAMENTO, "taxa da Chroma");
        assertEq(address(pons).balance, 0, "contrato nao guarda ETH");
        uint256 gasto = criadorAntes - criador.balance;
        assertLe(gasto, IPonsFactory(FABRICA).launchFee() + TAXA_LANCAMENTO + 0.01 ether);
        emit log_named_uint("tokens do criador por 0.01 ETH", tokens / 1e18);
    }

    function test_LancaSemCompra() public {
        (address moeda,, uint256 tokens) = _lancar(0);
        assertEq(tokens, 0);
        assertTrue(IPonsFactory(FABRICA).getLaunchedToken(moeda).exists);
    }

    function test_DoisLancamentosIguaisNaoColidem() public {
        (address a,,) = _lancar(0);
        (address b,,) = _lancar(0);
        assertTrue(a != b);
    }

    function test_JanelaContraRobos() public {
        (address moeda,,) = _lancar(0.01 ether);
        vm.prank(trader);
        vm.expectRevert();
        pons.comprar{value: 0.01 ether}(moeda, 0, address(0));

        vm.warp(block.timestamp + 61);
        vm.prank(trader);
        uint256 tokens = pons.comprar{value: 0.01 ether}(moeda, 0, address(0));
        assertGt(tokens, 0);
    }

    function test_CompraEVendaComIndicacao() public {
        (address moeda,,) = _lancar(0.01 ether);
        vm.warp(block.timestamp + 61);

        uint256 platAntes = plataforma.balance;
        vm.prank(trader);
        uint256 tokens = pons.comprar{value: 0.1 ether}(moeda, 0, indicador);
        assertEq(IERC20Minimo(moeda).balanceOf(trader), tokens);
        // 0,95% de 0,1 ETH: 0,30% pro indicador, o resto pra plataforma.
        assertEq(indicador.balance, (0.1 ether * 30) / 10_000, "comissao na compra");
        assertEq(plataforma.balance - platAntes, (0.1 ether * 95) / 10_000 - (0.1 ether * 30) / 10_000);
        assertEq(address(pons).balance, 0);

        uint256 indicadorAntes = indicador.balance;
        uint256 traderAntes = trader.balance;
        vm.startPrank(trader);
        IERC20Minimo(moeda).approve(address(pons), tokens);
        uint256 liquido = pons.vender(moeda, tokens, 0, indicador);
        vm.stopPrank();
        assertGt(liquido, 0.09 ether, "venda devolve quase tudo (taxas)");
        assertEq(trader.balance - traderAntes, liquido);
        assertGt(indicador.balance, indicadorAntes, "comissao na venda");
        assertEq(IERC20Minimo(moeda).balanceOf(trader), 0);
        assertEq(IERC20Minimo(moeda).balanceOf(address(pons)), 0, "contrato nao guarda moeda");
        assertEq(address(pons).balance, 0);
        emit log_named_uint("vendeu 0.1 ETH de moeda por (wei)", liquido);
    }

    function test_RecusaMoedaQueNaoEhDaPons() public {
        vm.prank(trader);
        vm.expectRevert(ChromaPons.MoedaNaoEhDaPons.selector);
        pons.comprar{value: 0.01 ether}(address(0x1234), 0, address(0));
    }

    function test_CompraEmMoedaDaPonsLancadaPorOutros() public {
        // Moeda lançada direto na Pons (sem a Chroma): sem janela nossa.
        IPonsFactory.TokenParams memory p = _params("De fora");
        p.creatorFeeRecipient = trader;
        uint256 taxaPons = IPonsFactory(FABRICA).launchFee();
        vm.prank(trader);
        (address moeda,) = IPonsFactory(FABRICA).launchToken{value: taxaPons}(p, 0, address(0), new address[](0));
        vm.warp(block.timestamp + 61); // passa o imposto contra robôs da própria Pons
        vm.prank(criador);
        uint256 tokens = pons.comprar{value: 0.01 ether}(moeda, 0, address(0));
        assertGt(tokens, 0);
    }

    function test_AfiliadoNaoPodeSerOProprio() public {
        (address moeda,,) = _lancar(0);
        vm.warp(block.timestamp + 61);
        vm.prank(trader);
        vm.expectRevert(ChromaPons.AfiliadoEhOProprioTrader.selector);
        pons.comprar{value: 0.01 ether}(moeda, 0, trader);
    }

    function test_PausaNaoTravaVenda() public {
        (address moeda,, uint256 tokens) = _lancar(0.01 ether);
        vm.prank(autoridade);
        pons.pausar(true);
        vm.startPrank(criador);
        IERC20Minimo(moeda).approve(address(pons), tokens);
        uint256 liquido = pons.vender(moeda, tokens, 0, address(0));
        vm.stopPrank();
        assertGt(liquido, 0);
    }

    function test_TetoDaTaxa() public {
        vm.prank(autoridade);
        vm.expectRevert(ChromaPons.TaxaAcimaDoTeto.selector);
        pons.configurar(plataforma, 201, 30, TAXA_LANCAMENTO, 60);
    }

    function test_SoAutoridadeConfigura() public {
        vm.prank(trader);
        vm.expectRevert(ChromaPons.NaoAutorizado.selector);
        pons.configurar(trader, 95, 30, 0, 0);
    }
}
