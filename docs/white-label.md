# Site de cliente (white-label)

O mesmo código da Chroma vira o launchpad de um cliente só com configuração.
Nada do que está aqui muda a Chroma: sem as variáveis `NEXT_PUBLIC_MARCA_*`,
o site é a Chroma de sempre.

## O que pedir ao cliente

1. Nome do projeto, logo em PNG (quadrado e com fundo transparente) e a cor principal (hex).
2. Domínio, já apontado para o servidor dele.
3. Endereço PÚBLICO da carteira Solana que recebe as taxas.
4. Perfil no X e, se tiver, o Telegram.

## Montar (num servidor novo, nunca na pasta da Chroma)

1. Clonar o repositório numa VPS do cliente e rodar `npm install`.
2. Criar o `.env.local` a partir do `.env.example`, com o RPC e o banco DELE, e mais:

   ```
   NEXT_PUBLIC_SITE_URL=https://dominio-do-cliente.com
   NEXT_PUBLIC_MARCA_NOME=NomeDoCliente
   NEXT_PUBLIC_MARCA_X=perfilNoX
   NEXT_PUBLIC_MARCA_TELEGRAM=canal        # vazio esconde o link
   NEXT_PUBLIC_MARCA_COR=#f59e0b
   NEXT_PUBLIC_MARCA_POST_EXEMPLO=          # post do "trade dentro do X"; vazio esconde o botão
   NEXT_PUBLIC_PLATFORM_FEE_WALLET_SOL=carteiraDeTaxasDoCliente
   ```

3. Logo, ícones e capa de compartilhamento:

   ```
   node scripts/aplicar-marca.mjs caminho/do/logo.png
   ```

4. `npm run build` e subir com systemd + Caddy, como na VPS da Chroma.

## O que muda sozinho

- Nome em todos os textos dos três idiomas, inclusive termos e privacidade
  (`traducoes()` passa por `comMarca()` em `src/lib/marca.ts`).
- Títulos das abas, cartões do X, perfil do X e Telegram no rodapé e nos docs.
- Cor de destaque e o degradê dos títulos.
- Carteira das taxas: compras (taxa da plataforma) e os 30% do criador na
  pump.fun (`NEXT_PUBLIC_PLATFORM_FEE_WALLET_SOL`).
- Somem: mural do Obsi e a curva da Chroma (a nossa config paga a Chroma).

## Opcional: curva própria (Meteora) e lançamento em uma aprovação

- Curva da Meteora com as taxas pro cliente: criar a config em
  `/admin/curva-chroma` (só local) com a carteira dele e pôr o endereço em
  `NEXT_PUBLIC_CHROMA_DBC_CONFIG`. Sem ela, o site lança só pela pump.fun.
- Tabela de endereços (lançar em uma aprovação só): criar em `/admin/tabela`
  e pôr em `NEXT_PUBLIC_TABELA_SOLANA`. Sem ela, são duas aprovações.

## Testar antes de entregar

Rodar `npm run dev` com as variáveis da marca no ambiente (elas valem mais
que o `.env.local`), por exemplo `NEXT_PUBLIC_MARCA_NOME=Moonly` e
`NEXT_PUBLIC_MARCA_COR=#f59e0b`, sem mexer em arquivo nenhum.

## Não atender

Bundler, wash trading, sniper com carteiras próprias ou rug: o nome da Chroma vai junto.
