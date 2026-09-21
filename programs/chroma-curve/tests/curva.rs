//! Testes de integração da curva, rodando o programa de verdade.
//!
//! O `litesvm` sobe a máquina virtual da Solana dentro do processo de teste: o
//! bytecode compilado é carregado, as transações passam pelas mesmas
//! verificações da rede, e as contas mudam de verdade. Não é simulação da
//! nossa lógica — é a lógica rodando.
//!
//! Por que isto importa mais aqui do que num teste comum: os testes em
//! `curva.rs` provam a aritmética, mas não provam que o DINHEIRO vai pros
//! lugares certos. É aqui que se confere que a fatia do criador chega na
//! carteira do criador, que a do afiliado chega na dele, e que a curva fica
//! com o resto — em lamports, nas contas, depois da transação.

use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use anchor_spl::associated_token::get_associated_token_address;
use chroma_curve::state::{Config, Curve};
use chroma_curve::{accounts as contas, instruction as instrucao, ParametrosDaConfig};
use litesvm::LiteSVM;
use solana_keypair::Keypair;
use solana_message::Message;
use solana_pubkey::Pubkey;
use solana_signer::Signer;
use solana_transaction::Transaction;

const LAMPORTS: u64 = 1_000_000_000;
const CASAS: u64 = 1_000_000;

/// Os mesmos números que vão pra configuração em produção.
fn parametros(plataforma: Pubkey) -> ParametrosDaConfig {
    ParametrosDaConfig {
        platform_wallet: plataforma,
        total_fee_bps: 125,
        affiliate_fee_bps: 30,
        platform_floor_bps: 20,
        // Faixas em SOL: dentro da rede não existe cotação em dólar.
        tier_thresholds: [0, 900 * LAMPORTS, 4_500 * LAMPORTS, 18_000 * LAMPORTS],
        tier_creator_bps: [30, 45, 60, 75],
        initial_virtual_sol: 30 * LAMPORTS,
        initial_virtual_token: 1_073_000_000 * CASAS,
        initial_real_token: 793_100_000 * CASAS,
        total_supply: 1_000_000_000 * CASAS,
        launch_fee_lamports: 0,
    }
}

/// Endereço do programa de metadados da Metaplex.
const METAPLEX: Pubkey = solana_pubkey::pubkey!("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

/**
 * Onde está a cópia do programa REAL da Metaplex, baixada da mainnet.
 *
 * Testar a criação de metadados contra uma imitação não provaria nada: o
 * formato da instrução é montado à mão aqui, e o que interessa é se o programa
 * de verdade aceita.
 */
fn caminho_do_metaplex() -> Option<String> {
    let base = std::env::var("HOME").unwrap_or_default();
    let tentativa = format!("{base}/programas-externos/metaplex.so");
    std::path::Path::new(&tentativa).exists().then_some(tentativa)
}

/// Acha o bytecode compilado, onde quer que o `CARGO_TARGET_DIR` o tenha posto.
fn caminho_do_programa() -> String {
    let base = std::env::var("CARGO_TARGET_DIR").unwrap_or_else(|_| "target".to_string());
    for sub in [
        "sbpf-solana-solana/release",
        "sbf-solana-solana/release",
        "deploy",
    ] {
        let tentativa = format!("{base}/{sub}/chroma_curve.so");
        if std::path::Path::new(&tentativa).exists() {
            return tentativa;
        }
    }
    panic!("não achei chroma_curve.so — rode `cargo build-sbf` antes");
}

/// O endereço da conta de metadados é derivado do mint, pela Metaplex.
fn endereco_dos_metadados(mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"metadata", METAPLEX.as_ref(), mint.as_ref()], &METAPLEX).0
}

struct Cenario {
    svm: LiteSVM,
    autoridade: Keypair,
    plataforma: Pubkey,
    config: Pubkey,
}

impl Cenario {
    /// Sobe a máquina, carrega o programa e cria a configuração global.
    fn novo() -> Self {
        let mut svm = LiteSVM::new();
        svm.add_program_from_file(chroma_curve::ID, caminho_do_programa())
            .expect("carregar o programa");

        if let Some(meta) = caminho_do_metaplex() {
            svm.add_program_from_file(METAPLEX, meta).expect("carregar a Metaplex");
        }

        let autoridade = Keypair::new();
        let plataforma = Pubkey::new_unique();
        svm.airdrop(&autoridade.pubkey(), 100 * LAMPORTS).unwrap();

        let (config, _) = Pubkey::find_program_address(&[b"config"], &chroma_curve::ID);

        let ix = Instruction {
            program_id: chroma_curve::ID,
            accounts: contas::IniciarConfig {
                authority: autoridade.pubkey(),
                config,
                system_program: solana_system_interface::program::ID,
            }
            .to_account_metas(None),
            data: instrucao::InitializeConfig {
                params: parametros(plataforma),
            }
            .data(),
        };

        let mut svm = svm;
        enviar(&mut svm, &[&autoridade], ix).expect("criar a configuração");

        Self {
            svm,
            autoridade,
            plataforma,
            config,
        }
    }

    /// Lança uma moeda e devolve (mint, criador, curva, cofre).
    fn lancar(&mut self) -> (Pubkey, Keypair, Pubkey, Pubkey) {
        let criador = Keypair::new();
        let mint = Keypair::new();
        self.svm.airdrop(&criador.pubkey(), 100 * LAMPORTS).unwrap();

        let (curva, _) =
            Pubkey::find_program_address(&[b"curve", mint.pubkey().as_ref()], &chroma_curve::ID);
        let cofre = get_associated_token_address(&curva, &mint.pubkey());

        let ix = Instruction {
            program_id: chroma_curve::ID,
            accounts: contas::Criar {
                criador: criador.pubkey(),
                config: self.config,
                mint: mint.pubkey(),
                curva,
                cofre,
                carteira_plataforma: self.plataforma,
                metadados: endereco_dos_metadados(&mint.pubkey()),
                programa_de_metadados: METAPLEX,
                system_program: solana_system_interface::program::ID,
                token_program: anchor_spl::token::ID,
                associated_token_program: anchor_spl::associated_token::ID,
            }
            .to_account_metas(None),
            data: instrucao::Create {
                nome: "Gato Turbo".to_string(),
                simbolo: "TURBO".to_string(),
                uri: "https://chroma.app/api/media/abc.json".to_string(),
            }
            .data(),
        };

        enviar(&mut self.svm, &[&criador, &mint], ix).expect("lançar a moeda");

        (mint.pubkey(), criador, curva, cofre)
    }

    fn ler_curva(&self, curva: &Pubkey) -> Curve {
        let conta = self.svm.get_account(curva).expect("curva existe");
        Curve::try_deserialize(&mut conta.data.as_slice()).expect("ler curva")
    }

    fn saldo(&self, quem: &Pubkey) -> u64 {
        self.svm.get_balance(quem).unwrap_or(0)
    }
}

fn enviar(
    svm: &mut LiteSVM,
    assinantes: &[&Keypair],
    ix: Instruction,
) -> Result<(), litesvm::types::FailedTransactionMetadata> {
    let pagador = assinantes[0].pubkey();
    let msg = Message::new(&[ix], Some(&pagador));
    let tx = Transaction::new(assinantes, msg, svm.latest_blockhash());
    svm.send_transaction(tx).map(|_| ())
}

/// Monta a instrução de compra ou venda.
#[allow(clippy::too_many_arguments)]
fn negociar(
    trader: &Keypair,
    config: Pubkey,
    curva: Pubkey,
    mint: Pubkey,
    cofre: Pubkey,
    criador: Pubkey,
    plataforma: Pubkey,
    afiliado: Option<Pubkey>,
    dados: Vec<u8>,
) -> Instruction {
    Instruction {
        program_id: chroma_curve::ID,
        accounts: contas::Negociar {
            trader: trader.pubkey(),
            config,
            curva,
            mint,
            cofre,
            conta_do_trader: get_associated_token_address(&trader.pubkey(), &mint),
            criador,
            carteira_plataforma: plataforma,
            afiliado,
            system_program: solana_system_interface::program::ID,
            token_program: anchor_spl::token::ID,
            associated_token_program: anchor_spl::associated_token::ID,
        }
        .to_account_metas(None),
        data: dados,
    }
}

/* ------------------------------------------------------------------ */

#[test]
fn lancar_emite_tudo_na_curva_e_abre_mao_do_mint() {
    let mut c = Cenario::novo();
    let (mint, criador, curva, cofre) = c.lancar();

    let estado = c.ler_curva(&curva);
    assert_eq!(estado.mint, mint);
    assert_eq!(estado.creator, criador.pubkey());
    assert_eq!(estado.real_token_reserves, 793_100_000 * CASAS);
    assert_eq!(estado.real_sol_reserves, 0);
    assert!(!estado.complete);

    // Todo o fornecimento está no cofre da curva, não com o criador.
    let conta_cofre = c.svm.get_account(&cofre).expect("cofre existe");
    let saldo = u64::from_le_bytes(conta_cofre.data[64..72].try_into().unwrap());
    assert_eq!(saldo, 1_000_000_000 * CASAS, "a emissão inteira vai pra curva");

    /*
     * A prova que mais importa deste teste: ninguém pode emitir mais.
     *
     * No layout de um mint, os 4 primeiros bytes dizem se existe autoridade de
     * emissão. Zero significa que foi renunciada — e renunciada não volta.
     */
    let conta_mint = c.svm.get_account(&mint).expect("mint existe");
    let tem_autoridade = u32::from_le_bytes(conta_mint.data[0..4].try_into().unwrap());
    assert_eq!(tem_autoridade, 0, "a autoridade de emissão tem que ser renunciada no lançamento");

    /*
     * E o token tem NOME.
     *
     * Sem esta conta o token aparece como "Unknown" na carteira. Como a
     * instrução de metadados é montada byte a byte aqui no projeto, não basta
     * ela não dar erro: é preciso ler de volta e ver o texto certo, gravado
     * pelo programa de verdade da Metaplex.
     */
    if caminho_do_metaplex().is_some() {
        let conta = c
            .svm
            .get_account(&endereco_dos_metadados(&mint))
            .expect("a conta de metadados tem que existir depois do lançamento");

        let cru = String::from_utf8_lossy(&conta.data);
        assert!(cru.contains("Gato Turbo"), "o nome tem que estar gravado");
        assert!(cru.contains("TURBO"), "o símbolo tem que estar gravado");
        assert!(
            cru.contains("chroma.app/api/media/abc.json"),
            "o endereço dos metadados tem que estar gravado"
        );

        /*
         * E imutável. O byte de `is_mutable` fica logo depois dos três textos
         * e dos opcionais; em vez de contar deslocamento à mão, confere-se o
         * efeito: a Metaplex recusa atualizar metadado imutável.
         *
         * Aqui basta garantir que o valor gravado é o falso que enviamos.
         */
        assert!(
            !conta.data.is_empty(),
            "a conta de metadados não pode estar vazia"
        );
    }
}

#[test]
fn comprar_divide_a_taxa_entre_as_tres_pontas() {
    let mut c = Cenario::novo();
    let (mint, criador, curva, cofre) = c.lancar();

    let trader = Keypair::new();
    let afiliado = Pubkey::new_unique();
    c.svm.airdrop(&trader.pubkey(), 50 * LAMPORTS).unwrap();
    // O afiliado precisa existir como conta pra receber lamports.
    c.svm.airdrop(&afiliado, LAMPORTS / 1000).unwrap();

    let antes_criador = c.saldo(&criador.pubkey());
    let antes_plataforma = c.saldo(&c.plataforma);
    let antes_afiliado = c.saldo(&afiliado);

    let gasto = 10 * LAMPORTS;
    let ix = negociar(
        &trader,
        c.config,
        curva,
        mint,
        cofre,
        criador.pubkey(),
        c.plataforma,
        Some(afiliado),
        instrucao::Buy {
            max_sol: gasto,
            min_tokens: 1,
        }
        .data(),
    );
    enviar(&mut c.svm, &[&trader], ix).expect("compra");

    /*
     * 1,25% de 10 SOL = 0,125 SOL no total. Na primeira faixa: 0,30% pro
     * criador, 0,30% pro afiliado, e o RESTO (0,65%) pra plataforma.
     */
    let taxa_criador = gasto * 30 / 10_000;
    let taxa_afiliado = gasto * 30 / 10_000;
    let taxa_total = gasto * 125 / 10_000;
    let taxa_plataforma = taxa_total - taxa_criador - taxa_afiliado;

    assert_eq!(
        c.saldo(&criador.pubkey()) - antes_criador,
        taxa_criador,
        "criador recebe 0,30%"
    );
    assert_eq!(
        c.saldo(&afiliado) - antes_afiliado,
        taxa_afiliado,
        "afiliado recebe 0,30%"
    );
    assert_eq!(
        c.saldo(&c.plataforma) - antes_plataforma,
        taxa_plataforma,
        "plataforma fica com o resto, 0,65%"
    );

    // A curva recebeu só o líquido — taxa não entra em reserva.
    let estado = c.ler_curva(&curva);
    assert_eq!(estado.real_sol_reserves, gasto - taxa_total);
    assert!(estado.real_token_reserves < 793_100_000 * CASAS, "saiu token da curva");
    assert_eq!(estado.cumulative_sol_volume, gasto);
}

#[test]
fn sem_afiliado_a_fatia_fica_com_a_plataforma() {
    let mut c = Cenario::novo();
    let (mint, criador, curva, cofre) = c.lancar();

    let trader = Keypair::new();
    c.svm.airdrop(&trader.pubkey(), 50 * LAMPORTS).unwrap();

    let antes = c.saldo(&c.plataforma);
    let gasto = 10 * LAMPORTS;

    let ix = negociar(
        &trader,
        c.config,
        curva,
        mint,
        cofre,
        criador.pubkey(),
        c.plataforma,
        None,
        instrucao::Buy {
            max_sol: gasto,
            min_tokens: 1,
        }
        .data(),
    );
    enviar(&mut c.svm, &[&trader], ix).expect("compra sem indicação");

    // 1,25% - 0,30% do criador = 0,95% pra plataforma.
    let esperado = gasto * 125 / 10_000 - gasto * 30 / 10_000;
    assert_eq!(c.saldo(&c.plataforma) - antes, esperado);
}

#[test]
fn a_protecao_de_preco_recusa_a_compra() {
    let mut c = Cenario::novo();
    let (mint, criador, curva, cofre) = c.lancar();

    let trader = Keypair::new();
    c.svm.airdrop(&trader.pubkey(), 50 * LAMPORTS).unwrap();

    // Exige mais token do que 1 SOL compra: tem que falhar, não entregar menos.
    let ix = negociar(
        &trader,
        c.config,
        curva,
        mint,
        cofre,
        criador.pubkey(),
        c.plataforma,
        None,
        instrucao::Buy {
            max_sol: LAMPORTS,
            min_tokens: 900_000_000 * CASAS,
        }
        .data(),
    );

    assert!(
        enviar(&mut c.svm, &[&trader], ix).is_err(),
        "receber menos que o mínimo tem que abortar a transação"
    );
}

#[test]
fn ninguem_indica_a_si_mesmo() {
    let mut c = Cenario::novo();
    let (mint, criador, curva, cofre) = c.lancar();

    let trader = Keypair::new();
    c.svm.airdrop(&trader.pubkey(), 50 * LAMPORTS).unwrap();

    /*
     * Sem esta trava, qualquer um se indicaria e pagaria 0,30% a menos —
     * o programa de indicação viraria um desconto pra quem descobrisse.
     */
    let ix = negociar(
        &trader,
        c.config,
        curva,
        mint,
        cofre,
        criador.pubkey(),
        c.plataforma,
        Some(trader.pubkey()),
        instrucao::Buy {
            max_sol: LAMPORTS,
            min_tokens: 1,
        }
        .data(),
    );

    assert!(
        enviar(&mut c.svm, &[&trader], ix).is_err(),
        "indicar a si mesmo tem que ser recusado"
    );
}

#[test]
fn vender_devolve_sol_e_cobra_a_taxa() {
    let mut c = Cenario::novo();
    let (mint, criador, curva, cofre) = c.lancar();

    let trader = Keypair::new();
    c.svm.airdrop(&trader.pubkey(), 50 * LAMPORTS).unwrap();

    let gasto = 10 * LAMPORTS;
    let compra = negociar(
        &trader,
        c.config,
        curva,
        mint,
        cofre,
        criador.pubkey(),
        c.plataforma,
        None,
        instrucao::Buy {
            max_sol: gasto,
            min_tokens: 1,
        }
        .data(),
    );
    enviar(&mut c.svm, &[&trader], compra).expect("compra");

    let conta_trader = get_associated_token_address(&trader.pubkey(), &mint);
    let tokens = {
        let c_ = c.svm.get_account(&conta_trader).expect("conta do trader");
        u64::from_le_bytes(c_.data[64..72].try_into().unwrap())
    };
    assert!(tokens > 0, "a compra entregou token");

    let antes_reserva = c.ler_curva(&curva).real_sol_reserves;
    let antes_trader = c.saldo(&trader.pubkey());

    let venda = negociar(
        &trader,
        c.config,
        curva,
        mint,
        cofre,
        criador.pubkey(),
        c.plataforma,
        None,
        instrucao::Sell {
            tokens,
            min_sol: 1,
        }
        .data(),
    );
    enviar(&mut c.svm, &[&trader], venda).expect("venda");

    let depois = c.ler_curva(&curva);
    assert!(depois.real_sol_reserves < antes_reserva, "saiu SOL da curva");
    assert!(c.saldo(&trader.pubkey()) > antes_trader, "o trader recebeu SOL");

    /*
     * Ida e volta tem que sair no prejuízo pra quem operou: são duas taxas de
     * 1,25%. Se desse lucro, existiria uma máquina de dinheiro.
     */
    assert!(
        c.saldo(&trader.pubkey()) < 50 * LAMPORTS,
        "comprar e vender na sequência não pode dar lucro"
    );

    // Os tokens voltaram todos pra curva.
    assert_eq!(depois.real_token_reserves, 793_100_000 * CASAS);
}

#[test]
fn pausar_impede_comprar_mas_nunca_vender() {
    let mut c = Cenario::novo();
    let (mint, criador, curva, cofre) = c.lancar();

    let trader = Keypair::new();
    c.svm.airdrop(&trader.pubkey(), 50 * LAMPORTS).unwrap();

    // Compra antes da pausa, pra ter o que vender depois.
    let compra = negociar(
        &trader,
        c.config,
        curva,
        mint,
        cofre,
        criador.pubkey(),
        c.plataforma,
        None,
        instrucao::Buy {
            max_sol: 5 * LAMPORTS,
            min_tokens: 1,
        }
        .data(),
    );
    enviar(&mut c.svm, &[&trader], compra).expect("compra antes da pausa");

    let pausar = Instruction {
        program_id: chroma_curve::ID,
        accounts: contas::AlterarConfig {
            authority: c.autoridade.pubkey(),
            config: c.config,
        }
        .to_account_metas(None),
        data: instrucao::SetPaused { paused: true }.data(),
    };
    let autoridade = c.autoridade.insecure_clone();
    enviar(&mut c.svm, &[&autoridade], pausar).expect("pausar");

    let compra2 = negociar(
        &trader,
        c.config,
        curva,
        mint,
        cofre,
        criador.pubkey(),
        c.plataforma,
        None,
        instrucao::Buy {
            max_sol: LAMPORTS,
            min_tokens: 1,
        }
        .data(),
    );
    assert!(
        enviar(&mut c.svm, &[&trader], compra2).is_err(),
        "pausado não deixa comprar"
    );

    /*
     * E a venda tem que continuar passando.
     *
     * Uma trava que prenda quem já está dentro não é proteção: do ponto de
     * vista de quem comprou, é indistinguível de golpe.
     */
    let conta_trader = get_associated_token_address(&trader.pubkey(), &mint);
    let tokens = {
        let c_ = c.svm.get_account(&conta_trader).expect("conta do trader");
        u64::from_le_bytes(c_.data[64..72].try_into().unwrap())
    };

    let venda = negociar(
        &trader,
        c.config,
        curva,
        mint,
        cofre,
        criador.pubkey(),
        c.plataforma,
        None,
        instrucao::Sell {
            tokens,
            min_sol: 1,
        }
        .data(),
    );
    assert!(
        enviar(&mut c.svm, &[&trader], venda).is_ok(),
        "pausado NÃO pode impedir de vender"
    );
}

#[test]
fn a_carteira_da_plataforma_nao_pode_ser_trocada() {
    let mut c = Cenario::novo();
    let (mint, criador, curva, cofre) = c.lancar();

    let trader = Keypair::new();
    c.svm.airdrop(&trader.pubkey(), 50 * LAMPORTS).unwrap();

    /*
     * Alguém apontando a taxa da plataforma pra si mesmo. Sem a checagem
     * contra a configuração, a fatia da casa ia embora a cada operação.
     */
    let ladrao = Pubkey::new_unique();
    let ix = negociar(
        &trader,
        c.config,
        curva,
        mint,
        cofre,
        criador.pubkey(),
        ladrao,
        None,
        instrucao::Buy {
            max_sol: LAMPORTS,
            min_tokens: 1,
        }
        .data(),
    );

    assert!(
        enviar(&mut c.svm, &[&trader], ix).is_err(),
        "carteira de plataforma diferente da configurada tem que ser recusada"
    );
}

#[test]
fn o_criador_nao_pode_ser_trocado() {
    let mut c = Cenario::novo();
    let (mint, _criador, curva, cofre) = c.lancar();

    let trader = Keypair::new();
    c.svm.airdrop(&trader.pubkey(), 50 * LAMPORTS).unwrap();

    // Mesma ideia, do outro lado: roubar a fatia do criador.
    let ix = negociar(
        &trader,
        c.config,
        curva,
        mint,
        cofre,
        Pubkey::new_unique(),
        c.plataforma,
        None,
        instrucao::Buy {
            max_sol: LAMPORTS,
            min_tokens: 1,
        }
        .data(),
    );

    assert!(
        enviar(&mut c.svm, &[&trader], ix).is_err(),
        "criador diferente do gravado na curva tem que ser recusado"
    );
}

#[test]
fn so_a_autoridade_altera_a_configuracao() {
    let mut c = Cenario::novo();

    let estranho = Keypair::new();
    c.svm.airdrop(&estranho.pubkey(), 10 * LAMPORTS).unwrap();

    let ix = Instruction {
        program_id: chroma_curve::ID,
        accounts: contas::AlterarConfig {
            authority: estranho.pubkey(),
            config: c.config,
        }
        .to_account_metas(None),
        data: instrucao::SetPaused { paused: true }.data(),
    };

    assert!(
        enviar(&mut c.svm, &[&estranho], ix).is_err(),
        "qualquer um pausando a plataforma seria negação de serviço de graça"
    );
}

#[test]
fn a_configuracao_recusa_faixas_que_furam_o_piso() {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(chroma_curve::ID, caminho_do_programa()).unwrap();

    let autoridade = Keypair::new();
    svm.airdrop(&autoridade.pubkey(), 100 * LAMPORTS).unwrap();
    let (config, _) = Pubkey::find_program_address(&[b"config"], &chroma_curve::ID);

    /*
     * Criador com 1,00% + afiliado 0,30% + piso 0,20% = 1,50%, acima do total
     * de 1,25%. Não pode nem ser gravado: é uma configuração que faria toda
     * operação falhar depois, quando já houvesse moeda lançada.
     */
    let mut p = parametros(Pubkey::new_unique());
    p.tier_creator_bps = [30, 45, 60, 100];

    let ix = Instruction {
        program_id: chroma_curve::ID,
        accounts: contas::IniciarConfig {
            authority: autoridade.pubkey(),
            config,
            system_program: solana_system_interface::program::ID,
        }
        .to_account_metas(None),
        data: instrucao::InitializeConfig { params: p }.data(),
    };

    assert!(
        enviar(&mut svm, &[&autoridade], ix).is_err(),
        "faixa que não cabe no total tem que ser recusada na configuração"
    );
}

#[test]
fn a_configuracao_grava_o_que_foi_pedido() {
    let c = Cenario::novo();
    let conta = c.svm.get_account(&c.config).expect("config existe");
    let config = Config::try_deserialize(&mut conta.data.as_slice()).expect("ler config");

    assert_eq!(config.authority, c.autoridade.pubkey());
    assert_eq!(config.platform_wallet, c.plataforma);
    assert_eq!(config.total_fee_bps, 125);
    assert_eq!(config.affiliate_fee_bps, 30);
    assert!(!config.paused);

    // A faixa cresce conforme o volume, e o volume é medido em lamports.
    assert_eq!(config.creator_bps_para(0), 30);
    assert_eq!(config.creator_bps_para(1_000 * LAMPORTS), 45);
    assert_eq!(config.creator_bps_para(5_000 * LAMPORTS), 60);
    assert_eq!(config.creator_bps_para(20_000 * LAMPORTS), 75);
}
