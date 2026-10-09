// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ChromaToken} from "./ChromaToken.sol";
import {MatematicaDaPool} from "./MatematicaDaPool.sol";
import {ICLPoolManager, IVault, ModifyLiquidityParams, PoolKey, Saldo, SwapParams} from "./InfinityCL.sol";

/**
 * LANÇADOR DA BNB CHAIN (pedido do dono, 09/10/2026) — modelo Clanker.
 *
 * A moeda NASCE numa pool CL da PancakeSwap Infinity (BNB nativo / moeda),
 * sem curva nossa: os bots de sniper e a GMGN enxergam no primeiro segundo,
 * porque pra eles é uma pool normal da PancakeSwap.
 *
 * - Sem liquidez em BNB: toda a emissão entra numa faixa só, ACIMA do preço
 *   inicial. Cada compra coloca BNB na pool e sobe o preço — uma curva dentro
 *   da própria DEX.
 * - Taxa anti-sniper: 50% no primeiro segundo, caindo em linha reta até 1% em
 *   5 minutos (compra E venda). Depois, 1% pra sempre.
 * - TODA a taxa (a anti-sniper e a normal) é do CRIADOR. A Chroma não fica com
 *   nada; a PancakeSwap cobra a parte dela (0,03%) por fora.
 * - A compra inicial do criador entra NA MESMA transação do lançamento, antes
 *   de qualquer bot, e paga a taxa normal.
 * - A liquidez fica travada aqui pra sempre: não existe função de retirar.
 *   Ninguém (nem o criador, nem a Chroma) consegue tirar a liquidez.
 * - Nada aqui tem dono ou pode ser mudado depois do deploy.
 */
contract ChromaBnb {
    using Saldo for int256;

    error SoOCofre();
    error SoOGerente();
    error SoEsteContrato();
    error MoedaDesconhecida();
    error NomeInvalido();
    error FalhaAoDevolver();

    event Lancou(
        address indexed moeda,
        address indexed criador,
        string nome,
        string simbolo,
        string uri,
        uint256 compraInicialBnb,
        uint256 compraInicialTokens
    );
    event Coletou(address indexed moeda, address indexed criador, uint256 bnb, uint256 tokens);

    /** Emissão de cada moeda (igual às outras redes da Chroma). */
    uint256 public constant EMISSAO = 1_000_000_000 ether;

    /** Espaçamento dos ticks da pool. */
    int24 public constant ESPACAMENTO = 60;

    /** Taxas em "pips": 1_000_000 = 100%. */
    uint24 public constant TAXA_INICIAL = 500_000; // 50%
    uint24 public constant TAXA_NORMAL = 10_000; // 1%
    uint256 public constant JANELA = 5 minutes;

    uint24 private constant TAXA_DINAMICA = 0x800000;
    uint24 private constant SOBRESCREVER_TAXA = 0x400000;

    /** Ganchos: antes de criar a pool, antes de pôr liquidez, antes de cada troca. */
    uint16 private constant GANCHOS = (1 << 0) | (1 << 2) | (1 << 6);

    int24 private constant MENOR_TICK = -887272;
    uint160 private constant MENOR_SQRT = 4295128739;
    address private constant QUEIMA = 0x000000000000000000000000000000000000dEaD;

    IVault public immutable COFRE;
    ICLPoolManager public immutable GERENTE;

    /** Valor de mercado inicial (FDV), em wei de BNB. */
    uint256 public immutable FDV_INICIAL;

    struct Lancamento {
        address criador;
        uint64 inicio;
        int24 tickTopo;
    }

    mapping(address => Lancamento) public lancamentos;

    enum Acao {
        Lancar,
        Coletar
    }

    constructor(address cofre, address gerente, uint256 fdvInicialWei) {
        COFRE = IVault(cofre);
        GERENTE = ICLPoolManager(gerente);
        FDV_INICIAL = fdvInicialWei;
    }

    /* ------------------------------------------------------------------ */
    /* Lançar                                                             */
    /* ------------------------------------------------------------------ */

    /**
     * Cria a moeda, a pool e põe toda a emissão de liquidez. O BNB enviado
     * (se houver) é a compra inicial do criador, feita aqui mesmo.
     */
    function lancar(string calldata nome, string calldata simbolo, string calldata uri)
        external
        payable
        returns (address moeda)
    {
        uint256 n = bytes(nome).length;
        uint256 s = bytes(simbolo).length;
        if (n == 0 || n > 64 || s == 0 || s > 16) revert NomeInvalido();

        ChromaToken token = new ChromaToken();
        token.iniciar(nome, simbolo, EMISSAO, address(this));
        moeda = address(token);

        // Preço = moedas por BNB. FDV inicial F → preço = EMISSAO / F.
        uint160 sqrtInicial = uint160(MatematicaDaPool.raiz((EMISSAO << 64) / FDV_INICIAL) << 64);

        lancamentos[moeda] = Lancamento({criador: msg.sender, inicio: uint64(block.timestamp), tickTopo: 0});
        int24 tick = GERENTE.initialize(_chave(moeda), sqrtInicial);
        lancamentos[moeda].tickTopo = _paraBaixo(tick);

        bytes memory r = COFRE.lock(abi.encode(Acao.Lancar, moeda, msg.sender, msg.value, sqrtInicial));
        uint256 tokensDoCriador = abi.decode(r, (uint256));

        // Sobra de arredondamento (bem menos de 1%): queimada, à vista de todos.
        uint256 resto = token.balanceOf(address(this));
        if (resto > 0) token.transfer(QUEIMA, resto);

        emit Lancou(moeda, msg.sender, nome, simbolo, uri, msg.value, tokensDoCriador);
    }

    /** Manda as taxas acumuladas da pool pro criador. Qualquer um pode chamar. */
    function coletar(address moeda) external {
        if (lancamentos[moeda].criador == address(0)) revert MoedaDesconhecida();
        COFRE.lock(abi.encode(Acao.Coletar, moeda, address(0), uint256(0), uint160(0)));
    }

    function lockAcquired(bytes calldata dados) external returns (bytes memory) {
        if (msg.sender != address(COFRE)) revert SoOCofre();
        (Acao acao, address moeda, address criador, uint256 compra, uint160 sqrtInicial) =
            abi.decode(dados, (Acao, address, address, uint256, uint160));
        return acao == Acao.Lancar ? _lancarNoCofre(moeda, criador, compra, sqrtInicial) : _coletarNoCofre(moeda);
    }

    function _lancarNoCofre(address moeda, address criador, uint256 compra, uint160 sqrtInicial)
        private
        returns (bytes memory)
    {
        PoolKey memory chave = _chave(moeda);

        // Toda a emissão numa faixa só: do menor preço possível do BNB (moeda
        // caríssima) até o preço inicial. Acima da faixa = só moeda, zero BNB.
        // A liquidez é calculada com o preço inicial, que fica no topo da
        // faixa ou um pouco acima: assim a pool nunca pede mais que a emissão.
        uint256 liquidez = (EMISSAO << 96) / sqrtInicial;
        (int256 d,) = GERENTE.modifyLiquidity(
            chave,
            ModifyLiquidityParams({
                tickLower: _menorTickUsavel(),
                tickUpper: lancamentos[moeda].tickTopo,
                liquidityDelta: int256(liquidez),
                salt: bytes32(0)
            }),
            ""
        );
        uint256 deveTokens = uint256(-int256(d.moeda1()));

        uint256 recebe;
        if (compra > 0) {
            int256 t = GERENTE.swap(
                chave,
                SwapParams({zeroForOne: true, amountSpecified: -int256(compra), sqrtPriceLimitX96: MENOR_SQRT + 1}),
                ""
            );
            uint256 pagou = uint256(-int256(t.moeda0()));
            recebe = uint256(int256(t.moeda1()));
            COFRE.settle{value: pagou}();
            if (compra > pagou) _devolver(criador, compra - pagou);
        }

        COFRE.sync(moeda);
        ChromaToken(moeda).transfer(address(COFRE), deveTokens);
        COFRE.settle();
        if (recebe > 0) COFRE.take(moeda, criador, recebe);

        return abi.encode(recebe);
    }

    function _coletarNoCofre(address moeda) private returns (bytes memory) {
        Lancamento memory l = lancamentos[moeda];
        (int256 d,) = GERENTE.modifyLiquidity(
            _chave(moeda),
            ModifyLiquidityParams({
                tickLower: _menorTickUsavel(),
                tickUpper: l.tickTopo,
                liquidityDelta: 0,
                salt: bytes32(0)
            }),
            ""
        );
        uint256 bnb = uint256(int256(d.moeda0()));
        uint256 tokens = uint256(int256(d.moeda1()));
        if (bnb > 0) COFRE.take(address(0), l.criador, bnb);
        if (tokens > 0) COFRE.take(moeda, l.criador, tokens);
        emit Coletou(moeda, l.criador, bnb, tokens);
        return "";
    }

    /* ------------------------------------------------------------------ */
    /* Ganchos da pool                                                    */
    /* ------------------------------------------------------------------ */

    function getHooksRegistrationBitmap() external pure returns (uint16) {
        return GANCHOS;
    }

    /** Só este contrato cria pools com este gancho. */
    function beforeInitialize(address sender, PoolKey calldata, uint160) external view returns (bytes4) {
        if (msg.sender != address(GERENTE)) revert SoOGerente();
        if (sender != address(this)) revert SoEsteContrato();
        return this.beforeInitialize.selector;
    }

    /** Só este contrato põe liquidez: toda a taxa da pool fica com o criador. */
    function beforeAddLiquidity(address sender, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        view
        returns (bytes4)
    {
        if (msg.sender != address(GERENTE)) revert SoOGerente();
        if (sender != address(this)) revert SoEsteContrato();
        return this.beforeAddLiquidity.selector;
    }

    function beforeSwap(address sender, PoolKey calldata chave, SwapParams calldata, bytes calldata)
        external
        view
        returns (bytes4, int256, uint24)
    {
        if (msg.sender != address(GERENTE)) revert SoOGerente();
        return (this.beforeSwap.selector, 0, taxaAgora(chave.currency1, sender) | SOBRESCREVER_TAXA);
    }

    /**
     * A taxa de agora na pool da moeda: 50% no lançamento, caindo em linha reta
     * até 1% em 5 minutos. A compra inicial do criador (feita por este
     * contrato) paga só a normal.
     */
    function taxaAgora(address moeda, address quem) public view returns (uint24) {
        if (quem == address(this)) return TAXA_NORMAL;
        uint256 passou = block.timestamp - lancamentos[moeda].inicio;
        if (passou >= JANELA) return TAXA_NORMAL;
        return uint24(TAXA_INICIAL - (uint256(TAXA_INICIAL - TAXA_NORMAL) * passou) / JANELA);
    }

    /* ------------------------------------------------------------------ */
    /* Auxiliares                                                         */
    /* ------------------------------------------------------------------ */

    /** A chave da pool da moeda (BNB nativo é sempre a moeda 0). */
    function chaveDaPool(address moeda) external view returns (PoolKey memory) {
        return _chave(moeda);
    }

    function _chave(address moeda) private view returns (PoolKey memory) {
        return PoolKey({
            currency0: address(0),
            currency1: moeda,
            hooks: address(this),
            poolManager: address(GERENTE),
            fee: TAXA_DINAMICA,
            parameters: bytes32(uint256(GANCHOS) | (uint256(uint24(ESPACAMENTO)) << 16))
        });
    }

    function _menorTickUsavel() private pure returns (int24) {
        return (MENOR_TICK / ESPACAMENTO) * ESPACAMENTO;
    }

    function _paraBaixo(int24 tick) private pure returns (int24) {
        int24 c = tick / ESPACAMENTO;
        if (tick < 0 && tick % ESPACAMENTO != 0) c--;
        return c * ESPACAMENTO;
    }

    function _devolver(address para, uint256 quanto) private {
        (bool ok,) = para.call{value: quanto}("");
        if (!ok) revert FalhaAoDevolver();
    }
}
