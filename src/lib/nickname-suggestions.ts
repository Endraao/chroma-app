/**
 * Sugestão de apelido para quem acabou de entrar.
 *
 * O campo já vem preenchido para a pessoa não travar na primeira tela: quem
 * não liga aceita o que veio e segue, quem liga apaga e escreve o seu. Sem
 * isso, a tela de apelido vira um obstáculo entre conectar a carteira e usar
 * o site.
 *
 * Palavras em inglês porque é a língua do mercado de meme coin, e o apelido
 * vira link público que o promotor espalha lá fora.
 */

const ADJETIVOS = [
  "swift", "brave", "lucky", "silent", "cosmic", "golden", "wild", "neon",
  "rapid", "clever", "bold", "prime", "sharp", "solar", "lunar", "turbo",
  "quiet", "royal", "mighty", "electric", "crystal", "velvet", "rogue", "noble",
  "hyper", "frozen", "molten", "shadow", "radiant", "steady", "vivid", "atomic",
];

const SUBSTANTIVOS = [
  "falcon", "comet", "otter", "raven", "tiger", "panda", "wolf", "koi",
  "lynx", "heron", "bison", "gecko", "orca", "puma", "crane", "moth",
  "quartz", "ember", "prism", "onyx", "harbor", "summit", "vector", "cipher",
  "drifter", "nomad", "ranger", "pilot", "trader", "seeker", "voyager", "maker",
];

const escolher = <T,>(lista: T[]) => lista[Math.floor(Math.random() * lista.length)];

/**
 * Gera um apelido no formato `adjetivosubstantivo` + número.
 *
 * O número no fim existe pra reduzir colisão sem precisar consultar o
 * servidor: com 32×32 combinações e 2 dígitos, são ~100 mil possibilidades.
 * Ainda assim quem chama deve conferir a disponibilidade — ver
 * `sugerirApelidoDisponivel`.
 */
export function suggestNickname(): string {
  const numero = Math.floor(Math.random() * 90) + 10; // 10–99
  return `${escolher(ADJETIVOS)}${escolher(SUBSTANTIVOS)}${numero}`;
}

/**
 * Tenta algumas sugestões até achar uma livre.
 *
 * Se todas estiverem ocupadas (ou o servidor não responder), devolve a última
 * mesmo assim: o campo fica preenchido, a checagem normal da tela avisa que
 * está em uso, e a pessoa troca. Melhor do que deixar o campo vazio.
 */
export async function sugerirApelidoDisponivel(
  verificar: (nome: string) => Promise<{ available: boolean } | null>,
  tentativas = 4,
): Promise<string> {
  let ultima = suggestNickname();

  for (let i = 0; i < tentativas; i++) {
    ultima = suggestNickname();
    const resultado = await verificar(ultima);
    if (resultado?.available) return ultima;
  }

  return ultima;
}
