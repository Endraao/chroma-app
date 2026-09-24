# Chroma

Launchpad e terminal de trading não-custodial para **Solana** e **Robinhood Chain**.

- **Dados de mercado reais** (Dexscreener + GeckoTerminal + Jupiter), sem chave de API.
- **Gráfico ao vivo**: velas reais + preço atualizado a cada 3s.
- **Swap real na Solana** via Jupiter, com a taxa dentro da mesma transação.
- **Painel de segurança** com auditoria da GoPlus.
- **Login com apelido**: `?ref=joaozinho` em vez de `?ref=9xQeWv…usVFin`.
- **Afiliados nativos**: 0,30% da taxa vai pro promotor, no mesmo bloco.

---

## Rodar

```bash
npm install
npm run dev
```

Abre em http://localhost:3000. Copie `.env.example` para `.env.local`.

**Para o swap funcionar você precisa de duas coisas:**

1. `NEXT_PUBLIC_SOLANA_RPC` — um RPC dedicado. O endpoint público da Solana responde **403 para
   o navegador**, então sem isso o app lê preço e gráfico (que passam pelo servidor) mas não
   consegue ler saldo nem enviar transação. A Helius tem plano gratuito. A aplicação mostra um
   aviso amarelo no topo enquanto isso não estiver configurado.
2. `NEXT_PUBLIC_PLATFORM_FEE_WALLET_SOL` — a carteira que recebe a parte da plataforma. Sem ela o
   swap é bloqueado de propósito.

---

## Redes

| Rede | Chain ID | Gás | Swap | Auditoria de contrato |
| --- | --- | --- | --- | --- |
| Solana | — | SOL | ✅ Jupiter | ✅ GoPlus |
| Robinhood Chain | 4663 | ETH | ⚠️ contratos prontos, falta ligar | ❌ nenhum provedor cobre ainda |

A Robinhood Chain é uma L2 Arbitrum sobre Ethereum, definida em `src/lib/web3.ts` porque ainda não
vem no `viem/chains`.

**Sobre a auditoria na Robinhood Chain:** nenhum serviço (GoPlus, Quick Intel) cobre a rede ainda.
O painel não inventa resultado verde — mostra tudo como "sem dados" com score 0 e um aviso
explícito de que nada foi verificado.

---

## Pares de liquidez

Escolhidos no lançamento, em `src/lib/pairs.ts`.

| Rede | Pares |
| --- | --- |
| Solana | SOL, USDC |
| Robinhood Chain | ETH, NVDA, SPCX |

**Leia o aviso no topo de `src/lib/pairs.ts` antes de adicionar qualquer par.** Na Robinhood Chain
existem vários contratos falsos usando os mesmos símbolos: uma busca por "NVDA" no explorador
devolve quatro contratos diferentes, e por "USDC" devolve seis. O que identifica o oficial é o nome
terminando em `• Robinhood Token`. Os endereços na lista foram conferidos um a um no
[explorador oficial](https://robinhoodchain.blockscout.com) em 19/09/2026.

USDC está ausente na Robinhood Chain de propósito: os contratos chamados "USD Coin" encontrados lá
têm 18 decimais e ~200 holders, enquanto o USDC real tem 6 decimais. São falsificações.

---

## Login e apelido

O botão é **Sign in**, não "conectar carteira" — a diferença importa porque a sessão tem duas
partes: a carteira (que recebe o dinheiro) e o apelido (que é a fachada pública).

**Carteiras.** Duas telas, como nos launchpads grandes: destaques no topo e "Mais carteiras" com
busca e o catálogo completo.

Nada é fixo no código. As instaladas se anunciam sozinhas — Solana pelo **Wallet Standard**, EVM
pelo **EIP-6963** — e cada uma entrega o próprio nome e o próprio logo oficial. Carteira nova que
surgir amanhã aparece sem tocar no projeto.

Para as que a pessoa **não** tem instaladas existe um catálogo de 28 carteiras com logo oficial:

```bash
npm run wallets:catalog
```

O script `scripts/build-wallet-catalog.mjs` extrai nome, logo e link de cada adapter oficial da
Solana e escreve `src/lib/wallet-catalog.ts`. O pacote de adapters fica em devDependencies —
importá-lo de verdade custaria 441 dependências no bundle (Ledger, Torus e Trezor trazem SDKs
enormes) pra entregar três strings por carteira.

**Buraco conhecido:** as carteiras EVM não instaladas (MetaMask, Rabby, Trust, OKX, Brave) ficam
com um quadrado com a inicial. Nenhuma publica o logo num pacote npm que o projeto já use, e não
vale embutir um desenho feito de memória — logo errado numa tela de carteira faz o site parecer
falso. Para resolver, baixe o logo oficial de cada uma e salve em `public/wallets/<nome>.svg`; a
interface carrega sozinha e cai no quadrado se o arquivo não existir. Ver `public/wallets/README.md`.

**Detecção honesta:** o conector do SDK da MetaMask foi removido de propósito. Ele aparecia na
lista mesmo sem a extensão instalada, e a tela dizia "detectada" pra uma carteira que a pessoa não
tinha. Agora cada conector EVM só entra na lista depois de `getProvider()` responder.

**Google.** O botão existe mas está desligado. "Entrar com Google" numa plataforma não-custodial
exige um provedor de embedded wallet (Privy, Web3Auth, Dynamic, Turnkey) — escolher um é decisão
de negócio, porque ele passa a controlar o acesso às carteiras dos seus usuários. Ver
`src/lib/social-login.ts`.

**Apelido.** Registrar **não pede assinatura da carteira** — é só um nome de exibição, e pedir
assinatura na primeira tela assusta quem está chegando. O campo já vem preenchido com uma sugestão
em inglês; quem quiser troca ali mesmo ou depois, em `/profile`.

Trocar de apelido **não quebra links já divulgados**: o antigo continua resolvendo pra mesma
carteira (o arquivo é append-only) e ninguém mais consegue registrá-lo.

O raciocínio completo, incluindo o que a assinatura protegia de verdade (pouca coisa) e o limite
que fica sem ela, está no topo de `src/lib/accounts.ts`.

Teste das regras, com o servidor de pé:

```bash
node scripts/test-nickname.mjs
```

Confirma que apelido livre é aceito sem assinatura, que outra carteira não toma um apelido em uso,
que nome reservado e formato inválido são recusados, que o apelido resolve pra carteira certa e —
o mais importante — que trocar de nome mantém o link antigo funcionando e bloqueado pra terceiros.

---

## Taxas

Tudo em `src/lib/fees.ts`, em basis points (100 bps = 1%). A página `/fees` mostra a mesma coisa
pro usuário, rede por rede.

### Por que as taxas são por rede

Cada rede tem um concorrente dominante com economia diferente:

| Rede | Concorrente | Total | Vai pro criador | Sobra pra plataforma |
| --- | --- | --- | --- | --- |
| Solana | pump.fun | 1,25% | 0,30% | 0,95% |
| Robinhood Chain | PONS | 1,00% | 0,70% | 0,30% |

O afiliado da Chroma custa 0,30% — **exatamente a margem inteira que o PONS guarda pra si.** Logo,
na Robinhood Chain é impossível cobrar 1% igual ao PONS, pagar o criador igual ao PONS e ainda
sobrar alguma coisa. Alguma das três pontas tem que ceder.

A escolha foi ceder no lado do trader: 1,20% contra 1,00% do PONS. Numa meme coin o slippage
costuma passar de 3%, então 0,20 ponto percentual é ruído pro trader — enquanto 0,40 ponto a menos
no bolso do criador decide em qual plataforma ele lança.

Na Solana o problema não existe: o pump.fun tem folga de sobra, então a Chroma empata o total
(1,25%) e paga muito mais ao criador.

### Solana — empata o pump.fun no total

| Faixa | Volume acumulado | Criador | Afiliado | Plataforma |
| --- | --- | --- | --- | --- |
| Lançamento | até US$ 100k | 0,30% | 0,30% | 0,65% |
| Pegando tração | US$ 100k – 500k | 0,45% | 0,30% | 0,50% |
| Consolidada | US$ 500k – 2M | 0,60% | 0,30% | 0,35% |
| Topo | acima de US$ 2M | 0,75% | 0,30% | 0,20% |

Lançar é grátis, igual ao pump.fun.

### Robinhood Chain — 0,20 ponto acima do PONS

| Faixa | Volume acumulado | Criador | Afiliado | Plataforma |
| --- | --- | --- | --- | --- |
| Lançamento | até US$ 100k | 0,45% | 0,30% | 0,45% |
| Pegando tração | US$ 100k – 500k | 0,55% | 0,30% | 0,35% |
| Consolidada | US$ 500k – 2M | 0,62% | 0,30% | 0,28% |
| Topo | acima de US$ 2M | 0,70% | 0,30% | 0,20% |

Lançar custa 0,0005 ETH, igual ao PONS. No topo o criador empata a fatia do PONS.

### Regras que valem nas duas

- **Afiliado**: 0,30%, saindo da fatia da plataforma — o trader não paga a mais por isso.
- **Taxa de criador opcional**: 0% por padrão, teto de 10%, definida no lançamento e imutável.
- **Piso da plataforma**: 0,20%. Nenhuma faixa pode empurrar a nossa fatia abaixo disso.
- **Token externo** (roteado via agregador, não lançado aqui): não há criador nosso pra pagar,
  então essa fatia simplesmente não é cobrada — 0,95% na Solana, 0,75% na Robinhood.
- **Limite de lançamentos**: nenhum. A taxa de lançamento é o limite.

A fatia da plataforma é sempre o **resto** (`total − criador − afiliado`), nunca um número fixo —
assim a soma fecha mesmo que as faixas mudem. A métrica das faixas é volume acumulado, não market
cap, porque volume só cresce: a faixa nunca regride no meio do dia. Inflar volume pra subir de
faixa não compensa, já que cada trade falso paga o total e devolve no máximo a fatia do criador.

Teste da matemática (não precisa de servidor):

```bash
node scripts/test-fees.mjs
```

Confirma, nas duas redes, que as três fatias sempre somam o total, que a plataforma nunca cai
abaixo do piso e que a fatia do criador no topo bate a do concorrente.

### Pool de taxas e queima — removidos

Existiu aqui um pool que juntava a taxa de criador de moedas de um mesmo "tema" e, num
"fechamento", dividia tudo em 60% compra-e-queima da vencedora, 30% pro criador vencedor e 10%
pra plataforma (`POOL_SPLIT_BPS` / `computePoolSplit()`).

Nada alimentava esse pool: a função só era chamada pela página de taxas, pra desenhar uma barra,
e pelo teste. Os três termos que a página usava — tema, fechamento e época — nunca foram
especificados nem implementados.

**Decisão do dono do projeto:** sem queima por enquanto, e a fatia da plataforma fica
integralmente em caixa. Não há mais nenhuma redistribuição programada. A receita da plataforma é
a coluna PLATAFORMA da tabela de faixas, calculada em `distributeFees()`.

Se um mecanismo de competição entre moedas voltar à mesa, ele precisa vir com definição escrita
de tema, fechamento e época antes de virar texto na interface.

**Estado:** só a taxa de swap e o split do afiliado são cobrados de verdade hoje. As taxas de
criador e de lançamento dependem da curva de bonding on-chain, que ainda não existe.

### Como a taxa vira transação (Solana — implementado)

Uma transação Solana é **atômica**: ou todas as instruções confirmam juntas, ou nenhuma confirma.

1. O usuário digita 1 SOL. Descontamos o 1% e cotamos a Jupiter com **0,99 SOL**.
2. A Jupiter devolve a transação de swap pronta (`VersionedTransaction`).
3. Descompactamos (resolvendo as Address Lookup Tables), inserimos as transferências de taxa logo
   depois das instruções de compute budget, e recompactamos.
4. O usuário assina **uma** transação. O afiliado recebe no mesmo slot do swap.

Em compra a taxa é SOL nativo; em venda é uma transferência SPL do próprio token, com criação
idempotente da conta de destino (o aluguel, ~0,002 SOL, sai do usuário).

Código: `src/lib/solana-swap.ts`. **Não usamos o `platformFeeBps` da Jupiter** porque exigiria
conta no programa de referral dela e entregaria o valor num endereço só, sem como dividir.

### Quando a curva enche

A curva fecha quando o último token à venda sai (~95 SOL arrecadados). A partir
daí ela para de negociar, e duas instruções levam a liquidez pra uma pool da
**Raydium CP-Swap**:

1. `preparar_migracao` — embrulha o SOL arrecadado em WSOL.
2. `migrar` — cria a pool e **queima o LP**.

**As duas são abertas: qualquer carteira pode chamar.** Se a migração dependesse
da plataforma, uma chave perdida ou um servidor fora do ar prenderiam dinheiro de
terceiros sem prazo. Quem chama não escolhe valor nem destino — só paga o gás.

**Por que duas transações e não uma:** a rede recusa creditar lamports numa conta
que não é do programa e, na mesma instrução, chamar outro programa passando essa
conta. A tentativa falha com "a soma dos saldos não bate".

**Por que quem executa figura como criador da pool:** a Raydium abre seis contas
e paga o aluguel delas com uma transferência do programa do sistema, tirada de
quem cria — e o sistema só transfere de contas que ele mesmo detém. A conta da
curva é nossa, com dados dentro, então não serve. Os ativos passam pela carteira
de quem executa na mesma instrução; ela é um corredor, não um cofre.

**O LP é queimado** na mesma instrução em que nasce. Sem isso, alguém poderia
esvaziar o par e sumir com o dinheiro de quem comprou — o golpe que o painel de
segurança desta plataforma avisa contra.

`npm run test:migracao` enche uma curva até o fim e migra contra o programa da
Raydium **copiado da mainnet**, rodando na rede local.

---

### Robinhood Chain — o contrato existe, a ligação não

Em EVM não dá pra anexar uma transferência a uma transação de swap: uma transação chama UM
contrato. Por isso existe o `ChromaRouter` (`contracts/src/ChromaRouter.sol`), que desconta a taxa,
reparte entre plataforma, criador e afiliado, e repassa o resto pro roteador da Uniswap — tudo na
mesma transação.

**O contrato não guarda nada.** Entra e sai na mesma transação, nenhuma aprovação fica de pé, não
existe função de saque nem pra quem administra, e o destino das chamadas é fixo no construtor.
Não há fundos parados pra alguém levar.

**A rota chega pronta e o contrato não a interpreta.** O roteador da Uniswap nesta rede é um fork
com um campo a mais na estrutura de swap; montar a chamada aqui dentro seria depender de um
formato que já divergiu uma vez. Em vez disso o contrato confere o RESULTADO — quanto de fato
chegou na carteira de quem pediu. É isso que torna seguro não entender a rota.

Endereços verificados on-chain na rede 4663 (`eth_getCode` devolveu bytecode nos cinco):

| Contrato | Endereço |
| --- | --- |
| UniversalRouter | `0x06AfBA43Fd06227fA663b0DAecF536f6EaA6bf99` |
| PoolManager | `0x8366a39CC670B4001A1121B8F6A443A643e40951` |
| Quoter | `0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94` |
| StateView | `0xF3334192D15450CdD385c8B70e03f9A6bD9E673b` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

`npm run contracts:test` — 19 testes, incluindo fuzz da divisão da taxa.

**Ainda falta, e a interface continua dizendo "em breve" até lá:** montar a rota do swap na tela,
publicar os contratos, e uma auditoria externa antes de qualquer dinheiro de verdade passar por eles.

### Lançar na Robinhood Chain

`ChromaCurve.sol` é a mesma curva da Solana, em Solidity: reservas virtuais, faixas de criador,
divisão da taxa com a plataforma ficando com o RESTO, e pausa que bloqueia comprar mas **nunca**
vender. Cada moeda é um clone mínimo (EIP-1167) de `ChromaToken.sol`, que nasce com a emissão
inteira na curva e **sem função de emitir, pausar, confiscar ou dono** — cada um desses poderes é um
jeito conhecido de tirar dinheiro de quem comprou, e o nosso próprio painel de segurança marca token
que os tenha.

**Nada fica com quem lança.** Quem quiser participar da própria moeda compra como todo mundo, pelo
mesmo preço.

`npm run paridade` gera a tabela que o teste `Paridade.t.sol` usa pra provar que as duas redes
entregam a mesma coisa. Não bate exato de propósito: na Solana a moeda tem 6 casas decimais e aqui
tem 18, então o arredondamento tem granularidade diferente. A margem aceita é de UMA unidade na
escala da Solana — um milionésimo de token — e qualquer coisa além disso falha.

### Quando a curva enche, na Robinhood

A liquidez vai pra uma pool da **Uniswap v4**, em par com ETH nativo. Uma instrução só, **aberta a
qualquer carteira** pelo mesmo motivo da Solana: migração que depende da plataforma prende dinheiro
de terceiros no dia em que a plataforma falha.

**A v4 não tem token de LP pra queimar.** O jeito de travar a liquidez é a posição nascer em nome do
contrato e não existir função nenhuma que a remova — nem pra autoridade. Não é promessa, é ausência
de código.

A posição é de **faixa cheia**. Faixa estreita renderia mais taxa, mas deixa de valer assim que o
preço sai dela — e numa liquidez travada pra sempre, sem ninguém pra reposicionar, isso deixaria a
moeda sem mercado justamente quando mais se negocia.

Sobra um troco de alguns milhares de wei, porque a liquidez é um número inteiro e quase nunca
consome as duas quantidades até o último wei. Fica travado junto com ela.

**O teste roda contra o PoolManager de verdade**, num fork da Robinhood Chain
(`contracts/test/Migracao.t.sol`). Uma imitação aceitaria exatamente o que eu escrevi, inclusive se
estivesse errado.

| Contrato | Endereço | Como foi confirmado |
| --- | --- | --- |
| PoolManager v4 | `0x8366a39CC670B4001A1121B8F6A443A643e40951` | 163 eventos `Initialize` e 2686 `ModifyLiquidity` com as assinaturas **padrão** da v4 em 5000 blocos — o fork desta rede mexeu no roteador, não no gerente de pools |
| Factory v3 | `0x1f7d7550B1b028f7571E69A784071F0205FD2EfA` | `factory()` chamado numa pool que existe |

**Cuidado com endereço canônico:** `0x1F98431c…`, que é a factory v3 da Uniswap na maioria das redes,
tem OUTRO contrato nesta. Se a migração tivesse confiado nele, mandaria a liquidez pra um contrato
aleatório. `contracts/test/Rede.t.sol` falha se isso mudar.

---

## Dados de mercado

| O quê | Fonte | Chave? | Cache |
| --- | --- | --- | --- |
| Lista de tokens | Dexscreener `token-profiles` | não | 60s |
| Preço, liquidez, volume | Dexscreener `dex/tokens` | não | 3–10s |
| Velas OHLCV | GeckoTerminal | não | 20s |
| Decimais, holders, criador | Jupiter Tokens | não | 5min |
| Cotação e rota | Jupiter Swap | não | — |
| Auditoria (só Solana) | GoPlus Security | não | 30s |

Tudo passa pelo servidor (`src/lib/cache.ts`), que deduplica requisições simultâneas: dez usuários
na mesma página viram **uma** chamada externa, não dez. Quando uma API cai, o cache devolve o
último valor conhecido; se nunca houve valor, a interface avisa que os dados são de demonstração.

---

## Criar token

O formulário está completo e validado; o **deploy ainda não emite transação**.

- **Mídia obrigatória**: imagem (máx 15 MB, mín 1000x1000px) ou vídeo (máx 30 MB, .mp4). Seleção
  por clique ou arrastar-e-soltar, com validação de tamanho, formato e resolução no navegador
  antes do envio — importante porque a mídia não pode ser trocada depois.
- **Banner opcional**: máx 4,5 MB, proporção 3:1, 1500x500px.
- **Par de liquidez** e **recompensas de criador** (criador ou detentores).
- Aviso de imutabilidade no topo, porque muda o que a pessoa preenche.

A validação no navegador **não substitui validação no servidor** — quando o upload real existir, o
backend precisa repetir todas as checagens.

---

## Persistência

**SQLite**, em `.data/chroma.db`, pela biblioteca embutida do Node (`node:sqlite`) — sem instalar
nada. As alternativas populares compilam na instalação, e este projeto mantém `ignore-scripts=true`
de propósito: script rodando em `npm install` é o vetor clássico de ataque de cadeia de suprimentos.

Saiu de dois arquivos JSONL em 21/09/2026. Os três motivos, em ordem de gravidade:

1. **Escrita concorrente corrompia linha.** O código lidava com isso ignorando a linha quebrada —
   ou seja, perdia o registro em silêncio. Se fosse a vinculação de carteira de alguém, a comissão
   dele passaria a cair na plataforma sem ninguém perceber.
2. **Toda consulta lia o arquivo inteiro** e filtrava na memória, a cada visita ao painel.
3. **"Uma carteira pertence a uma conta só" era uma checagem em JavaScript** que duas requisições
   simultâneas atravessavam juntas. Virou chave primária.

A importação dos arquivos antigos roda sozinha na primeira abertura e revelou um bug que estava
ativo: dos 136 registros de conversão, só **6 eram transações distintas** — o painel do promotor
vinha contando o mesmo swap até 23 vezes. Um índice único por transação fechou isso.

Os `.jsonl` originais não são apagados: viram `.importado`. São dados de usuários reais e o
original precisa continuar existindo pra conferência.

**Apelido tem tabela própria, com histórico.** Renomear não apaga o nome antigo: quem imprimiu
`?ref=fulano` num panfleto não reimprime porque a pessoa trocou de nome, e apelido largado que
volta pro mercado é convite pra alguém se passar por quem o usava antes.

**Isso não afeta o pagamento**: se os arquivos sumirem, ninguém deixa de receber — o pagamento é
on-chain. O que se perde é o histórico do painel e os apelidos registrados.

---

## O que falta

Em ordem de peso, não de importância.

1. **Deploy real do token.** `/create` valida tudo e não emite transação. Precisa de um programa de
   bonding curve on-chain (Anchor) publicado. É o maior item que sobrou.

2. **Upload real da mídia.** A imagem escolhida hoje só existe no navegador de quem preencheu o
   formulário. Falta armazenamento (IPFS ou S3) e repetir no servidor todas as validações que a
   interface já faz — o que é checado no browser pode ser burlado.

3. **Cofre de comissões.** Hoje a comissão cai direto na carteira do promotor, dentro da transação
   (`PAYOUT_MODE = "instant"`). Para o modelo de "acumular e resgatar" sem virar custodiante, falta
   um cofre on-chain. Ver `src/lib/payout.ts`. Sai junto com o item 1, mesma stack.

4. **Swap na Robinhood Chain.** Em EVM não dá pra anexar a transferência do afiliado à transação de
   swap; precisa de um contrato *router* próprio. A interface diz isso na tela em vez de fingir.

5. **Login com Google.** Precisa contratar um provedor de embedded wallet. Ver
   `src/lib/social-login.ts` — a escolha amarra a plataforma a quem controla o acesso às carteiras
   dos usuários, então é decisão de negócio.

6. **Indexador próprio.** Dois efeitos: a home só reordena a amostra que a Dexscreener entrega de
   graça (não varre o mercado), e o perfil não tem histórico de operações do usuário — por isso não
   há PnL nem "top trades" como nos concorrentes.

7. **Banco em um arquivo.** SQLite resolve concorrência e índice, mas continua sendo um arquivo
   numa máquina. Escalar pra mais de uma instância pede Postgres — e aí muda só `db.ts`.

8. **Bubble Map e InsightX.** Continuam como espaços reservados no painel de segurança.

---

## Publicação na Vercel

- **O autor do commit precisa ser uma conta de GitHub de verdade.** No plano Hobby a Vercel só
  publica commits escritos pelo dono do projeto: qualquer outro e-mail vira "colaboração" e a
  publicação sai como `Blocked`, com a mensagem *"couldn't find a Git account for the commit
  author"*. Aconteceu aqui — o git estava com `dev@chroma.local`, que não existe em conta nenhuma,
  e seis publicações seguidas ficaram travadas antes de alguém ler o motivo. O e-mail privado do
  GitHub (`<id>+<usuario>@users.noreply.github.com`) sempre é reconhecido.
- `DATABASE_URL` e `BLOB_READ_WRITE_TOKEN` vêm das integrações do Neon e do Blob — não devem ser
  criadas à mão, senão uma sobrescreve a outra.
- Variável com `NEXT_PUBLIC_` não pode ser marcada como `Secret`: ela vai embutida no código que
  roda no navegador, por definição. A Vercel avisa, e o aviso está certo.
- `NEXT_PUBLIC_SITE_URL` precisa apontar pro domínio de produção. Sem ela o código usa a origem da
  requisição, e uma publicação de teste gravaria esse endereço temporário dentro dos metadados de
  um token — que ficam imutáveis na transação de criação.

## Notas de build

- `npm run dev` escreve em `.next`; `npm run build` escreve em `.next-prod` (via
  `scripts/build.mjs`) — **exceto na Vercel**, onde a saída precisa ser `.next` ou a publicação
  falha com "No Output Directory named .next found". Os formatos são incompatíveis: quando
  compartilhavam a mesma pasta, a página abria em branco com todo CSS e JS em 404.
- Três dependências opcionais são apontadas pra vazio em `next.config.mjs` porque não existem no
  browser e não são usadas: `@x402/*`, `pino-pretty` e `@react-native-async-storage/async-storage`.
- `tsconfig.json` usa `target: ES2020` por causa dos `BigInt` em `fees.ts`.
- O modal de login é renderizado por portal no `<body>`. O header usa `backdrop-blur`, e
  `backdrop-filter` transforma o elemento em bloco de contenção pra descendentes `position: fixed` —
  sem o portal, o modal ficava preso dentro do header.
