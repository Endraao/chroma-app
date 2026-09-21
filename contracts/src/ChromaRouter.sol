// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/**
 * Router de taxa da Chroma na Robinhood Chain.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ESTE CONTRATO PRECISA EXISTIR
 * ---------------------------------------------------------------------------
 * Na Solana a taxa do afiliado viaja como mais uma instrução dentro da mesma
 * transação do swap: ou tudo acontece, ou nada acontece. Em EVM não existe esse
 * recurso — uma transação chama UM contrato, e é ele que precisa fazer as duas
 * coisas.
 *
 * Sem este contrato só sobram opções ruins: cobrar em duas transações (e quem
 * quiser some com a segunda), ou entregar a taxa num endereço só (e aí não dá
 * pra dividir com quem indicou). É por isso que a tela hoje diz "em breve" em
 * vez de fingir que funciona.
 *
 * ---------------------------------------------------------------------------
 * A REGRA QUE GOVERNA O DESENHO: ESTE CONTRATO NÃO GUARDA NADA
 * ---------------------------------------------------------------------------
 * Contrato que acumula saldo ou aprovação é o alvo preferido de quem ataca
 * DeFi: basta uma falha pra levar o que está parado lá dentro. Aqui não há o
 * que levar.
 *
 *   - entra e sai na MESMA transação; entre uma e outra o saldo é zero;
 *   - nenhuma aprovação fica de pé (a de venda é zerada antes de terminar);
 *   - não existe função de saque, nem pra quem administra;
 *   - o destino das chamadas é fixo no construtor e nunca muda.
 *
 * O pior que um atacante consegue com uma rota maliciosa é prejudicar os
 * próprios fundos que ele acabou de mandar. Não há fundos de terceiros ao
 * alcance, porque não há fundos parados.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A ROTA VEM DE FORA, PRONTA
 * ---------------------------------------------------------------------------
 * O router da Uniswap nesta rede é um fork com campo a mais na estrutura de
 * swap. Se este contrato montasse a chamada, ele passaria a depender de um
 * formato que não controlamos e que já divergiu uma vez — e uma divergência
 * dessas não aparece como erro de compilação, aparece como transação revertida
 * na cara de quem negocia.
 *
 * Então a rota chega pronta e este contrato não a interpreta: ele só desconta a
 * taxa, repassa o resto e CONFERE O RESULTADO. A conferência é o que torna
 * seguro não entender a rota — o que importa não é por onde passou, é quanto
 * chegou na mão de quem pediu.
 */
contract ChromaRouter {
    /* ---------------------------------------------------------------- */
    /* Erros                                                            */
    /* ---------------------------------------------------------------- */

    error NaoAutorizado();
    error EnderecoZero();
    error ValorZero();
    error TaxaAcimaDoTeto();
    error PisoDaPlataformaViolado();
    error AbaixoDoMinimo(uint256 recebido, uint256 minimo);
    error AfiliadoEhOProprioTrader();
    error FalhaNaRota();
    error FalhaNoRepasse();
    error Reentrancia();

    /* ---------------------------------------------------------------- */
    /* Constantes                                                       */
    /* ---------------------------------------------------------------- */

    uint256 private constant BPS = 10_000;

    /**
     * Teto absoluto da taxa total, gravado no código.
     *
     * A administração pode ajustar a taxa, mas nunca acima disto — nem por
     * engano, nem por chave roubada. Um teto que só existe na configuração
     * protege enquanto a configuração está sob controle; gravado aqui, protege
     * inclusive quando não está.
     */
    uint16 public constant TETO_DA_TAXA_BPS = 200; // 2%

    /* ---------------------------------------------------------------- */
    /* Imutáveis                                                        */
    /* ---------------------------------------------------------------- */

    /**
     * Para onde a rota é repassada. Fixo no construtor, sem função pra trocar.
     *
     * É isto que impede o contrato de virar procurador de terceiros: se o
     * destino pudesse ser escolhido por quem chama, uma chamada forjada poderia
     * mandar o contrato agir sobre qualquer outro contrato da rede.
     */
    address public immutable ROTEADOR;

    /* ---------------------------------------------------------------- */
    /* Configuração                                                     */
    /* ---------------------------------------------------------------- */

    address public autoridade;
    address public carteiraDaPlataforma;

    /**
     * Quem criou cada moeda.
     *
     * ---------------------------------------------------------------------
     * POR QUE ISTO NÃO PODE VIR DE QUEM CHAMA
     * ---------------------------------------------------------------------
     * Na Solana o programa lê o criador da conta da curva: é um dado gravado
     * na rede, e quem negocia não escolhe. Aqui, se o criador viesse como
     * argumento, qualquer pessoa apontaria pro próprio endereço e receberia de
     * volta a fatia do criador a cada operação — pagando, na prática, só o piso
     * da plataforma. A taxa continuaria "certa" no total e o dinheiro sairia
     * pela porta dos fundos.
     *
     * Moeda não registrada não é erro: a fatia do criador simplesmente não é
     * separada, e o total vai pra plataforma. Assim uma moeda de fora da
     * Chroma negocia normalmente, sem inventar um criador que não existe.
     */
    mapping(address => address) public criadorDaMoeda;

    uint16 public taxaTotalBps;
    uint16 public taxaAfiliadoBps;
    uint16 public taxaCriadorBps;
    /** A plataforma nunca pode cair abaixo disto, aconteça o que acontecer. */
    uint16 public pisoDaPlataformaBps;

    /**
     * Trava de emergência.
     *
     * Bloqueia COMPRA e nada mais. Vender continua liberado mesmo pausado, pela
     * mesma razão que na Solana: uma trava que prende quem já está dentro não é
     * proteção, é sequestro. Se algo der errado, a saída tem que continuar
     * aberta — principalmente se algo der errado.
     */
    bool public pausado;

    /* ---------------------------------------------------------------- */
    /* Eventos                                                          */
    /* ---------------------------------------------------------------- */

    event Negociado(
        address indexed trader,
        address indexed moeda,
        bool compra,
        uint256 entrada,
        uint256 saida,
        uint256 taxa
    );

    event TaxaRepartida(
        address indexed plataforma,
        address indexed criador,
        address indexed afiliado,
        uint256 paraPlataforma,
        uint256 paraCriador,
        uint256 paraAfiliado
    );

    event ConfiguracaoAlterada(
        address carteiraDaPlataforma,
        uint16 taxaTotalBps,
        uint16 taxaAfiliadoBps,
        uint16 taxaCriadorBps
    );

    event CriadorRegistrado(address indexed moeda, address indexed criador);
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

    constructor(
        address roteador,
        address autoridade_,
        address carteiraDaPlataforma_,
        uint16 taxaTotalBps_,
        uint16 taxaAfiliadoBps_,
        uint16 taxaCriadorBps_,
        uint16 pisoDaPlataformaBps_
    ) {
        if (roteador == address(0) || autoridade_ == address(0)) revert EnderecoZero();

        ROTEADOR = roteador;
        autoridade = autoridade_;

        _definirTaxas(
            carteiraDaPlataforma_,
            taxaTotalBps_,
            taxaAfiliadoBps_,
            taxaCriadorBps_,
            pisoDaPlataformaBps_
        );
    }

    /* ---------------------------------------------------------------- */
    /* Negociação                                                       */
    /* ---------------------------------------------------------------- */

    /**
     * Compra `moeda` com o ETH enviado.
     *
     * @param rota chamada pronta pro roteador da Uniswap, montada pela tela
     * @param minSaida quanto de `moeda` a pessoa aceita receber no mínimo. É a
     * proteção contra o preço mudar — e, aqui, também é o que dispensa este
     * contrato de entender a rota.
     */
    function comprar(
        address moeda,
        uint256 minSaida,
        bytes calldata rota,
        address afiliado
    ) external payable semReentrada returns (uint256 saida) {
        if (pausado) revert NaoAutorizado();
        if (msg.value == 0) revert ValorZero();
        if (moeda == address(0)) revert EnderecoZero();
        if (afiliado == msg.sender) revert AfiliadoEhOProprioTrader();

        uint256 taxa = _repartir(moeda, msg.value, afiliado);
        uint256 liquido = msg.value - taxa;

        uint256 antes = _saldoDe(moeda, msg.sender);

        // Protegido por `semReentrada`: reentrar aqui cai no revert da trava.
        // forge-lint: disable-next-line(reentrancy-eth,reentrancy-no-eth,reentrancy-balance)
        (bool ok,) = ROTEADOR.call{value: liquido}(rota);
        if (!ok) revert FalhaNaRota();

        /*
         * A conta que importa: quanto a MOEDA de quem chamou aumentou.
         *
         * Medir no destinatário final, e não no que a rota alega ter feito, é o
         * que fecha a porta. Uma rota que mande os tokens pra outro lugar não
         * consegue mentir aqui — o saldo de quem pediu simplesmente não sobe, e
         * a transação inteira volta atrás.
         */
        saida = _saldoDe(moeda, msg.sender) - antes;
        if (saida < minSaida) revert AbaixoDoMinimo(saida, minSaida);

        // Troco: rota que gastou menos que o enviado devolve a diferença.
        uint256 sobra = address(this).balance;
        if (sobra > 0) _enviar(msg.sender, sobra);

        // forge-lint: disable-next-line(reentrancy-events)
        emit Negociado(msg.sender, moeda, true, msg.value, saida, taxa);
    }

    /**
     * Vende `quantidade` de `moeda` por ETH.
     *
     * A taxa sai do ETH que SAI, não da moeda que entra — senão a plataforma
     * acumularia pedaços de mil moedas diferentes, que é um problema sem fim.
     * Por isso aqui o contrato recebe o ETH antes de repassar: é o único jeito
     * de descontar sobre o valor certo.
     */
    function vender(
        address moeda,
        uint256 quantidade,
        uint256 minSaida,
        bytes calldata rota,
        address afiliado
    ) external semReentrada returns (uint256 liquido) {
        if (quantidade == 0) revert ValorZero();
        if (moeda == address(0)) revert EnderecoZero();
        if (afiliado == msg.sender) revert AfiliadoEhOProprioTrader();
        // Repare: `pausado` NÃO é conferido aqui. Ver o comentário da variável.

        _puxar(moeda, msg.sender, quantidade);

        /*
         * Aprovação do tamanho exato e por uma chamada só. Aprovar "infinito"
         * pra economizar gás é o atalho que transforma qualquer falha futura do
         * roteador em perda dos fundos de quem passou por aqui.
         */
        _aprovar(moeda, ROTEADOR, quantidade);

        uint256 antes = address(this).balance;

        // Idem: a trava já está levantada quando esta chamada sai.
        // forge-lint: disable-next-line(reentrancy-eth,reentrancy-no-eth,reentrancy-balance)
        (bool ok,) = ROTEADOR.call(rota);
        if (!ok) revert FalhaNaRota();

        // Zera a aprovação mesmo que a rota não tenha gastado tudo.
        _aprovar(moeda, ROTEADOR, 0);

        uint256 bruto = address(this).balance - antes;
        if (bruto == 0) revert FalhaNaRota();

        uint256 taxa = _repartir(moeda, bruto, afiliado);
        liquido = bruto - taxa;
        if (liquido < minSaida) revert AbaixoDoMinimo(liquido, minSaida);

        /*
         * Este anúncio não TEM como vir antes de uma chamada externa: o número
         * que ele carrega só existe depois que a rota executou. O que protege
         * aqui é a trava de reentrada, não a ordem.
         */
        // forge-lint: disable-next-line(reentrancy-events)
        emit Negociado(msg.sender, moeda, false, quantidade, liquido, taxa);

        // Última coisa a acontecer, pela mesma razão de `_repartir`.
        _enviar(msg.sender, liquido);
    }

    /* ---------------------------------------------------------------- */
    /* Divisão da taxa                                                  */
    /* ---------------------------------------------------------------- */

    /**
     * Reparte a taxa sobre `base` e devolve quanto foi cobrado no total.
     *
     * A fatia da plataforma é o RESTO, nunca uma conta separada — igual ao
     * programa da Solana. Somar as três pontas isoladamente deixaria sobrar ou
     * faltar wei por arredondamento, e o que sobra num contrato sem função de
     * saque fica preso pra sempre.
     */
    function _repartir(address moeda, uint256 base, address afiliado)
        private
        returns (uint256 total)
    {
        total = (base * taxaTotalBps) / BPS;

        address criador = criadorDaMoeda[moeda];

        uint256 paraCriador = criador == address(0) ? 0 : (base * taxaCriadorBps) / BPS;
        uint256 paraAfiliado = afiliado == address(0) ? 0 : (base * taxaAfiliadoBps) / BPS;

        uint256 paraPlataforma = total - paraCriador - paraAfiliado;

        /*
         * O piso é conferido a cada operação, e não só na hora de configurar.
         * Assim nenhuma combinação futura de taxas consegue zerar a plataforma
         * sem que a operação falhe de forma visível.
         */
        if (paraPlataforma < (base * pisoDaPlataformaBps) / BPS) {
            revert PisoDaPlataformaViolado();
        }

        /*
         * O anúncio vem ANTES das transferências, e não é detalhe de estilo:
         * é a ordem que impede um destinatário malicioso de reentrar e fazer
         * o contrato registrar um log diferente do que aconteceu. Tudo que
         * muda estado acontece primeiro; o que sai do contrato, por último.
         *
         * O aviso do linter persiste porque `_repartir` é chamada DEPOIS da
         * rota, e disso não dá pra fugir: a taxa da venda incide sobre o que a
         * rota devolveu. A trava de reentrada é o que cobre esse trecho.
         */
        // forge-lint: disable-next-line(reentrancy-events)
        emit TaxaRepartida(carteiraDaPlataforma, criador, afiliado, paraPlataforma, paraCriador, paraAfiliado);

        if (paraCriador > 0) _enviar(criador, paraCriador);
        if (paraAfiliado > 0) _enviar(afiliado, paraAfiliado);
        if (paraPlataforma > 0) _enviar(carteiraDaPlataforma, paraPlataforma);
    }

    /* ---------------------------------------------------------------- */
    /* Administração                                                    */
    /* ---------------------------------------------------------------- */

    function alterarConfiguracao(
        address carteiraDaPlataforma_,
        uint16 taxaTotalBps_,
        uint16 taxaAfiliadoBps_,
        uint16 taxaCriadorBps_,
        uint16 pisoDaPlataformaBps_
    ) external somenteAutoridade {
        _definirTaxas(
            carteiraDaPlataforma_,
            taxaTotalBps_,
            taxaAfiliadoBps_,
            taxaCriadorBps_,
            pisoDaPlataformaBps_
        );
    }

    /**
     * Diz quem criou uma moeda, pra ela passar a receber a fatia de criador.
     *
     * Hoje quem escreve aqui é a administração. Quando a curva da Chroma existir
     * em EVM, é ela que vai registrar no mesmo ato do lançamento — e aí o dado
     * passa a nascer da rede, como já acontece na Solana.
     *
     * Só grava uma vez por moeda. Se pudesse ser reescrito, uma chave roubada
     * redirecionaria o ganho de todos os criadores da plataforma com uma
     * transação — e eles não teriam como perceber.
     */
    function registrarCriador(address moeda, address criador) external somenteAutoridade {
        if (moeda == address(0) || criador == address(0)) revert EnderecoZero();
        if (criadorDaMoeda[moeda] != address(0)) revert NaoAutorizado();

        criadorDaMoeda[moeda] = criador;
        emit CriadorRegistrado(moeda, criador);
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

    function _definirTaxas(
        address carteira,
        uint16 total,
        uint16 afiliadoBps,
        uint16 criadorBps,
        uint16 pisoBps
    ) private {
        if (carteira == address(0)) revert EnderecoZero();
        if (total > TETO_DA_TAXA_BPS) revert TaxaAcimaDoTeto();

        /*
         * As partes têm que caber no todo COM o piso sobrando. Aceitar uma
         * configuração impossível aqui adiaria a falha pra hora da operação,
         * onde ela aparece como uma transação revertida sem explicação.
         */
        if (uint256(afiliadoBps) + criadorBps + pisoBps > total) {
            revert PisoDaPlataformaViolado();
        }

        carteiraDaPlataforma = carteira;
        taxaTotalBps = total;
        taxaAfiliadoBps = afiliadoBps;
        taxaCriadorBps = criadorBps;
        pisoDaPlataformaBps = pisoBps;

        emit ConfiguracaoAlterada(carteira, total, afiliadoBps, criadorBps);
    }

    /* ---------------------------------------------------------------- */
    /* Ajudantes                                                        */
    /* ---------------------------------------------------------------- */

    function _enviar(address para, uint256 quanto) private {
        /*
         * O destino é escolhido por quem chama (afiliado) ou pela configuração
         * (plataforma, criador). É o objetivo da função, não um descuido: o
         * contrato não tem saldo próprio pra alguém desviar — o que sai aqui é
         * o que entrou na mesma transação.
         */
        // forge-lint: disable-next-line(arbitrary-send-eth,reentrancy-eth)
        (bool ok,) = para.call{value: quanto}("");
        if (!ok) revert FalhaNoRepasse();
    }

    /**
     * Leituras e escritas de ERC-20 na mão.
     *
     * Muito token por aí não devolve booleano nenhum (o USDT é o caso célebre),
     * e a interface padrão do Solidity reverte quando isso acontece. Tratar o
     * retorno vazio como sucesso é o que faz estes tokens funcionarem.
     */
    function _saldoDe(address token, address dono) private view returns (uint256) {
        (bool ok, bytes memory dados) =
            token.staticcall(abi.encodeWithSelector(0x70a08231, dono));
        if (!ok || dados.length < 32) revert FalhaNaRota();
        return abi.decode(dados, (uint256));
    }

    function _puxar(address token, address de, uint256 quanto) private {
        // Chamada de token dentro da trava; nada de estado depende do retorno.
        // forge-lint: disable-next-line(reentrancy-no-eth,reentrancy-balance)
        (bool ok, bytes memory dados) = token.call(abi.encodeWithSelector(0x23b872dd, de, address(this), quanto));
        if (!ok || (dados.length > 0 && !abi.decode(dados, (bool)))) revert FalhaNoRepasse();
    }

    function _aprovar(address token, address para, uint256 quanto) private {
        // Idem. A aprovação é do tamanho exato e zerada antes do fim da operação.
        // forge-lint: disable-next-line(reentrancy-no-eth,reentrancy-balance)
        (bool ok, bytes memory dados) = token.call(abi.encodeWithSelector(0x095ea7b3, para, quanto));
        if (!ok || (dados.length > 0 && !abi.decode(dados, (bool)))) revert FalhaNoRepasse();
    }

    /**
     * Recebe o ETH que a rota devolve.
     *
     * Vazio de propósito: aceitar sem fazer nada. Qualquer lógica aqui rodaria
     * no meio de uma chamada externa, que é exatamente onde reentrância mora.
     */
    receive() external payable {}
}
