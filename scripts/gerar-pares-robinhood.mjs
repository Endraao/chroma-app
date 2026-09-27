/**
 * Monta a lista de pares de liquidez da Robinhood Chain a partir da rede.
 *
 *   node scripts/gerar-pares-robinhood.mjs > /tmp/pares.txt
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO É UM SCRIPT, E NÃO UMA LISTA DIGITADA
 * ---------------------------------------------------------------------------
 * São setenta ativos tokenizados. Digitar setenta endereços de 42 caracteres à
 * mão é garantia de errar pelo menos um — e um endereço errado nesta lista faz
 * a moeda de alguém nascer pareada com um contrato aleatório, sem volta.
 *
 * ---------------------------------------------------------------------------
 * A TRAVA CONTRA IMPOSTOR
 * ---------------------------------------------------------------------------
 * A Robinhood Chain tem vários tokens usando os mesmos símbolos das ações. Uma
 * busca por "NET" devolve a Cloudflare e também uma meme coin chamada
 * "NetNet"; "BULL" devolve a Webull e uma chamada "The Bull".
 *
 * O que separa um do outro é o NOME: o ativo emitido pela Robinhood termina em
 * "• Robinhood Token". Quem não casa com isso só entra se estiver na lista de
 * exceções conhecidas abaixo, uma a uma, com o motivo escrito.
 *
 * Símbolo nunca basta. Foi assim que o site passou a listar a USDG carregando
 * o par do PONS.
 */

const REDE = "robinhood";
const BUSCA = `https://api.geckoterminal.com/api/v2/search/pools?network=${REDE}`;

/**
 * Ativos legítimos cujo nome NÃO segue o padrão da Robinhood.
 *
 * Cada um aqui é uma decisão consciente, não um atalho: são moedas de verdade
 * da rede, não ações tokenizadas, então não carregam o sufixo.
 */
const EXCECOES = {
  USDG: "Global Dollar — a stablecoin da rede, contra a qual quase tudo é cotado",
  WETH: "ETH embrulhado, necessário para pares na Uniswap",
  ETH: "moeda nativa da rede",
};

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** Todos os tokens da rede com este símbolo exato, com os nomes completos. */
async function candidatos(simbolo) {
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    try {
      const r = await fetch(
        `${BUSCA}&query=${encodeURIComponent(simbolo)}&include=base_token,quote_token`,
        { headers: { accept: "application/json" } },
      );
      if (r.status === 429) {
        await espera(5000);
        continue;
      }
      if (!r.ok) return [];

      const j = await r.json();
      const porId = {};
      for (const t of j.included ?? []) porId[t.id] = t.attributes;

      const vistos = new Map();
      for (const p of j.data ?? []) {
        for (const lado of ["base_token", "quote_token"]) {
          const a = porId[p.relationships?.[lado]?.data?.id];
          if (a?.symbol?.toUpperCase() === simbolo.toUpperCase()) {
            vistos.set(a.address, {
              symbol: a.symbol,
              name: a.name ?? "",
              address: a.address,
              image: a.image_url ?? null,
            });
          }
        }
      }
      return [...vistos.values()];
    } catch {
      await espera(2500);
    }
  }
  return [];
}

export async function resolver(simbolos) {
  const oficiais = [];
  const duvidosos = [];
  const ausentes = [];

  for (const simbolo of simbolos) {
    const lista = await candidatos(simbolo);

    if (lista.length === 0) {
      ausentes.push(simbolo);
    } else {
      const daRobinhood = lista.find((c) => /robinhood/i.test(c.name));
      const excecao = EXCECOES[simbolo.toUpperCase()] ? lista[0] : null;

      if (daRobinhood) oficiais.push(daRobinhood);
      else if (excecao) oficiais.push(excecao);
      else duvidosos.push({ simbolo, candidatos: lista });
    }

    await espera(2200);
  }

  return { oficiais, duvidosos, ausentes };
}
