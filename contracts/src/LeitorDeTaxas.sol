// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ChromaBnb} from "./ChromaBnb.sol";
import {ChromaToken} from "./ChromaToken.sol";

/**
 * NUNCA É PUBLICADO (09/10/2026). O servidor usa o código dele numa chamada
 * simulada (eth_call com "state override"): ele chama `coletar` e devolve
 * quanto o criador receberia — em BNB e em moeda — sem mudar nada na rede.
 * É assim que a página mostra "Coletar taxas (≈ US$ …)" antes do clique.
 */
contract LeitorDeTaxas {
    function ler(address lancador, address moeda) external returns (uint256 bnb, uint256 tokens) {
        (address criador,,) = ChromaBnb(lancador).lancamentos(moeda);
        uint256 b0 = criador.balance;
        uint256 t0 = ChromaToken(moeda).balanceOf(criador);
        ChromaBnb(lancador).coletar(moeda);
        bnb = criador.balance - b0;
        tokens = ChromaToken(moeda).balanceOf(criador) - t0;
    }
}
