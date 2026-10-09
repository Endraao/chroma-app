// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ChromaBnb} from "./ChromaBnb.sol";
import {ChromaToken} from "./ChromaToken.sol";
import {IVault, ICLPoolManager, PoolKey, Saldo, SwapParams} from "./InfinityCL.sol";

/**
 * COMPRA E VENDA DAS MOEDAS DO ChromaBnb (pedido do dono, 09/10/2026).
 *
 * Troca direto na pool da PancakeSwap Infinity de cada moeda — a mesma em
 * que PancakeSwap, GMGN e bots negociam. Paga a taxa da pool como qualquer
 * um (anti-sniper nos 5 primeiros minutos, 1% depois, toda pro criador).
 *
 * - Não guarda nada: o BNB e as moedas passam direto entre a pessoa e a pool.
 * - Proteção de preço: `minimo` (o que a tela calculou menos o slippage).
 * - `cotar` simula a troca e desfaz (padrão "quoter"): a tela mostra quanto
 *   a pessoa recebe sem precisar de aprovação nem saldo.
 * - Sem dono, sem nada que se mude depois do deploy.
 */
contract ChromaBnbTroca {
    using Saldo for int256;

    error SoOCofre();
    error MoedaDesconhecida();
    error RecebeuMenosQueOMinimo(uint256 recebeu, uint256 minimo);
    error Cotacao(uint256 saida);
    error FalhaAoPagar();

    event Trocou(address indexed moeda, address indexed quem, bool compra, uint256 entrada, uint256 saida);

    uint160 private constant MENOR_SQRT = 4295128740;
    uint160 private constant MAIOR_SQRT = 1461446703485210103287273052203988822378723970341;

    IVault public immutable COFRE;
    ICLPoolManager public immutable GERENTE;
    ChromaBnb public immutable LANCADOR;

    enum Acao {
        Comprar,
        Vender,
        Cotar
    }

    constructor(address lancador) {
        LANCADOR = ChromaBnb(lancador);
        COFRE = LANCADOR.COFRE();
        GERENTE = LANCADOR.GERENTE();
    }

    /** Compra com o BNB enviado. As moedas vão pra quem chamou. */
    function comprar(address moeda, uint256 minimo) external payable returns (uint256 tokens) {
        _conhecida(moeda);
        tokens = abi.decode(COFRE.lock(abi.encode(Acao.Comprar, moeda, msg.sender, msg.value, minimo)), (uint256));
        emit Trocou(moeda, msg.sender, true, msg.value, tokens);
    }

    /** Vende `quantidade` (precisa de approve pra este contrato). O BNB vai pra quem chamou. */
    function vender(address moeda, uint256 quantidade, uint256 minimo) external returns (uint256 bnb) {
        _conhecida(moeda);
        bnb = abi.decode(COFRE.lock(abi.encode(Acao.Vender, moeda, msg.sender, quantidade, minimo)), (uint256));
        emit Trocou(moeda, msg.sender, false, quantidade, bnb);
    }

    /** Quanto sai de uma compra (`compra`) ou venda, agora, com a taxa de agora. Chamar com eth_call. */
    function cotar(address moeda, bool compra, uint256 quantidade) external returns (uint256 saida) {
        _conhecida(moeda);
        try COFRE.lock(abi.encode(Acao.Cotar, moeda, address(0), quantidade, compra ? 1 : 0)) {
            // nunca chega aqui: a cotação sempre desfaz
        } catch (bytes memory erro) {
            if (erro.length != 36 || bytes4(erro) != Cotacao.selector) {
                assembly ("memory-safe") {
                    revert(add(erro, 32), mload(erro))
                }
            }
            assembly ("memory-safe") {
                saida := mload(add(erro, 36))
            }
        }
    }

    function lockAcquired(bytes calldata dados) external returns (bytes memory) {
        if (msg.sender != address(COFRE)) revert SoOCofre();
        (Acao acao, address moeda, address quem, uint256 quantidade, uint256 extra) =
            abi.decode(dados, (Acao, address, address, uint256, uint256));
        PoolKey memory chave = LANCADOR.chaveDaPool(moeda);

        bool compra = acao == Acao.Comprar || (acao == Acao.Cotar && extra == 1);
        int256 d = GERENTE.swap(
            chave,
            SwapParams({
                zeroForOne: compra,
                amountSpecified: -int256(quantidade),
                sqrtPriceLimitX96: compra ? MENOR_SQRT : MAIOR_SQRT
            }),
            ""
        );
        uint256 entrou = uint256(-int256(compra ? d.moeda0() : d.moeda1()));
        uint256 saiu = uint256(int256(compra ? d.moeda1() : d.moeda0()));

        if (acao == Acao.Cotar) revert Cotacao(saiu);
        if (saiu < extra) revert RecebeuMenosQueOMinimo(saiu, extra);

        if (compra) {
            COFRE.settle{value: entrou}();
            COFRE.take(moeda, quem, saiu);
            // Sobra (a pool não absorveu tudo — só se a liquidez acabar): devolve.
            if (quantidade > entrou) _pagar(quem, quantidade - entrou);
        } else {
            COFRE.sync(moeda);
            ChromaToken(moeda).transferFrom(quem, address(COFRE), entrou);
            COFRE.settle();
            COFRE.take(address(0), quem, saiu);
        }
        return abi.encode(saiu);
    }

    function _conhecida(address moeda) private view {
        (address criador,,) = LANCADOR.lancamentos(moeda);
        if (criador == address(0)) revert MoedaDesconhecida();
    }

    function _pagar(address para, uint256 quanto) private {
        (bool ok,) = para.call{value: quanto}("");
        if (!ok) revert FalhaAoPagar();
    }
}
