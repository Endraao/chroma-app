use anchor_lang::prelude::*;

/// Erros do programa.
///
/// Cada mensagem é escrita pra pessoa que está olhando a carteira, não pra
/// quem escreveu o código: quando uma transação falha, é este texto que
/// aparece. "Custom error 6003" não ajuda ninguém a decidir o que fazer.
#[error_code]
pub enum ErroDaCurva {
    #[msg("A plataforma está com as operações pausadas.")]
    Pausado,

    #[msg("Esta moeda já encheu a curva e migrou. Negocie por uma DEX.")]
    CurvaConcluida,

    #[msg("O valor precisa ser maior que zero.")]
    ValorZero,

    #[msg("O preço mudou e o resultado ficaria abaixo do mínimo que você aceitou.")]
    AbaixoDoMinimo,

    #[msg("A curva não tem tokens suficientes para esta compra.")]
    TokensInsuficientes,

    #[msg("A curva não tem SOL suficiente para esta venda.")]
    SolInsuficiente,

    #[msg("Cálculo estourou o limite numérico.")]
    EstouroDeCalculo,

    #[msg("As faixas de comissão deixariam a plataforma abaixo do piso.")]
    FaixasMalConfiguradas,

    #[msg("A taxa total não pode passar de 10%.")]
    TaxaTotalAltaDemais,

    #[msg("Quem indicou não pode ser quem está operando.")]
    AfiliadoEhOProprioTrader,

    #[msg("A conta informada não é a carteira da plataforma configurada.")]
    CarteiraDaPlataformaErrada,

    #[msg("A conta informada não é a do criador desta moeda.")]
    CriadorErrado,

    #[msg("O nome, símbolo ou endereço dos metadados passou do tamanho permitido.")]
    TextoLongoDemais,

    #[msg("Parâmetros de curva inválidos.")]
    CurvaInvalida,

    #[msg("a curva ainda não encheu")]
    CurvaNaoConcluida,
    #[msg("esta moeda já migrou pra pool")]
    JaMigrou,
    #[msg("a conta da pool não é a que a Raydium calcularia")]
    PoolErrada,
    #[msg("sobrou pouco SOL pra criar a pool")]
    SolInsuficienteParaMigrar,
    #[msg("a curva não tem token sobrando pra pool")]
    TokenInsuficienteParaMigrar,
}
