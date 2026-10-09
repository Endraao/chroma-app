"use client";

/**
 * TESTE (09/10/2026): qual formato de link abre o APP da carteira de dentro do
 * navegador do X no celular. Os links https (metamask.app.link, phantom.app/ul)
 * caem na Play Store ou dão "nenhum aplicativo pode executar esta ação". O
 * dono toca cada botão no Android e diz quais abriram — aí o formato que
 * funcionar vai pros botões do post. Página fora do site (sem link, noindex).
 */
const ALVO = "https://chromalaunch.fun/p/3xrw3JKyaSYjzksYc8nrZE1kReQAxoHT3epi3P1mpZVf?ref=chroma";
const SEM = ALVO.replace(/^https?:\/\//, "");
// O link que o botão do post monta: a mesma moeda com valor e lado.
const SEM_POST = `${SEM}&valor=10&lado=buy`;
const U = encodeURIComponent(ALVO);
const R = encodeURIComponent("https://chromalaunch.fun");
const FUGA = encodeURIComponent(ALVO);

const intent = (caminho: string, esquema: string, pacote: string) =>
  `intent://${caminho}#Intent;scheme=${esquema};package=${pacote};S.browser_fallback_url=${FUGA};end`;

// Moeda da Robinhood Chain pra testar no celular ($CHROMA, já existe na rede).
const ROBINHOOD = "https://chromalaunch.fun/p/0x475ab8dd5b1a13a5d18b0b70a1599e3501b0941c?ref=radiantcipher";
const ROBINHOOD_SEM = ROBINHOOD.replace("https://", "");

const GRUPOS: [string, [string, string][]][] = [
  [
    "ROBINHOOD — $CHROMA (abrir a moeda e testar)",
    [
      ["R1 · abrir a moeda aqui (lista de carteiras)", ROBINHOOD],
      ["R2 · abrir direto na MetaMask", intent(`dapp/${ROBINHOOD_SEM}`, "metamask", "io.metamask")],
    ],
  ],
  [
    "X (abrir o perfil da Chroma) — teste DENTRO do app da MetaMask",
    [
      ["X1 · intent (o de hoje)", `intent://x.com/ChromaLaunch#Intent;scheme=https;package=com.twitter.android;S.browser_fallback_url=${encodeURIComponent("https://x.com/ChromaLaunch")};end`],
      ["X2 · x.com mesma aba", "https://x.com/ChromaLaunch"],
      ["X3 · mobile.x.com", "https://mobile.x.com/ChromaLaunch"],
      ["X4 · twitter:// (app)", "twitter://user?screen_name=ChromaLaunch"],
      ["X5 · twitter.com", "https://twitter.com/ChromaLaunch"],
    ],
  ],
  [
    "Abrir no Chrome (sair do navegador do X)",
    [["C1 · intent Chrome", `intent://${SEM}#Intent;scheme=https;package=com.android.chrome;end`]],
  ],
  [
    "MetaMask",
    [
      ["M1 · metamask://dapp", `metamask://dapp/${SEM}`],
      ["M2 · intent", intent(`dapp/${SEM}`, "metamask", "io.metamask")],
      ["M3 · link.metamask.io", `https://link.metamask.io/dapp/${SEM}`],
      ["M4 · metamask.app.link (o de hoje)", `https://metamask.app.link/dapp/${SEM}`],
      ["M5 · igual ao post (valor e lado)", `https://metamask.app.link/dapp/${SEM_POST}`],
      ["M6 · intent igual ao post", intent(`dapp/${SEM_POST}`, "metamask", "io.metamask")],
      ["M7 · link.metamask.io igual ao post", `https://link.metamask.io/dapp/${SEM_POST}`],
    ],
  ],
  [
    "Phantom",
    [
      ["P1 · phantom://browse", `phantom://browse/${U}?ref=${R}`],
      ["P2 · intent", intent(`browse/${U}?ref=${R}`, "phantom", "app.phantom")],
      ["P3 · phantom.app/ul (o de hoje)", `https://phantom.app/ul/browse/${U}?ref=${R}`],
    ],
  ],
  [
    "Solflare",
    [
      ["S1 · solflare://ul/v1/browse", `solflare://ul/v1/browse/${U}?ref=${R}`],
      ["S2 · intent", intent(`ul/v1/browse/${U}?ref=${R}`, "solflare", "com.solflare.mobile")],
      ["S3 · solflare.com/ul (o de hoje)", `https://solflare.com/ul/v1/browse/${U}?ref=${R}`],
    ],
  ],
  [
    "Trust",
    [
      ["T1 · trust://open_url", `trust://open_url?coin_id=501&url=${U}`],
      ["T2 · intent", intent(`open_url?coin_id=501&url=${U}`, "trust", "com.wallet.crypto.trustapp")],
      ["T3 · link.trustwallet.com (o de hoje)", `https://link.trustwallet.com/open_url?coin_id=501&url=${U}`],
    ],
  ],
];

export default function TesteCarteira() {
  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-6">
      <h1 className="text-xl font-black text-zinc-50">Teste de carteiras no celular</h1>
      <p className="text-[13px] text-zinc-400">
        Abra esta página pelo X no celular. Toque em cada botão e anote quais abriram o APP da carteira (e não a Play
        Store). Volte pro X depois de cada um.
      </p>
      {GRUPOS.map(([titulo, links]) => (
        <section key={titulo} className="space-y-2 rounded-xl border border-white/[0.06] bg-ink-900/60 p-3">
          <p className="text-[14px] font-bold text-zinc-100">{titulo}</p>
          {links.map(([nome, href]) => (
            <a
              key={nome}
              href={href}
              className="block rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 text-[14px] font-bold text-zinc-100"
            >
              {nome}
            </a>
          ))}
        </section>
      ))}
    </main>
  );
}
