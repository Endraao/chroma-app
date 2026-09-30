// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/*
 * ============================================================================
 * CHROMA × PONS — lançar e negociar na curva da Pons pela Chroma
 * ============================================================================
 *
 * POR QUE EXISTE (30/09/2026)
 * ----------------------------------------------------------------------------
 * Na Robinhood a Chroma tinha a própria curva: moeda lançada nela não aparecia
 * em lugar nenhum fora da Chroma, e lançar pedia duas confirmações. A Pons é a
 * plataforma de lançamento dominante da rede. Lançando pela fábrica dela, a
 * moeda entra na Pons como qualquer outra — e este contrato põe a Chroma no
 * meio, do mesmo jeito que na Solana a Chroma lança pela curva de lançamento de
 * lá:
 *
 *   lancar   taxa da Chroma + criação na Pons + compra do criador, numa
 *            transação só. A taxa de criador da Pons vai pra carteira de
 *            quem lançou (é ela que recebe `creatorFeeRecipient`).
 *   comprar  / vender  na curva da Pons, com a taxa da Chroma (e a comissão
 *            de indicação) descontada na mesma transação.
 *
 * ----------------------------------------------------------------------------
 * O QUE ESTE CONTRATO NUNCA FAZ
 * ----------------------------------------------------------------------------
 * - Guardar dinheiro. Todo ETH que entra sai na mesma transação; o que sobrar
 *   (troco da curva) volta pra quem chamou.
 * - Falar com curva que a fábrica da Pons não reconhece. A curva é SEMPRE lida
 *   da fábrica a partir da moeda — nunca aceita como argumento —, então não dá
 *   pra apontar este contrato pra um endereço forjado.
 * - Travar a venda. Pausado, só a compra e o lançamento param.
 *
 * ----------------------------------------------------------------------------
 * A JANELA CONTRA ROBÔS
 * ----------------------------------------------------------------------------
 * A Pons cobra um imposto alto de quem compra nos primeiros segundos de uma
 * moeda — menos de quem a lançou. Quem lança aqui é ESTE contrato, então ele
 * fica isento nas moedas que lança. Sem cuidado, um robô compraria por aqui
 * nos primeiros segundos pra fugir do imposto. Por isso `comprar` recusa as
 * moedas lançadas por este contrato até `janelaContraRobos` passar. A compra
 * do criador, dentro de `lancar`, é a única isenta — que é o combinado.
 */

/* -------------------------------------------------------------------------- */
/* Interfaces da Pons V2 (conferidas contra transações reais da rede)          */
/* -------------------------------------------------------------------------- */

interface IPonsFactory {
    struct Socials {
        string twitter;
        string telegram;
        string discord;
        string website;
        string farcaster;
    }

    struct TokenParams {
        string name;
        string symbol;
        string logo;
        string description;
        Socials socials;
        address creatorFeeRecipient;
        uint16 creatorTaxBps;
        bool buybackEnabled;
        bytes32 expectedEconomics;
        bytes32 salt;
    }

    struct LaunchedToken {
        address token;
        address curve;
        address deployer;
        address creatorFeeRecipient;
        address pairToken;
        uint256 graduationThreshold;
        uint24 poolFee;
        int24 tickSpacing;
        uint16 creatorTaxBps;
        bool buybackEnabled;
        uint8 phase; // 0 = ainda na curva
        uint256 sweptQuote;
        uint256 sweptTokens;
        uint256 sweptAt;
        bool exists;
    }

    function launchToken(
        TokenParams calldata params,
        uint256 launchConfigId,
        address pairToken,
        address[] calldata snipeTaxExemptions
    ) external payable returns (address token, address curve);

    function launchFee() external view returns (uint256);

    function getLaunchedToken(address token) external view returns (LaunchedToken memory);
}

interface IPonsCurve {
    function buy(uint256 quoteIn, uint256 minTokensOut, address recipient)
        external
        payable
        returns (uint256 tokensOut);

    function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient) external returns (uint256 quoteOut);
}

interface IERC20Minimo {
    function transferFrom(address de, address para, uint256 quantidade) external returns (bool);
    function approve(address gastador, uint256 quantidade) external returns (bool);
    function balanceOf(address conta) external view returns (uint256);
}

contract ChromaPons {
    /* ---------------------------------------------------------------- */
    /* Erros                                                            */
    /* ---------------------------------------------------------------- */

    error NaoAutorizado();
    error EnderecoZero();
    error ValorZero();
    error TaxaAcimaDoTeto();
    error PagamentoInsuficiente(uint256 enviado, uint256 exigido);
    error MoedaNaoEhDaPons();
    error CurvaEncerrada();
    error JanelaContraRobos(uint256 liberaEm);
    error AbaixoDoMinimo(uint256 recebido, uint256 minimo);
    error AfiliadoEhOProprioTrader();
    error FalhaNoRepasse();
    error FalhaNaAprovacao();
    error Reentrancia();
    error Pausado();

    /* ---------------------------------------------------------------- */
    /* Constantes e imutáveis                                           */
    /* ---------------------------------------------------------------- */

    uint256 private constant BPS = 10_000;

    /** Teto da taxa de negociação, gravado no código: nem a autoridade passa disso. */
    uint16 public constant TETO_DA_TAXA_BPS = 200; // 2%
    /** Teto da taxa de lançamento da Chroma. */
    uint256 public constant TETO_DA_TAXA_DE_LANCAMENTO = 0.01 ether;
    /** A janela contra robôs nunca passa de 5 minutos, nem por engano. */
    uint256 public constant TETO_DA_JANELA = 300;

    /** A fábrica da Pons. Fixa: sem função pra trocar. */
    IPonsFactory public immutable FABRICA;

    /* ---------------------------------------------------------------- */
    /* Configuração                                                     */
    /* ---------------------------------------------------------------- */

    address public autoridade;
    address public carteiraDaPlataforma;
    uint16 public taxaTotalBps;
    uint16 public taxaAfiliadoBps;
    uint256 public taxaDeLancamento;
    uint256 public janelaContraRobos;
    bool public pausado;

    /** Quando cada moeda foi lançada POR ESTE contrato (zero = não foi). */
    mapping(address => uint256) public lancadaEm;
    /** Quantos lançamentos este contrato já fez (entra no salt). */
    uint256 public lancamentos;

    /* ---------------------------------------------------------------- */
    /* Eventos                                                          */
    /* ---------------------------------------------------------------- */

    event Lancada(address indexed moeda, address indexed curva, address indexed criador, uint256 compra, uint256 tokens);
    event Negociado(address indexed trader, address indexed moeda, bool compra, uint256 entrada, uint256 saida, uint256 taxa);
    event TaxaRepartida(address indexed afiliado, uint256 paraPlataforma, uint256 paraAfiliado);
    event ConfiguracaoAlterada(
        address carteiraDaPlataforma, uint16 taxaTotalBps, uint16 taxaAfiliadoBps, uint256 taxaDeLancamento, uint256 janela
    );
    event PausaAlterada(bool pausado);
    event AutoridadeTransferida(address anterior, address nova);

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

    constructor(
        address fabrica,
        address autoridade_,
        address carteiraDaPlataforma_,
        uint16 taxaTotalBps_,
        uint16 taxaAfiliadoBps_,
        uint256 taxaDeLancamento_,
        uint256 janelaContraRobos_
    ) {
        if (fabrica == address(0) || autoridade_ == address(0)) revert EnderecoZero();
        FABRICA = IPonsFactory(fabrica);
        autoridade = autoridade_;
        _configurar(carteiraDaPlataforma_, taxaTotalBps_, taxaAfiliadoBps_, taxaDeLancamento_, janelaContraRobos_);
    }

    /* ---------------------------------------------------------------- */
    /* Lançamento                                                       */
    /* ---------------------------------------------------------------- */

    /**
     * Lança na Pons e faz a compra do criador, numa transação só.
     *
     * `msg.value` = taxa de lançamento da Pons + a da Chroma + a compra.
     * O que for além disso é a compra; zero de compra só lança.
     *
     * `params.creatorFeeRecipient` é SOBRESCRITO com quem chamou: a taxa de
     * criador da Pons é de quem lançou, e não dá pra desviar pra outro.
     */
    function lancar(
        IPonsFactory.TokenParams calldata params,
        uint256 idDaConfiguracao,
        uint256 minTokens
    ) external payable semReentrada returns (address moeda, address curva, uint256 tokens) {
        if (pausado) revert Pausado();

        uint256 taxaDaPons = FABRICA.launchFee();
        uint256 exigido = taxaDaPons + taxaDeLancamento;
        if (msg.value < exigido) revert PagamentoInsuficiente(msg.value, exigido);
        uint256 compra = msg.value - exigido;

        IPonsFactory.TokenParams memory p = params;
        p.creatorFeeRecipient = msg.sender;
        // O endereço da moeda sai do "salt", que tem de ser único POR LANÇADOR
        // — e o lançador aqui é sempre este contrato. Misturando quem chamou e
        // um contador, dois lançamentos nunca colidem.
        p.salt = keccak256(abi.encode(msg.sender, params.salt, ++lancamentos));

        // forge-lint: disable-next-line(reentrancy-eth,reentrancy-no-eth,reentrancy-benign)
        (moeda, curva) = FABRICA.launchToken{value: taxaDaPons}(p, idDaConfiguracao, address(0), new address[](0));
        lancadaEm[moeda] = block.timestamp;

        if (compra > 0) {
            // Direto pra carteira de quem lançou. Este contrato é o lançador,
            // então esta compra é isenta do imposto contra robôs — só esta.
            // forge-lint: disable-next-line(reentrancy-eth,reentrancy-no-eth)
            tokens = IPonsCurve(curva).buy{value: compra}(compra, minTokens, msg.sender);
        }

        // forge-lint: disable-next-line(reentrancy-events)
        emit Lancada(moeda, curva, msg.sender, compra, tokens);

        // Dinheiro por último: a taxa da Chroma e o troco que a curva devolveu.
        if (taxaDeLancamento > 0) _enviar(carteiraDaPlataforma, taxaDeLancamento);
        uint256 sobra = address(this).balance;
        if (sobra > 0) _enviar(msg.sender, sobra);
    }

    /* ---------------------------------------------------------------- */
    /* Negociação                                                       */
    /* ---------------------------------------------------------------- */

    function comprar(address moeda, uint256 minTokens, address afiliado)
        external
        payable
        semReentrada
        returns (uint256 tokens)
    {
        if (pausado) revert Pausado();
        if (msg.value == 0) revert ValorZero();
        if (afiliado == msg.sender) revert AfiliadoEhOProprioTrader();

        uint256 lancada = lancadaEm[moeda];
        if (lancada != 0 && block.timestamp < lancada + janelaContraRobos) {
            revert JanelaContraRobos(lancada + janelaContraRobos);
        }

        address curva = _curvaDa(moeda);
        (uint256 paraPlataforma, uint256 paraAfiliado) = _taxas(msg.value, afiliado);
        uint256 liquido = msg.value - paraPlataforma - paraAfiliado;

        // forge-lint: disable-next-line(reentrancy-eth,reentrancy-no-eth)
        tokens = IPonsCurve(curva).buy{value: liquido}(liquido, minTokens, msg.sender);
        if (tokens < minTokens) revert AbaixoDoMinimo(tokens, minTokens);

        // forge-lint: disable-next-line(reentrancy-events)
        emit Negociado(msg.sender, moeda, true, msg.value, tokens, paraPlataforma + paraAfiliado);

        _pagarTaxas(paraPlataforma, afiliado, paraAfiliado);
        // Troco da curva (compra parcial perto de encher) volta pra quem comprou.
        uint256 sobra = address(this).balance;
        if (sobra > 0) _enviar(msg.sender, sobra);
    }

    /**
     * Vende na curva. A taxa sai do ETH que SAI. Nunca pausada.
     * Pede aprovação prévia da moeda pra este contrato (exata, não infinita).
     */
    function vender(address moeda, uint256 quantidade, uint256 minEth, address afiliado)
        external
        semReentrada
        returns (uint256 liquido)
    {
        if (quantidade == 0) revert ValorZero();
        if (afiliado == msg.sender) revert AfiliadoEhOProprioTrader();

        address curva = _curvaDa(moeda);

        if (!IERC20Minimo(moeda).transferFrom(msg.sender, address(this), quantidade)) revert FalhaNoRepasse();
        _aprovar(moeda, curva, quantidade);

        uint256 antes = address(this).balance;
        // forge-lint: disable-next-line(reentrancy-eth,reentrancy-no-eth,reentrancy-balance)
        IPonsCurve(curva).sell(quantidade, 0, address(this));
        _aprovar(moeda, curva, 0);
        uint256 bruto = address(this).balance - antes;
        if (bruto == 0) revert ValorZero();

        (uint256 paraPlataforma, uint256 paraAfiliado) = _taxas(bruto, afiliado);
        liquido = bruto - paraPlataforma - paraAfiliado;
        if (liquido < minEth) revert AbaixoDoMinimo(liquido, minEth);

        // forge-lint: disable-next-line(reentrancy-events)
        emit Negociado(msg.sender, moeda, false, quantidade, liquido, paraPlataforma + paraAfiliado);

        _pagarTaxas(paraPlataforma, afiliado, paraAfiliado);
        _enviar(msg.sender, liquido);
    }

    /* ---------------------------------------------------------------- */
    /* Internos                                                         */
    /* ---------------------------------------------------------------- */

    /** A curva vem da FÁBRICA, a partir da moeda — nunca de quem chama. */
    function _curvaDa(address moeda) private view returns (address) {
        IPonsFactory.LaunchedToken memory l = FABRICA.getLaunchedToken(moeda);
        if (!l.exists || l.token != moeda || l.curve == address(0) || l.pairToken != address(0)) {
            revert MoedaNaoEhDaPons();
        }
        if (l.phase != 0) revert CurvaEncerrada();
        return l.curve;
    }

    /** Plataforma = resto, pra nenhum wei sobrar preso por arredondamento. */
    function _taxas(uint256 base, address afiliado) private view returns (uint256 paraPlataforma, uint256 paraAfiliado) {
        uint256 total = (base * taxaTotalBps) / BPS;
        paraAfiliado = afiliado == address(0) ? 0 : (base * taxaAfiliadoBps) / BPS;
        paraPlataforma = total - paraAfiliado;
    }

    function _pagarTaxas(uint256 paraPlataforma, address afiliado, uint256 paraAfiliado) private {
        // forge-lint: disable-next-line(reentrancy-events)
        emit TaxaRepartida(afiliado, paraPlataforma, paraAfiliado);
        if (paraAfiliado > 0) _enviar(afiliado, paraAfiliado);
        if (paraPlataforma > 0) _enviar(carteiraDaPlataforma, paraPlataforma);
    }

    function _enviar(address para, uint256 valor) private {
        // forge-lint: disable-next-line(arbitrary-send-eth)
        (bool ok,) = para.call{value: valor}("");
        if (!ok) revert FalhaNoRepasse();
    }

    function _aprovar(address moeda, address gastador, uint256 quantidade) private {
        if (!IERC20Minimo(moeda).approve(gastador, quantidade)) revert FalhaNaAprovacao();
    }

    /** Só aceita ETH vindo da negociação (troco e venda da curva). */
    receive() external payable {
        if (trava != 2) revert NaoAutorizado();
    }

    /* ---------------------------------------------------------------- */
    /* Administração                                                    */
    /* ---------------------------------------------------------------- */

    function configurar(
        address carteiraDaPlataforma_,
        uint16 taxaTotalBps_,
        uint16 taxaAfiliadoBps_,
        uint256 taxaDeLancamento_,
        uint256 janelaContraRobos_
    ) external somenteAutoridade {
        _configurar(carteiraDaPlataforma_, taxaTotalBps_, taxaAfiliadoBps_, taxaDeLancamento_, janelaContraRobos_);
    }

    function _configurar(
        address carteiraDaPlataforma_,
        uint16 taxaTotalBps_,
        uint16 taxaAfiliadoBps_,
        uint256 taxaDeLancamento_,
        uint256 janelaContraRobos_
    ) private {
        if (carteiraDaPlataforma_ == address(0)) revert EnderecoZero();
        if (taxaTotalBps_ > TETO_DA_TAXA_BPS || taxaAfiliadoBps_ > taxaTotalBps_) revert TaxaAcimaDoTeto();
        if (taxaDeLancamento_ > TETO_DA_TAXA_DE_LANCAMENTO || janelaContraRobos_ > TETO_DA_JANELA) {
            revert TaxaAcimaDoTeto();
        }
        carteiraDaPlataforma = carteiraDaPlataforma_;
        taxaTotalBps = taxaTotalBps_;
        taxaAfiliadoBps = taxaAfiliadoBps_;
        taxaDeLancamento = taxaDeLancamento_;
        janelaContraRobos = janelaContraRobos_;
        emit ConfiguracaoAlterada(
            carteiraDaPlataforma_, taxaTotalBps_, taxaAfiliadoBps_, taxaDeLancamento_, janelaContraRobos_
        );
    }

    function pausar(bool valor) external somenteAutoridade {
        pausado = valor;
        emit PausaAlterada(valor);
    }

    function transferirAutoridade(address nova) external somenteAutoridade {
        if (nova == address(0)) revert EnderecoZero();
        emit AutoridadeTransferida(autoridade, nova);
        autoridade = nova;
    }
}
