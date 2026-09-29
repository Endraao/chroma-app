/**
 * O JSON de metadados que a transação de criação aponta.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO EXISTE
 * ---------------------------------------------------------------------------
 * Um token na Solana não guarda nome, símbolo nem imagem dentro de si. O que
 * fica on-chain é uma URL; tudo que a carteira mostra vem de um arquivo JSON
 * nesse endereço. Se ele não existir ou estiver fora do formato, o token
 * aparece sem nome e sem imagem na Phantom — e não tem conserto depois, porque
 * a URL é gravada de forma imutável.
 *
 * O formato abaixo é o que o ecossistema já lê (Metaplex Token Metadata). Os
 * campos fora do padrão vão dentro de `extensions`, que é onde as carteiras
 * esperam encontrar redes sociais.
 */

export interface DadosDaMoeda {
  name: string;
  symbol: string;
  description?: string;
  /** URL da arte principal, já guardada */
  image: string;
  /** URL do banner, quando houver */
  banner?: string;
  /** quando a arte é um vídeo, ela também entra como animação */
  animationUrl?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  /** quem lançou — aparece como criador nos exploradores */
  creator?: string;
}

export interface MetadadosDaMoeda {
  name: string;
  symbol: string;
  description: string;
  image: string;
  external_url?: string;
  animation_url?: string;
  attributes: { trait_type: string; value: string }[];
  properties: {
    files: { uri: string; type: string }[];
    category: "image" | "video";
    creators?: { address: string; share: number }[];
  };
  extensions?: Record<string, string>;
  /* formato que a pump.fun lê */
  website?: string;
  twitter?: string;
  telegram?: string;
  showName?: boolean;
  createdOn?: string;
}

/**
 * Monta o JSON a partir do formulário.
 *
 * @param base URL absoluta do site, porque o arquivo será lido de FORA — uma
 * carteira buscando `/api/media/abc.png` não tem como saber de qual site é.
 * Caminho relativo aqui significa token sem imagem em todo lugar menos aqui.
 */
export function montarMetadados(dados: DadosDaMoeda, base: string): MetadadosDaMoeda {
  const absoluta = (caminho: string) =>
    caminho.startsWith("http") ? caminho : `${base.replace(/\/$/, "")}${caminho}`;

  const imagem = absoluta(dados.image);
  const ehVideo = Boolean(dados.animationUrl);

  const files: { uri: string; type: string }[] = [
    { uri: imagem, type: tipoPelaExtensao(imagem) },
  ];
  if (dados.animationUrl) {
    files.push({ uri: absoluta(dados.animationUrl), type: "video/mp4" });
  }
  if (dados.banner) {
    files.push({ uri: absoluta(dados.banner), type: tipoPelaExtensao(dados.banner) });
  }

  const extensions: Record<string, string> = {};
  if (dados.website) extensions.website = dados.website;
  if (dados.twitter) extensions.twitter = dados.twitter;
  if (dados.telegram) extensions.telegram = dados.telegram;

  return {
    name: dados.name,
    symbol: dados.symbol,
    description: dados.description ?? "",
    image: imagem,
    external_url: dados.website,
    animation_url: dados.animationUrl ? absoluta(dados.animationUrl) : undefined,
    /*
     * Marca a origem. Não é enfeite: quem olhar o token daqui a seis meses num
     * explorador consegue saber de onde ele saiu sem depender do nosso site
     * estar no ar.
     */
    attributes: [{ trait_type: "Lançado em", value: "Chroma" }],
    properties: {
      files,
      category: ehVideo ? "video" : "image",
      // 100% ao criador: a Chroma não retém participação na criação.
      creators: dados.creator ? [{ address: dados.creator, share: 100 }] : undefined,
    },
    extensions: Object.keys(extensions).length > 0 ? extensions : undefined,
    website: dados.website || undefined,
    twitter: dados.twitter || undefined,
    telegram: dados.telegram || undefined,
    showName: true,
    createdOn: base.replace(/\/$/, ""),
  };
}

function tipoPelaExtensao(url: string): string {
  const ext = url.split(".").pop()?.toLowerCase() ?? "";
  const mapa: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    mp4: "video/mp4",
  };
  return mapa[ext] ?? "image/png";
}

/* ------------------------------------------------------------------ */
/* Validação do que vem do formulário                                  */
/* ------------------------------------------------------------------ */

/** Limites do padrão on-chain da Solana. Passar disso faz a transação falhar. */
export const LIMITES = {
  name: 32,
  symbol: 10,
  uri: 200,
  description: 1000,
} as const;

/**
 * Confere o que não pode passar.
 *
 * Roda no servidor mesmo já tendo rodado na tela, porque estes limites não são
 * preferência nossa: são do formato on-chain. Um nome de 33 caracteres não
 * fica feio — a transação simplesmente é rejeitada pela rede, e a pessoa paga
 * a taxa pra nada.
 */
export function recusarMetadados(dados: DadosDaMoeda): string | null {
  const nome = dados.name?.trim() ?? "";
  const simbolo = dados.symbol?.trim() ?? "";

  if (nome.length < 1) return "O nome é obrigatório.";
  if (nome.length > LIMITES.name) {
    return `O nome pode ter no máximo ${LIMITES.name} caracteres (este tem ${nome.length}).`;
  }

  if (simbolo.length < 1) return "O símbolo é obrigatório.";
  if (simbolo.length > LIMITES.symbol) {
    return `O símbolo pode ter no máximo ${LIMITES.symbol} caracteres (este tem ${simbolo.length}).`;
  }

  if ((dados.description ?? "").length > LIMITES.description) {
    return `A descrição pode ter no máximo ${LIMITES.description} caracteres.`;
  }

  for (const [campo, valor] of [
    ["Site", dados.website],
    ["X", dados.twitter],
    ["Telegram", dados.telegram],
  ] as const) {
    if (valor && !/^https?:\/\/\S+$/i.test(valor)) {
      return `O link de ${campo} precisa começar com http:// ou https://.`;
    }
  }

  return null;
}
