use anchor_lang::prelude::*;

use crate::errors::ErroDaCurva;

/// Denominador dos basis points. 100 bps = 1%.
pub const BPS: u64 = 10_000;

/// Quantas faixas de comissão do criador existem.
pub const FAIXAS: usize = 4;

/// Configuração global da plataforma.
///
/// Fica numa conta só, com PDA fixo, e vale pra todas as moedas. Os números da
/// curva e das taxas moram AQUI, e não no código, porque mudar um parâmetro
/// econômico não deveria exigir publicar um programa novo — publicar de novo
/// troca o código que já está segurando dinheiro de terceiros, e isso é bem
/// mais arriscado do que alterar um campo.
///
/// O que NÃO é configurável de propósito: o piso da plataforma é checado a
/// cada operação, então nem a própria autoridade consegue montar uma
/// combinação de faixas que zere a fatia do criador.
#[account]
#[derive(InitSpace)]
pub struct Config {
    /// Quem pode alterar esta conta.
    pub authority: Pubkey,
    /// Recebe a fatia da plataforma em cada operação.
    pub platform_wallet: Pubkey,

    /// O que o trader paga no total, em bps. Hoje 125 (1,25%).
    pub total_fee_bps: u16,
    /// Fatia de quem indicou, quando há indicação. Hoje 30 (0,30%).
    pub affiliate_fee_bps: u16,
    /// A plataforma nunca pode ficar abaixo disto. Hoje 20 (0,20%).
    pub platform_floor_bps: u16,

    /// Volume acumulado, em lamports, a partir do qual cada faixa vale.
    ///
    /// Em SOL e não em dólar porque o programa não tem como saber a cotação:
    /// dentro da rede não existe preço em dólar sem depender de um oráculo, e
    /// amarrar cada compra a um serviço externo significa que a compra falha
    /// quando ele falha.
    pub tier_thresholds: [u64; FAIXAS],
    /// Fatia do criador em cada faixa, em bps.
    pub tier_creator_bps: [u16; FAIXAS],

    /// Reservas virtuais iniciais — definem o preço de largada da curva.
    pub initial_virtual_sol: u64,
    pub initial_virtual_token: u64,
    /// Quantos tokens ficam à venda na curva.
    pub initial_real_token: u64,
    /// Emissão total do token.
    pub total_supply: u64,

    /// Cobrado de quem lança. Zero na Solana hoje.
    pub launch_fee_lamports: u64,

    /// Trava de emergência: impede criar e negociar, mas nunca impede vender.
    pub paused: bool,
    pub bump: u8,
}

/// Estado da curva de uma moeda.
///
/// Uma conta por token, com PDA derivado do mint. É ela que guarda o SOL
/// arrecadado e é dona da conta de tokens à venda.
#[account]
#[derive(InitSpace)]
pub struct Curve {
    pub mint: Pubkey,
    /// Quem lançou; recebe a fatia de criador de cada operação.
    pub creator: Pubkey,

    /// Reservas virtuais: é com elas que o preço é calculado.
    pub virtual_sol_reserves: u64,
    pub virtual_token_reserves: u64,

    /// Reservas reais: é o que existe de fato em conta.
    ///
    /// Separar as duas é o que permite a curva começar com preço razoável sem
    /// precisar de SOL depositado. A parte virtual só existe na conta; a real
    /// é a que pode ser sacada, e é por ela que a migração se guia.
    pub real_sol_reserves: u64,
    pub real_token_reserves: u64,

    /// Soma de tudo que já passou pela curva, em lamports. Decide a faixa.
    pub cumulative_sol_volume: u64,

    /// Curva concluída: os tokens acabaram e a moeda vai migrar pra uma DEX.
    /// A partir daqui não se compra nem vende mais por aqui.
    pub complete: bool,
    pub bump: u8,
}

impl Config {
    /// Fatia do criador conforme o volume já acumulado pela moeda.
    ///
    /// Percorre de trás pra frente e devolve a primeira faixa alcançada: assim
    /// acrescentar faixas no futuro não muda o resultado das que já valiam.
    pub fn creator_bps_para(&self, volume_acumulado: u64) -> u16 {
        for i in (0..FAIXAS).rev() {
            if volume_acumulado >= self.tier_thresholds[i] {
                return self.tier_creator_bps[i];
            }
        }
        self.tier_creator_bps[0]
    }
}

/// Como uma taxa se divide entre as três pontas.
#[derive(Clone, Copy, Debug, Default, AnchorSerialize, AnchorDeserialize)]
pub struct Divisao {
    pub total: u64,
    pub criador: u64,
    pub afiliado: u64,
    pub plataforma: u64,
}

/// Calcula a divisão da taxa sobre `base` lamports.
///
/// A fatia da plataforma é o RESTO, nunca uma conta à parte. Somar as três
/// pontas separadamente abriria espaço pra sobrar ou faltar um lamport por
/// arredondamento — e um lamport perdido por operação, repetido, é dinheiro
/// que some sem dono. Com o resto, a soma fecha por construção.
pub fn dividir_taxa(
    config: &Config,
    base: u64,
    volume_acumulado: u64,
    tem_afiliado: bool,
) -> Result<Divisao> {
    let bps_de = |bps: u16| -> Result<u64> {
        u64::try_from((base as u128) * (bps as u128) / (BPS as u128))
            .map_err(|_| error!(ErroDaCurva::EstouroDeCalculo))
    };

    let total = bps_de(config.total_fee_bps)?;
    let criador = bps_de(config.creator_bps_para(volume_acumulado))?;
    let afiliado = if tem_afiliado {
        bps_de(config.affiliate_fee_bps)?
    } else {
        0
    };

    let plataforma = total
        .checked_sub(criador)
        .and_then(|v| v.checked_sub(afiliado))
        .ok_or(ErroDaCurva::FaixasMalConfiguradas)?;

    /*
     * O piso é checado aqui, a cada operação, e não só na hora de configurar.
     * Assim nenhuma combinação futura de faixas consegue deixar a plataforma
     * no zero sem que a operação falhe de forma visível.
     */
    let piso = bps_de(config.platform_floor_bps)?;
    require!(plataforma >= piso, ErroDaCurva::FaixasMalConfiguradas);

    Ok(Divisao {
        total,
        criador,
        afiliado,
        plataforma,
    })
}
