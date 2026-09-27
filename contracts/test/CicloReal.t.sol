// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ChromaCurve} from "../src/ChromaCurve.sol";
import {ChromaToken} from "../src/ChromaToken.sol";

/**
 * O ciclo inteiro contra a curva PUBLICADA, num fork da Robinhood Chain.
 *
 * Os outros testes publicam uma curva nova com números de teste. Este usa a
 * que está no ar — com os parâmetros ajustados em 27/09/2026 para o preço
 * inicial da PONS — e percorre o que um usuário de verdade faz: lançar,
 * comprar com indicação, vender, encher a curva e migrar pra Uniswap.
 *
 * Existe porque o ajuste de 30 → 2,032 ETH virtuais mudou quanto ETH enche a
 * curva, e a migração com esse número nunca tinha rodado.
 */
contract CicloRealTest is Test {
    ChromaCurve internal constant CURVA = ChromaCurve(payable(0x3Fb52955Ba3394a237F803222110Dac5b9d01501));
    address internal constant GERENTE = 0x8366a39CC670B4001A1121B8F6A443A643e40951;

    address internal criador = address(0xC3);
    address internal trader = address(0xE5);
    address internal promotor = address(0xAF);
    address internal estranho = address(0xF6);

    bool internal temRede;

    modifier comRede() {
        if (!temRede) return;
        _;
    }

    function setUp() public {
        try vm.createFork("robinhood") returns (uint256 id) {
            vm.selectFork(id);
            temRede = true;
        } catch {
            return;
        }
        vm.deal(criador, 1 ether);
        vm.deal(trader, 100 ether);
        vm.deal(estranho, 1 ether);
    }

    function _lancar() internal returns (address moeda) {
        uint256 taxa = CURVA.taxaDeLancamento();
        vm.prank(criador);
        moeda = CURVA.lancar{value: taxa}("Teste", "TST", "https://exemplo/meta.json");
    }

    function test_parametros_no_ar_sao_os_da_pons() public comRede {
        assertEq(CURVA.ethVirtualInicial(), 2.032 ether, "ethVirtual");
        assertEq(CURVA.tokenVirtualInicial(), 1_073_000_000 ether, "tokenVirtual");
        assertEq(CURVA.taxaDeLancamento(), 0.0005 ether, "taxa de lancamento");
    }

    function test_lancar_comprar_com_indicacao_e_vender() public comRede {
        address plataforma = CURVA.carteiraDaPlataforma();
        uint256 antesPlataforma = plataforma.balance;

        address moeda = _lancar();
        assertEq(plataforma.balance - antesPlataforma, 0.0005 ether, "taxa de lancamento chegou");

        uint256 antesPromotor = promotor.balance;
        uint256 antesCriador = criador.balance;

        vm.prank(trader);
        uint256 tokens = CURVA.comprar{value: 0.1 ether}(moeda, 1, promotor);
        assertGt(tokens, 0, "comprou");

        /* 0,30% pro promotor, fatia do criador, resto pra plataforma. */
        assertEq(promotor.balance - antesPromotor, (0.1 ether * 30) / 10_000, "afiliado recebeu 0,30%");
        assertGt(criador.balance - antesCriador, 0, "criador recebeu");

        /* Vende metade, com aprovação exata. */
        uint256 metade = tokens / 2;
        uint256 antesTrader = trader.balance;
        vm.startPrank(trader);
        ChromaToken(moeda).approve(address(CURVA), metade);
        CURVA.vender(moeda, metade, 1, promotor);
        vm.stopPrank();
        assertGt(trader.balance, antesTrader, "recebeu ETH na venda");
    }

    function test_market_cap_inicial_perto_de_5_mil_dolares() public comRede {
        address moeda = _lancar();
        (, uint256 ethV, uint256 tokenV,,,,,) = CURVA.curvas(moeda);
        /* Preço * 1 bi de tokens, em ETH. A 2.700 dólares, ~1,89 ETH = ~US$ 5,1 mil. */
        uint256 mcapEmEth = (ethV * 1_000_000_000 ether) / tokenV;
        assertApproxEqRel(mcapEmEth, 1.894 ether, 0.01e18, "mcap inicial ~1,89 ETH");
    }

    function test_enche_com_uns_6_eth_e_migra() public comRede {
        address moeda = _lancar();

        uint256 gasto;
        bool cheia;
        while (!cheia) {
            vm.prank(trader);
            try CURVA.comprar{value: 0.25 ether}(moeda, 1, address(0)) {
                gasto += 0.25 ether;
            } catch {
                /* A última compra passa do que resta: compra só o que falta. */
                vm.prank(trader);
                CURVA.comprar{value: 0.01 ether}(moeda, 1, address(0));
                gasto += 0.01 ether;
            }
            (,,,,,, cheia,) = CURVA.curvas(moeda);
            require(gasto < 20 ether, "curva nao enche");
        }

        emit log_named_decimal_uint("ETH gasto pra encher", gasto, 18);
        assertLt(gasto, 7 ether, "enche com menos de 7 ETH");
        assertGt(gasto, 5 ether, "e com mais de 5 ETH");

        uint256 ethAntes = GERENTE.balance;
        vm.prank(estranho);
        CURVA.migrar(moeda);

        (,,,,,,, bool migrada) = CURVA.curvas(moeda);
        assertTrue(migrada, "migrou");
        assertGt(GERENTE.balance - ethAntes, 5 ether, "a liquidez foi pra Uniswap");
    }
}
