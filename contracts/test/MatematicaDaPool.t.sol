// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {MatematicaDaPool} from "../src/MatematicaDaPool.sol";

/**
 * As contas da pool, conferidas com números na mão.
 *
 * Funções puras testadas isoladamente: se o preço inicial sair errado, a
 * liquidez migrada nasce num preço que não é o da curva — e a diferença é
 * arbitrada no primeiro bloco, saindo do bolso de quem comprou a moeda.
 */
contract MatematicaDaPoolTest is Test {
    function test_a_raiz_devolve_o_piso() public pure {
        assertEq(MatematicaDaPool.raiz(0), 0);
        assertEq(MatematicaDaPool.raiz(1), 1);
        assertEq(MatematicaDaPool.raiz(4), 2);
        assertEq(MatematicaDaPool.raiz(8), 2, "piso, nao arredondamento");
        assertEq(MatematicaDaPool.raiz(9), 3);
        assertEq(MatematicaDaPool.raiz(1e36), 1e18);
    }

    function testFuzz_a_raiz_nunca_passa_do_valor(uint128 x) public pure {
        uint256 r = MatematicaDaPool.raiz(x);

        /*
         * A definição de piso da raiz: r² cabe em x, e (r+1)² não. Se alguma
         * das duas falhar, o refinamento de Newton parou no lugar errado.
         */
        assertLe(r * r, uint256(x), "r ao quadrado passou do valor");
        assertGt((r + 1) * (r + 1), uint256(x), "r poderia ser maior");
    }

    /**
     * O preço de abertura bate com o da curva.
     *
     * Este é o número que decide se a liquidez nasce valendo o mesmo que a
     * última compra da curva. Errar aqui não dá erro nenhum — dá uma pool com
     * preço diferente, arbitrada no primeiro bloco.
     */
    function test_o_preco_de_abertura_reflete_as_quantidades() public pure {
        // O estado típico depois de a curva encher.
        uint256 eth = 94.59 ether;
        uint256 tokens = 206_900_000 ether;

        uint160 sqrtPreco = MatematicaDaPool.sqrtPrecoInicial(eth, tokens);

        /*
         * Desfaz a conta: (sqrtPreco / 2^96)² tem que dar tokens/eth.
         * A comparação é com folga de 0,01% porque a raiz é inteira.
         */
        /*
         * Divide ANTES de multiplicar por 1e18. O caminho direto estoura: o
         * quadrado do preço já é 1e64, e multiplicado por 1e18 passa do que
         * cabe em 256 bits.
         */
        uint256 quadrado = (uint256(sqrtPreco) * uint256(sqrtPreco)) / MatematicaDaPool.Q96;
        uint256 precoReconstruido = (quadrado * 1e18) / MatematicaDaPool.Q96;
        uint256 precoEsperado = (tokens * 1e18) / eth;

        uint256 diferenca = precoReconstruido > precoEsperado
            ? precoReconstruido - precoEsperado
            : precoEsperado - precoReconstruido;

        assertLt(diferenca * 10_000, precoEsperado, "o preco de abertura saiu da faixa de 0,01%");
    }

    function test_preco_de_um_para_um() public pure {
        uint160 sqrtPreco = MatematicaDaPool.sqrtPrecoInicial(1 ether, 1 ether);

        // Preço 1 significa raiz 1, ou seja, exatamente 2^96.
        assertEq(uint256(sqrtPreco), MatematicaDaPool.Q96, "preco 1 tem que dar 2^96 exato");
    }

    function test_quantidade_zero_nao_passa() public {
        /*
         * Pela casca, não direto: função de biblioteca interna é embutida no
         * chamador, e aí o `expectRevert` não tem uma chamada pra observar.
         */
        Casca casca = new Casca();

        vm.expectRevert(MatematicaDaPool.DivisaoPorZero.selector);
        casca.preco(0, 1 ether);
    }

    function test_a_liquidez_cabe_nas_duas_pernas() public pure {
        uint256 eth = 94.59 ether;
        uint256 tokens = 206_900_000 ether;

        uint160 sqrtPreco = MatematicaDaPool.sqrtPrecoInicial(eth, tokens);
        uint128 liquidez = MatematicaDaPool.liquidezDeFaixaCheia(sqrtPreco, eth, tokens);

        assertGt(liquidez, 0, "liquidez zerada");

        /*
         * As duas pernas têm que dar quase o mesmo: é o que prova que o preço
         * e as quantidades são coerentes entre si. Divergência grande aqui
         * significa que uma das duas contas está errada.
         */
        uint256 porEth = (eth * sqrtPreco) / MatematicaDaPool.Q96;
        uint256 porToken = (tokens * MatematicaDaPool.Q96) / sqrtPreco;

        uint256 maior = porEth > porToken ? porEth : porToken;
        uint256 menor = porEth > porToken ? porToken : porEth;

        assertLt((maior - menor) * 10_000, maior, "as duas pernas divergiram mais de 0,01%");
    }

    function test_a_faixa_cheia_alinha_com_o_espacamento() public pure {
        (int24 menor, int24 maior) = MatematicaDaPool.faixaCheia(200);

        assertEq(menor % 200, 0, "o tick de baixo precisa ser multiplo");
        assertEq(maior % 200, 0, "o de cima tambem");
        assertEq(menor, -887200);
        assertEq(maior, 887200);

        /* A pool recusa tick fora do limite absoluto; alinhar tem que encolher. */
        assertGe(menor, -887272);
        assertLe(maior, 887272);
    }

    function test_faixa_cheia_com_outros_espacamentos() public pure {
        int24[4] memory espacamentos = [int24(1), 10, 60, 200];

        for (uint256 i = 0; i < espacamentos.length; i++) {
            (int24 menor, int24 maior) = MatematicaDaPool.faixaCheia(espacamentos[i]);
            assertEq(menor % espacamentos[i], 0);
            assertEq(maior % espacamentos[i], 0);
            assertGe(menor, -887272);
            assertLe(maior, 887272);
        }
    }
}

/** Expõe a biblioteca como chamada externa, só pros testes de revert. */
contract Casca {
    function preco(uint256 a, uint256 b) external pure returns (uint160) {
        return MatematicaDaPool.sqrtPrecoInicial(a, b);
    }
}
