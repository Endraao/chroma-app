import "server-only";

/**
 * O HORÁRIO DE CADA BLOCO, sem derrubar o servidor (18/10/2026).
 *
 * Antes, a lista de negócios de uma moeda da Robinhood (Pons e curva da
 * Chroma) pedia o horário de TODOS os blocos com negócio de uma vez — um
 * Promise.all sem limite. Numa moeda com milhares de negócios isso abria
 * milhares de conexões TLS com o nó; se uma falhava, nada ficava guardado e o
 * gráfico (que relê a cada segundo) repetia a enxurrada. Derrubou a VPS na
 * madrugada de 18/10 (6 mil conexões por processo, CPU 100%, site em 503).
 *
 * Agora: no máximo MAX_EXATOS blocos novos por chamada, PARALELO por vez,
 * cada falha isolada. O resto sai por interpolação entre os horários já
 * conhecidos (bloco é sequencial e o horário só cresce) — e vai ficando exato
 * nas próximas leituras, sempre com a mesma cota.
 */
const MAX_EXATOS = 40;
const PARALELO = 4;
/** Bloco da Robinhood Chain sai a cada ~0,25 s; só vale quando não há dois pontos conhecidos. */
const SEGUNDOS_POR_BLOCO = 0.25;

const GUARDADOS = new Map<bigint, number>();

interface LeitorDeBloco {
  getBlock(args: { blockNumber: bigint }): Promise<{ timestamp: bigint }>;
}

export async function temposDosBlocos(cliente: LeitorDeBloco, blocos: bigint[]): Promise<Map<bigint, number>> {
  const unicos = [...new Set(blocos)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const faltam = unicos.filter((b) => !GUARDADOS.has(b));

  // Quais buscar agora: todos, se couberem; senão o primeiro, o último e uns espalhados no meio.
  let buscar = faltam;
  if (faltam.length > MAX_EXATOS) {
    const passo = (faltam.length - 1) / (MAX_EXATOS - 1);
    buscar = [...new Set(Array.from({ length: MAX_EXATOS }, (_, i) => faltam[Math.round(i * passo)]))];
  }
  for (let i = 0; i < buscar.length; i += PARALELO) {
    await Promise.all(
      buscar.slice(i, i + PARALELO).map(async (b) => {
        try {
          GUARDADOS.set(b, Number((await cliente.getBlock({ blockNumber: b })).timestamp));
        } catch {
          /* fica pra interpolação desta vez */
        }
      }),
    );
  }
  if (GUARDADOS.size > 200_000) GUARDADOS.clear();

  const conhecidos = [...GUARDADOS.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const saida = new Map<bigint, number>();
  for (const b of unicos) {
    const exato = GUARDADOS.get(b);
    if (exato !== undefined) {
      saida.set(b, exato);
      continue;
    }
    saida.set(b, interpolar(b, conhecidos));
  }
  return saida;
}

function interpolar(b: bigint, conhecidos: bigint[]): number {
  if (!conhecidos.length) return Math.floor(Date.now() / 1000);
  // Vizinhos conhecidos de cada lado (busca binária).
  let lo = 0;
  let hi = conhecidos.length;
  while (lo < hi) {
    const meio = (lo + hi) >> 1;
    if (conhecidos[meio] < b) lo = meio + 1;
    else hi = meio;
  }
  const antes = lo > 0 ? conhecidos[lo - 1] : undefined;
  const depois = lo < conhecidos.length ? conhecidos[lo] : undefined;
  if (antes !== undefined && depois !== undefined) {
    const ta = GUARDADOS.get(antes)!;
    const td = GUARDADOS.get(depois)!;
    return Math.round(ta + ((td - ta) * Number(b - antes)) / Number(depois - antes));
  }
  const ref = (antes ?? depois)!;
  return Math.round(GUARDADOS.get(ref)! + Number(b - ref) * SEGUNDOS_POR_BLOCO);
}
