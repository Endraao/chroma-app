// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {ChromaCurve} from "../src/ChromaCurve.sol";

/**
 * Ajusta o preço de largada da curva JÁ PUBLICADA, sem tocar no resto.
 *
 * A publicação usou 30 ETH virtuais, copiados dos 30 SOL da Solana: com o ETH
 * a ~US$ 2.700, toda moeda nascia valendo ~US$ 75 mil. A PONS, concorrente
 * desta rede, nasce em ~US$ 5,1 mil — medido na rede em 27/09/2026 (~1,89 ETH
 * virtuais para 1 bilhão de tokens).
 *
 * 2,032 ETH contra os mesmos 1,073 bilhão virtuais dá o mesmo preço inicial. O
 * token virtual NÃO muda: é ele que faz o preço final da curva bater com o
 * preço da pool na migração (a divisão 793,1 M à venda / 206,9 M pra pool fixa
 * 1,073 bi). Consequência: migra com ~5,76 ETH (a PONS usa 4,2).
 *
 * Vale só para moedas lançadas DEPOIS. Todo o resto é lido do contrato e
 * devolvido igual, pra que um ajuste de preço não mude taxa por descuido.
 *
 *   forge script script/Ajustar.s.sol --rpc-url robinhood --sender <autoridade>
 *
 * O dry-run gerado é assinado pela MetaMask em `/publicar`.
 */
contract Ajustar is Script {
    address internal constant CURVA = 0x3Fb52955Ba3394a237F803222110Dac5b9d01501;
    uint256 internal constant NOVO_ETH_VIRTUAL = 2.032 ether;

    function run() external {
        ChromaCurve c = ChromaCurve(payable(CURVA));

        ChromaCurve.Parametros memory p;
        p.carteiraDaPlataforma = c.carteiraDaPlataforma();
        p.taxaTotalBps = c.taxaTotalBps();
        p.taxaAfiliadoBps = c.taxaAfiliadoBps();
        p.pisoDaPlataformaBps = c.pisoDaPlataformaBps();
        for (uint256 i = 0; i < 4; i++) {
            p.limitesDasFaixas[i] = c.limitesDasFaixas(i);
            p.faixasDoCriadorBps[i] = c.faixasDoCriadorBps(i);
        }
        p.ethVirtualInicial = NOVO_ETH_VIRTUAL;
        p.tokenVirtualInicial = c.tokenVirtualInicial();
        p.tokenAVenda = c.tokenAVenda();
        p.emissaoTotal = c.emissaoTotal();
        p.taxaDeLancamento = c.taxaDeLancamento();
        p.taxaDaPool = c.taxaDaPool();
        p.espacamentoDaPool = c.espacamentoDaPool();

        vm.startBroadcast();
        c.configurar(p);
        vm.stopBroadcast();

        require(c.ethVirtualInicial() == NOVO_ETH_VIRTUAL, "nao aplicou");
        require(c.taxaTotalBps() == p.taxaTotalBps, "taxa mudou");
        require(c.taxaDeLancamento() == p.taxaDeLancamento, "taxa de lancamento mudou");
        console.log("ethVirtualInicial", c.ethVirtualInicial());
    }
}
