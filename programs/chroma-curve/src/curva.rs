use anchor_lang::prelude::*;

use crate::errors::ErroDaCurva;

/// A matemática da curva, isolada de qualquer conta.
///
/// ---------------------------------------------------------------------------
/// COMO O PREÇO SE FORMA
/// ---------------------------------------------------------------------------
/// Produto constante, o mesmo princípio de uma pool de DEX: o produto das duas
/// reservas não muda. Comprar tira token e põe SOL, então o token seguinte sai
/// mais caro. Não há livro de ofertas nem formador de mercado — o preço é
/// consequência aritmética de quanto já foi comprado.
///
/// A parte "virtual" das reservas existe para a moeda poder começar com um
/// preço sensato sem ninguém depositar SOL antes. Sem ela, a primeira compra
/// levaria quase toda a emissão por quase nada.
///
/// ---------------------------------------------------------------------------
/// POR QUE ISTO FICA NUM ARQUIVO SÓ, SEM TOCAR EM CONTA
/// ---------------------------------------------------------------------------
/// Porque assim dá pra testar cada conta de cabeça, sem subir validador. Um
/// erro de arredondamento aqui não aparece como pane: aparece como alguém
/// recebendo um token a menos por operação, milhares de vezes. É o tipo de
/// defeito que só teste direto pega.
///
/// ---------------------------------------------------------------------------
/// PARA QUE LADO ARREDONDA
/// ---------------------------------------------------------------------------
/// Sempre a favor da curva, nunca de quem está operando. Nos dois sentidos o
/// que SAI é arredondado pra baixo — o que exige arredondar a reserva pra
/// CIMA, que é o contrário do que a intuição sugere.
///
/// A diferença é de uma unidade por operação e fica na reserva, que é de todo
/// mundo que ainda está dentro. Sem isso, fatiar uma ordem em muitas pequenas
/// rende mais do que fazê-la de uma vez, e aí existe um jeito de sangrar a
/// pool repetindo operações minúsculas.
pub struct Curva;

impl Curva {
    /// Quantos tokens saem ao entrar com `sol_liquido` lamports.
    ///
    /// `sol_liquido` é o valor DEPOIS da taxa: a taxa não entra na reserva, vai
    /// para as três pontas. Passar o valor bruto aqui faria a curva andar mais
    /// do que o dinheiro que de fato entrou nela.
    pub fn tokens_por_sol(
        virtual_sol: u64,
        virtual_token: u64,
        sol_liquido: u64,
    ) -> Result<u64> {
        require!(sol_liquido > 0, ErroDaCurva::ValorZero);
        require!(
            virtual_sol > 0 && virtual_token > 0,
            ErroDaCurva::CurvaInvalida
        );

        // u128 no meio do caminho: 30 SOL x 1 bilhão de tokens já passa de u64.
        let k = (virtual_sol as u128)
            .checked_mul(virtual_token as u128)
            .ok_or(ErroDaCurva::EstouroDeCalculo)?;

        let novo_virtual_sol = (virtual_sol as u128)
            .checked_add(sol_liquido as u128)
            .ok_or(ErroDaCurva::EstouroDeCalculo)?;

        /*
         * Arredonda a RESERVA pra cima, para a SAÍDA cair pra baixo.
         *
         * Truncar a reserva pra baixo parece conservador e é o oposto: reserva
         * menor significa que saiu mais token. O teste pegou isso — picar uma
         * compra de 1 SOL em mil pedaços rendia 511 unidades a mais do que
         * comprar de uma vez, ou seja, fatiar a ordem virava lucro. Repetido,
         * é um dreno com escada pra subir.
         */
        let novo_virtual_token = k
            .checked_add(novo_virtual_sol - 1)
            .ok_or(ErroDaCurva::EstouroDeCalculo)?
            .checked_div(novo_virtual_sol)
            .ok_or(ErroDaCurva::EstouroDeCalculo)?;

        let saida = (virtual_token as u128)
            .checked_sub(novo_virtual_token)
            .ok_or(ErroDaCurva::EstouroDeCalculo)?;

        u64::try_from(saida).map_err(|_| error!(ErroDaCurva::EstouroDeCalculo))
    }

    /// Quantos lamports saem (ANTES da taxa) ao devolver `tokens` à curva.
    pub fn sol_por_tokens(virtual_sol: u64, virtual_token: u64, tokens: u64) -> Result<u64> {
        require!(tokens > 0, ErroDaCurva::ValorZero);
        require!(
            virtual_sol > 0 && virtual_token > 0,
            ErroDaCurva::CurvaInvalida
        );

        let k = (virtual_sol as u128)
            .checked_mul(virtual_token as u128)
            .ok_or(ErroDaCurva::EstouroDeCalculo)?;

        let novo_virtual_token = (virtual_token as u128)
            .checked_add(tokens as u128)
            .ok_or(ErroDaCurva::EstouroDeCalculo)?;

        /*
         * Aqui a divisão precisa arredondar pra CIMA, não pra baixo.
         *
         * O resultado é quanto SOL fica na reserva; o que sai é a diferença.
         * Truncar pra baixo deixaria a reserva menor do que deveria e pagaria
         * um lamport a mais a quem vendeu — exatamente a direção errada, e
         * repetida viraria dreno.
         */
        let novo_virtual_sol = k
            .checked_add(novo_virtual_token - 1)
            .ok_or(ErroDaCurva::EstouroDeCalculo)?
            .checked_div(novo_virtual_token)
            .ok_or(ErroDaCurva::EstouroDeCalculo)?;

        let saida = (virtual_sol as u128).saturating_sub(novo_virtual_sol);
        u64::try_from(saida).map_err(|_| error!(ErroDaCurva::EstouroDeCalculo))
    }
}

/* ------------------------------------------------------------------ */
/* Testes                                                              */
/* ------------------------------------------------------------------ */

#[cfg(test)]
mod testes {
    use super::*;

    /// Os mesmos valores de largada que a configuração usa.
    const V_SOL: u64 = 30_000_000_000; // 30 SOL
    const V_TOKEN: u64 = 1_073_000_000_000_000; // 1.073.000.000 com 6 casas
    const A_VENDA: u64 = 793_100_000_000_000; // 793.100.000

    #[test]
    fn comprar_move_o_preco_pra_cima() {
        let primeira = Curva::tokens_por_sol(V_SOL, V_TOKEN, 1_000_000_000).unwrap();

        // Segunda compra do mesmo tamanho, já com a curva andada.
        let sol_depois = V_SOL + 1_000_000_000;
        let token_depois = V_TOKEN - primeira;
        let segunda = Curva::tokens_por_sol(sol_depois, token_depois, 1_000_000_000).unwrap();

        assert!(
            segunda < primeira,
            "o segundo SOL tem que comprar menos token que o primeiro: {segunda} vs {primeira}"
        );
    }

    #[test]
    fn ida_e_volta_nunca_devolve_mais_do_que_entrou() {
        /*
         * A checagem que mais importa. Comprar e vender na sequência, sem
         * nenhuma taxa, tem que devolver no máximo o que entrou. Devolver mais
         * seria dinheiro saindo do nada — e alguém repetiria isso até esvaziar
         * a reserva.
         */
        for entrada in [
            100_000u64,
            1_000_000,
            1_000_000_000,
            10_000_000_000,
            50_000_000_000,
        ] {
            let tokens = Curva::tokens_por_sol(V_SOL, V_TOKEN, entrada).unwrap();
            let devolvido =
                Curva::sol_por_tokens(V_SOL + entrada, V_TOKEN - tokens, tokens).unwrap();

            assert!(
                devolvido <= entrada,
                "ida e volta devolveu mais do que entrou: {devolvido} > {entrada}"
            );
        }
    }

    #[test]
    fn a_curva_enche_perto_do_alvo() {
        /*
         * Vendidos todos os tokens à venda, quanto SOL a curva arrecadou? É o
         * valor que dispara a migração, então precisa bater com o que a
         * interface promete.
         */
        let k = (V_SOL as u128) * (V_TOKEN as u128);
        let token_restante = (V_TOKEN - A_VENDA) as u128;
        let sol_final = k / token_restante;
        let arrecadado = (sol_final - V_SOL as u128) as u64;

        let em_sol = arrecadado / 1_000_000_000;
        assert!(
            (80..=90).contains(&em_sol),
            "a curva deveria encher perto de 85 SOL, deu {em_sol}"
        );
    }

    #[test]
    fn valor_zero_e_recusado() {
        assert!(Curva::tokens_por_sol(V_SOL, V_TOKEN, 0).is_err());
        assert!(Curva::sol_por_tokens(V_SOL, V_TOKEN, 0).is_err());
    }

    #[test]
    fn compra_gigante_nao_estoura() {
        // Não pode entrar em pânico nem dar a volta no contador.
        let r = Curva::tokens_por_sol(V_SOL, V_TOKEN, u64::MAX / 2);
        assert!(r.is_ok(), "compra enorme deveria ser tratada, não estourar");
        assert!(
            r.unwrap() < V_TOKEN,
            "nunca pode sair mais token do que existe na reserva"
        );
    }
}
