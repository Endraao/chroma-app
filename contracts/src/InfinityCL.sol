// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/*
 * O pedaço da PancakeSwap Infinity (pools CL da BNB Chain) que o lançador da
 * BNB usa — escrito à mão a partir da interface pública, só com o que é
 * chamado. Endereços na BNB Chain (docs da PancakeSwap, 09/10/2026):
 *   Vault          0x238a358808379702088667322f80aC48bAd5e6c4
 *   CLPoolManager  0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b
 *
 * Convenções que importam (iguais às da Uniswap v4):
 * - a moeda 0 é a de endereço menor; BNB nativo é address(0), sempre a 0;
 * - `amountSpecified` NEGATIVO = entrada exata;
 * - o saldo é um par de int128 num int256: moeda 0 nos 128 bits de cima;
 *   negativo = quem chamou deve ao cofre, positivo = o cofre deve a ele.
 */

struct PoolKey {
    address currency0;
    address currency1;
    address hooks;
    address poolManager;
    uint24 fee;
    bytes32 parameters;
}

struct ModifyLiquidityParams {
    int24 tickLower;
    int24 tickUpper;
    int256 liquidityDelta;
    bytes32 salt;
}

struct SwapParams {
    bool zeroForOne;
    int256 amountSpecified;
    uint160 sqrtPriceLimitX96;
}

interface ICLPoolManager {
    function initialize(PoolKey memory key, uint160 sqrtPriceX96) external returns (int24 tick);

    function modifyLiquidity(PoolKey memory key, ModifyLiquidityParams memory params, bytes calldata hookData)
        external
        returns (int256 delta, int256 feeDelta);

    function swap(PoolKey memory key, SwapParams memory params, bytes calldata hookData)
        external
        returns (int256 delta);
}

interface IVault {
    function lock(bytes calldata data) external returns (bytes memory);
    function sync(address currency) external;
    function settle() external payable returns (uint256 paid);
    function take(address currency, address to, uint256 amount) external;
}

library Saldo {
    function moeda0(int256 d) internal pure returns (int128 r) {
        assembly ("memory-safe") {
            r := sar(128, d)
        }
    }

    function moeda1(int256 d) internal pure returns (int128 r) {
        assembly ("memory-safe") {
            r := signextend(15, d)
        }
    }
}
