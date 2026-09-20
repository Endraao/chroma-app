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
| Robinhood Chain | 4663 | ETH | ❌ falta router | ❌ nenhum provedor cobre ainda |

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
abaixo do piso, que a fatia do criador no topo bate a do concorrente e que o split do pool não
perde nenhuma fração na divisão.

### Pool de taxas de criador

As taxas de criador de todas as moedas de um mesmo tema entram num pool. No fechamento, e em toda
época depois dele, cada unidade é dividida em 60% compra-e-queima da vencedora, 30% pro criador
vencedor e 10% pra plataforma. Criador perdedor não recebe nada.

`computePoolSplit()` trabalha em BigInt e joga o resto da divisão na queima — assim nenhuma fração
se perde, e a sobra vai pra parte que beneficia quem segura o token.

**Estado:** só a taxa de swap e o split do afiliado são cobrados de verdade hoje. As taxas de
criador, de lançamento e o pool dependem da curva de bonding on-chain, que ainda não existe.

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

### Robinhood Chain — ainda não

Em EVM não dá pra anexar uma transferência a uma transação de swap. Precisa de um contrato *router*
da Chroma, ou do parâmetro de afiliado de um agregador. A interface diz isso na tela.

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

Dois arquivos JSONL em `.data/`, append puro:

- `accounts.jsonl` — apelidos e carteiras
- `affiliate-events.jsonl` — cliques e conversões

Escolha consciente: o MVP roda numa máquina só e não obriga ninguém a instalar Postgres pra testar.
Limites (uma instância, leitura carrega tudo em memória, sem índice) estão documentados em
`src/lib/accounts.ts` e `src/lib/affiliate-store.ts`. Trocar por banco significa mexer só nesses
dois arquivos.

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

7. **Banco de dados.** Apelidos e eventos de indicação estão em JSONL em `.data/`. Funciona numa
   máquina só. Trocar significa mexer em `accounts.ts` e `affiliate-store.ts`, e nada mais.

8. **Bubble Map e InsightX.** Continuam como espaços reservados no painel de segurança.

---

## Notas de build

- `npm run dev` escreve em `.next`; `npm run build` escreve em `.next-prod` (via
  `scripts/build.mjs`). Os formatos são incompatíveis: quando compartilhavam a mesma pasta, a
  página abria em branco com todo CSS e JS em 404.
- Três dependências opcionais são apontadas pra vazio em `next.config.mjs` porque não existem no
  browser e não são usadas: `@x402/*`, `pino-pretty` e `@react-native-async-storage/async-storage`.
- `tsconfig.json` usa `target: ES2020` por causa dos `BigInt` em `fees.ts`.
- O modal de login é renderizado por portal no `<body>`. O header usa `backdrop-blur`, e
  `backdrop-filter` transforma o elemento em bloco de contenção pra descendentes `position: fixed` —
  sem o portal, o modal ficava preso dentro do header.
