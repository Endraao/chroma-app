// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {ChromaCurve} from "../src/ChromaCurve.sol";
import {ChromaRouter} from "../src/ChromaRouter.sol";

/**
 * Publica a curva e o roteador na Robinhood Chain (ou num fork dela).
 *
 * ---------------------------------------------------------------------------
 * POR QUE OS NÚMEROS NÃO SÃO ARGUMENTOS DE LINHA DE COMANDO
 * ---------------------------------------------------------------------------
 * São os mesmos de `src/lib/fees.ts` e de `contracts/test/ChromaCurve.t.sol`,
 * escritos aqui uma vez. Taxa de produção passada na mão, na pressa de
 * publicar, é o tipo de erro que só aparece quando alguém já pagou a mais — e
 * a taxa de criador de uma moeda é IMUTÁVEL depois do lançamento.
 *
 * O que muda por execução vem do ambiente, e só o que de fato muda: quem
 * administra, quem recebe a fatia da plataforma e onde está o PoolManager.
 *
 * ---------------------------------------------------------------------------
 * AS FAIXAS SÃO AS DE PRODUÇÃO, NÃO AS DO TESTE
 * ---------------------------------------------------------------------------
 * O teste usa limites baixos (10/30/60 ETH) de propósito, para que a troca de
 * faixa aconteça antes da curva encher e possa ser observada. Em produção os
 * limites acompanham os da Solana: os equivalentes de $100 mil, $500 mil e
 * $2 milhões, convertidos para ETH.
 *
 * Copiar os limites do teste para cá faria toda moeda nascer já na última
 * faixa, e a plataforma receberia o piso desde o primeiro trade.
 *
 * ---------------------------------------------------------------------------
 * COMO RODAR
 * ---------------------------------------------------------------------------
 *   npm run contracts:publicar:local    # contra o anvil, de graça
 *   npm run contracts:publicar          # contra a rede de verdade
 */
contract Publicar is Script {
    /* Os números da Robinhood Chain, iguais aos de `src/lib/fees.ts`. */
    uint16 internal constant TAXA_TOTAL_BPS = 120;
    uint16 internal constant TAXA_AFILIADO_BPS = 30;
    uint16 internal constant PISO_PLATAFORMA_BPS = 20;

    uint256 internal constant EMISSAO = 1_000_000_000 ether;
    uint256 internal constant A_VENDA = 793_100_000 ether;
    uint256 internal constant ETH_VIRTUAL = 30 ether;
    uint256 internal constant TOKEN_VIRTUAL = 1_073_000_000 ether;

    /** Cobrado de quem lança. Igual ao PONS, e igual a `NEXT_PUBLIC_LAUNCH_FEE_ETH`. */
    uint256 internal constant TAXA_DE_LANCAMENTO = 0.0005 ether;

    /*
     * 1% de taxa e espaçamento 200: o par que a v4 usa pra moeda volátil.
     * Tem que bater com o que `MatematicaDaPool` assume ao calcular a posição
     * de faixa cheia na migração.
     */
    uint24 internal constant TAXA_DA_POOL = 10_000;
    int24 internal constant ESPACAMENTO_DA_POOL = 200;

    /*
     * Endereços confirmados on-chain na rede 4663 — ver a tabela no README e
     * `contracts/test/Rede.t.sol`, que falha se algum deles mudar.
     *
     * O UniversalRouter é para onde o ChromaRouter repassa o swap depois de
     * descontar a taxa. Ele NÃO é usado pela curva: moeda na curva não passa
     * por DEX nenhuma.
     */
    address internal constant POOL_MANAGER = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address internal constant UNIVERSAL_ROUTER = 0x06AfBA43Fd06227fA663b0DAecF536f6EaA6bf99;

    function run() external {
        address autoridade = vm.envAddress("CHROMA_AUTORIDADE");
        address plataforma = vm.envAddress("CHROMA_CARTEIRA_PLATAFORMA");

        /*
         * O PoolManager é configurável só para o fork local poder apontar para
         * uma cópia. Na rede de verdade o padrão é o endereço conferido acima,
         * e mandar a liquidez para um contrato errado é irreversível.
         */
        address gerenteDaPool = vm.envOr("CHROMA_POOL_MANAGER", POOL_MANAGER);
        address roteador = vm.envOr("CHROMA_UNIVERSAL_ROUTER", UNIVERSAL_ROUTER);

        /*
         * Faixas de produção, em ETH.
         *
         * São os equivalentes de $100 mil, $500 mil e $2 milhões de volume
         * acumulado. Em ETH e não em dólar porque o contrato não tem como
         * saber a cotação sem um oráculo — e amarrar cada compra a um oráculo
         * faz a compra falhar quando ele falhar.
         */
        uint256[4] memory limites = [uint256(0), 25 ether, 125 ether, 500 ether];
        uint16[4] memory faixas = [uint16(45), 55, 62, 70];

        vm.startBroadcast();

        ChromaCurve curva = new ChromaCurve(
            autoridade,
            gerenteDaPool,
            ChromaCurve.Parametros({
                carteiraDaPlataforma: plataforma,
                taxaTotalBps: TAXA_TOTAL_BPS,
                taxaAfiliadoBps: TAXA_AFILIADO_BPS,
                pisoDaPlataformaBps: PISO_PLATAFORMA_BPS,
                limitesDasFaixas: limites,
                faixasDoCriadorBps: faixas,
                ethVirtualInicial: ETH_VIRTUAL,
                tokenVirtualInicial: TOKEN_VIRTUAL,
                tokenAVenda: A_VENDA,
                emissaoTotal: EMISSAO,
                /*
                 * TEM QUE BATER COM `NEXT_PUBLIC_LAUNCH_FEE_ETH`.
                 *
                 * O contrato recusa a transação se o valor enviado não for
                 * exatamente este, e quem envia é o site. Divergir aqui faz
                 * todo lançamento falhar — ou, pior, faz a página de taxas
                 * anunciar um preço que o contrato não cobra.
                 *
                 * 0,0005 ETH é o mesmo do PONS, o concorrente desta rede.
                 */
                taxaDeLancamento: TAXA_DE_LANCAMENTO,
                taxaDaPool: TAXA_DA_POOL,
                espacamentoDaPool: ESPACAMENTO_DA_POOL
            })
        );

        /*
         * O roteador cobra a taxa de swap de moeda que NÃO é da curva — a de
         * fora, roteada pela Uniswap. Por isso a fatia do criador é zero aqui:
         * não existe criador nosso nessas moedas. É a mesma regra de
         * `swapFeeBps()` em `src/lib/fees.ts`.
         */
        ChromaRouter router = new ChromaRouter(
            roteador,
            autoridade,
            plataforma,
            TAXA_TOTAL_BPS - 45, // sem a fatia do criador da primeira faixa
            TAXA_AFILIADO_BPS,
            0,
            PISO_PLATAFORMA_BPS
        );

        vm.stopBroadcast();

        console.log("");
        console.log("=== publicado ===");
        console.log("ChromaCurve   ", address(curva));
        console.log("ChromaRouter  ", address(router));
        console.log("PoolManager   ", gerenteDaPool);
        console.log("autoridade    ", autoridade);
        console.log("plataforma    ", plataforma);
        console.log("");
        console.log("Ponha no .env.local:");
        console.log("NEXT_PUBLIC_CHROMA_CURVE_EVM=%s", address(curva));
        console.log("NEXT_PUBLIC_CHROMA_ROUTER_EVM=%s", address(router));
        console.log("");
    }
}
