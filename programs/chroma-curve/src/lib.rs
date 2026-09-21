#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, SetAuthority, Token, TokenAccount};
use anchor_spl::token::spl_token::instruction::AuthorityType;

pub mod curva;
pub mod errors;
pub mod metadados;
pub mod state;

use curva::Curva;
use errors::ErroDaCurva;
use state::{dividir_taxa, Config, Curve, FAIXAS};

/*
 * O endereço deste programa na rede.
 *
 * Vem do par de chaves em `target/deploy/chroma_curve-keypair.json`, que fica
 * FORA do repositório: quem tiver aquele arquivo pode publicar código novo
 * neste mesmo endereço. Perder o arquivo significa nunca mais atualizar o
 * programa; vazar significa que outra pessoa atualiza por você.
 */
declare_id!("2uAzEJEhVdEsk3DVMrkrcnHCmoFicmg8QPk7xKw8uqB4");

/// Semente do PDA global.
pub const SEMENTE_CONFIG: &[u8] = b"config";
/// Semente do PDA de cada curva, junto com o mint.
pub const SEMENTE_CURVA: &[u8] = b"curve";

/// Casas decimais de toda moeda lançada aqui.
///
/// Seis, e não nove. Com nove, os números do fornecimento passam de u64 quando
/// multiplicados na curva e obrigariam u128 em todo lugar; com seis, um
/// bilhão de tokens cabe folgado. É também o que as outras plataformas usam,
/// então carteiras e exploradores já exibem certo.
pub const CASAS: u8 = 6;

/// Teto absoluto da taxa total, acima do padrão de hoje mas ainda sóbrio.
///
/// Serve pra que um erro de configuração não consiga transformar a plataforma
/// numa armadilha. Está no código, e não na conta de configuração, justamente
/// pra que nem a autoridade consiga passar disso sem publicar um programa novo
/// — o que é público e visível.
pub const TETO_TAXA_BPS: u16 = 1_000;

#[program]
pub mod chroma_curve {
    use super::*;

    /// Cria a configuração global. Roda uma vez, no deploy.
    pub fn initialize_config(ctx: Context<IniciarConfig>, params: ParametrosDaConfig) -> Result<()> {
        params.validar()?;

        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.platform_wallet = params.platform_wallet;
        config.total_fee_bps = params.total_fee_bps;
        config.affiliate_fee_bps = params.affiliate_fee_bps;
        config.platform_floor_bps = params.platform_floor_bps;
        config.tier_thresholds = params.tier_thresholds;
        config.tier_creator_bps = params.tier_creator_bps;
        config.initial_virtual_sol = params.initial_virtual_sol;
        config.initial_virtual_token = params.initial_virtual_token;
        config.initial_real_token = params.initial_real_token;
        config.total_supply = params.total_supply;
        config.launch_fee_lamports = params.launch_fee_lamports;
        config.paused = false;
        config.bump = ctx.bumps.config;

        Ok(())
    }

    /// Altera a configuração. Só a autoridade.
    pub fn update_config(ctx: Context<AlterarConfig>, params: ParametrosDaConfig) -> Result<()> {
        params.validar()?;

        let config = &mut ctx.accounts.config;
        config.platform_wallet = params.platform_wallet;
        config.total_fee_bps = params.total_fee_bps;
        config.affiliate_fee_bps = params.affiliate_fee_bps;
        config.platform_floor_bps = params.platform_floor_bps;
        config.tier_thresholds = params.tier_thresholds;
        config.tier_creator_bps = params.tier_creator_bps;
        config.initial_virtual_sol = params.initial_virtual_sol;
        config.initial_virtual_token = params.initial_virtual_token;
        config.initial_real_token = params.initial_real_token;
        config.total_supply = params.total_supply;
        config.launch_fee_lamports = params.launch_fee_lamports;

        Ok(())
    }

    /// Liga e desliga as operações.
    ///
    /// Pausar impede CRIAR e COMPRAR, nunca VENDER. Uma trava que prenda quem
    /// já está dentro não é proteção, é sequestro — e seria indistinguível de
    /// um golpe do ponto de vista de quem comprou.
    pub fn set_paused(ctx: Context<AlterarConfig>, paused: bool) -> Result<()> {
        ctx.accounts.config.paused = paused;
        Ok(())
    }

    /// Lança uma moeda: cria o token, dá nome a ele, emite tudo pra curva e
    /// abre mão da emissão.
    ///
    /// A ordem importa e não pode mudar: dar nome exige a autoridade de
    /// emissão, e a renúncia a ela é o último passo. Ver `metadados.rs`.
    ///
    /// @param uri endereço do JSON com nome, imagem e redes sociais. É gravado
    /// de forma imutável — se apontar pro vazio, a moeda fica sem imagem pra
    /// sempre. Por isso o site publica o arquivo ANTES de mandar a transação.
    pub fn create(ctx: Context<Criar>, nome: String, simbolo: String, uri: String) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(!config.paused, ErroDaCurva::Pausado);

        let mint = ctx.accounts.mint.key();
        let sementes: &[&[&[u8]]] = &[&[SEMENTE_CURVA, mint.as_ref(), &[ctx.bumps.curva]]];

        // Emite o fornecimento inteiro direto no cofre da curva.
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                token::MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.cofre.to_account_info(),
                    authority: ctx.accounts.curva.to_account_info(),
                },
                sementes,
            ),
            config.total_supply,
        )?;

        // Nome, símbolo e imagem — enquanto a curva ainda pode emitir.
        metadados::criar(metadados::CriarMetadados {
            metadados: &ctx.accounts.metadados,
            mint: &ctx.accounts.mint.to_account_info(),
            curva: &ctx.accounts.curva.to_account_info(),
            pagador: &ctx.accounts.criador.to_account_info(),
            system_program: &ctx.accounts.system_program.to_account_info(),
            programa_de_metadados: &ctx.accounts.programa_de_metadados,
            sementes,
            nome: &nome,
            simbolo: &simbolo,
            uri: &uri,
        })?;

        /*
         * Renúncia ao mint, no MESMO lançamento.
         *
         * Enquanto existir autoridade de emissão, quem a tiver pode criar
         * tokens do nada e diluir todo mundo. Deixar pra revogar depois seria
         * pedir confiança; revogar aqui transforma "não vamos emitir mais" de
         * promessa em fato verificável por qualquer um.
         */
        token::set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                SetAuthority {
                    current_authority: ctx.accounts.curva.to_account_info(),
                    account_or_mint: ctx.accounts.mint.to_account_info(),
                },
                sementes,
            ),
            AuthorityType::MintTokens,
            None,
        )?;

        // Taxa de lançamento, quando houver (hoje é zero na Solana).
        if config.launch_fee_lamports > 0 {
            system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.key(),
                    system_program::Transfer {
                        from: ctx.accounts.criador.to_account_info(),
                        to: ctx.accounts.carteira_plataforma.to_account_info(),
                    },
                ),
                config.launch_fee_lamports,
            )?;
        }

        let curva = &mut ctx.accounts.curva;
        curva.mint = mint;
        curva.creator = ctx.accounts.criador.key();
        curva.virtual_sol_reserves = config.initial_virtual_sol;
        curva.virtual_token_reserves = config.initial_virtual_token;
        curva.real_sol_reserves = 0;
        curva.real_token_reserves = config.initial_real_token;
        curva.cumulative_sol_volume = 0;
        curva.complete = false;
        curva.bump = ctx.bumps.curva;

        emit!(MoedaCriada {
            mint,
            uri,
            criador: curva.creator,
            virtual_sol: curva.virtual_sol_reserves,
            virtual_token: curva.virtual_token_reserves,
            a_venda: curva.real_token_reserves,
        });

        Ok(())
    }

    /// Compra tokens da curva com SOL.
    ///
    /// `max_sol` é o teto que a pessoa aceita gastar e `min_tokens` o mínimo
    /// que aceita receber. Os dois existem porque entre montar a transação e
    /// ela ser processada o preço muda — sem eles, toda compra seria uma
    /// ordem a mercado sem limite, que é o que sanduíche come.
    pub fn buy<'info>(
        ctx: Context<'info, Negociar<'info>>,
        max_sol: u64,
        min_tokens: u64,
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(!config.paused, ErroDaCurva::Pausado);
        require!(!ctx.accounts.curva.complete, ErroDaCurva::CurvaConcluida);
        require!(max_sol > 0, ErroDaCurva::ValorZero);

        let afiliado = ctx.accounts.afiliado.as_ref();
        if let Some(a) = afiliado {
            require_keys_neq!(
                a.key(),
                ctx.accounts.trader.key(),
                ErroDaCurva::AfiliadoEhOProprioTrader
            );
        }

        let volume = ctx.accounts.curva.cumulative_sol_volume;
        let divisao = dividir_taxa(config, max_sol, volume, afiliado.is_some())?;
        let liquido = max_sol
            .checked_sub(divisao.total)
            .ok_or(ErroDaCurva::EstouroDeCalculo)?;

        let curva_leitura = &ctx.accounts.curva;
        let bruto = Curva::tokens_por_sol(
            curva_leitura.virtual_sol_reserves,
            curva_leitura.virtual_token_reserves,
            liquido,
        )?;

        /*
         * A última compra não pode pedir mais token do que resta.
         *
         * Quando pede, ela leva o que sobrou e a curva encerra. Quem comprou
         * recebe menos do que a cotação sugeria — e é exatamente por isso que
         * `min_tokens` existe: a interface cota o valor certo, e quem montou a
         * transação com outro número é protegido pelo mínimo, não surpreendido.
         */
        let tokens = bruto.min(curva_leitura.real_token_reserves);
        require!(tokens > 0, ErroDaCurva::TokensInsuficientes);
        require!(tokens >= min_tokens, ErroDaCurva::AbaixoDoMinimo);

        // O SOL líquido vai pra curva; as taxas vão direto pras três pontas.
        transferir_do_trader(&ctx, ctx.accounts.curva.to_account_info(), liquido)?;
        pagar_taxas(&ctx, &divisao)?;

        let mint = ctx.accounts.mint.key();
        let sementes: &[&[&[u8]]] = &[&[SEMENTE_CURVA, mint.as_ref(), &[ctx.accounts.curva.bump]]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                token::Transfer {
                    from: ctx.accounts.cofre.to_account_info(),
                    to: ctx.accounts.conta_do_trader.to_account_info(),
                    authority: ctx.accounts.curva.to_account_info(),
                },
                sementes,
            ),
            tokens,
        )?;

        let curva = &mut ctx.accounts.curva;
        curva.virtual_sol_reserves = curva
            .virtual_sol_reserves
            .checked_add(liquido)
            .ok_or(ErroDaCurva::EstouroDeCalculo)?;
        curva.virtual_token_reserves = curva
            .virtual_token_reserves
            .checked_sub(tokens)
            .ok_or(ErroDaCurva::EstouroDeCalculo)?;
        curva.real_sol_reserves = curva
            .real_sol_reserves
            .checked_add(liquido)
            .ok_or(ErroDaCurva::EstouroDeCalculo)?;
        curva.real_token_reserves = curva
            .real_token_reserves
            .checked_sub(tokens)
            .ok_or(ErroDaCurva::EstouroDeCalculo)?;
        curva.cumulative_sol_volume = curva.cumulative_sol_volume.saturating_add(max_sol);

        if curva.real_token_reserves == 0 {
            curva.complete = true;
            emit!(CurvaEncheu {
                mint,
                sol_arrecadado: curva.real_sol_reserves,
            });
        }

        emit!(Negocio {
            mint,
            trader: ctx.accounts.trader.key(),
            compra: true,
            sol: max_sol,
            tokens,
            taxa_criador: divisao.criador,
            taxa_afiliado: divisao.afiliado,
            taxa_plataforma: divisao.plataforma,
            afiliado: afiliado.map(|a| a.key()),
        });

        Ok(())
    }

    /// Vende tokens de volta pra curva.
    ///
    /// Não é bloqueada por pausa: ver `set_paused`.
    pub fn sell<'info>(
        ctx: Context<'info, Negociar<'info>>,
        tokens: u64,
        min_sol: u64,
    ) -> Result<()> {
        require!(!ctx.accounts.curva.complete, ErroDaCurva::CurvaConcluida);
        require!(tokens > 0, ErroDaCurva::ValorZero);

        let afiliado = ctx.accounts.afiliado.as_ref();
        if let Some(a) = afiliado {
            require_keys_neq!(
                a.key(),
                ctx.accounts.trader.key(),
                ErroDaCurva::AfiliadoEhOProprioTrader
            );
        }

        let curva_leitura = &ctx.accounts.curva;
        let bruto = Curva::sol_por_tokens(
            curva_leitura.virtual_sol_reserves,
            curva_leitura.virtual_token_reserves,
            tokens,
        )?;
        require!(
            bruto <= curva_leitura.real_sol_reserves,
            ErroDaCurva::SolInsuficiente
        );

        let config = &ctx.accounts.config;
        let volume = curva_leitura.cumulative_sol_volume;
        let divisao = dividir_taxa(config, bruto, volume, afiliado.is_some())?;
        let liquido = bruto
            .checked_sub(divisao.total)
            .ok_or(ErroDaCurva::EstouroDeCalculo)?;
        require!(liquido >= min_sol, ErroDaCurva::AbaixoDoMinimo);

        // Os tokens entram na curva antes de qualquer lamport sair dela.
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                token::Transfer {
                    from: ctx.accounts.conta_do_trader.to_account_info(),
                    to: ctx.accounts.cofre.to_account_info(),
                    authority: ctx.accounts.trader.to_account_info(),
                },
            ),
            tokens,
        )?;

        pagar_da_curva(&ctx, ctx.accounts.trader.to_account_info(), liquido)?;
        pagar_da_curva(
            &ctx,
            ctx.accounts.criador.to_account_info(),
            divisao.criador,
        )?;
        pagar_da_curva(
            &ctx,
            ctx.accounts.carteira_plataforma.to_account_info(),
            divisao.plataforma,
        )?;
        if let Some(a) = afiliado {
            pagar_da_curva(&ctx, a.to_account_info(), divisao.afiliado)?;
        }

        let curva = &mut ctx.accounts.curva;
        curva.virtual_sol_reserves = curva
            .virtual_sol_reserves
            .checked_sub(bruto)
            .ok_or(ErroDaCurva::EstouroDeCalculo)?;
        curva.virtual_token_reserves = curva
            .virtual_token_reserves
            .checked_add(tokens)
            .ok_or(ErroDaCurva::EstouroDeCalculo)?;
        curva.real_sol_reserves = curva
            .real_sol_reserves
            .checked_sub(bruto)
            .ok_or(ErroDaCurva::EstouroDeCalculo)?;
        curva.real_token_reserves = curva
            .real_token_reserves
            .checked_add(tokens)
            .ok_or(ErroDaCurva::EstouroDeCalculo)?;
        curva.cumulative_sol_volume = curva.cumulative_sol_volume.saturating_add(bruto);

        emit!(Negocio {
            mint: curva.mint,
            trader: ctx.accounts.trader.key(),
            compra: false,
            sol: liquido,
            tokens,
            taxa_criador: divisao.criador,
            taxa_afiliado: divisao.afiliado,
            taxa_plataforma: divisao.plataforma,
            afiliado: afiliado.map(|a| a.key()),
        });

        Ok(())
    }
}

/* ------------------------------------------------------------------ */
/* Movimentação de lamports                                            */
/* ------------------------------------------------------------------ */

/// Manda lamports do trader (que assina) pra alguém.
fn transferir_do_trader<'info>(
    ctx: &Context<'info, Negociar<'info>>,
    destino: AccountInfo<'info>,
    valor: u64,
) -> Result<()> {
    if valor == 0 {
        return Ok(());
    }
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            system_program::Transfer {
                from: ctx.accounts.trader.to_account_info(),
                to: destino,
            },
        ),
        valor,
    )
}

/// Paga as três pontas a partir da carteira do trader (caso da compra).
fn pagar_taxas<'info>(
    ctx: &Context<'info, Negociar<'info>>,
    divisao: &state::Divisao,
) -> Result<()> {
    transferir_do_trader(
        ctx,
        ctx.accounts.criador.to_account_info(),
        divisao.criador,
    )?;
    transferir_do_trader(
        ctx,
        ctx.accounts.carteira_plataforma.to_account_info(),
        divisao.plataforma,
    )?;
    if let Some(a) = ctx.accounts.afiliado.as_ref() {
        transferir_do_trader(ctx, a.to_account_info(), divisao.afiliado)?;
    }
    Ok(())
}

/// Tira lamports da conta da curva.
///
/// A curva é dona do próprio saldo, então a saída é feita mexendo nos lamports
/// direto — uma transferência pelo programa do sistema exigiria que a conta
/// assinasse, e conta de programa não assina.
///
/// A checagem de isenção de aluguel não é detalhe: se o saldo cair abaixo
/// dela, a rede apaga a conta, e junto com ela some o estado da curva de todo
/// mundo que ainda tem a moeda.
fn pagar_da_curva<'info>(
    ctx: &Context<'info, Negociar<'info>>,
    destino: AccountInfo<'info>,
    valor: u64,
) -> Result<()> {
    if valor == 0 {
        return Ok(());
    }

    let curva = ctx.accounts.curva.to_account_info();
    let minimo = Rent::get()?.minimum_balance(curva.data_len());

    let saldo = curva.lamports();
    let restante = saldo
        .checked_sub(valor)
        .ok_or(ErroDaCurva::SolInsuficiente)?;
    require!(restante >= minimo, ErroDaCurva::SolInsuficiente);

    **curva.try_borrow_mut_lamports()? = restante;
    **destino.try_borrow_mut_lamports()? = destino
        .lamports()
        .checked_add(valor)
        .ok_or(ErroDaCurva::EstouroDeCalculo)?;

    Ok(())
}

/* ------------------------------------------------------------------ */
/* Parâmetros                                                          */
/* ------------------------------------------------------------------ */

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ParametrosDaConfig {
    pub platform_wallet: Pubkey,
    pub total_fee_bps: u16,
    pub affiliate_fee_bps: u16,
    pub platform_floor_bps: u16,
    pub tier_thresholds: [u64; FAIXAS],
    pub tier_creator_bps: [u16; FAIXAS],
    pub initial_virtual_sol: u64,
    pub initial_virtual_token: u64,
    pub initial_real_token: u64,
    pub total_supply: u64,
    pub launch_fee_lamports: u64,
}

impl ParametrosDaConfig {
    fn validar(&self) -> Result<()> {
        require!(
            self.total_fee_bps <= TETO_TAXA_BPS,
            ErroDaCurva::TaxaTotalAltaDemais
        );

        // As faixas têm que subir; uma faixa fora de ordem nunca seria atingida.
        for i in 1..FAIXAS {
            require!(
                self.tier_thresholds[i] > self.tier_thresholds[i - 1],
                ErroDaCurva::FaixasMalConfiguradas
            );
        }

        // Nenhuma faixa pode, sozinha, estourar o total nem furar o piso.
        for i in 0..FAIXAS {
            let comprometido = self.tier_creator_bps[i]
                .checked_add(self.affiliate_fee_bps)
                .and_then(|v| v.checked_add(self.platform_floor_bps))
                .ok_or(ErroDaCurva::FaixasMalConfiguradas)?;
            require!(
                comprometido <= self.total_fee_bps,
                ErroDaCurva::FaixasMalConfiguradas
            );
        }

        require!(
            self.initial_virtual_sol > 0
                && self.initial_virtual_token > 0
                && self.initial_real_token > 0
                && self.initial_real_token <= self.total_supply
                && self.initial_real_token <= self.initial_virtual_token,
            ErroDaCurva::CurvaInvalida
        );

        Ok(())
    }
}

/* ------------------------------------------------------------------ */
/* Contas                                                              */
/* ------------------------------------------------------------------ */

#[derive(Accounts)]
pub struct IniciarConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Config::INIT_SPACE,
        seeds = [SEMENTE_CONFIG],
        bump
    )]
    pub config: Account<'info, Config>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AlterarConfig<'info> {
    #[account(address = config.authority)]
    pub authority: Signer<'info>,

    #[account(mut, seeds = [SEMENTE_CONFIG], bump = config.bump)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct Criar<'info> {
    #[account(mut)]
    pub criador: Signer<'info>,

    #[account(seeds = [SEMENTE_CONFIG], bump = config.bump)]
    pub config: Account<'info, Config>,

    /*
     * Sem autoridade de congelamento, e isso é decidido aqui.
     *
     * Quem tem essa autoridade consegue congelar a conta de qualquer pessoa e
     * impedir que ela venda. Anchor deixa o campo vazio quando não é
     * declarado, e vazio é o que queremos: não existe.
     */
    #[account(
        init,
        payer = criador,
        mint::decimals = CASAS,
        mint::authority = curva,
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = criador,
        space = 8 + Curve::INIT_SPACE,
        seeds = [SEMENTE_CURVA, mint.key().as_ref()],
        bump
    )]
    pub curva: Account<'info, Curve>,

    #[account(
        init,
        payer = criador,
        associated_token::mint = mint,
        associated_token::authority = curva,
    )]
    pub cofre: Account<'info, TokenAccount>,

    /// CHECK: conferida contra a configuração.
    #[account(
        mut,
        address = config.platform_wallet @ ErroDaCurva::CarteiraDaPlataformaErrada
    )]
    pub carteira_plataforma: UncheckedAccount<'info>,

    /*
     * A conta de metadados. O endereço é derivado — não escolhido — e a
     * derivação é conferida aqui, com as sementes do programa da Metaplex.
     *
     * Sem esta checagem, quem chamasse poderia passar qualquer conta no lugar;
     * a Metaplex recusaria, mas a mensagem de erro sairia de lá e não daqui,
     * dificultando entender o que houve.
     */
    /// CHECK: endereço validado pelas sementes abaixo e pela própria Metaplex.
    #[account(
        mut,
        seeds = [b"metadata", metadados::PROGRAMA_DE_METADADOS.as_ref(), mint.key().as_ref()],
        bump,
        seeds::program = metadados::PROGRAMA_DE_METADADOS,
    )]
    pub metadados: UncheckedAccount<'info>,

    /// CHECK: conferido contra o endereço fixo do programa da Metaplex.
    #[account(address = metadados::PROGRAMA_DE_METADADOS)]
    pub programa_de_metadados: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct Negociar<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,

    #[account(seeds = [SEMENTE_CONFIG], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [SEMENTE_CURVA, mint.key().as_ref()],
        bump = curva.bump,
        has_one = mint,
    )]
    pub curva: Account<'info, Curve>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = curva,
    )]
    pub cofre: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = trader,
        associated_token::mint = mint,
        associated_token::authority = trader,
    )]
    pub conta_do_trader: Account<'info, TokenAccount>,

    /// CHECK: conferido contra o criador gravado na curva.
    #[account(mut, address = curva.creator @ ErroDaCurva::CriadorErrado)]
    pub criador: UncheckedAccount<'info>,

    /// CHECK: conferida contra a configuração.
    #[account(
        mut,
        address = config.platform_wallet @ ErroDaCurva::CarteiraDaPlataformaErrada
    )]
    pub carteira_plataforma: UncheckedAccount<'info>,

    /*
     * Opcional: quando não há indicação, a fatia do afiliado simplesmente não
     * é cobrada — e não vira bônus da plataforma. É o mesmo que a interface
     * promete na página de taxas.
     */
    /// CHECK: só recebe lamports; não é lida.
    #[account(mut)]
    pub afiliado: Option<UncheckedAccount<'info>>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

/* ------------------------------------------------------------------ */
/* Eventos                                                             */
/* ------------------------------------------------------------------ */

#[event]
pub struct MoedaCriada {
    pub mint: Pubkey,
    /// Onde estão nome e imagem — o indexador precisa disto.
    pub uri: String,
    pub criador: Pubkey,
    pub virtual_sol: u64,
    pub virtual_token: u64,
    pub a_venda: u64,
}

/// Um negócio. É daqui que o gráfico e o painel de indicação se alimentam.
#[event]
pub struct Negocio {
    pub mint: Pubkey,
    pub trader: Pubkey,
    pub compra: bool,
    pub sol: u64,
    pub tokens: u64,
    pub taxa_criador: u64,
    pub taxa_afiliado: u64,
    pub taxa_plataforma: u64,
    pub afiliado: Option<Pubkey>,
}

#[event]
pub struct CurvaEncheu {
    pub mint: Pubkey,
    pub sol_arrecadado: u64,
}
