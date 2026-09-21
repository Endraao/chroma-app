// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ChromaToken} from "./ChromaToken.sol";
import {MatematicaDaPool} from "./MatematicaDaPool.sol";
import {IPoolManager, ModifyLiquidityParams, PoolKey, Saldos} from "./UniswapV4.sol";

/**
 * A curva de bonding da Chroma na Robinhood Chain.
 *
 * ---------------------------------------------------------------------------
 * A MESMA CURVA DA SOLANA, NA OUTRA REDE
 * ---------------------------------------------------------------------------
 * A matemática aqui é linha a linha a mesma de `programs/chroma-curve` — as
 * reservas virtuais, a direção do arredondamento, a divisão da taxa, o teto por
 * faixa. Não é elegância: se as duas redes cotassem diferente, a mesma moeda
 * valeria coisas diferentes dependendo de onde a pessoa comprou, e ninguém
 * saberia explicar por quê.
 *
 * O teste de paridade (`test/Paridade.t.sol`) compara os dois resultados com os
 * mesmos números. Divergiu, falha.
 *
 * ---------------------------------------------------------------------------
 * A DIREÇÃO DO ARREDONDAMENTO É O DETALHE QUE CUSTA DINHEIRO
 * ---------------------------------------------------------------------------
 * A reserva de token arredonda PRA CIMA, pra que a saída arredonde pra baixo.
 * Na primeira versão do programa em Rust eu fiz o contrário achando que
 * favorecia a curva — favorece o contrário. Dividir uma compra de 1 SOL em mil
 * compras rendia 511 unidades a mais, ou seja: fatiar ordem era lucro.
 *
 * ---------------------------------------------------------------------------
 * UMA CURVA POR MOEDA, TODAS NESTE CONTRATO
 * ---------------------------------------------------------------------------
 * O estado de cada moeda mora num `mapping` aqui, e o token em si é um clone
 * mínimo. A alternativa — publicar um contrato de curva por lançamento —
 * custaria muito mais gás a cada moeda criada, e esse custo sai do bolso de
 * quem lança.
 */
contract ChromaCurve {
    /* ---------------------------------------------------------------- */
    /* Erros                                                            */
    /* ---------------------------------------------------------------- */

    error NaoAutorizado();
    error EnderecoZero();
    error ValorZero();
    error TaxaAcimaDoTeto();
    error PisoDaPlataformaViolado();
    error FaixasForaDeOrdem();
    error AbaixoDoMinimo(uint256 recebido, uint256 minimo);
    error AcimaDoMaximo(uint256 gasto, uint256 maximo);
    error AfiliadoEhOProprioTrader();
    error MoedaDesconhecida();
    error CurvaConcluida();
    error Pausado();
    error TextoLongoDemais();
    error FalhaNoRepasse();
    error SaldoInsuficiente();
    error Reentrancia();
    error CurvaNaoConcluida();
    error JaMigrou();

    /* ---------------------------------------------------------------- */
    /* Constantes                                                       */
    /* ---------------------------------------------------------------- */

    uint256 private constant BPS = 10_000;
    uint256 private constant FAIXAS = 4;

    /**
     * Teto absoluto da taxa, gravado no código.
     *
     * A administração ajusta a taxa, mas nunca acima disto — nem por engano,
     * nem por chave roubada. Teto que só existe na configuração protege
     * enquanto a configuração está sob controle; gravado aqui, protege
     * inclusive quando não está.
     */
    uint16 public constant TETO_DA_TAXA_BPS = 200;

    /** Limites do nome e do símbolo. Texto sem teto é gás sem teto. */
    uint256 private constant MAX_NOME = 32;
    uint256 private constant MAX_SIMBOLO = 10;

    /* ---------------------------------------------------------------- */
    /* Imutáveis                                                        */
    /* ---------------------------------------------------------------- */

    /** O molde do token. Cada lançamento clona este endereço. */
    address public immutable MOLDE_DO_TOKEN;

    /**
     * O gerente de pools da Uniswap v4 desta rede.
     *
     * Fixo no construtor, sem função pra trocar: é pra onde a liquidez de toda
     * moeda que encher a curva vai parar, e um endereço trocável aqui seria um
     * jeito de desviar tudo com uma transação só.
     */
    IPoolManager public immutable GERENTE_DA_POOL;

    /* ---------------------------------------------------------------- */
    /* Configuração                                                     */
    /* ---------------------------------------------------------------- */

    address public autoridade;
    address public carteiraDaPlataforma;

    uint16 public taxaTotalBps;
    uint16 public taxaAfiliadoBps;
    uint16 public pisoDaPlataformaBps;

    /**
     * Volume acumulado, em wei, a partir do qual cada faixa vale.
     *
     * Em ETH e não em dólar porque o contrato não tem como saber a cotação:
     * dentro da rede não existe preço em dólar sem depender de um oráculo, e
     * amarrar cada compra a um serviço externo significa que a compra falha
     * quando ele falha. A calibragem pra dólar é decisão de quem configura.
     */
    uint256[FAIXAS] public limitesDasFaixas;
    uint16[FAIXAS] public faixasDoCriadorBps;

    /** Reservas virtuais de largada — definem o preço inicial. */
    uint256 public ethVirtualInicial;
    uint256 public tokenVirtualInicial;
    /** Quantos tokens ficam à venda na curva. */
    uint256 public tokenAVenda;
    /** Emissão total da moeda. O que sobra da venda vira liquidez na migração. */
    uint256 public emissaoTotal;
    /** Cobrado de quem lança. */
    uint256 public taxaDeLancamento;

    /**
     * A faixa de taxa da pool que recebe a liquidez, e o espaçamento dela.
     *
     * Configurável porque é escolha de produto: taxa alta rende mais a quem
     * provê liquidez e encarece quem negocia. O par tem que ser um que a v4
     * aceite — taxa e espaçamento andam juntos.
     */
    uint24 public taxaDaPool;
    int24 public espacamentoDaPool;

    /**
     * Trava de emergência.
     *
     * Bloqueia CRIAR e COMPRAR. Vender continua liberado mesmo pausado, pela
     * mesma razão que na Solana: uma trava que prende quem já está dentro não é
     * proteção, é sequestro. Se algo der errado, a saída tem que continuar
     * aberta — principalmente se algo der errado.
     */
    bool public pausado;

    /* ---------------------------------------------------------------- */
    /* Estado de cada moeda                                             */
    /* ---------------------------------------------------------------- */

    struct Curva {
        address criador;
        uint256 ethVirtual;
        uint256 tokenVirtual;
        uint256 ethReal;
        uint256 tokenReal;
        uint256 volumeAcumulado;
        bool concluida;
        bool migrada;
    }

    mapping(address => Curva) public curvas;
    /** Só pra quem quiser listar; a fonte de verdade são os eventos. */
    address[] public moedas;

    /* ---------------------------------------------------------------- */
    /* Eventos                                                          */
    /* ---------------------------------------------------------------- */

    event Lancada(
        address indexed moeda,
        address indexed criador,
        string nome,
        string simbolo,
        string uri
    );

    event Negocio(
        address indexed moeda,
        address indexed trader,
        bool compra,
        uint256 eth,
        uint256 tokens,
        uint256 taxaCriador,
        uint256 taxaAfiliado,
        uint256 taxaPlataforma,
        address afiliado
    );

    event CurvaEncheu(address indexed moeda, uint256 ethArrecadado);
    event Migrou(address indexed moeda, uint256 eth, uint256 tokens);
    event ConfiguracaoAlterada(address carteiraDaPlataforma, uint16 taxaTotalBps);
    event PausaAlterada(bool pausado);
    event AutoridadeTransferida(address anterior, address nova);

    /* ---------------------------------------------------------------- */
    /* Reentrância                                                      */
    /* ---------------------------------------------------------------- */

    uint256 private trava = 1;

    modifier semReentrada() {
        if (trava != 1) revert Reentrancia();
        trava = 2;
        _;
        trava = 1;
    }

    modifier somenteAutoridade() {
        if (msg.sender != autoridade) revert NaoAutorizado();
        _;
    }

    /* ---------------------------------------------------------------- */

    struct Parametros {
        address carteiraDaPlataforma;
        uint16 taxaTotalBps;
        uint16 taxaAfiliadoBps;
        uint16 pisoDaPlataformaBps;
        uint256[FAIXAS] limitesDasFaixas;
        uint16[FAIXAS] faixasDoCriadorBps;
        uint256 ethVirtualInicial;
        uint256 tokenVirtualInicial;
        uint256 tokenAVenda;
        uint256 emissaoTotal;
        uint256 taxaDeLancamento;
        uint24 taxaDaPool;
        int24 espacamentoDaPool;
    }

    constructor(address autoridade_, address gerenteDaPool, Parametros memory p) {
        if (autoridade_ == address(0) || gerenteDaPool == address(0)) revert EnderecoZero();
        autoridade = autoridade_;
        GERENTE_DA_POOL = IPoolManager(gerenteDaPool);

        MOLDE_DO_TOKEN = address(new ChromaToken());

        _configurar(p);
    }

    /* ---------------------------------------------------------------- */
    /* Lançamento                                                       */
    /* ---------------------------------------------------------------- */

    /**
     * Cria a moeda e abre a curva dela.
     *
     * A emissão inteira nasce na curva; nada fica com quem lançou. Quem quiser
     * participar da própria moeda compra como todo mundo, pelo mesmo preço — é
     * o que impede o lançamento de já começar com uma fatia guardada pra
     * despejar depois em cima de quem comprou.
     */
    /// Protegida por `semReentrada`, como as demais.
    function lancar(
        string calldata nome,
        string calldata simbolo,
        string calldata uri
    ) external payable semReentrada returns (address moeda) {
        if (pausado) revert Pausado();
        if (bytes(nome).length == 0 || bytes(nome).length > MAX_NOME) revert TextoLongoDemais();
        if (bytes(simbolo).length == 0 || bytes(simbolo).length > MAX_SIMBOLO) {
            revert TextoLongoDemais();
        }
        if (msg.value < taxaDeLancamento) revert AcimaDoMaximo(msg.value, taxaDeLancamento);

        moeda = _clonar(MOLDE_DO_TOKEN);
        ChromaToken(moeda).iniciar(nome, simbolo, emissaoTotal, address(this));

        curvas[moeda] = Curva({
            criador: msg.sender,
            ethVirtual: ethVirtualInicial,
            tokenVirtual: tokenVirtualInicial,
            ethReal: 0,
            tokenReal: tokenAVenda,
            volumeAcumulado: 0,
            concluida: false,
            migrada: false
        });
        moedas.push(moeda);

        emit Lancada(moeda, msg.sender, nome, simbolo, uri);

        /*
         * A taxa de lançamento vai pra plataforma e o troco volta. Mandar o
         * troco depois do evento mantém a ordem "estado primeiro, dinheiro
         * por último" que vale em todo este contrato.
         */
        if (taxaDeLancamento > 0) _enviar(carteiraDaPlataforma, taxaDeLancamento);
        uint256 troco = msg.value - taxaDeLancamento;
        if (troco > 0) _enviar(msg.sender, troco);
    }

    /* ---------------------------------------------------------------- */
    /* Negociação                                                       */
    /* ---------------------------------------------------------------- */

    /**
     * Compra tokens da curva com o ETH enviado.
     *
     * @param minTokens o mínimo aceitável. Zero aqui significaria aceitar
     * qualquer resultado, que é como se perde dinheiro pra sanduíche.
     */
    /// Protegida por `semReentrada`: reentrar aqui cai no revert da trava.
    function comprar(
        address moeda,
        uint256 minTokens,
        address afiliado
    ) external payable semReentrada returns (uint256 tokens) {
        if (pausado) revert Pausado();
        if (msg.value == 0) revert ValorZero();
        if (afiliado == msg.sender) revert AfiliadoEhOProprioTrader();

        Curva storage c = curvas[moeda];
        if (c.criador == address(0)) revert MoedaDesconhecida();
        if (c.concluida) revert CurvaConcluida();

        (uint256 total, uint256 paraCriador, uint256 paraAfiliado, uint256 paraPlataforma) =
            _dividirTaxa(msg.value, c.volumeAcumulado, afiliado != address(0));

        uint256 liquido = msg.value - total;
        tokens = _cotarCompraLiquida(c.ethVirtual, c.tokenVirtual, c.tokenReal, liquido);

        if (tokens < minTokens) revert AbaixoDoMinimo(tokens, minTokens);
        if (tokens == 0) revert ValorZero();

        c.ethVirtual += liquido;
        c.tokenVirtual -= tokens;
        c.ethReal += liquido;
        c.tokenReal -= tokens;
        c.volumeAcumulado += msg.value;

        if (c.tokenReal == 0) {
            c.concluida = true;
            emit CurvaEncheu(moeda, c.ethReal);
        }

        // O número só existe depois da conta; a trava é o que cobre aqui.
        emit Negocio(
            moeda, msg.sender, true, msg.value, tokens,
            paraCriador, paraAfiliado, paraPlataforma, afiliado
        );

        // Dinheiro por último: estado já está gravado quando o ETH sai.
        _repassar(c.criador, paraCriador, afiliado, paraAfiliado, paraPlataforma);

        /*
         * O retorno é conferido mesmo sendo o nosso próprio token, que sempre
         * reverte em vez de devolver false. Confiar no comportamento de hoje
         * amarra este contrato a uma implementação que pode mudar — e a falha
         * silenciosa seria a pior possível: a taxa paga e o token não.
         */
        if (!ChromaToken(moeda).transfer(msg.sender, tokens)) revert FalhaNoRepasse();
    }

    /**
     * Vende tokens de volta pra curva.
     *
     * Não é bloqueada por pausa — ver o comentário de `pausado`.
     */
    /// Protegida por `semReentrada`, como `comprar`.
    function vender(
        address moeda,
        uint256 tokens,
        uint256 minEth,
        address afiliado
    ) external semReentrada returns (uint256 liquido) {
        if (tokens == 0) revert ValorZero();
        if (afiliado == msg.sender) revert AfiliadoEhOProprioTrader();

        Curva storage c = curvas[moeda];
        if (c.criador == address(0)) revert MoedaDesconhecida();
        if (c.concluida) revert CurvaConcluida();

        uint256 bruto = _cotarVendaBruta(c.ethVirtual, c.tokenVirtual, tokens);
        if (bruto > c.ethReal) revert SaldoInsuficiente();

        (uint256 total, uint256 paraCriador, uint256 paraAfiliado, uint256 paraPlataforma) =
            _dividirTaxa(bruto, c.volumeAcumulado, afiliado != address(0));

        liquido = bruto - total;
        if (liquido < minEth) revert AbaixoDoMinimo(liquido, minEth);

        c.ethVirtual -= bruto;
        c.tokenVirtual += tokens;
        c.ethReal -= bruto;
        c.tokenReal += tokens;
        c.volumeAcumulado += bruto;

        emit Negocio(
            moeda, msg.sender, false, liquido, tokens,
            paraCriador, paraAfiliado, paraPlataforma, afiliado
        );

        /*
         * Os tokens vêm ANTES do ETH sair. Se a transferência falhar, nada
         * aconteceu; o contrário deixaria o ETH pago e os tokens na mão de
         * quem vendeu.
         */
        if (!ChromaToken(moeda).transferFrom(msg.sender, address(this), tokens)) {
            revert FalhaNoRepasse();
        }

        _repassar(c.criador, paraCriador, afiliado, paraAfiliado, paraPlataforma);
        _enviar(msg.sender, liquido);
    }

    /* ---------------------------------------------------------------- */
    /* Cotação — pública, é o que a tela usa                            */
    /* ---------------------------------------------------------------- */

    /** Quantos tokens saem por `ethBruto` wei, já descontada a taxa. */
    function cotarCompra(address moeda, uint256 ethBruto) external view returns (uint256) {
        Curva storage c = curvas[moeda];
        if (c.criador == address(0)) revert MoedaDesconhecida();

        uint256 taxa = (ethBruto * taxaTotalBps) / BPS;
        return _cotarCompraLiquida(c.ethVirtual, c.tokenVirtual, c.tokenReal, ethBruto - taxa);
    }

    /** Quanto ETH sai ao devolver `tokens`, já descontada a taxa. */
    function cotarVenda(address moeda, uint256 tokens) external view returns (uint256) {
        Curva storage c = curvas[moeda];
        if (c.criador == address(0)) revert MoedaDesconhecida();

        uint256 bruto = _cotarVendaBruta(c.ethVirtual, c.tokenVirtual, tokens);
        return bruto - (bruto * taxaTotalBps) / BPS;
    }

    /**
     * O produto constante, com a reserva arredondando PRA CIMA.
     *
     * Arredondar a reserva pra cima faz a saída arredondar pra baixo, e é o que
     * impede fatiar ordem de render mais que uma ordem só. O contrário — que eu
     * escrevi primeiro na versão em Rust — transformava o troco em lucro de
     * quem repetisse a operação.
     *
     * A última compra leva só o que resta: é o que faz a curva fechar exata,
     * sem sobra e sem precisar acertar o valor no centavo.
     */
    function _cotarCompraLiquida(
        uint256 ethVirtual,
        uint256 tokenVirtual,
        uint256 tokenReal,
        uint256 liquido
    ) private pure returns (uint256) {
        if (liquido == 0) return 0;

        uint256 k = ethVirtual * tokenVirtual;
        uint256 novoEth = ethVirtual + liquido;
        uint256 novoToken = (k + novoEth - 1) / novoEth; // pra cima
        uint256 saida = tokenVirtual - novoToken;

        return saida < tokenReal ? saida : tokenReal;
    }

    function _cotarVendaBruta(
        uint256 ethVirtual,
        uint256 tokenVirtual,
        uint256 tokens
    ) private pure returns (uint256) {
        uint256 k = ethVirtual * tokenVirtual;
        uint256 novoToken = tokenVirtual + tokens;
        uint256 novoEth = (k + novoToken - 1) / novoToken; // pra cima

        return ethVirtual > novoEth ? ethVirtual - novoEth : 0;
    }

    /* ---------------------------------------------------------------- */
    /* Divisão da taxa                                                  */
    /* ---------------------------------------------------------------- */

    /**
     * Como a taxa se reparte — o mesmo cálculo de `dividir_taxa` no Rust.
     *
     * A fatia da plataforma é o RESTO, nunca uma conta à parte. Somar as três
     * pontas separadamente deixaria sobrar ou faltar wei por arredondamento, e
     * o que sobra num contrato sem função de saque fica preso pra sempre.
     */
    function _dividirTaxa(
        uint256 base,
        uint256 volumeAcumulado,
        bool temAfiliado
    )
        private
        view
        returns (uint256 total, uint256 paraCriador, uint256 paraAfiliado, uint256 paraPlataforma)
    {
        total = (base * taxaTotalBps) / BPS;
        paraCriador = (base * _faixaDoCriador(volumeAcumulado)) / BPS;
        paraAfiliado = temAfiliado ? (base * taxaAfiliadoBps) / BPS : 0;

        paraPlataforma = total - paraCriador - paraAfiliado;

        /*
         * O piso é conferido a CADA operação, não só na configuração. Assim
         * nenhuma combinação futura de faixas consegue zerar a plataforma sem
         * que a operação falhe de forma visível.
         */
        if (paraPlataforma < (base * pisoDaPlataformaBps) / BPS) {
            revert PisoDaPlataformaViolado();
        }
    }

    /**
     * A fatia do criador no volume acumulado atual.
     *
     * Percorre de trás pra frente: vale a faixa mais alta já alcançada. De
     * frente, pararia na primeira e o criador ficaria preso na menor pra
     * sempre.
     */
    function _faixaDoCriador(uint256 volumeAcumulado) private view returns (uint16) {
        for (uint256 i = FAIXAS; i > 0; i--) {
            if (volumeAcumulado >= limitesDasFaixas[i - 1]) return faixasDoCriadorBps[i - 1];
        }
        return faixasDoCriadorBps[0];
    }

    function _repassar(
        address criador,
        uint256 paraCriador,
        address afiliado,
        uint256 paraAfiliado,
        uint256 paraPlataforma
    ) private {
        if (paraCriador > 0) _enviar(criador, paraCriador);
        if (paraAfiliado > 0) _enviar(afiliado, paraAfiliado);
        if (paraPlataforma > 0) _enviar(carteiraDaPlataforma, paraPlataforma);
    }

    /* ---------------------------------------------------------------- */
    /* Administração                                                    */
    /* ---------------------------------------------------------------- */

    function configurar(Parametros calldata p) external somenteAutoridade {
        _configurar(p);
    }

    function pausar(bool valor) external somenteAutoridade {
        pausado = valor;
        emit PausaAlterada(valor);
    }

    function transferirAutoridade(address nova) external somenteAutoridade {
        if (nova == address(0)) revert EnderecoZero();
        address anterior = autoridade;
        autoridade = nova;
        emit AutoridadeTransferida(anterior, nova);
    }

    function _configurar(Parametros memory p) private {
        if (p.carteiraDaPlataforma == address(0)) revert EnderecoZero();
        if (p.taxaTotalBps > TETO_DA_TAXA_BPS) revert TaxaAcimaDoTeto();
        if (p.ethVirtualInicial == 0 || p.tokenVirtualInicial == 0) revert ValorZero();
        if (p.tokenAVenda == 0 || p.tokenAVenda > p.emissaoTotal) revert ValorZero();

        /*
         * A maior fatia possível do criador tem que caber no total, junto do
         * afiliado e do piso. Aceitar configuração impossível aqui adiaria a
         * falha pra hora da operação, onde ela aparece como transação revertida
         * sem explicação.
         */
        uint16 maiorCriador = 0;
        for (uint256 i = 0; i < FAIXAS; i++) {
            if (p.faixasDoCriadorBps[i] > maiorCriador) maiorCriador = p.faixasDoCriadorBps[i];
            /* As faixas sobem com o volume; fora de ordem, a busca de trás pra
             * frente devolveria a fatia errada. */
            // Falhar no meio é o certo: configuração ruim não pode entrar pela metade.
            // forge-lint: disable-next-line(require-revert-in-loop)
            if (i > 0 && p.limitesDasFaixas[i] <= p.limitesDasFaixas[i - 1]) {
                revert FaixasForaDeOrdem();
            }
        }

        if (
            uint256(maiorCriador) + p.taxaAfiliadoBps + p.pisoDaPlataformaBps > p.taxaTotalBps
        ) {
            revert PisoDaPlataformaViolado();
        }

        carteiraDaPlataforma = p.carteiraDaPlataforma;
        taxaTotalBps = p.taxaTotalBps;
        taxaAfiliadoBps = p.taxaAfiliadoBps;
        pisoDaPlataformaBps = p.pisoDaPlataformaBps;
        limitesDasFaixas = p.limitesDasFaixas;
        faixasDoCriadorBps = p.faixasDoCriadorBps;
        ethVirtualInicial = p.ethVirtualInicial;
        tokenVirtualInicial = p.tokenVirtualInicial;
        tokenAVenda = p.tokenAVenda;
        emissaoTotal = p.emissaoTotal;
        taxaDeLancamento = p.taxaDeLancamento;
        taxaDaPool = p.taxaDaPool;
        espacamentoDaPool = p.espacamentoDaPool;

        emit ConfiguracaoAlterada(p.carteiraDaPlataforma, p.taxaTotalBps);
    }


    /* ---------------------------------------------------------------- */
    /* Migração pra pool                                                 */
    /* ---------------------------------------------------------------- */

    /**
     * Leva a liquidez da curva cheia pra uma pool da Uniswap v4.
     *
     * -------------------------------------------------------------------
     * POR QUE ISTO PRECISA EXISTIR
     * -------------------------------------------------------------------
     * Sem esta etapa, encher a curva — que é o SUCESSO — vira o fim da moeda:
     * comprar e vender ficam bloqueados, o ETH arrecadado fica parado e não há
     * caminho pra fora. A moeda que der mais certo seria a que morre.
     *
     * -------------------------------------------------------------------
     * POR QUE QUALQUER UM PODE CHAMAR
     * -------------------------------------------------------------------
     * Não há permissão aqui. Se a migração dependesse de nós, uma chave perdida
     * ou um servidor fora do ar prenderiam dinheiro de terceiros sem prazo — e
     * quem comprou não teria a quem recorrer.
     *
     * Quem chama não escolhe nada: as quantidades vêm do estado da curva, o
     * preço vem delas, e a pool é a derivada dos dois ativos. Só paga o gás.
     *
     * -------------------------------------------------------------------
     * POR QUE A LIQUIDEZ FICA TRAVADA PRA SEMPRE
     * -------------------------------------------------------------------
     * A posição nasce em nome DESTE contrato, e não existe função nenhuma aqui
     * que a remova. Não é promessa: é ausência de código. Nem nós, nem quem
     * lançou, nem quem migrou consegue esvaziar o par.
     *
     * É o mesmo efeito de queimar o LP na Solana — só que aqui a v4 nem tem
     * token de LP pra queimar, então o jeito de travar é não ter como soltar.
     */
    function migrar(address moeda) external semReentrada {
        Curva storage c = curvas[moeda];
        if (c.criador == address(0)) revert MoedaDesconhecida();
        if (!c.concluida) revert CurvaNaoConcluida();
        if (c.migrada) revert JaMigrou();

        uint256 ethParaPool = c.ethReal;
        uint256 tokensParaPool = ChromaToken(moeda).balanceOf(address(this));

        if (ethParaPool == 0 || tokensParaPool == 0) revert ValorZero();

        /*
         * Marcado ANTES de qualquer chamada externa. A trava de reentrância já
         * cobriria, mas as duas juntas custam quase nada e fecham a porta duas
         * vezes num lugar onde ela não pode abrir.
         */
        c.migrada = true;
        c.ethReal = 0;

        PoolKey memory chave = _chaveDaPool(moeda);

        uint160 sqrtPreco = MatematicaDaPool.sqrtPrecoInicial(ethParaPool, tokensParaPool);
        GERENTE_DA_POOL.initialize(chave, sqrtPreco);

        GERENTE_DA_POOL.unlock(abi.encode(chave, sqrtPreco, ethParaPool, tokensParaPool));

        emit Migrou(moeda, ethParaPool, tokensParaPool);
    }

    /**
     * A janela em que a v4 deixa mexer na pool.
     *
     * Ela chama isto de volta durante o `unlock`. Só o gerente da pool pode
     * entrar aqui: sem essa checagem, qualquer um chamaria esta função direto e
     * faria o contrato depositar por conta própria.
     */
    function unlockCallback(bytes calldata dados) external returns (bytes memory) {
        if (msg.sender != address(GERENTE_DA_POOL)) revert NaoAutorizado();

        (PoolKey memory chave, uint160 sqrtPreco, uint256 quantidadeEth, uint256 quantidadeToken) =
            abi.decode(dados, (PoolKey, uint160, uint256, uint256));

        (int24 menor, int24 maior) = MatematicaDaPool.faixaCheia(chave.tickSpacing);

        uint128 liquidez =
            MatematicaDaPool.liquidezDeFaixaCheia(sqrtPreco, quantidadeEth, quantidadeToken);

        (int256 saldos,) = GERENTE_DA_POOL.modifyLiquidity(
            chave,
            ModifyLiquidityParams({
                tickLower: menor,
                tickUpper: maior,
                liquidityDelta: int256(uint256(liquidez)),
                salt: bytes32(0)
            }),
            ""
        );

        _quitar(chave.currency0, Saldos.primeiro(saldos));
        _quitar(chave.currency1, Saldos.segundo(saldos));

        return "";
    }

    /**
     * Paga o que devemos à pool, ou recolhe o que sobrou.
     *
     * A sobra existe porque a liquidez é um número inteiro: ela raramente
     * consome as duas quantidades até o último wei. O que volta fica neste
     * contrato — são centavos, e não há função de saque, então ficam travados
     * junto com a liquidez em vez de irem parar na mão de alguém.
     */
    function _quitar(address ativo, int128 saldo) private {
        uint256 devido = Saldos.divida(saldo);

        if (devido > 0) {
            if (ativo == address(0)) {
                // Moeda nativa: o valor viaja junto com a quitação.
                GERENTE_DA_POOL.settle{value: devido}();
            } else {
                /*
                 * Token: a pool precisa saber quanto tinha antes de o nosso
                 * depósito chegar, senão não reconhece o que foi mandado.
                 */
                GERENTE_DA_POOL.sync(ativo);
                if (!ChromaToken(ativo).transfer(address(GERENTE_DA_POOL), devido)) {
                    revert FalhaNoRepasse();
                }
                GERENTE_DA_POOL.settle();
            }
            return;
        }

        uint256 aReceber = Saldos.credito(saldo);
        if (aReceber > 0) GERENTE_DA_POOL.take(ativo, address(this), aReceber);
    }

    /**
     * A chave da pool desta moeda.
     *
     * A moeda nativa é o endereço zero e, sendo o menor endereço possível, fica
     * sempre em primeiro. Inverter a ordem apontaria pra outra pool — sem erro
     * nenhum, só no lugar errado, com o dinheiro dentro.
     */
    function _chaveDaPool(address moeda) private view returns (PoolKey memory) {
        return PoolKey({
            currency0: address(0),
            currency1: moeda,
            fee: taxaDaPool,
            tickSpacing: espacamentoDaPool,
            hooks: address(0)
        });
    }

    /** Onde a liquidez desta moeda foi parar, pra tela poder apontar. */
    function chaveDaPool(address moeda) external view returns (PoolKey memory) {
        return _chaveDaPool(moeda);
    }

    /** A v4 devolve a sobra em moeda nativa direto pra cá. */
    receive() external payable {}

    /* ---------------------------------------------------------------- */
    /* Ajudantes                                                        */
    /* ---------------------------------------------------------------- */

    /**
     * Clone mínimo (EIP-1167).
     *
     * São 45 bytes que só sabem repassar toda chamada pro molde. Custa uma
     * fração de publicar o contrato inteiro — e numa launchpad esse custo é
     * pago por quem lança.
     */
    function _clonar(address molde) private returns (address copia) {
        bytes20 alvo = bytes20(molde);
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(ptr, 0x14), alvo)
            mstore(add(ptr, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            copia := create(0, ptr, 0x37)
        }
        if (copia == address(0)) revert FalhaNoRepasse();
    }

    function _enviar(address para, uint256 quanto) private {
        /*
         * O destino vem da configuração (plataforma), da curva (criador) ou de
         * quem chama (afiliado). É o objetivo da função: o contrato não guarda
         * saldo próprio, o que sai aqui é o que entrou na mesma transação.
         */
        // forge-lint: disable-next-line(arbitrary-send-eth,reentrancy-eth)
        (bool ok,) = para.call{value: quanto}("");
        if (!ok) revert FalhaNoRepasse();
    }

    /** Quantas moedas já foram lançadas. */
    function quantasMoedas() external view returns (uint256) {
        return moedas.length;
    }
}
