// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ChromaRouter} from "../src/ChromaRouter.sol";

/**
 * O que estes testes provam.
 *
 * Não é que o contrato compila — é PRA ONDE O DINHEIRO VAI, em cada caminho,
 * incluindo os caminhos que alguém mal-intencionado tentaria.
 *
 * A lista é a mesma do programa da Solana, porque as duas redes têm que se
 * comportar igual: a divisão fecha exatamente, a plataforma nunca cai abaixo do
 * piso, a pausa nunca impede vender, e ninguém consegue se passar por criador
 * nem se auto-indicar pra pagar menos.
 */

/* ------------------------------------------------------------------ */
/* Dublês                                                              */
/* ------------------------------------------------------------------ */

/** Token ERC-20 do mínimo necessário. */
contract TokenFalso {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function emitir(address para, uint256 quanto) external {
        balanceOf[para] += quanto;
    }

    function approve(address quem, uint256 quanto) external returns (bool) {
        allowance[msg.sender][quem] = quanto;
        return true;
    }

    function transfer(address para, uint256 quanto) external returns (bool) {
        balanceOf[msg.sender] -= quanto;
        balanceOf[para] += quanto;
        return true;
    }

    function transferFrom(address de, address para, uint256 quanto) external returns (bool) {
        if (de != msg.sender) allowance[de][msg.sender] -= quanto;
        balanceOf[de] -= quanto;
        balanceOf[para] += quanto;
        return true;
    }
}

/**
 * Roteador de mentira que se comporta como o da Uniswap para o que importa:
 * recebe ETH e entrega token, ou recebe token e entrega ETH.
 */
contract RoteadorFalso {
    TokenFalso public immutable TOKEN;
    /** quantos tokens entrega por wei recebido */
    uint256 public taxaDeCambio = 1000;
    /** pra onde manda o token na compra — normalmente quem pediu */
    address public destinoForcado;

    constructor(TokenFalso token) {
        TOKEN = token;
    }

    function forcarDestino(address quem) external {
        destinoForcado = quem;
    }

    /** Compra: recebe ETH, entrega token. */
    function comprarPara(address quem) external payable {
        address destino = destinoForcado == address(0) ? quem : destinoForcado;
        TOKEN.emitir(destino, msg.value * taxaDeCambio);
    }

    /** Venda: puxa token de quem chamou e devolve ETH. */
    function venderDe(address quem, uint256 quanto) external {
        TOKEN.transferFrom(quem, address(this), quanto);
        uint256 devolver = quanto / taxaDeCambio;
        (bool ok,) = msg.sender.call{value: devolver}("");
        require(ok, "sem eth");
    }

    /** Engole o ETH e não entrega nada. */
    function golpe() external payable {}

    receive() external payable {}
}

/** Tenta reentrar no router quando recebe a fatia de afiliado. */
contract AfiliadoReentrante {
    ChromaRouter public alvo;
    address public moeda;
    bool public tentou;

    function apontar(ChromaRouter r, address m) external {
        alvo = r;
        moeda = m;
    }

    receive() external payable {
        if (!tentou) {
            tentou = true;
            // Deve reverter na trava; o `try` guarda o resultado sem derrubar.
            try alvo.comprar{value: 1}(moeda, 0, "", address(0)) {} catch {}
        }
    }
}

/* ------------------------------------------------------------------ */

contract ChromaRouterTest is Test {
    ChromaRouter internal router;
    TokenFalso internal token;
    RoteadorFalso internal uniswap;

    address internal autoridade = address(0xA1);
    address internal plataforma = address(0xB2);
    address internal criador = address(0xC3);
    address internal afiliado = address(0xD4);
    address internal trader = address(0xE5);

    // 1,25% total; 0,30% afiliado; 0,30% criador; 0,20% de piso.
    uint16 internal constant TOTAL = 125;
    uint16 internal constant AFILIADO = 30;
    uint16 internal constant CRIADOR = 30;
    uint16 internal constant PISO = 20;

    function setUp() public {
        token = new TokenFalso();
        uniswap = new RoteadorFalso(token);

        router = new ChromaRouter(
            address(uniswap), autoridade, plataforma, TOTAL, AFILIADO, CRIADOR, PISO
        );

        vm.prank(autoridade);
        router.registrarCriador(address(token), criador);

        vm.deal(trader, 100 ether);
        vm.deal(address(uniswap), 100 ether);
    }

    function _rotaDeCompra(address para) internal pure returns (bytes memory) {
        return abi.encodeCall(RoteadorFalso.comprarPara, (para));
    }

    function _rotaDeVenda(uint256 quanto) internal view returns (bytes memory) {
        return abi.encodeCall(RoteadorFalso.venderDe, (address(router), quanto));
    }

    /* ---------------------------------------------------------------- */
    /* A divisão                                                        */
    /* ---------------------------------------------------------------- */

    function test_compra_reparte_a_taxa_exatamente() public {
        uint256 gasto = 10 ether;

        vm.prank(trader);
        router.comprar{value: gasto}(address(token), 0, _rotaDeCompra(trader), afiliado);

        uint256 esperadoCriador = (gasto * CRIADOR) / 10_000;
        uint256 esperadoAfiliado = (gasto * AFILIADO) / 10_000;
        uint256 esperadoTotal = (gasto * TOTAL) / 10_000;

        assertEq(criador.balance, esperadoCriador, "criador");
        assertEq(afiliado.balance, esperadoAfiliado, "afiliado");
        assertEq(
            plataforma.balance,
            esperadoTotal - esperadoCriador - esperadoAfiliado,
            "plataforma fica com o resto"
        );

        /*
         * A soma tem que fechar o total EXATO. Um wei sobrando por operação,
         * repetido, é dinheiro que some sem dono — e este contrato não tem
         * função de saque pra ir buscar depois.
         */
        assertEq(
            criador.balance + afiliado.balance + plataforma.balance,
            esperadoTotal,
            "as tres fatias fecham o total"
        );
    }

    function test_sem_afiliado_a_fatia_vai_pra_plataforma() public {
        uint256 gasto = 10 ether;

        vm.prank(trader);
        router.comprar{value: gasto}(address(token), 0, _rotaDeCompra(trader), address(0));

        uint256 total = (gasto * TOTAL) / 10_000;
        uint256 doCriador = (gasto * CRIADOR) / 10_000;

        assertEq(afiliado.balance, 0, "afiliado nao recebe");
        assertEq(plataforma.balance, total - doCriador, "plataforma absorve a fatia");
    }

    function test_moeda_sem_criador_registrado_nao_inventa_um() public {
        TokenFalso outra = new TokenFalso();
        RoteadorFalso outroUni = new RoteadorFalso(outra);
        vm.deal(address(outroUni), 10 ether);

        ChromaRouter r2 = new ChromaRouter(
            address(outroUni), autoridade, plataforma, TOTAL, AFILIADO, CRIADOR, PISO
        );

        uint256 gasto = 10 ether;
        vm.prank(trader);
        r2.comprar{value: gasto}(
            address(outra), 0, abi.encodeCall(RoteadorFalso.comprarPara, (trader)), address(0)
        );

        // Sem criador registrado, o total inteiro é da plataforma.
        assertEq(plataforma.balance, (gasto * TOTAL) / 10_000, "plataforma leva tudo");
        assertEq(criador.balance, 0, "nenhum criador foi inventado");
    }

    /* ---------------------------------------------------------------- */
    /* As fraudes que o desenho precisa barrar                          */
    /* ---------------------------------------------------------------- */

    function test_ninguem_se_indica_pra_pagar_menos() public {
        vm.prank(trader);
        vm.expectRevert(ChromaRouter.AfiliadoEhOProprioTrader.selector);
        router.comprar{value: 1 ether}(address(token), 0, _rotaDeCompra(trader), trader);
    }

    function test_so_a_autoridade_registra_criador() public {
        TokenFalso outra = new TokenFalso();

        vm.prank(trader);
        vm.expectRevert(ChromaRouter.NaoAutorizado.selector);
        router.registrarCriador(address(outra), trader);
    }

    function test_criador_nao_pode_ser_reescrito() public {
        /*
         * Se pudesse, uma chave roubada redirecionaria o ganho de todos os
         * criadores da plataforma numa transação só — e eles não teriam como
         * perceber, porque a taxa total continuaria idêntica.
         */
        vm.prank(autoridade);
        vm.expectRevert(ChromaRouter.NaoAutorizado.selector);
        router.registrarCriador(address(token), trader);
    }

    function test_rota_que_desvia_os_tokens_faz_tudo_voltar_atras() public {
        // A rota manda os tokens pra outro endereço em vez de pra quem pagou.
        uniswap.forcarDestino(address(0xBAD));

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(ChromaRouter.AbaixoDoMinimo.selector, 0, 1));
        router.comprar{value: 1 ether}(address(token), 1, _rotaDeCompra(trader), afiliado);
    }

    function test_rota_que_nao_entrega_nada_reverte() public {
        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(ChromaRouter.AbaixoDoMinimo.selector, 0, 1));
        router.comprar{value: 1 ether}(
            address(token), 1, abi.encodeCall(RoteadorFalso.golpe, ()), afiliado
        );
    }

    function test_protecao_de_preco_aborta() public {
        uint256 gasto = 1 ether;
        // A rota entrega 1000 por wei; pedir o dobro tem que abortar.
        uint256 impossivel = gasto * 2000;

        vm.prank(trader);
        vm.expectRevert();
        router.comprar{value: gasto}(address(token), impossivel, _rotaDeCompra(trader), afiliado);
    }

    function test_reentrada_pelo_afiliado_nao_passa() public {
        AfiliadoReentrante bandido = new AfiliadoReentrante();
        bandido.apontar(router, address(token));

        vm.prank(trader);
        router.comprar{value: 1 ether}(address(token), 0, _rotaDeCompra(trader), address(bandido));

        assertTrue(bandido.tentou(), "o dubla tentou reentrar");
        // A tentativa falhou: o contrato continua sem saldo preso.
        assertEq(address(router).balance, 0, "nada ficou no router");
    }

    /* ---------------------------------------------------------------- */
    /* A pausa                                                          */
    /* ---------------------------------------------------------------- */

    function test_pausa_bloqueia_a_compra() public {
        vm.prank(autoridade);
        router.pausar(true);

        vm.prank(trader);
        vm.expectRevert(ChromaRouter.NaoAutorizado.selector);
        router.comprar{value: 1 ether}(address(token), 0, _rotaDeCompra(trader), afiliado);
    }

    function test_pausa_NUNCA_bloqueia_a_venda() public {
        /*
         * O teste mais importante do arquivo.
         *
         * Uma trava que impede comprar protege quem ia entrar. A mesma trava
         * impedindo vender prende quem já está dentro — e aí não é proteção, é
         * sequestro. A saída fica aberta inclusive (e principalmente) quando
         * algo deu errado.
         */
        uint256 quantidade = 1000 ether;
        token.emitir(trader, quantidade);

        vm.prank(trader);
        token.approve(address(router), quantidade);

        vm.prank(autoridade);
        router.pausar(true);

        uint256 antes = trader.balance;

        vm.prank(trader);
        uint256 liquido =
            router.vender(address(token), quantidade, 0, _rotaDeVenda(quantidade), afiliado);

        assertGt(liquido, 0, "vendeu mesmo pausado");
        assertEq(trader.balance, antes + liquido, "e o dinheiro chegou");
    }

    /* ---------------------------------------------------------------- */
    /* Venda                                                            */
    /* ---------------------------------------------------------------- */

    function test_venda_cobra_a_taxa_sobre_o_eth_que_sai() public {
        uint256 quantidade = 1000 ether;
        token.emitir(trader, quantidade);

        vm.prank(trader);
        token.approve(address(router), quantidade);

        uint256 bruto = quantidade / uniswap.taxaDeCambio();
        uint256 taxaEsperada = (bruto * TOTAL) / 10_000;

        vm.prank(trader);
        uint256 liquido =
            router.vender(address(token), quantidade, 0, _rotaDeVenda(quantidade), afiliado);

        assertEq(liquido, bruto - taxaEsperada, "liquido = bruto menos a taxa");
        assertEq(criador.balance, (bruto * CRIADOR) / 10_000, "criador na venda tambem");
        assertEq(afiliado.balance, (bruto * AFILIADO) / 10_000, "afiliado na venda tambem");
    }

    function test_venda_nao_deixa_aprovacao_de_pe() public {
        uint256 quantidade = 1000 ether;
        token.emitir(trader, quantidade);

        vm.prank(trader);
        token.approve(address(router), quantidade);

        vm.prank(trader);
        router.vender(address(token), quantidade, 0, _rotaDeVenda(quantidade), afiliado);

        /*
         * Aprovação esquecida é o que transforma uma falha futura do roteador
         * em perda dos fundos de quem já passou por aqui.
         */
        assertEq(token.allowance(address(router), address(uniswap)), 0, "aprovacao zerada");
    }

    /* ---------------------------------------------------------------- */
    /* O contrato não acumula nada                                      */
    /* ---------------------------------------------------------------- */

    function test_nao_sobra_saldo_no_contrato() public {
        vm.prank(trader);
        router.comprar{value: 7.77 ether}(address(token), 0, _rotaDeCompra(trader), afiliado);
        assertEq(address(router).balance, 0, "depois da compra");

        uint256 quantidade = 500 ether;
        token.emitir(trader, quantidade);
        vm.prank(trader);
        token.approve(address(router), quantidade);
        vm.prank(trader);
        router.vender(address(token), quantidade, 0, _rotaDeVenda(quantidade), afiliado);

        assertEq(address(router).balance, 0, "depois da venda");
        assertEq(token.balanceOf(address(router)), 0, "nem token parado");
    }

    /* ---------------------------------------------------------------- */
    /* Limites da configuração                                          */
    /* ---------------------------------------------------------------- */

    function test_taxa_nao_passa_do_teto_gravado_no_codigo() public {
        vm.prank(autoridade);
        vm.expectRevert(ChromaRouter.TaxaAcimaDoTeto.selector);
        router.alterarConfiguracao(plataforma, 201, 30, 30, 20);
    }

    function test_configuracao_que_zeraria_a_plataforma_e_recusada() public {
        // 100 de afiliado + 100 de criador + 20 de piso não cabem em 125.
        vm.prank(autoridade);
        vm.expectRevert(ChromaRouter.PisoDaPlataformaViolado.selector);
        router.alterarConfiguracao(plataforma, 125, 100, 100, 20);
    }

    function test_so_a_autoridade_muda_a_configuracao() public {
        vm.prank(trader);
        vm.expectRevert(ChromaRouter.NaoAutorizado.selector);
        router.alterarConfiguracao(trader, 125, 30, 30, 20);
    }

    /* ---------------------------------------------------------------- */

    /**
     * A divisão fecha pra QUALQUER valor, não só pros redondos que escolhi.
     *
     * É onde o arredondamento apareceria: um caso em que as três fatias somadas
     * não dão o total cobrado.
     */
    function testFuzz_a_divisao_sempre_fecha(uint96 gasto) public {
        vm.assume(gasto > 10_000 && gasto < 50 ether);
        vm.deal(trader, gasto);

        vm.prank(trader);
        router.comprar{value: gasto}(address(token), 0, _rotaDeCompra(trader), afiliado);

        uint256 total = (uint256(gasto) * TOTAL) / 10_000;
        assertEq(
            criador.balance + afiliado.balance + plataforma.balance,
            total,
            "soma bate em qualquer valor"
        );
        assertEq(address(router).balance, 0, "e nada fica preso");
    }
}
