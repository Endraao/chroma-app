// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

/**
 * O que existe de verdade na Robinhood Chain.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ESTE ARQUIVO EXISTE
 * ---------------------------------------------------------------------------
 * A migração vai chamar contratos que não são nossos, num endereço que eu li em
 * documentação. Documentação erra e endereço canônico de uma rede pode ter
 * OUTRA coisa em outra — foi o que aconteceu aqui: os endereços canônicos da
 * Uniswap v3 têm um contrato qualquer nesta rede, não a Uniswap.
 *
 * Estes testes rodam contra o estado REAL da rede (fork) e falham se o que está
 * lá deixar de ser o que a gente espera. É a diferença entre "o endereço que eu
 * anotei" e "o endereço que responde".
 *
 * Só rodam quando há rede: sem ela, passam de lado em vez de falhar, pra não
 * quebrar o build de quem está offline.
 */
contract RedeTest is Test {
    /** A v4 é onde está a liquidez: 612 swaps contra 2 da v3 nos mesmos 200 blocos. */
    address internal constant POOL_MANAGER = 0x8366a39CC670B4001A1121B8F6A443A643e40951;

    /**
     * A factory v3 REAL desta rede.
     *
     * Descoberta chamando `factory()` numa pool que existe, não copiada de
     * documentação. O endereço canônico da Uniswap (`0x1F98431c…`) tem outro
     * contrato aqui.
     */
    address internal constant FACTORY_V3 = 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA;

    uint256 internal fork;
    bool internal temRede;

    function setUp() public {
        try vm.createFork("robinhood") returns (uint256 id) {
            fork = id;
            vm.selectFork(id);
            temRede = true;
        } catch {
            temRede = false;
        }
    }

    modifier comRede() {
        if (!temRede) {
            emit log("sem rede: teste pulado");
            return;
        }
        _;
    }

    function test_o_pool_manager_da_v4_esta_la() public comRede {
        assertGt(POOL_MANAGER.code.length, 1000, "PoolManager sem codigo no endereco esperado");
    }

    function test_a_factory_v3_que_descobrimos_esta_la() public comRede {
        assertGt(FACTORY_V3.code.length, 1000, "factory v3 sem codigo");
    }

    /**
     * O endereço canônico da Uniswap NÃO é a Uniswap aqui.
     *
     * Este teste existe pra documentar a armadilha: se um dia ele falhar porque
     * a Uniswap publicou no endereço canônico, ótimo — mas alguém precisa
     * olhar, não assumir.
     */
    function test_o_endereco_canonico_nao_e_a_uniswap_nesta_rede() public comRede {
        address canonico = 0x1F98431c8aD98523631AE4a59f267346ea31F984;

        // Tem código, mas não é a factory: `owner()` da Uniswap responderia.
        (bool ok, bytes memory dados) = canonico.staticcall(abi.encodeWithSignature("owner()"));

        assertFalse(
            ok && dados.length == 32,
            "o endereco canonico passou a responder como Uniswap: conferir antes de usar"
        );
    }
}
