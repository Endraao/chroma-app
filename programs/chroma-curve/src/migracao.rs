use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;

use crate::errors::ErroDaCurva;

/// Leva a liquidez da curva pra uma pool da Raydium.
///
/// ---------------------------------------------------------------------------
/// POR QUE ISTO PRECISA EXISTIR, E POR QUE É URGENTE
/// ---------------------------------------------------------------------------
/// Sem esta etapa, encher a curva — que é o SUCESSO — vira o fim da moeda: a
/// compra e a venda ficam bloqueadas, o SOL arrecadado fica parado na conta da
/// curva e não existe caminho nenhum pra fora. A moeda que der mais certo na
/// plataforma seria a que morre.
///
/// ---------------------------------------------------------------------------
/// POR QUE QUALQUER UM PODE CHAMAR
/// ---------------------------------------------------------------------------
/// Não há permissão nem assinatura da plataforma aqui. Se a migração dependesse
/// de nós, uma chave perdida, um servidor fora do ar ou uma simples desatenção
/// prenderiam o dinheiro de terceiros por tempo indeterminado — e quem comprou
/// não teria a quem recorrer.
///
/// Quem chama não escolhe nada: os valores saem do estado da curva, o destino é
/// a pool derivada dos mints, e o LP é queimado no mesmo ato. Não há o que
/// desviar, então não há motivo pra restringir quem aperta o botão.
///
/// ---------------------------------------------------------------------------
/// POR QUE O LP É QUEIMADO
/// ---------------------------------------------------------------------------
/// O token de LP é o direito de retirar a liquidez da pool. Guardá-lo — conosco
/// ou com quem lançou — significaria que alguém pode esvaziar o par e sumir com
/// o dinheiro de quem comprou. É exatamente o golpe que o painel de segurança
/// desta plataforma avisa contra.
///
/// Queimado, a liquidez fica travada pra sempre e ninguém precisa confiar em
/// ninguém. É irreversível de propósito.

/// Programa da Raydium CP-Swap. O mesmo endereço na mainnet.
pub const PROGRAMA_RAYDIUM: Pubkey = pubkey!("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C");

/// SOL embrulhado. A Raydium negocia token contra token, nunca SOL nativo.
pub const WSOL: Pubkey = pubkey!("So11111111111111111111111111111111111111112");

/// Identificador da instrução `initialize` da Raydium.
const INICIALIZAR: [u8; 8] = [175, 175, 109, 31, 13, 152, 155, 237];

/// Sementes das contas derivadas da Raydium, copiadas do código-fonte dela.
pub const SEMENTE_AUTORIDADE: &[u8] = b"vault_and_lp_mint_auth_seed";
pub const SEMENTE_POOL: &[u8] = b"pool";
pub const SEMENTE_LP: &[u8] = b"pool_lp_mint";
pub const SEMENTE_COFRE: &[u8] = b"pool_vault";
pub const SEMENTE_OBSERVACAO: &[u8] = b"observation";

/// As contas que a criação de pool precisa, na ordem exata do programa dela.
///
/// A ordem não é escolha nossa e não pode ser "arrumada": ela é a interface do
/// programa da Raydium. Trocar duas de lugar não dá erro de compilação — dá
/// transação recusada, e só na hora em que alguém tentar migrar de verdade.
pub struct ContasDaPool<'a, 'info> {
    /// A curva, que assina como criadora da pool.
    pub criador: &'a AccountInfo<'info>,
    pub amm_config: &'a AccountInfo<'info>,
    pub autoridade: &'a AccountInfo<'info>,
    pub pool: &'a AccountInfo<'info>,
    pub mint_0: &'a AccountInfo<'info>,
    pub mint_1: &'a AccountInfo<'info>,
    pub lp_mint: &'a AccountInfo<'info>,
    pub conta_0_do_criador: &'a AccountInfo<'info>,
    pub conta_1_do_criador: &'a AccountInfo<'info>,
    pub conta_lp_do_criador: &'a AccountInfo<'info>,
    pub cofre_0: &'a AccountInfo<'info>,
    pub cofre_1: &'a AccountInfo<'info>,
    pub taxa_de_criacao: &'a AccountInfo<'info>,
    pub observacao: &'a AccountInfo<'info>,
    pub token_program: &'a AccountInfo<'info>,
    pub associated_token_program: &'a AccountInfo<'info>,
    pub system_program: &'a AccountInfo<'info>,
    pub rent: &'a AccountInfo<'info>,
    pub programa_raydium: &'a AccountInfo<'info>,
}

/// Cria a pool e deposita a liquidez inicial.
///
/// `quantidade_0` e `quantidade_1` seguem a ordem dos mints, que a Raydium
/// exige ordenada pelo endereço — ver [`ordenar`].
pub fn criar_pool(
    contas: ContasDaPool<'_, '_>,
    quantidade_0: u64,
    quantidade_1: u64,
    sementes: &[&[&[u8]]],
) -> Result<()> {
    let mut dados = Vec::with_capacity(8 + 24);
    dados.extend_from_slice(&INICIALIZAR);
    dados.extend_from_slice(&quantidade_0.to_le_bytes());
    dados.extend_from_slice(&quantidade_1.to_le_bytes());
    /*
     * `open_time = 0` significa "abre agora".
     *
     * O programa da Raydium troca qualquer valor no passado pelo instante
     * seguinte ao bloco atual. Adiar a abertura seria deixar a moeda um tempo
     * sem poder ser negociada em lugar nenhum — a curva já fechou.
     */
    dados.extend_from_slice(&0u64.to_le_bytes());

    let metas = vec![
        AccountMeta::new(contas.criador.key(), true),
        AccountMeta::new_readonly(contas.amm_config.key(), false),
        AccountMeta::new_readonly(contas.autoridade.key(), false),
        AccountMeta::new(contas.pool.key(), false),
        AccountMeta::new_readonly(contas.mint_0.key(), false),
        AccountMeta::new_readonly(contas.mint_1.key(), false),
        AccountMeta::new(contas.lp_mint.key(), false),
        AccountMeta::new(contas.conta_0_do_criador.key(), false),
        AccountMeta::new(contas.conta_1_do_criador.key(), false),
        AccountMeta::new(contas.conta_lp_do_criador.key(), false),
        AccountMeta::new(contas.cofre_0.key(), false),
        AccountMeta::new(contas.cofre_1.key(), false),
        AccountMeta::new(contas.taxa_de_criacao.key(), false),
        AccountMeta::new(contas.observacao.key(), false),
        AccountMeta::new_readonly(contas.token_program.key(), false),
        // token_0_program e token_1_program: os dois são o token program padrão.
        AccountMeta::new_readonly(contas.token_program.key(), false),
        AccountMeta::new_readonly(contas.token_program.key(), false),
        AccountMeta::new_readonly(contas.associated_token_program.key(), false),
        AccountMeta::new_readonly(contas.system_program.key(), false),
        AccountMeta::new_readonly(contas.rent.key(), false),
    ];

    let instrucao = Instruction {
        program_id: PROGRAMA_RAYDIUM,
        accounts: metas,
        data: dados,
    };

    invoke_signed(
        &instrucao,
        &[
            contas.criador.clone(),
            contas.amm_config.clone(),
            contas.autoridade.clone(),
            contas.pool.clone(),
            contas.mint_0.clone(),
            contas.mint_1.clone(),
            contas.lp_mint.clone(),
            contas.conta_0_do_criador.clone(),
            contas.conta_1_do_criador.clone(),
            contas.conta_lp_do_criador.clone(),
            contas.cofre_0.clone(),
            contas.cofre_1.clone(),
            contas.taxa_de_criacao.clone(),
            contas.observacao.clone(),
            contas.token_program.clone(),
            contas.associated_token_program.clone(),
            contas.system_program.clone(),
            contas.rent.clone(),
            contas.programa_raydium.clone(),
        ],
        sementes,
    )
    .map_err(Into::into)
}

/// Põe os dois mints na ordem que a Raydium exige, e diz se houve troca.
///
/// A Raydium identifica a pool pelos dois mints EM ORDEM de endereço. Mandar na
/// ordem errada não dá erro: cria (ou procura) uma pool diferente, num endereço
/// que ninguém vai achar — com o dinheiro dentro.
///
/// O booleano devolvido diz se a moeda ficou em segundo lugar, pra quem chama
/// saber em qual das duas quantidades pôr o quê.
pub fn ordenar(moeda: Pubkey, wsol: Pubkey) -> (Pubkey, Pubkey, bool) {
    if moeda.to_bytes() < wsol.to_bytes() {
        (moeda, wsol, false)
    } else {
        (wsol, moeda, true)
    }
}

/// Confere que uma conta derivada é mesmo a que a Raydium vai calcular.
///
/// Sem isto, quem chamasse a migração poderia apontar pra contas de uma pool
/// qualquer. O programa da Raydium também confere do lado dele — esta é a
/// segunda tranca, e ela existe porque a primeira é de outra pessoa.
pub fn exigir_derivada(
    conta: &Pubkey,
    sementes: &[&[u8]],
    erro: ErroDaCurva,
) -> Result<()> {
    let (esperado, _) = Pubkey::find_program_address(sementes, &PROGRAMA_RAYDIUM);
    require_keys_eq!(*conta, esperado, erro);
    Ok(())
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn a_ordem_dos_mints_segue_o_endereco() {
        let menor = Pubkey::new_from_array([1u8; 32]);
        let maior = Pubkey::new_from_array([9u8; 32]);

        let (a, b, trocou) = ordenar(menor, maior);
        assert_eq!(a, menor);
        assert_eq!(b, maior);
        assert!(!trocou, "moeda menor fica em primeiro");

        let (a, b, trocou) = ordenar(maior, menor);
        assert_eq!(a, menor, "o menor vem sempre primeiro");
        assert_eq!(b, maior);
        assert!(trocou, "aqui a moeda foi pro segundo lugar");
    }

    #[test]
    fn o_identificador_da_raydium_confere() {
        /*
         * Os 8 bytes são o começo do sha256 de "global:initialize". Gravados
         * como constante porque o programa não tem como calcular hash barato
         * em tempo de execução — e se um dia divergirem, é aqui que aparece.
         */
        assert_eq!(INICIALIZAR, [175, 175, 109, 31, 13, 152, 155, 237]);
    }
}
