// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ChromaCurve} from "../src/ChromaCurve.sol";
import {ChromaToken} from "../src/ChromaToken.sol";
import {PoolKey} from "../src/UniswapV4.sol";

/**
 * Encher a curva e migrar, contra a Uniswap de verdade.
 *
 * ---------------------------------------------------------------------------
 * POR QUE CONTRA A REDE REAL
 * ---------------------------------------------------------------------------
 * A migração chama um contrato que não é nosso, com uma interface que eu
 * escrevi à mão e uma sequência de quitação que a v4 impõe. Uma imitação do
 * PoolManager aceitaria exatamente o que eu escrevi — inclusive se estivesse
 * errado. É o tipo de teste que dá confiança falsa.
 *
 * Então o teste roda sobre um fork da Robinhood Chain: o PoolManager é o que
 * está publicado lá, com o código dele. Nada é enviado à rede; o fork é local.
 *
 * ---------------------------------------------------------------------------
 * O QUE ELE PROVA
 * ---------------------------------------------------------------------------
 * Que a moeda que encheu a curva vira pool com liquidez de verdade, que o
 * dinheiro saiu da curva e entrou lá, e que ninguém — nem nós — consegue tirar.
 *
 * Sem rede, passa de lado em vez de falhar.
 */
contract MigracaoTest is Test {
    /** O PoolManager da v4 na Robinhood Chain. */
    address internal constant GERENTE = 0x8366a39CC670B4001A1121B8F6A443A643e40951;

    ChromaCurve internal curva;

    address internal autoridade = address(0xA1);
    address internal plataforma = address(0xB2);
    address internal criador = address(0xC3);
    address internal trader = address(0xE5);
    address internal estranho = address(0xF6);

    bool internal temRede;

    function setUp() public {
        try vm.createFork("robinhood") returns (uint256 id) {
            vm.selectFork(id);
            temRede = true;
        } catch {
            temRede = false;
            return;
        }

        uint256[4] memory limites = [uint256(0), 10 ether, 30 ether, 60 ether];
        uint16[4] memory faixas = [uint16(45), 55, 62, 70];

        curva = new ChromaCurve(
            autoridade,
            GERENTE,
            ChromaCurve.Parametros({
                carteiraDaPlataforma: plataforma,
                taxaTotalBps: 120,
                taxaAfiliadoBps: 30,
                pisoDaPlataformaBps: 20,
                limitesDasFaixas: limites,
                faixasDoCriadorBps: faixas,
                ethVirtualInicial: 30 ether,
                tokenVirtualInicial: 1_073_000_000 ether,
                tokenAVenda: 793_100_000 ether,
                emissaoTotal: 1_000_000_000 ether,
                taxaDeLancamento: 0,
                taxaDaPool: 10_000,
                espacamentoDaPool: 200
            })
        );

        vm.deal(trader, 100_000 ether);
        vm.deal(estranho, 1 ether);
    }

    modifier comRede() {
        if (!temRede) {
            emit log("sem rede: teste pulado");
            return;
        }
        _;
    }

    /** Lança e compra até o último token sair. */
    function _encher() internal returns (address moeda) {
        vm.prank(criador);
        moeda = curva.lancar("Moeda Vencedora", "VENCEU", "u");

        for (uint256 i = 0; i < 40; i++) {
            (,,,, uint256 restam,, bool cheia,) = curva.curvas(moeda);
            if (cheia || restam == 0) break;

            vm.prank(trader);
            curva.comprar{value: 20 ether}(moeda, 0, address(0));
        }
    }

    function test_a_moeda_que_encheu_a_curva_vira_pool() public comRede {
        address moeda = _encher();

        (,,, uint256 ethNaCurva,,, bool cheia,) = curva.curvas(moeda);
        assertTrue(cheia, "a curva precisava ter enchido");
        assertGt(ethNaCurva, 0, "e ter arrecadado");

        uint256 tokensParaPool = ChromaToken(moeda).balanceOf(address(curva));
        assertGt(tokensParaPool, 0, "e ter sobrado token pra pool");

        uint256 ethAntesNoGerente = GERENTE.balance;

        /*
         * Quem migra é uma carteira ALEATÓRIA, sem relação com a plataforma nem
         * com quem lançou. É a prova de que a migração é aberta: se dependesse
         * de nós, uma chave perdida prenderia dinheiro de terceiros.
         */
        vm.prank(estranho);
        curva.migrar(moeda);

        (,,, uint256 ethDepois,,,, bool migrada) = curva.curvas(moeda);
        assertTrue(migrada, "a curva ficou marcada como migrada");
        assertEq(ethDepois, 0, "e sem ETH registrado");

        /*
         * O dinheiro saiu da curva e entrou no gerente de pools. A folga é
         * porque a liquidez é inteira: sobra um resto minúsculo, que fica
         * travado aqui junto com ela.
         */
        uint256 entrouNoGerente = GERENTE.balance - ethAntesNoGerente;
        assertGt(entrouNoGerente, (ethNaCurva * 99) / 100, "quase todo o ETH foi pra pool");

        uint256 tokensNoGerente = ChromaToken(moeda).balanceOf(GERENTE);
        assertGt(tokensNoGerente, (tokensParaPool * 99) / 100, "e quase todo o token tambem");
    }

    function test_migrar_duas_vezes_nao_pode() public comRede {
        address moeda = _encher();

        vm.prank(estranho);
        curva.migrar(moeda);

        vm.prank(estranho);
        vm.expectRevert(ChromaCurve.JaMigrou.selector);
        curva.migrar(moeda);
    }

    function test_nao_da_pra_migrar_curva_que_nao_encheu() public comRede {
        vm.prank(criador);
        address moeda = curva.lancar("Ainda Nao", "NAO", "u");

        vm.prank(trader);
        curva.comprar{value: 1 ether}(moeda, 0, address(0));

        vm.prank(estranho);
        vm.expectRevert(ChromaCurve.CurvaNaoConcluida.selector);
        curva.migrar(moeda);
    }

    /**
     * Ninguém consegue tirar a liquidez.
     *
     * A garantia não é uma promessa nossa: é a AUSÊNCIA de código. O contrato
     * não tem função que remova posição, então nem a autoridade tem como.
     *
     * O teste confirma o que dá pra confirmar: depois de migrar, a curva não
     * tem mais nem ETH nem token, e a chamada de volta que a v4 usa pra deixar
     * mexer nas pools recusa qualquer um que não seja ela mesma.
     */
    function test_ninguem_tira_a_liquidez() public comRede {
        address moeda = _encher();

        vm.prank(estranho);
        curva.migrar(moeda);

        /*
         * Sobra troco, e é esperado: a liquidez é um número inteiro, então ela
         * quase nunca consome as duas quantidades até o último wei. Na prática
         * ficam alguns milhares de wei — bilionésimos de centavo.
         *
         * O troco NÃO é um problema: fica travado aqui junto com a liquidez,
         * porque este contrato não tem função de saque. O limite abaixo existe
         * pra que uma sobra de verdade — sinal de conta errada — apareça.
         */
        assertLt(address(curva).balance, 1e12, "sobrou ETH demais na curva");
        assertLt(
            ChromaToken(moeda).balanceOf(address(curva)),
            1e15,
            "sobrou token relevante na curva"
        );

        /*
         * A porta dos fundos: se qualquer um pudesse chamar o retorno do
         * `unlock`, faria o contrato operar a pool por conta própria.
         */
        vm.prank(estranho);
        vm.expectRevert(ChromaCurve.NaoAutorizado.selector);
        curva.unlockCallback("");

        vm.prank(autoridade);
        vm.expectRevert(ChromaCurve.NaoAutorizado.selector);
        curva.unlockCallback("");
    }

    function test_a_pool_fica_no_endereco_que_a_tela_mostra() public comRede {
        address moeda = _encher();

        PoolKey memory chave = curva.chaveDaPool(moeda);

        /*
         * A moeda nativa é o endereço zero e tem que vir em PRIMEIRO. Fora de
         * ordem, a chave aponta pra outra pool — sem erro, só no lugar errado,
         * com o dinheiro dentro.
         */
        assertEq(chave.currency0, address(0), "a moeda nativa vem primeiro");
        assertEq(chave.currency1, moeda, "e a moeda em segundo");
        assertEq(chave.fee, 10_000);
        assertEq(chave.tickSpacing, int24(200));
        assertEq(chave.hooks, address(0), "sem hook: nada roda no meio do swap");
    }
}
