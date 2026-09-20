# Logos de carteira

Coloque aqui os logos das carteiras que **não** trazem o próprio ícone.

Carteira instalada nunca precisa disto: Solana (Wallet Standard) e EVM
(EIP-6963) entregam nome e logo oficiais sozinhas, e as 28 do catálogo em
`src/lib/wallet-catalog.ts` já vêm com o logo embutido.

O buraco é a carteira EVM que a pessoa **não** tem instalada — MetaMask,
Rabby e afins. Sem o logo oficial, a lista mostra um quadrado com a inicial.

## Como preencher

Baixe o logo na página oficial de brand assets de cada carteira e salve como:

    public/wallets/metamask.svg
    public/wallets/rabby.svg
    public/wallets/coinbase.svg

O nome do arquivo é o nome da carteira em minúsculas, sem espaços nem
acentos. A interface tenta carregar esse caminho sozinha; se o arquivo não
existir, cai no quadrado com a inicial sem quebrar nada.

Aceita `.svg` e `.png`.
