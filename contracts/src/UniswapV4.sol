// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/**
 * O pedaço da Uniswap v4 que a migração usa.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A INTERFACE É ESCRITA À MÃO
 * ---------------------------------------------------------------------------
 * Trazer os pacotes da Uniswap como dependência puxaria dezenas de arquivos pra
 * usar cinco funções — e este projeto mantém `ignore-scripts=true` justamente
 * por desconfiar de dependência que ninguém lê.
 *
 * O preço é que a interface precisa estar certa. Ela foi conferida contra a
 * rede: os eventos `Initialize` e `ModifyLiquidity` do PoolManager da Robinhood
 * Chain têm as assinaturas padrão (163 e 2686 deles nos últimos 5000 blocos),
 * então o fork daquela rede mexeu no roteador, não aqui.
 */

/**
 * A identidade de uma pool.
 *
 * Os dois ativos vêm ORDENADOS por endereço, e a moeda nativa é o endereço
 * zero — que é sempre o menor, então ela é sempre o `currency0`. Fora de ordem,
 * a chave aponta pra outra pool; não dá erro, só vai pro lugar errado.
 */
struct PoolKey {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

struct ModifyLiquidityParams {
    int24 tickLower;
    int24 tickUpper;
    int256 liquidityDelta;
    bytes32 salt;
}

interface IPoolManager {
    /** Abre a pool num preço. Só funciona uma vez por chave. */
    function initialize(PoolKey memory key, uint160 sqrtPriceX96) external returns (int24 tick);

    /**
     * Abre a janela em que dá pra mexer nas pools.
     *
     * A v4 não deixa mexer direto: ela chama de volta o `unlockCallback` de
     * quem pediu, e só ali dentro as operações valem. No fim da janela, tudo
     * que foi movimentado precisa estar quitado — senão a transação inteira
     * volta atrás.
     */
    function unlock(bytes calldata data) external returns (bytes memory);

    /**
     * Põe ou tira liquidez.
     *
     * O retorno é um par de saldos empacotado num inteiro: os 128 bits altos
     * são do primeiro ativo, os baixos do segundo. Negativo significa que
     * DEVEMOS aquilo à pool.
     */
    function modifyLiquidity(
        PoolKey memory key,
        ModifyLiquidityParams memory params,
        bytes calldata hookData
    ) external returns (int256 callerDelta, int256 feesAccrued);

    /**
     * Marca quanto do ativo já estava na pool antes de mandarmos mais.
     *
     * Sem isto o `settle` não tem com o que comparar e a pool não reconhece o
     * depósito. Não vale pra moeda nativa, que chega junto com a chamada.
     */
    function sync(address currency) external;

    /** Quita o que devemos. Pra moeda nativa, o valor vai junto. */
    function settle() external payable returns (uint256 paid);

    /** Retira o que a pool nos deve. */
    function take(address currency, address to, uint256 amount) external;
}

/** Quem chama `unlock` precisa implementar isto. */
interface IUnlockCallback {
    function unlockCallback(bytes calldata data) external returns (bytes memory);
}

/** Separa o par de saldos empacotado que a v4 devolve. */
library Saldos {
    /** Os 128 bits altos: o primeiro ativo. */
    function primeiro(int256 delta) internal pure returns (int128) {
        return int128(delta >> 128);
    }

    /** Os 128 bits baixos: o segundo ativo. */
    function segundo(int256 delta) internal pure returns (int128) {
        return int128(int256(uint256(uint128(uint256(delta)))));
    }

    /**
     * Quanto devemos, em positivo.
     *
     * Saldo negativo é dívida nossa com a pool; positivo é crédito. A migração
     * só deposita, então o normal é dívida — mas a sobra de arredondamento
     * pode voltar como crédito, e aí é `take` em vez de `settle`.
     */
    function divida(int128 saldo) internal pure returns (uint256) {
        return saldo < 0 ? uint256(uint128(-saldo)) : 0;
    }

    function credito(int128 saldo) internal pure returns (uint256) {
        return saldo > 0 ? uint256(uint128(saldo)) : 0;
    }
}
