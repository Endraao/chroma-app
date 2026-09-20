/**
 * Gera `src/lib/wallet-catalog.ts` a partir dos adapters oficiais da Solana.
 *
 *   npm run wallets:catalog
 *
 * POR QUE ISTO EXISTE
 * -------------------
 * Carteira moderna se anuncia sozinha pelo padrão Wallet Standard, então
 * Phantom, Solflare, Backpack, MetaMask e companhia aparecem e conectam sem
 * precisar de adapter nenhum. O que falta é mostrar as carteiras que a pessoa
 * NÃO tem instalada — e pra isso só precisamos de nome, logo e link.
 *
 * Importar o pacote de adapters inteiro custaria 441 dependências no bundle
 * (Ledger, Torus, Trezor e WalletConnect trazem SDKs enormes) pra entregar, no
 * fim, três strings por carteira. Então este script roda UMA vez, extrai
 * nome/ícone/URL de cada adapter e escreve um arquivo estático. O pacote fica
 * em devDependencies e nada dele vai pro navegador.
 *
 * Cada pacote é importado separadamente e dentro de try/catch: vários deles
 * não carregam fora do browser (o do Ledger tem import quebrado em ESM), e um
 * import em bloco derrubaria o script inteiro por causa de um só.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

/*
 * Os adapters são escritos pro browser e alguns tocam `window` no construtor.
 * Um shim mínimo é suficiente pra instanciar e ler os metadados.
 */
globalThis.window ??= {
  addEventListener() {},
  removeEventListener() {},
  location: { href: "", origin: "" },
};
globalThis.document ??= {
  addEventListener() {},
  removeEventListener() {},
  readyState: "complete",
  createElement: () => ({ style: {} }),
};
globalThis.navigator ??= { userAgent: "node" };
globalThis.self ??= globalThis;

/*
 * Em qual rede cada carteira opera.
 *
 * Várias fazem as duas: a MetaMask ganhou suporte a Solana e a Phantom ganhou
 * suporte a EVM. Elas precisam aparecer nos DOIS grupos da tela de login — é
 * o mesmo aplicativo, mas são contas diferentes, em redes diferentes.
 *
 * O que não está listado aqui herda a rede da fonte: adapter da Solana vira
 * ["solana"], ícone do RainbowKit vira ["evm"].
 */
const REDES_POR_CARTEIRA = {
  MetaMask: ["evm", "solana"],
  Phantom: ["solana", "evm"],
  Backpack: ["solana", "evm"],
  "Magic Eden": ["solana", "evm"],
  "Coinbase Wallet": ["evm", "solana"],
  "Trust Wallet": ["evm", "solana"],
  "OKX Wallet": ["evm", "solana"],
  "Brave Wallet": ["evm", "solana"],
  Bitget: ["evm", "solana"],
  Coin98: ["evm", "solana"],
  SafePal: ["evm", "solana"],
  TokenPocket: ["evm", "solana"],
  Ledger: ["solana", "evm"],
};

const redesDe = (nome, padrao) => REDES_POR_CARTEIRA[nome] ?? [padrao];

/** Pacotes a tentar. Nome = sufixo de `@solana/wallet-adapter-…`. */
const PACOTES = [
  "avana", "bitkeep", "bitpie", "clover", "coinbase", "coinhub", "coin98",
  "huobi", "hyperpay", "krystal", "ledger", "mathwallet", "nightly", "nufi",
  "keystone", "onto", "safepal", "salmon", "phantom", "spot", "solong",
  "torus", "trezor", "trust", "tokenpocket", "solflare", "xdefi", "sky",
  // walletconnect fica de fora: o pacote não embute ícone e a conexão dele
  // precisa de projectId. Entra pelo lado EVM, via wagmi.
];

/** Fora da lista: burner de teste e carteiras já descontinuadas. */
const PULAR = new Set(["UnsafeBurner", "Fractal", "Neko", "Saifu", "Tokenary", "Alpha"]);

const encontradas = new Map();
const falhas = [];

for (const pacote of PACOTES) {
  try {
    const mod = await import(`@solana/wallet-adapter-${pacote}`);

    for (const [exportName, Adapter] of Object.entries(mod)) {
      if (!exportName.endsWith("WalletAdapter") || typeof Adapter !== "function") continue;

      try {
        // Alguns pedem opções; um objeto vazio basta pra ler os metadados.
        const instance = new Adapter({});
        const name = String(instance.name ?? "");
        const icon = String(instance.icon ?? "");

        if (!name || !icon.startsWith("data:") || PULAR.has(name)) continue;
        if (encontradas.has(name)) continue;

        encontradas.set(name, {
          name,
          networks: redesDe(name, "solana"),
          icon,
          url: String(instance.url ?? ""),
        });
      } catch (error) {
        falhas.push(`${pacote}/${exportName}: ${String(error.message).split("\n")[0]}`);
      }
    }
  } catch (error) {
    falhas.push(`${pacote}: ${String(error.message).split("\n")[0]}`);
  }
}

/*
 * Resgate por leitura de arquivo.
 *
 * O pacote do Ledger tem um import quebrado em ESM e nunca carrega aqui, mas
 * o ícone está no bundle CJS como texto. Ler o data URI direto do arquivo
 * evita perder uma carteira relevante por um detalhe de empacotamento.
 */
const RESGATE = [
  {
    pacote: "ledger",
    arquivo: "lib/cjs/adapter.js",
    name: "Ledger",
    url: "https://www.ledger.com",
  },
];

for (const alvo of RESGATE) {
  if (encontradas.has(alvo.name)) continue;

  try {
    const caminho = `node_modules/@solana/wallet-adapter-${alvo.pacote}/${alvo.arquivo}`;
    const conteudo = readFileSync(caminho, "utf8");
    const icon = conteudo.match(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/)?.[0];

    if (icon) {
      encontradas.set(alvo.name, {
        name: alvo.name,
        networks: redesDe(alvo.name, "solana"),
        icon,
        url: alvo.url,
      });
    }
    else falhas.push(`${alvo.pacote}: data URI não encontrado no arquivo`);
  } catch (error) {
    falhas.push(`${alvo.pacote} (resgate): ${String(error.message).split("\n")[0]}`);
  }
}

/* ------------------------------------------------------------------ */
/* Carteiras EVM, a partir dos ícones do RainbowKit                     */
/* ------------------------------------------------------------------ */

/*
 * Os adapters da Solana não cobrem MetaMask, Rabby, OKX nem Brave — e é
 * justamente a lista que aparece na aba da Robinhood Chain. O RainbowKit
 * empacota o logo oficial de 71 carteiras, um arquivo por carteira, cada um
 * contendo um data URI. Aqui a gente lê esses arquivos direto do disco.
 *
 * Mesmo raciocínio do resto do script: o pacote fica em devDependencies e
 * nada dele vai pro bundle — só as strings dos logos.
 */
const NOMES_RAINBOWKIT = {
  metaMaskWallet: "MetaMask",
  rabbyWallet: "Rabby",
  okxWallet: "OKX Wallet",
  braveWallet: "Brave Wallet",
  trustWallet: "Trust Wallet",
  coinbaseWallet: "Coinbase Wallet",
  phantomWallet: "Phantom",
  backpackWallet: "Backpack",
  ledgerWallet: "Ledger",
  safepalWallet: "SafePal",
  bitgetWallet: "Bitget",
  binanceWallet: "Binance Wallet",
  bybitWallet: "Bybit Wallet",
  coreWallet: "Core",
  coin98Wallet: "Coin98",
  clvWallet: "Clover",
  tokenPocketWallet: "TokenPocket",
  oneInchWallet: "1inch Wallet",
  oneKeyWallet: "OneKey",
  rainbowWallet: "Rainbow",
  zerionWallet: "Zerion",
  uniswapWallet: "Uniswap Wallet",
  talismanWallet: "Talisman",
  frameWallet: "Frame",
  enkryptWallet: "Enkrypt",
  imTokenWallet: "imToken",
  gateWallet: "Gate Wallet",
  krakenWallet: "Kraken Wallet",
  roninWallet: "Ronin",
  safeWallet: "Safe",
  magicEden: "Magic Eden",
  walletConnectWallet: "WalletConnect",
};

const URL_POR_NOME = {
  MetaMask: "https://metamask.io/download/",
  Rabby: "https://rabby.io/",
  "OKX Wallet": "https://www.okx.com/web3",
  "Brave Wallet": "https://brave.com/wallet/",
  "Trust Wallet": "https://trustwallet.com/download",
  Backpack: "https://backpack.app/",
  "Magic Eden": "https://wallet.magiceden.io/",
  Rainbow: "https://rainbow.me/",
  Zerion: "https://zerion.io/",
  Core: "https://core.app/",
  OneKey: "https://onekey.so/",
  Frame: "https://frame.sh/",
  Enkrypt: "https://www.enkrypt.com/",
  Talisman: "https://talisman.xyz/",
};


const DIST_RAINBOWKIT = "node_modules/@rainbow-me/rainbowkit/dist";

try {
  const arquivos = readdirSync(DIST_RAINBOWKIT);

  for (const [prefixo, nome] of Object.entries(NOMES_RAINBOWKIT)) {
    // Os arquivos vêm com um hash no fim: metaMaskWallet-EI6MED72.js
    const arquivo = arquivos.find((f) => f.startsWith(`${prefixo}-`) && f.endsWith(".js"));
    if (!arquivo) {
      falhas.push(`rainbowkit/${prefixo}: arquivo não encontrado`);
      continue;
    }

    const conteudo = readFileSync(`${DIST_RAINBOWKIT}/${arquivo}`, "utf8");
    // O data URI é um SVG com URL-encoding, então vale quase qualquer caractere.
    const icon = conteudo.match(/"(data:image\/[^"]+)"/)?.[1];

    if (!icon) {
      falhas.push(`rainbowkit/${prefixo}: data URI não encontrado`);
      continue;
    }

    // Já veio dos adapters da Solana? O de lá manda, é o oficial da rede.
    if (encontradas.has(nome)) continue;
    encontradas.set(nome, {
      name: nome,
      networks: redesDe(nome, "evm"),
      icon,
      url: URL_POR_NOME[nome] ?? "",
    });
  }
} catch (error) {
  falhas.push(`rainbowkit: ${String(error.message).split("\n")[0]}`);
}

const entries = [...encontradas.values()].sort((a, b) => a.name.localeCompare(b.name));

if (!entries.length) {
  console.error("nenhuma carteira extraída — o catálogo não foi reescrito");
  process.exit(1);
}

const arquivo = `// GERADO POR scripts/build-wallet-catalog.mjs — NÃO EDITE À MÃO.
//
// Nome, logo oficial e link de instalação das carteiras Solana conhecidas.
// Serve só para mostrar as que a pessoa ainda NÃO tem instaladas; as que ela
// tem se anunciam sozinhas pelo Wallet Standard e conectam sem passar daqui.
//
// Para atualizar: npm run wallets:catalog

export interface CatalogWallet {
  name: string;
  /** redes em que essa carteira opera; várias fazem as duas */
  networks: ("solana" | "evm")[];
  /** data URI com o logo oficial, embutido pelo próprio adapter */
  icon: string;
  /** página de instalação */
  url: string;
}

export const WALLET_CATALOG: CatalogWallet[] = ${JSON.stringify(entries, null, 2)};

const normalize = (name: string) => name.trim().toLowerCase().replace(/\\s+/g, "");

/** Busca por nome, ignorando maiúsculas e espaços. */
export function findCatalogWallet(name: string): CatalogWallet | undefined {
  const key = normalize(name);
  return WALLET_CATALOG.find((w) => normalize(w.name) === key);
}
`;

writeFileSync("src/lib/wallet-catalog.ts", arquivo, "utf8");

console.log(`${entries.length} carteiras (${(arquivo.length / 1024).toFixed(0)} KB)`);
const porRede = entries.reduce(
  (a, e) => e.networks.reduce((acc, n) => ({ ...acc, [n]: (acc[n] ?? 0) + 1 }), a),
  {},
);
console.log("solana: " + (porRede.solana ?? 0) + " | evm: " + (porRede.evm ?? 0));
console.log(entries.map((e) => e.name).join(", "));
if (falhas.length) console.log(`\nnão carregaram (${falhas.length}): ${falhas.map((f) => f.split(":")[0]).join(", ")}`);

/*
 * Saída explícita: o adapter do Torus deixa um timer aberto e o processo
 * ficaria pendurado depois de já ter escrito o arquivo.
 */
process.exit(0);
