// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ChromaCurve} from "../src/ChromaCurve.sol";

/**
 * A mesma moeda vale a mesma coisa nas duas redes.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO PRECISA SER TESTADO
 * ---------------------------------------------------------------------------
 * A curva existe duas vezes: em Rust na Solana e em Solidity aqui. São
 * linguagens e máquinas virtuais diferentes escrevendo a mesma conta. Nada além
 * de um teste impede que uma delas mude e a outra não.
 *
 * Se divergissem, a mesma moeda entregaria quantidades diferentes dependendo de
 * onde a pessoa comprou — e não haveria explicação aceitável pra isso.
 *
 * ---------------------------------------------------------------------------
 * DE ONDE VÊM OS NÚMEROS ESPERADOS
 * ---------------------------------------------------------------------------
 * De `node scripts/gerar-paridade.mjs`, que roda o MESMO código que a tela usa
 * pra cotar na Solana — e que o `test:programa` já prova ser idêntico ao Rust,
 * comparando contra o programa rodando de verdade.
 *
 * Mexeu na curva de um dos lados? Rode o gerador de novo. Se os números mudarem,
 * os dois lados precisavam mudar juntos.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A IGUALDADE NÃO É EXATA
 * ---------------------------------------------------------------------------
 * Na Solana a moeda tem 6 casas e o SOL tem 9; aqui a moeda tem 18 e o ETH tem
 * 18. A conta é a mesma, mas a granularidade do arredondamento não: arredondar
 * pra cima em passos de 1e-18 sobra menos do que em passos de 1e-6.
 *
 * A diferença é de no máximo UMA unidade na escala da Solana — um milionésimo
 * de token, sobre dezenas de milhões. O teste aceita exatamente essa margem e
 * recusa qualquer coisa além.
 */
contract ParidadeTest is Test {
    ChromaCurve internal curva;

    address internal autoridade = address(0xA1);
    address internal plataforma = address(0xB2);
    address internal criador = address(0xC3);
    address internal trader = address(0xE5);

    /** Uma unidade na escala da Solana, escrita na escala daqui. */
    uint256 internal constant UMA_UNIDADE_SOLANA = 1e12;

    function setUp() public {
        uint256[4] memory limites = [uint256(0), 900 ether, 4_500 ether, 18_000 ether];
        uint16[4] memory faixas = [uint16(30), 45, 60, 75];

        /*
         * A configuração da SOLANA, não a da Robinhood.
         *
         * A taxa total de lá é 1,25% e a de cá é 1,20% — diferença de produto,
         * decidida por rede. O que este teste compara é a CURVA, então os dois
         * lados precisam usar a mesma taxa; senão estaríamos medindo a decisão
         * comercial, não a matemática.
         */
        curva = new ChromaCurve(
            autoridade,
            ChromaCurve.Parametros({
                carteiraDaPlataforma: plataforma,
                taxaTotalBps: 125,
                taxaAfiliadoBps: 30,
                pisoDaPlataformaBps: 20,
                limitesDasFaixas: limites,
                faixasDoCriadorBps: faixas,
                ethVirtualInicial: 30 ether,
                tokenVirtualInicial: 1_073_000_000 ether,
                tokenAVenda: 793_100_000 ether,
                emissaoTotal: 1_000_000_000 ether,
                taxaDeLancamento: 0
            })
        );

        vm.deal(trader, 1_000 ether);
    }

    function _lancar() internal returns (address) {
        vm.prank(criador);
        return curva.lancar("Paridade", "PAR", "u");
    }

    function test_a_compra_entrega_o_mesmo_que_na_solana() public {
        address moeda = _lancar();

        /* Gerado por `node scripts/gerar-paridade.mjs`. Não editar à mão. */
        uint256[6] memory gastoEmWei = [
            uint256(10000000000000000),
            uint256(100000000000000000),
            uint256(1000000000000000000),
            uint256(5000000000000000000),
            uint256(25000000000000000000),
            uint256(80000000000000000000)
        ];

        /* O que a curva da Solana entrega, convertido pra 18 casas. */
        uint256[6] memory tokensEsperados = [
            uint256(353079611294000000000000),
            uint256(3520370447277000000000000),
            uint256(34194029850746000000000000),
            uint256(151640429338103000000000000),
            uint256(484382857142857000000000000),
            uint256(777678899082568000000000000)
        ];

        /*
         * Cada caso parte da curva NOVA, porque os números do gerador são todos
         * a partir do estado de largada. Comprar em sequência mudaria a reserva
         * e a comparação deixaria de fazer sentido.
         */
        for (uint256 i = 0; i < gastoEmWei.length; i++) {
            uint256 daEvm = curva.cotarCompra(moeda, gastoEmWei[i]);
            uint256 daSolana = tokensEsperados[i];

            uint256 diferenca = daEvm > daSolana ? daEvm - daSolana : daSolana - daEvm;

            assertLe(
                diferenca,
                UMA_UNIDADE_SOLANA,
                "a curva das duas redes divergiu alem do arredondamento"
            );
        }
    }

    function test_a_venda_devolve_o_mesmo_que_na_solana() public {
        address moeda = _lancar();

        // venda de 1.000.000 tokens -> 0.027583798 SOL
        uint256 vendaTokens = 1000000000000000000000000;
        uint256 esperadoEmWei = 27583798000000000;

        uint256 daEvm = curva.cotarVenda(moeda, vendaTokens);

        uint256 diferenca =
            daEvm > esperadoEmWei ? daEvm - esperadoEmWei : esperadoEmWei - daEvm;

        /*
         * Aqui a margem é em WEI, não em token: a saída é ETH. Uma unidade na
         * escala do SOL (1 lamport) são 1e9 wei.
         */
        assertLe(diferenca, 1e9, "a venda divergiu entre as redes");
    }

    /**
     * O preço de largada é o mesmo nas duas redes.
     *
     * É a checagem mais simples e a que pega o erro mais grosso: reservas
     * virtuais configuradas fora de escala. Um zero a mais aqui faria a moeda
     * nascer valendo mil vezes menos numa das redes, e todo o resto da curva
     * herdaria o erro.
     */
    function test_o_preco_de_largada_e_o_mesmo() public view {
        uint256 ethVirtual = curva.ethVirtualInicial();
        uint256 tokenVirtual = curva.tokenVirtualInicial();

        /*
         * Na Solana: 30 SOL virtuais contra 1,073 bilhão de tokens. A razão é
         * o preço inicial, e é ela que precisa bater — não os números brutos,
         * que estão em escalas diferentes.
         *
         * 1e18 de multiplicador pra não perder as casas na divisão inteira.
         */
        /*
         * A comparação é em MOEDA INTEIRA por TOKEN INTEIRO, não em unidade
         * bruta. Comparar as unidades brutas daria diferença de mil vezes sem
         * que nada estivesse errado — é só o SOL ter 9 casas e o ETH ter 18.
         *
         * O 1e27 é casa decimal pra divisão inteira não zerar o resultado.
         */
        uint256 razaoDaqui = (ethVirtual * 1e27) / tokenVirtual;

        uint256 solVirtualEmLamports = uint256(30) * 1e9;
        uint256 tokenVirtualEmCasas6 = uint256(1_073_000_000) * 1e6;
        uint256 razaoDaSolana = (solVirtualEmLamports * 1e24) / tokenVirtualEmCasas6;

        assertEq(razaoDaqui, razaoDaSolana, "o preco de largada difere entre as redes");
    }
}
