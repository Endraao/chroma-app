// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/**
 * A moeda lançada na Chroma, na Robinhood Chain.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTE CONTRATO NÃO TEM, E É DE PROPÓSITO
 * ---------------------------------------------------------------------------
 * Não existe função de emitir, de queimar alheio, de pausar transferência, de
 * confiscar, nem dono. A emissão inteira nasce numa única chamada e nunca mais
 * muda.
 *
 * Isso não é minimalismo: é o que separa uma moeda de um golpe. Cada um desses
 * poderes é um jeito conhecido de alguém tirar o dinheiro de quem comprou, e o
 * nosso próprio painel de segurança marca token que os tenha. Seria estranho
 * avisar contra o que a gente mesmo faz.
 *
 * ---------------------------------------------------------------------------
 * POR QUE É CLONÁVEL
 * ---------------------------------------------------------------------------
 * Cada lançamento cria uma cópia mínima (EIP-1167) apontando pra este código, e
 * a cópia custa uma fração do que custaria publicar o contrato inteiro de novo.
 * Numa launchpad, esse custo é pago por quem lança — então é dinheiro do
 * usuário, não nosso.
 *
 * O preço do clone é que o construtor não roda: a inicialização vira uma função
 * comum, e ela tem que se proteger de ser chamada duas vezes. É o que
 * `iniciado` faz.
 */
contract ChromaToken {
    error JaIniciado();
    error SaldoInsuficiente();
    error AutorizacaoInsuficiente();
    error EnderecoZero();

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    string public name;
    string public symbol;

    /**
     * 18 casas, como manda o costume em EVM.
     *
     * Na Solana a mesma moeda tem 6. Os números da curva são os mesmos em
     * PROPORÇÃO — as reservas virtuais acompanham a escala —, então a mesma
     * quantidade de moeda nativa compra a mesma fatia da emissão nas duas
     * redes. O teste de paridade confere isso.
     */
    uint8 public constant decimals = 18;

    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    bool private iniciado;

    /**
     * Cria a moeda e entrega a emissão inteira à curva.
     *
     * Chamada uma vez, pela curva, no mesmo instante do clone. Depois disso não
     * existe caminho no código que altere `totalSupply`.
     */
    function iniciar(
        string calldata nome_,
        string calldata simbolo_,
        uint256 emissao,
        address para
    ) external {
        if (iniciado) revert JaIniciado();
        if (para == address(0)) revert EnderecoZero();

        iniciado = true;
        name = nome_;
        symbol = simbolo_;
        totalSupply = emissao;
        balanceOf[para] = emissao;

        emit Transfer(address(0), para, emissao);
    }

    function transfer(address para, uint256 quanto) external returns (bool) {
        _mover(msg.sender, para, quanto);
        return true;
    }

    function approve(address quem, uint256 quanto) external returns (bool) {
        allowance[msg.sender][quem] = quanto;
        emit Approval(msg.sender, quem, quanto);
        return true;
    }

    function transferFrom(address de, address para, uint256 quanto) external returns (bool) {
        uint256 permitido = allowance[de][msg.sender];

        /*
         * Autorização "infinita" não é decrementada. É a convenção que a
         * maioria das carteiras e roteadores espera, e mexer nela faria a moeda
         * se comportar diferente das outras sem motivo.
         */
        if (permitido != type(uint256).max) {
            if (permitido < quanto) revert AutorizacaoInsuficiente();
            unchecked {
                allowance[de][msg.sender] = permitido - quanto;
            }
        }

        _mover(de, para, quanto);
        return true;
    }

    function _mover(address de, address para, uint256 quanto) private {
        if (para == address(0)) revert EnderecoZero();

        uint256 saldo = balanceOf[de];
        if (saldo < quanto) revert SaldoInsuficiente();

        unchecked {
            balanceOf[de] = saldo - quanto;
            balanceOf[para] += quanto;
        }

        emit Transfer(de, para, quanto);
    }
}
