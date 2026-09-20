/**
 * Baixa os logos das moedas usadas como par de liquidez e das redes.
 *
 *   npm run tokens:icons
 *
 * Salva em `public/tokens/` e `public/chains/`, já redimensionado. Baixar uma
 * vez e servir local, em vez de apontar a tag <img> pro CDN de terceiro, evita
 * o logo sumir se o CDN cair, o navegador do usuário entregar o IP dele pra
 * terceiros a cada carregamento, e o layout pular esperando imagem externa.
 *
 * ---------------------------------------------------------------------------
 * CUIDADO AO ESCOLHER A FONTE
 * ---------------------------------------------------------------------------
 * A primeira versão deste script puxava tudo de
 * `cdn.robinhood.com/ncw_assets/logos/<endereço>.png`. O endpoint responde 200
 * para qualquer endereço — mas devolve o logo da PRÓPRIA ROBINHOOD, não o da
 * empresa. NVDA e SPCX saíram os dois com a pena verde da Robinhood, e o ETH
 * saiu com o logo do WETH, que é um contrato de embrulho e não a moeda da rede.
 *
 * Por isso cada item abaixo declara a fonte explicitamente, e o resultado
 * precisa ser conferido com o olho depois de rodar. Logo errado numa tela de
 * seleção de par é o tipo de coisa que faz a pessoa comprar o ativo errado.
 */
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import sharp from "sharp";

const CABECALHOS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
  accept: "application/json,image/*,*/*",
};

const TAMANHO = 64;

/* ------------------------------------------------------------------ */
/* Fontes                                                              */
/* ------------------------------------------------------------------ */

/** Logo do token pela API da Jupiter (Solana). */
async function daJupiter(mint) {
  const res = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${mint}`, {
    headers: CABECALHOS,
  });
  if (!res.ok) throw new Error(`Jupiter respondeu ${res.status}`);
  const lista = await res.json();
  return lista.find((t) => t.id === mint)?.icon ?? null;
}

/**
 * Logo do token pela GeckoTerminal, que resolve pro CoinGecko.
 *
 * É a fonte certa pras ações tokenizadas: devolve o logo da NVIDIA e o da
 * SpaceX de verdade, não o da corretora que as emitiu.
 */
async function daGeckoTerminal(rede, endereco) {
  const res = await fetch(
    `https://api.geckoterminal.com/api/v2/networks/${rede}/tokens/${endereco}`,
    { headers: CABECALHOS },
  );
  if (!res.ok) throw new Error(`GeckoTerminal respondeu ${res.status}`);
  const url = (await res.json())?.data?.attributes?.image_url;
  return url && !String(url).endsWith("missing.png") ? url : null;
}

/** Ícone já embutido no RainbowKit, lido do disco (sem rede). */
function doRainbowKit(prefixo) {
  const dir = "node_modules/@rainbow-me/rainbowkit/dist";
  const arquivo = readdirSync(dir).find((f) => f.startsWith(`${prefixo}-`) && f.endsWith(".js"));
  if (!arquivo) throw new Error(`${prefixo} não encontrado no RainbowKit`);

  const uri = readFileSync(`${dir}/${arquivo}`, "utf8").match(/"(data:image\/[^"]+)"/)?.[1];
  if (!uri) throw new Error(`${prefixo} sem data URI`);
  return uri;
}

/** Lê um arquivo de imagem do disco e devolve como data URI. */
function doArquivo(caminho) {
  const conteudo = readFileSync(caminho);
  const tipo = caminho.endsWith(".svg") ? "svg+xml" : "png";
  return `data:image/${tipo};base64,${conteudo.toString("base64")}`;
}

/** Converte data URI ou URL remota em Buffer. */
async function baixar(origem) {
  if (origem.startsWith("data:")) {
    const [, dados] = origem.match(/^data:image\/[a-z+]+(?:;base64)?,(.*)$/s) ?? [];
    return origem.includes(";base64,")
      ? Buffer.from(dados, "base64")
      : Buffer.from(decodeURIComponent(dados), "utf8");
  }

  const res = await fetch(origem, { headers: CABECALHOS });
  if (!res.ok) throw new Error(`download respondeu ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/* ------------------------------------------------------------------ */
/* O que baixar                                                        */
/* ------------------------------------------------------------------ */

const SOL_MINT = "So11111111111111111111111111111111111111112";
const NVDA = "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC";
const SPCX = "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa";

const ALVOS = [
  /* --- Pares de liquidez --- */
  {
    arquivo: "public/tokens/solana-sol.png",
    rotulo: "par SOL",
    fonte: () => daJupiter(SOL_MINT),
  },
  {
    arquivo: "public/tokens/solana-usdc.png",
    rotulo: "par USDC",
    fonte: () => daJupiter("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
  },
  {
    arquivo: "public/tokens/robinhood-eth.png",
    rotulo: "par ETH",
    /*
     * O losango branco no círculo azul (#627EEA) — a versão que praticamente
     * todo agregador usa. Não é o logo do WETH (contrato de embrulho, outra
     * coisa) nem o losango cinza sem fundo, que some no tema escuro.
     */
    fonte: () => doArquivo("node_modules/cryptocurrency-icons/svg/color/eth.svg"),
  },
  /*
   * NVDA e SPCX: o logo da EMPRESA, não o do emissor.
   *
   * Tentativas que deram errado, pra ninguém repetir:
   *   - cdn.robinhood.com → devolve a pena verde da Robinhood
   *   - GeckoTerminal/CoinGecko pelo endereço do token na Robinhood Chain →
   *     mesma pena, porque a imagem vem do metadado que a Robinhood cadastrou
   *
   * As mesmas ações tokenizadas por outros emissores estão no CoinGecko com o
   * logo real da empresa. É de lá que vêm as duas imagens abaixo — o ativo
   * subjacente é o mesmo (NVIDIA, SpaceX), só muda quem emitiu o token.
   */
  {
    arquivo: "public/tokens/robinhood-nvda.png",
    rotulo: "par NVDA",
    fonte: () =>
      "https://coin-images.coingecko.com/coins/images/102175596/large/nvda_200x200.png",
  },
  {
    arquivo: "public/tokens/robinhood-spcx.png",
    rotulo: "par SPCX",
    // O X branco em fundo preto, não o logotipo escrito "SPACEX" — num ícone
    // de 36px a palavra vira borrão e o X é reconhecível na hora.
    fonte: () => "https://coin-images.coingecko.com/coins/images/102173730/large/spcxon.png",
  },

  /* --- Símbolos das redes --- */
  {
    arquivo: "public/chains/solana.png",
    rotulo: "rede Solana",
    fonte: () => daJupiter(SOL_MINT),
  },
  {
    arquivo: "public/chains/robinhood.png",
    rotulo: "rede Robinhood",
    // Aqui a pena verde É o logo certo: é a marca da rede, não de um token.
    fonte: () => `https://cdn.robinhood.com/ncw_assets/logos/${NVDA.toLowerCase()}.png`,
  },
];

/* ------------------------------------------------------------------ */

mkdirSync("public/tokens", { recursive: true });
mkdirSync("public/chains", { recursive: true });

let falhas = 0;

for (const alvo of ALVOS) {
  try {
    const origem = await alvo.fonte();
    if (!origem) throw new Error("fonte não devolveu imagem");

    const bruto = await baixar(origem);
    const info = await sharp(bruto)
      .resize(TAMANHO, TAMANHO, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(alvo.arquivo);

    console.log(`  ok    ${alvo.rotulo.padEnd(15)} ${(info.size / 1024).toFixed(1).padStart(5)} KB`);
  } catch (error) {
    falhas++;
    console.log(`  FALHA ${alvo.rotulo.padEnd(15)} ${String(error.message).split("\n")[0]}`);
  }
}

console.log(
  falhas === 0
    ? "\nBaixado. CONFIRA COM O OLHO — endpoint certo pode devolver logo errado."
    : `\n${falhas} falha(s).`,
);

process.exit(falhas === 0 ? 0 : 1);
