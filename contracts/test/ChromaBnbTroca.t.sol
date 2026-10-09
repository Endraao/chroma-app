// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {ChromaBnb} from "../src/ChromaBnb.sol";
import {ChromaBnbTroca} from "../src/ChromaBnbTroca.sol";
import {ChromaToken} from "../src/ChromaToken.sol";

contract ChromaBnbTrocaTest is Test {
    address constant COFRE = 0x238a358808379702088667322f80aC48bAd5e6c4;
    address constant GERENTE = 0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b;

    ChromaBnb lancador;
    ChromaBnbTroca troca;
    address criador = makeAddr("criador");
    address pessoa = makeAddr("pessoa");
    address moeda;
    uint256 t0;

    function setUp() public {
        vm.createSelectFork("bsc");
        lancador = new ChromaBnb(COFRE, GERENTE, 4.35 ether);
        troca = new ChromaBnbTroca(address(lancador));
        vm.deal(criador, 10 ether);
        vm.deal(pessoa, 10 ether);
        vm.prank(criador);
        moeda = lancador.lancar{value: 0.01 ether}("Teste", "TST", "");
        t0 = block.timestamp;
        vm.warp(t0 + 5 minutes); // fora da janela anti-sniper
    }

    function test_cotacao_da_compra_bate_com_a_compra() public {
        uint256 cotado = troca.cotar(moeda, true, 0.1 ether);
        vm.prank(pessoa);
        uint256 recebido = troca.comprar{value: 0.1 ether}(moeda, (cotado * 99) / 100);
        assertEq(recebido, cotado);
        assertEq(ChromaToken(moeda).balanceOf(pessoa), recebido);
    }

    function test_venda_com_aprovacao_devolve_bnb() public {
        vm.startPrank(pessoa);
        uint256 tokens = troca.comprar{value: 0.1 ether}(moeda, 0);
        ChromaToken(moeda).approve(address(troca), type(uint256).max);
        uint256 cotado = troca.cotar(moeda, false, tokens);
        uint256 antes = pessoa.balance;
        uint256 bnb = troca.vender(moeda, tokens, (cotado * 99) / 100);
        vm.stopPrank();
        assertEq(bnb, cotado);
        assertEq(pessoa.balance - antes, bnb);
        assertEq(ChromaToken(moeda).balanceOf(pessoa), 0);
        // ida e volta ~2% (1% + 1%) + 0,03% x2 da PancakeSwap
        assertApproxEqRel(bnb, 0.098 ether, 0.003e18);
    }

    function test_nada_fica_preso_no_contrato_de_troca() public {
        vm.startPrank(pessoa);
        uint256 tokens = troca.comprar{value: 0.2 ether}(moeda, 0);
        ChromaToken(moeda).approve(address(troca), tokens);
        troca.vender(moeda, tokens / 2, 0);
        vm.stopPrank();
        assertEq(address(troca).balance, 0);
        assertEq(ChromaToken(moeda).balanceOf(address(troca)), 0);
    }

    function test_protecao_de_preco_recusa_se_vier_menos() public {
        uint256 cotado = troca.cotar(moeda, true, 0.1 ether);
        vm.prank(pessoa);
        vm.expectRevert();
        troca.comprar{value: 0.1 ether}(moeda, cotado + 1);
    }

    function test_venda_sem_aprovacao_falha() public {
        vm.startPrank(pessoa);
        uint256 tokens = troca.comprar{value: 0.1 ether}(moeda, 0);
        vm.expectRevert();
        troca.vender(moeda, tokens, 0);
        vm.stopPrank();
    }

    function test_moeda_que_nao_e_do_lancador_falha() public {
        vm.expectRevert(ChromaBnbTroca.MoedaDesconhecida.selector);
        troca.cotar(address(0xBEEF), true, 1 ether);
    }

    function test_na_janela_anti_sniper_a_cotacao_ja_mostra_a_taxa_alta() public {
        vm.warp(t0); // primeiro segundo
        uint256 comTaxaAlta = troca.cotar(moeda, true, 0.1 ether);
        vm.warp(t0 + 5 minutes);
        uint256 normal = troca.cotar(moeda, true, 0.1 ether);
        assertLt(comTaxaAlta, (normal * 55) / 100);
    }
}
