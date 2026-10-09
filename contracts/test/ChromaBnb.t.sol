// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {ChromaBnb} from "../src/ChromaBnb.sol";
import {ChromaToken} from "../src/ChromaToken.sol";
import {ICLPoolManager, IVault, ModifyLiquidityParams, PoolKey, Saldo, SwapParams} from "../src/InfinityCL.sol";

address constant COFRE = 0x238a358808379702088667322f80aC48bAd5e6c4;
address constant GERENTE = 0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b;

/** Um comprador qualquer (bot, pessoa): troca direto na pool, como um router faria. */
contract Negociante {
    using Saldo for int256;

    ChromaBnb immutable lancador;

    constructor(ChromaBnb l) {
        lancador = l;
    }

    receive() external payable {}

    function comprar(address moeda) external payable returns (uint256) {
        return abi.decode(IVault(COFRE).lock(abi.encode(true, moeda, msg.value)), (uint256));
    }

    function vender(address moeda, uint256 quanto) external returns (uint256) {
        return abi.decode(IVault(COFRE).lock(abi.encode(false, moeda, quanto)), (uint256));
    }

    function porLiquidez(address moeda) external {
        PoolKey memory chave = lancador.chaveDaPool(moeda);
        ICLPoolManager(GERENTE).modifyLiquidity(chave, ModifyLiquidityParams(-60, 60, 1e18, bytes32(0)), "");
    }

    function lockAcquired(bytes calldata dados) external returns (bytes memory) {
        (bool compra, address moeda, uint256 quanto) = abi.decode(dados, (bool, address, uint256));
        PoolKey memory chave = lancador.chaveDaPool(moeda);
        int256 d = ICLPoolManager(GERENTE).swap(
            chave,
            SwapParams({
                zeroForOne: compra,
                amountSpecified: -int256(quanto),
                sqrtPriceLimitX96: compra ? 4295128740 : 1461446703485210103287273052203988822378723970341
            }),
            ""
        );
        if (compra) {
            IVault(COFRE).settle{value: uint256(-int256(d.moeda0()))}();
            uint256 out = uint256(int256(d.moeda1()));
            IVault(COFRE).take(moeda, address(this), out);
            return abi.encode(out);
        }
        IVault(COFRE).sync(moeda);
        ChromaToken(moeda).transfer(COFRE, uint256(-int256(d.moeda1())));
        IVault(COFRE).settle();
        uint256 bnb = uint256(int256(d.moeda0()));
        IVault(COFRE).take(address(0), address(this), bnb);
        return abi.encode(bnb);
    }
}

contract ChromaBnbTest is Test {
    ChromaBnb lancador;
    Negociante bot;
    address criador = makeAddr("criador");

    function setUp() public {
        vm.createSelectFork("bsc");
        lancador = new ChromaBnb(COFRE, GERENTE, 4 ether);
        bot = new Negociante(lancador);
        vm.deal(criador, 10 ether);
        vm.deal(address(bot), 100 ether);
    }

    function _lancar(uint256 compra) internal returns (address moeda) {
        vm.prank(criador);
        moeda = lancador.lancar{value: compra}("Teste", "TST", "ipfs://x");
    }

    function test_lancaSemCompra_toda_emissao_vira_liquidez() public {
        address moeda = _lancar(0);
        ChromaToken t = ChromaToken(moeda);
        assertEq(t.balanceOf(address(lancador)), 0, "nada fica no contrato");
        assertEq(t.balanceOf(criador), 0);
        // Sobra de arredondamento queimada: menos de 1% da emissao.
        assertLt(t.balanceOf(0x000000000000000000000000000000000000dEaD), lancador.EMISSAO() / 100);
        assertGt(t.balanceOf(COFRE), (lancador.EMISSAO() * 99) / 100);
    }

    function test_compraInicial_do_criador_paga_taxa_normal() public {
        address moeda = _lancar(0.5 ether);
        uint256 doCriador = ChromaToken(moeda).balanceOf(criador);
        assertGt(doCriador, 0);
        // Um bot comprando o mesmo valor logo depois recebe bem menos (taxa de 50% + preço já subiu).
        uint256 doBot = bot.comprar{value: 0.5 ether}(moeda);
        assertLt(doBot, doCriador / 2);
    }

    function test_taxa_cai_de_50_ate_1_em_5_minutos() public {
        address moeda = _lancar(0);
        // Horários absolutos: com via_ir, `block.timestamp` relido depois de um
        // vm.warp pode vir do valor antigo.
        uint256 t0 = block.timestamp;
        assertEq(lancador.taxaAgora(moeda, address(bot)), 500_000);
        vm.warp(t0 + 150);
        assertEq(lancador.taxaAgora(moeda, address(bot)), 255_000);
        vm.warp(t0 + 300);
        assertEq(lancador.taxaAgora(moeda, address(bot)), 10_000);
        vm.warp(t0 + 365 days);
        assertEq(lancador.taxaAgora(moeda, address(bot)), 10_000);
    }

    function test_sniper_no_primeiro_segundo_deixa_metade_pro_criador() public {
        address moeda = _lancar(0);
        bot.comprar{value: 1 ether}(moeda);
        uint256 antes = criador.balance;
        lancador.coletar(moeda);
        uint256 ganhou = criador.balance - antes;
        // 50% de 1 BNB, menos a parte da PancakeSwap (0,03%).
        assertApproxEqRel(ganhou, 0.5 ether, 0.002e18);
    }

    function test_depois_da_janela_criador_ganha_1_por_cento() public {
        address moeda = _lancar(0);
        vm.warp(block.timestamp + 5 minutes);
        bot.comprar{value: 1 ether}(moeda);
        uint256 antes = criador.balance;
        lancador.coletar(moeda);
        assertApproxEqRel(criador.balance - antes, 0.01 ether, 0.01e18);
    }

    function test_venda_funciona_e_taxa_em_moeda_vai_pro_criador() public {
        address moeda = _lancar(0);
        vm.warp(block.timestamp + 5 minutes);
        uint256 tokens = bot.comprar{value: 1 ether}(moeda);
        uint256 bnb = bot.vender(moeda, tokens);
        // Ida e volta custa ~2% de taxa (+0,03% x2 da PancakeSwap).
        assertApproxEqRel(bnb, 0.98 ether, 0.003e18);
        lancador.coletar(moeda);
        assertGt(ChromaToken(moeda).balanceOf(criador), 0, "taxa da venda, em moeda");
    }

    function test_ninguem_mais_poe_liquidez_na_pool() public {
        address moeda = _lancar(0);
        vm.expectRevert();
        bot.porLiquidez(moeda);
    }

    function test_ninguem_cria_pool_com_o_gancho() public {
        address moeda = _lancar(0);
        PoolKey memory chave = lancador.chaveDaPool(moeda);
        chave.currency1 = address(0x55d398326f99059fF775485246999027B3197955); // USDT
        vm.expectRevert();
        ICLPoolManager(GERENTE).initialize(chave, 79228162514264337593543950336);
    }

    function test_coletar_moeda_desconhecida_falha() public {
        vm.expectRevert(ChromaBnb.MoedaDesconhecida.selector);
        lancador.coletar(address(0xBEEF));
    }

    function test_preco_sobe_com_compras() public {
        address moeda = _lancar(0);
        vm.warp(block.timestamp + 5 minutes);
        uint256 primeira = bot.comprar{value: 1 ether}(moeda);
        uint256 segunda = bot.comprar{value: 1 ether}(moeda);
        assertLt(segunda, primeira);
    }
}
