use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::instruction::Instruction;

use crate::errors::ErroDaCurva;

/// Dá nome, símbolo e imagem ao token.
///
/// ---------------------------------------------------------------------------
/// POR QUE ISTO PRECISA EXISTIR
/// ---------------------------------------------------------------------------
/// Um token na Solana não guarda nome nem imagem. Quem guarda é uma conta
/// separada, do programa de metadados da Metaplex, que toda carteira e todo
/// explorador sabem ler. Sem ela o token aparece como "Unknown" na Phantom,
/// sem figura e sem símbolo — existe, mas ninguém reconhece.
///
/// ---------------------------------------------------------------------------
/// POR QUE AQUI DENTRO, E NÃO NUMA SEGUNDA TRANSAÇÃO
/// ---------------------------------------------------------------------------
/// Criar a conta de metadados exige a assinatura da AUTORIDADE DE EMISSÃO do
/// token — e o nosso `create` renuncia a ela no mesmo lançamento, de propósito,
/// pra ninguém poder emitir mais. Então só existe uma janela: depois de criar
/// o token e antes de abrir mão da autoridade.
///
/// Deixar pra uma segunda transação significaria ou adiar a renúncia (abrindo
/// espaço pra emitir mais) ou aceitar tokens sem nome quando a segunda falhar.
///
/// ---------------------------------------------------------------------------
/// POR QUE A CHAMADA É MONTADA À MÃO
/// ---------------------------------------------------------------------------
/// O SDK oficial só está publicado em versão alfa. Depender de alfa num
/// programa que segura dinheiro alheio é pior do que escrever os sessenta bytes
/// abaixo — o formato desta instrução não muda há anos, e o teste na rede local
/// roda contra o programa REAL da Metaplex, copiado da mainnet.

/// Endereço do programa de metadados. O mesmo em todas as redes.
pub const PROGRAMA_DE_METADADOS: Pubkey = pubkey!("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

/// Código da instrução `CreateMetadataAccountV3`.
const CRIAR_METADADOS_V3: u8 = 33;

/// Limites do formato on-chain. Passar deles faz a rede recusar a transação.
pub const MAX_NOME: usize = 32;
pub const MAX_SIMBOLO: usize = 10;
pub const MAX_URI: usize = 200;

/// Texto em Borsh: 4 bytes de tamanho, little-endian, e depois os bytes.
fn texto(valor: &str) -> Vec<u8> {
    let bytes = valor.as_bytes();
    let mut saida = Vec::with_capacity(4 + bytes.len());
    saida.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
    saida.extend_from_slice(bytes);
    saida
}

/// Cria a conta de metadados do token.
///
/// `sementes` são as da curva: é ela que assina, porque é ela que detém a
/// autoridade de emissão nesse instante.
pub fn criar<'info>(params: CriarMetadados<'_, 'info>) -> Result<()> {
    require!(
        params.nome.len() <= MAX_NOME
            && params.simbolo.len() <= MAX_SIMBOLO
            && params.uri.len() <= MAX_URI,
        ErroDaCurva::TextoLongoDemais
    );

    let mut dados = vec![CRIAR_METADADOS_V3];

    // DataV2
    dados.extend(texto(params.nome));
    dados.extend(texto(params.simbolo));
    dados.extend(texto(params.uri));
    // seller_fee_basis_points: sem royalty. Isto é uma moeda, não uma obra.
    dados.extend_from_slice(&0u16.to_le_bytes());
    /*
     * creators, collection e uses: todos ausentes.
     *
     * Em Borsh, opcional ausente é um único byte zero. A lista de criadores
     * existe pra dividir royalty de NFT; aqui não há royalty pra dividir, e
     * quem lançou já está registrado na conta da curva e no JSON externo.
     */
    dados.push(0); // creators: None
    dados.push(0); // collection: None
    dados.push(0); // uses: None

    /*
     * is_mutable = false.
     *
     * O nome, o símbolo e a imagem ficam congelados pra sempre. É o que a tela
     * de criação promete a quem lança — e, mais importante, é o que protege
     * quem compra: sem isto, o dono poderia trocar a moeda por outra coisa
     * depois de vendida, mantendo o mesmo endereço.
     */
    dados.push(0);

    // collection_details: None
    dados.push(0);

    let contas = vec![
        AccountMeta::new(params.metadados.key(), false),
        AccountMeta::new_readonly(params.mint.key(), false),
        // A curva assina nos dois papéis: emite e atualiza.
        AccountMeta::new_readonly(params.curva.key(), true),
        AccountMeta::new(params.pagador.key(), true),
        AccountMeta::new_readonly(params.curva.key(), true),
        AccountMeta::new_readonly(params.system_program.key(), false),
    ];

    let instrucao = Instruction {
        program_id: PROGRAMA_DE_METADADOS,
        accounts: contas,
        data: dados,
    };

    invoke_signed(
        &instrucao,
        &[
            params.metadados.clone(),
            params.mint.clone(),
            params.curva.clone(),
            params.pagador.clone(),
            params.system_program.clone(),
            params.programa_de_metadados.clone(),
        ],
        params.sementes,
    )
    .map_err(Into::into)
}

/// As contas que a criação de metadados precisa.
pub struct CriarMetadados<'a, 'info> {
    pub metadados: &'a AccountInfo<'info>,
    pub mint: &'a AccountInfo<'info>,
    /// A curva: detém a autoridade de emissão e assina.
    pub curva: &'a AccountInfo<'info>,
    pub pagador: &'a AccountInfo<'info>,
    pub system_program: &'a AccountInfo<'info>,
    pub programa_de_metadados: &'a AccountInfo<'info>,
    pub sementes: &'a [&'a [&'a [u8]]],
    pub nome: &'a str,
    pub simbolo: &'a str,
    pub uri: &'a str,
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn texto_segue_o_formato_borsh() {
        // "abc" → 3 em 4 bytes little-endian, depois os bytes.
        assert_eq!(texto("abc"), vec![3, 0, 0, 0, b'a', b'b', b'c']);
        assert_eq!(texto(""), vec![0, 0, 0, 0]);
    }

    #[test]
    fn acentos_contam_em_bytes_nao_em_letras() {
        /*
         * "Gatão" tem 5 letras e 6 bytes. O limite do formato é em BYTES, e é
         * por isso que o tamanho vem de `as_bytes().len()` — usar a contagem de
         * caracteres deixaria passar um nome que a rede recusa.
         */
        let t = texto("Gatão");
        assert_eq!(&t[0..4], &[6, 0, 0, 0]);
        assert_eq!(t.len(), 10);
    }
}
