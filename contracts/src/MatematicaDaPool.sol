// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/**
 * As contas que a Uniswap v4 exige pra abrir uma pool.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO É UM ARQUIVO SEPARADO
 * ---------------------------------------------------------------------------
 * São funções puras, sem estado e sem chamada externa: dá pra testar cada uma
 * com números na mão, sem rede e sem pool. Misturadas na curva, só seriam
 * exercitadas junto com o resto — e um erro de arredondamento aqui aparece como
 * "a migração levou menos dinheiro do que devia", que é a pior forma de
 * descobrir.
 */
library MatematicaDaPool {
    error PrecoForaDaFaixa();
    error DivisaoPorZero();

    /** 2^96, a escala que a Uniswap usa pra preço. */
    uint256 internal constant Q96 = 0x1000000000000000000000000;

    /**
     * Limites de preço da v4. Abaixo ou acima disso a pool não aceita.
     *
     * São os mesmos da v3 e correspondem aos ticks extremos: o preço mínimo
     * representável e o máximo.
     */
    uint160 internal constant MIN_SQRT_PRECO = 4295128739;
    uint160 internal constant MAX_SQRT_PRECO = 1461446703485210103287273052203988822378723970342;

    /**
     * Raiz quadrada inteira, por Newton.
     *
     * Devolve o piso da raiz. Arredondar pra baixo aqui significa um preço
     * inicial marginalmente MENOR que o exato — a favor de quem compra, nunca
     * da pool. Num lugar onde o erro é inevitável, é pra esse lado que ele deve
     * cair.
     */
    function raiz(uint256 x) internal pure returns (uint256 r) {
        if (x == 0) return 0;

        /*
         * Chute inicial pela posição do bit mais alto: leva a raiz pra ordem de
         * grandeza certa antes de refinar, o que corta as iterações de dezenas
         * pra meia dúzia.
         */
        uint256 xx = x;
        r = 1;
        if (xx >= 0x100000000000000000000000000000000) {
            xx >>= 128;
            r <<= 64;
        }
        if (xx >= 0x10000000000000000) {
            xx >>= 64;
            r <<= 32;
        }
        if (xx >= 0x100000000) {
            xx >>= 32;
            r <<= 16;
        }
        if (xx >= 0x10000) {
            xx >>= 16;
            r <<= 8;
        }
        if (xx >= 0x100) {
            xx >>= 8;
            r <<= 4;
        }
        if (xx >= 0x10) {
            xx >>= 4;
            r <<= 2;
        }
        if (xx >= 0x4) r <<= 1;

        // Sete passos de Newton bastam pra 256 bits.
        unchecked {
            r = (r + x / r) >> 1;
            r = (r + x / r) >> 1;
            r = (r + x / r) >> 1;
            r = (r + x / r) >> 1;
            r = (r + x / r) >> 1;
            r = (r + x / r) >> 1;
            r = (r + x / r) >> 1;
        }

        // Newton pode parar uma unidade acima; o piso é o que queremos.
        uint256 abaixo = x / r;
        return r < abaixo ? r : abaixo;
    }

    /**
     * O preço de abertura da pool, no formato que a v4 espera.
     *
     * A v4 guarda a RAIZ do preço multiplicada por 2^96. Preço, pra ela, é
     * quanto do token1 vale uma unidade do token0 — aqui: quantos tokens da
     * moeda por unidade de moeda nativa.
     *
     * -------------------------------------------------------------------
     * POR QUE A CONTA É FEITA NESSA ORDEM
     * -------------------------------------------------------------------
     * O caminho direto — `raiz(quantidade1 * 2^192 / quantidade0)` — estoura:
     * 2^192 sozinho já é 6e57, e multiplicado pela quantidade de token passa do
     * que cabe em 256 bits.
     *
     * Então a escala entra em duas etapas: 1e36 antes da raiz (que vira 1e18
     * depois dela) e 2^96 depois. Sobra precisão de sobra e nada estoura.
     */
    function sqrtPrecoInicial(uint256 quantidade0, uint256 quantidade1)
        internal
        pure
        returns (uint160)
    {
        if (quantidade0 == 0) revert DivisaoPorZero();

        uint256 razao = (quantidade1 * 1e36) / quantidade0;
        uint256 sqrtPreco = (raiz(razao) * Q96) / 1e18;

        if (sqrtPreco <= MIN_SQRT_PRECO || sqrtPreco >= MAX_SQRT_PRECO) {
            revert PrecoForaDaFaixa();
        }

        return uint160(sqrtPreco);
    }

    /**
     * Quanta liquidez cabe nas duas quantidades, numa posição de faixa cheia.
     *
     * -------------------------------------------------------------------
     * POR QUE FAIXA CHEIA
     * -------------------------------------------------------------------
     * Faixa estreita renderia mais taxa por dólar, mas deixa de valer assim que
     * o preço sai dela — e aí a moeda fica sem liquidez justamente quando mais
     * se negocia. Numa liquidez que vai ficar travada pra sempre, sem ninguém
     * pra reposicionar, faixa cheia é a única escolha honesta.
     *
     * -------------------------------------------------------------------
     * POR QUE O MÍNIMO DOS DOIS
     * -------------------------------------------------------------------
     * A liquidez precisa caber nas DUAS pernas. Pegar a maior faria a pool
     * pedir mais do que temos e a transação reverter; pegar a menor deixa uma
     * sobra minúscula, que volta pra quem chamou em vez de sumir.
     */
    function liquidezDeFaixaCheia(
        uint160 sqrtPreco,
        uint256 quantidade0,
        uint256 quantidade1
    ) internal pure returns (uint128) {
        if (sqrtPreco == 0) revert DivisaoPorZero();

        /*
         * Com a faixa inteira, os limites ficam tão longe do preço atual que as
         * fórmulas gerais da Uniswap se reduzem a estas duas. Menos operação,
         * menos lugar pra estourar.
         */
        uint256 liquidez0 = (quantidade0 * sqrtPreco) / Q96;
        uint256 liquidez1 = (quantidade1 * Q96) / sqrtPreco;

        uint256 menor = liquidez0 < liquidez1 ? liquidez0 : liquidez1;
        return menor > type(uint128).max ? type(uint128).max : uint128(menor);
    }

    /**
     * Os ticks extremos que a faixa cheia usa, alinhados ao espaçamento.
     *
     * A pool só aceita tick múltiplo do próprio espaçamento. Passar o limite
     * absoluto sem alinhar faz a chamada reverter — e o erro não diz isso.
     */
    function faixaCheia(int24 espacamento) internal pure returns (int24 menor, int24 maior) {
        int24 limite = 887272;
        menor = (-limite / espacamento) * espacamento;
        maior = (limite / espacamento) * espacamento;
    }
}
