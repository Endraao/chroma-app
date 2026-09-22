#!/usr/bin/env bash
# Rede Solana local, com a curva, a Metaplex e a Raydium carregadas.
#
# Os programas entram junto com a criacao da rede em vez de serem publicados
# por transacao: e instantaneo e nao depende de confirmacao.
#
# Metaplex e Raydium sao as copias REAIS, baixadas da mainnet. Testar criacao de
# metadados ou migracao de liquidez contra uma imitacao nao provaria nada: as
# instrucoes sao montadas byte a byte neste projeto, e o que importa e o
# programa de verdade aceitar.
#
# A conta AmmConfig da Raydium vem junto porque a criacao de pool le dela a taxa
# (0,15 SOL) e as aliquotas. Sem ela a instrucao falha por conta inexistente.
#
# Recompilou a curva? Reinicie isto: os .so sao lidos na largada.
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

CURVA="2uAzEJEhVdEsk3DVMrkrcnHCmoFicmg8QPk7xKw8uqB4"
METAPLEX="metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
RAYDIUM="CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C"
AMM_CONFIG="D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2"
# Recebe a taxa de criacao de pool. A Raydium exige que ja exista como conta
# de token: sem ela a instrucao falha com "conta nao inicializada".
TAXA_POOL="DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8"

SO_CURVA="$HOME/chroma-target/sbpf-solana-solana/release/chroma_curve.so"
SO_META="$HOME/programas-externos/metaplex.so"
SO_RAY="$HOME/programas-externos/raydium-cpmm.so"
CONTA_AMM="$HOME/contas-externas/$AMM_CONFIG.json"
CONTA_TAXA="$HOME/contas-externas/$TAXA_POOL.json"

ARGS=(--ledger "$HOME/chroma-ledger" --rpc-port 8899 --reset)
ARGS+=(--bpf-program "$CURVA" "$SO_CURVA")
[ -f "$SO_META" ] && ARGS+=(--bpf-program "$METAPLEX" "$SO_META")
[ -f "$SO_RAY" ] && ARGS+=(--bpf-program "$RAYDIUM" "$SO_RAY")
[ -f "$CONTA_AMM" ] && ARGS+=(--account "$AMM_CONFIG" "$CONTA_AMM")
[ -f "$CONTA_TAXA" ] && ARGS+=(--account "$TAXA_POOL" "$CONTA_TAXA")

exec solana-test-validator "${ARGS[@]}"
