"use client";

import { useState } from "react";
import Link from "next/link";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { MediaDropzone, MediaSpecList, type MediaSpec, type SelectedMedia } from "@/components/ui/MediaDropzone";
import { useRouter } from "next/navigation";

import { useChromaAccount } from "@/hooks/useChromaAccount";
import { TEXTO_DA_ETAPA, useLancarToken } from "@/hooks/useLancarToken";
import { useLancarTokenEvm } from "@/hooks/useLancarTokenEvm";
import { CHAINS, CHAIN_IDS } from "@/lib/web3";
import { DEFAULT_PAIR, LIQUIDITY_PAIRS, pairLogo } from "@/lib/pairs";
import {
  CHAIN_FEES,
  DEFAULT_CREATOR_TAX_BPS,
  MAX_CREATOR_TAX_BPS,
  feeLabel,
  feeLabelFor,
  validateCreatorTax,
} from "@/lib/fees";
import { cn } from "@/lib/utils";
import type { ChainId, CreatorRewardsMode } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Requisitos de mídia                                                 */
/* ------------------------------------------------------------------ */

const COIN_MEDIA: MediaSpec = {
  maxSizeMb: 15,
  maxVideoSizeMb: 30,
  accept: ["image/jpeg", "image/png", "image/gif", "video/mp4"],
  minDimension: 1000,
};

/**
 * Atalhos comuns; o slider cobre o resto até o teto de 10%.
 * Valores fixos, não derivados do padrão — senão mudar o padrão pra 0
 * duplicaria o primeiro botão.
 */
const CREATOR_TAX_PRESETS = [0, 100, 200, 500];

const BANNER_MEDIA: MediaSpec = {
  maxSizeMb: 4.5,
  accept: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  aspectRatio: { value: 3, tolerance: 0.35, label: "3:1" },
};

export default function CreateTokenPage() {
  const account = useChromaAccount();
  const router = useRouter();

  /*
   * UM HOOK POR REDE, e a tela escolhe qual usar.
   * ---------------------------------------------------------------------
   * As duas redes assinam de jeitos incompatíveis: a Solana monta uma
   * transação com `@solana/web3.js` e um par de chaves novo que precisa
   * assinar junto; a EVM chama uma função de contrato pelo wagmi e lê o
   * endereço da moeda no recibo.
   *
   * Tentar unificar isso num hook só significaria um corpo cheio de `if
   * (chain === ...)` em volta de bibliotecas diferentes. Dois hooks com a
   * MESMA forma de retorno — `lancar`, `etapa`, `erro`, `ocupado`,
   * `carteiraConectada` — deixam a tela tratar os dois igual.
   *
   * Os dois são chamados sempre, porque hook não pode ser condicional; o
   * que não está em uso simplesmente fica parado.
   */
  const lancamentoSolana = useLancarToken();
  const lancamentoEvm = useLancarTokenEvm();

  const [chain, setChain] = useState<ChainId>("solana");

  /*
   * A partir daqui a tela não sabe mais em que rede está: ela fala com
   * `lancamento`, e quem é `lancamento` depende da rede escolhida. Assim o
   * botão, a mensagem de erro e o texto de etapa continuam com um caminho só.
   */
  const lancamento = chain === "solana" ? lancamentoSolana : lancamentoEvm;

  /*
   * A Solana está publicada; a Robinhood depende dos contratos estarem no ar.
   * `disponivel` só existe no hook EVM — na Solana a resposta é sempre sim.
   */
  const redeDisponivel = chain === "solana" ? true : lancamentoEvm.disponivel;

  const [pair, setPair] = useState(DEFAULT_PAIR.solana);
  const [rewards, setRewards] = useState<CreatorRewardsMode>("creator");
  const [creatorTaxBps, setCreatorTaxBps] = useState(DEFAULT_CREATOR_TAX_BPS);
  const [media, setMedia] = useState<SelectedMedia | null>(null);
  const [banner, setBanner] = useState<SelectedMedia | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  const [form, setForm] = useState({
    name: "",
    symbol: "",
    description: "",
    website: "",
    twitter: "",
    telegram: "",
    initialBuy: "",
  });

  const meta = CHAINS[chain];
  const pairs = LIQUIDITY_PAIRS[chain];

  const taxCheck = validateCreatorTax(creatorTaxBps);
  const taxWarning = taxCheck.ok ? null : taxCheck.error;
  const launchFee = CHAIN_FEES[chain].launchFee;
  const chainLabels = feeLabelFor(chain);

  function selectChain(next: ChainId) {
    setChain(next);
    setPair(DEFAULT_PAIR[next]); // o par da rede anterior não existe na nova
  }

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const ready =
    account.isSignedIn &&
    taxCheck.ok &&
    form.name.trim().length >= 2 &&
    form.symbol.trim().length >= 2 &&
    Boolean(media);

  return (
    <div className="mx-auto max-w-2xl space-y-4 pt-4">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-zinc-50">Criar token</h1>
        <p className="mt-1 text-[13px] text-zinc-500">
          Criação e negociação no mesmo lugar: assim que a moeda é criada, ela já fica disponível
          para compra e venda, com página própria e gráfico ao vivo.
        </p>
      </div>

      {/* Aviso de imutabilidade — no topo, porque muda o que a pessoa preenche */}
      <div className="flex gap-2.5 rounded-xl border border-warn/25 bg-warn/[0.06] p-3">
        <span className="mt-0.5 shrink-0 text-warn">⚠</span>
        <p className="text-[12px] leading-relaxed text-warn">
          Os dados da moeda — imagem, banner e links de redes sociais — só podem ser adicionados{" "}
          <strong>agora</strong> e não poderão ser alterados nem editados depois da criação.
        </p>
      </div>

      {/* Rede */}
      <Card>
        <CardHeader>
          <CardTitle>Rede</CardTitle>
        </CardHeader>
        <CardBody className="grid grid-cols-2 gap-2">
          {CHAIN_IDS.map((id) => (
            <button
              key={id}
              onClick={() => selectChain(id)}
              className={cn(
                "rounded-xl border px-3 py-3 text-left transition-all",
                chain === id
                  ? "border-marca/50 bg-marca/10"
                  : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14]",
              )}
            >
              <div className={cn("text-sm font-bold", chain === id ? "text-marca" : "text-zinc-300")}>
                {CHAINS[id].label}
              </div>
              <div className="text-[11px] text-zinc-600">gás em {CHAINS[id].nativeSymbol}</div>
            </button>
          ))}
        </CardBody>
      </Card>

      {/* Par de liquidez */}
      <Card>
        <CardHeader>
          <CardTitle>Par de liquidez</CardTitle>
          <span className="text-[11px] text-zinc-600">contra o que seu token é cotado</span>
        </CardHeader>
        <CardBody className="space-y-2">
          {pairs.map((option) => (
            <button
              key={option.symbol}
              onClick={() => setPair(option.symbol)}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-all",
                pair === option.symbol
                  ? "border-marca/50 bg-marca/[0.08]"
                  : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14]",
              )}
            >
              <PairLogo chain={chain} symbol={option.symbol} active={pair === option.symbol} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-[13px] font-bold text-zinc-100">{option.symbol}</span>
                  <span className="truncate text-[11px] text-zinc-600">{option.name}</span>
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-zinc-500">{option.hint}</span>
              </span>
            </button>
          ))}

          {chain === "robinhood" && (
            <p className="rounded-lg border border-white/[0.06] bg-ink-950/60 p-2.5 text-[11px] leading-relaxed text-zinc-600">
              NVDA e SPCX são ações tokenizadas oficiais da Robinhood. Existem contratos falsos usando os mesmos
              símbolos nessa rede — os endereços aqui foram conferidos no explorador oficial.
            </p>
          )}
        </CardBody>
      </Card>

      {/* Mídia da moeda */}
      <Card>
        <CardHeader>
          <CardTitle>Imagem ou vídeo</CardTitle>
          <Badge tone="danger">obrigatório</Badge>
        </CardHeader>
        <CardBody className="space-y-4">
          <MediaDropzone
            spec={COIN_MEDIA}
            value={media}
            onChange={setMedia}
            title="Selecione o vídeo ou a imagem que deseja enviar."
            subtitle="ou arraste e solte aqui."
          />

          <MediaSpecList
            columns={[
              {
                icon: "file",
                title: "Tamanho e tipo do arquivo",
                items: [
                  "Imagem — máximo 15 MB. Recomenda-se o formato '.jpg', '.gif' ou '.png'.",
                  "Vídeo — máximo 30 MB. Formato '.mp4' recomendado.",
                ],
              },
              {
                icon: "image",
                title: "Resolução e proporção da tela",
                items: [
                  "Imagem — mínimo 1000x1000px, proporção 1:1 recomendada.",
                  "Vídeo — Formato 16:9 ou 9:16, resolução 1080p ou superior recomendada.",
                ],
              },
            ]}
          />
        </CardBody>
      </Card>

      {/* Banner */}
      <Card>
        <button
          onClick={() => setShowBanner((v) => !v)}
          className="flex w-full items-center gap-2 px-4 py-3 text-left"
        >
          <svg viewBox="0 0 24 24" className="size-4 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
          <span className="text-[13px] font-semibold text-marca">Adicionar banner</span>
          <span className="text-[12px] text-zinc-600">(Opcional)</span>
          <span className={cn("ml-auto text-zinc-600 transition-transform", showBanner && "rotate-180")}>⌄</span>
        </button>

        {showBanner && (
          <CardBody className="space-y-4 border-t border-white/[0.06]">
            <div>
              <div className="text-[13px] font-bold text-zinc-200">Carregar banner</div>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                Isso será exibido na página da moeda, além da imagem da moeda. Imagens ou GIFs animados de até 4,5
                MB; imagens maiores são redimensionadas automaticamente, GIFs não. Proporção de 3:1, 1500x500px
                recomendado. Você só pode fazer isso ao criar a moeda e não poderá alterar posteriormente.
              </p>
            </div>

            <MediaDropzone
              spec={BANNER_MEDIA}
              value={banner}
              onChange={setBanner}
              title="Carregar arquivo…"
            />

            <MediaSpecList
              columns={[
                {
                  icon: "file",
                  title: "Tamanho e tipo do arquivo",
                  items: [
                    "Imagem — máximo 4,5 MB (imagens maiores são redimensionadas automaticamente, GIFs não). Formatos: '.jpg', '.png', '.webp' ou '.gif'.",
                  ],
                },
                {
                  icon: "image",
                  title: "Resolução e proporção da tela",
                  items: ["Proporção de aspecto 3:1, resolução recomendada de 1500x500px."],
                },
              ]}
            />
          </CardBody>
        )}
      </Card>

      {/* Identidade */}
      <Card>
        <CardHeader>
          <CardTitle>Identidade</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <Field label="Nome" placeholder="Ex: Gato Turbo" value={form.name} onChange={(v) => set("name", v)} />
          <Field
            label="Símbolo"
            placeholder="Ex: TURBO"
            value={form.symbol}
            maxLength={10}
            onChange={(v) => set("symbol", v.toUpperCase())}
          />
          <Field
            label="Descrição"
            placeholder="O que é esse token?"
            value={form.description}
            multiline
            onChange={(v) => set("description", v)}
          />
        </CardBody>
      </Card>

      {/* Redes sociais */}
      <Card>
        <CardHeader>
          <CardTitle>Redes sociais</CardTitle>
          <span className="text-[11px] text-zinc-600">opcional · não editável depois</span>
        </CardHeader>
        <CardBody className="space-y-3">
          <Field label="Site" placeholder="https://" value={form.website} onChange={(v) => set("website", v)} />
          <Field label="X (Twitter)" placeholder="https://x.com/..." value={form.twitter} onChange={(v) => set("twitter", v)} />
          <Field label="Telegram" placeholder="https://t.me/..." value={form.telegram} onChange={(v) => set("telegram", v)} />
        </CardBody>
      </Card>

      {/*
        Taxa de criador só aparece na Robinhood Chain.

        É assim que o mercado de cada rede funciona: o PONS deixa o criador
        definir uma taxa própria (teto de 10%) e isso virou esperado lá. O
        pump.fun não tem esse conceito, e oferecer na Solana só criaria uma
        alavanca de golpe numa rede onde o comprador não espera encontrar.
      */}
      {chain === "robinhood" && (
      <Card>
        <CardHeader>
          <CardTitle>Taxa de criador</CardTitle>
          <Badge tone="warn">imutável</Badge>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="flex items-center gap-2">
            {CREATOR_TAX_PRESETS.map((bps) => (
              <button
                key={bps}
                onClick={() => setCreatorTaxBps(bps)}
                className={cn(
                  "flex-1 rounded-xl border py-2.5 text-sm font-bold transition-all",
                  creatorTaxBps === bps
                    ? "border-marca/50 bg-marca/10 text-marca"
                    : "border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:border-white/[0.14]",
                )}
              >
                {bps / 100}%
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={MAX_CREATOR_TAX_BPS}
              step={25}
              value={creatorTaxBps}
              onChange={(e) => setCreatorTaxBps(Number(e.target.value))}
              className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink-700 accent-marca"
            />
            <span className="tnum w-14 text-right text-sm font-bold text-zinc-100">
              {(creatorTaxBps / 100).toFixed(2).replace(".", ",")}%
            </span>
          </div>

          {taxWarning && (
            <p className="rounded-lg border border-bear/25 bg-bear/[0.06] px-3 py-2 text-[11px] leading-snug text-bear">
              {taxWarning}
            </p>
          )}

          <p className="text-[11px] leading-relaxed text-zinc-500">
            Cobrada de quem negocia a sua moeda e paga direto para você, além da sua fatia das
            faixas. O limite é {feeLabel.creatorTaxMax}; acima disso o lançamento é recusado. Escolha
            com cuidado:{" "}
            <strong className="text-zinc-300">esse número não pode ser alterado depois</strong>, e
            taxas altas costumam afastar compradores.
          </p>

          <div className="rounded-xl border border-white/[0.06] bg-ink-950/60 p-3 text-[11px] leading-relaxed text-zinc-500">
            <span className="font-semibold text-zinc-300">Além dela, você já recebe</span>{" "}
            {chainLabels.creatorBase} de cada operação, subindo até {chainLabels.creatorTop}{" "}
            conforme a moeda ganha volume — sem cobrar nada a mais de quem compra.{" "}
            <span className="text-zinc-600">
              No {chainLabels.reference.name} o criador recebe {chainLabels.referenceCreator}.
            </span>{" "}
            <Link href="/fees" className="text-marca hover:text-chroma-cyan">
              ver as faixas
            </Link>
          </div>
        </CardBody>
      </Card>

      )}

      {/* Recompensas de criador */}
      <Card>
        <CardHeader>
          <CardTitle>Compartilhar recompensas de criador</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2">
          <RewardOption
            active={rewards === "creator"}
            onClick={() => setRewards("creator")}
            title="Criador"
            description="As recompensas para criadores podem ser compartilhadas com carteiras digitais ou instituições de caridade a partir da página da moeda, após a sua criação."
          />
          <RewardOption
            active={rewards === "holders"}
            onClick={() => setRewards("holders")}
            title="Detentores"
            description="100% das recompensas para criadores vão para os detentores. Qualquer pessoa que possua mais de US$ 20 em suas moedas se qualifica."
          />
        </CardBody>
      </Card>

      {/* Compra inicial */}
      <Card>
        <CardHeader>
          <CardTitle>Compra inicial</CardTitle>
          <span className="text-[11px] text-zinc-600">opcional</span>
        </CardHeader>
        <CardBody className="space-y-3">
          <Field
            label={`Quanto você quer comprar no lançamento (em ${pair})`}
            placeholder="0.5"
            value={form.initialBuy}
            onChange={(v) => set("initialBuy", v.replace(/[^0-9.]/g, ""))}
          />
          <p className="text-[11px] leading-relaxed text-zinc-500">
            A Chroma não faz custódia: a moeda é sua e a transação sai da sua carteira. A compra
            inicial paga o mesmo preço que qualquer outra pessoa — não existe reserva de tokens para
            o criador. O que você comprar aqui aparece no painel de segurança como concentração do
            criador.
          </p>
        </CardBody>
      </Card>

      {lancamento.erro && (
        <div className="rounded-xl border border-bear/30 bg-bear/[0.07] px-4 py-3 text-[12px] leading-relaxed text-bear">
          {lancamento.erro}
        </div>
      )}

      <Button
        variant="chroma"
        size="lg"
        className="w-full"
        disabled={
          !ready ||
          lancamento.ocupado ||
          !redeDisponivel ||
          !lancamento.carteiraConectada
        }
        onClick={async () => {
          if (!media) return;

          const resultado = await lancamento.lancar({
            nome: form.name.trim(),
            simbolo: form.symbol.trim(),
            descricao: form.description.trim() || undefined,
            site: form.website.trim() || undefined,
            twitter: form.twitter.trim() || undefined,
            telegram: form.telegram.trim() || undefined,
            arte: media.file,
            banner: banner?.file ?? null,
          });

          /*
           * Vai direto pra página da moeda. A pessoa acabou de criar algo e
           * quer VER — deixá-la no formulário preenchido, sem saber se deu
           * certo, é o pior desfecho possível.
           */
          /*
           * Cada rede nomeia a moeda de um jeito: na Solana o endereço se
           * chama `mint`, na EVM é o endereço do contrato do token. A tela
           * precisa do endereço, não do nome que cada rede dá a ele.
           */
          if (!resultado) return;
          router.push(`/token/${"mint" in resultado ? resultado.mint : resultado.moeda}`);
        }}
      >
        {lancamento.ocupado
          ? TEXTO_DA_ETAPA[lancamento.etapa]
          : !redeDisponivel
            ? `Lançar na ${meta.label} em breve`
            : !account.isSignedIn
              ? "Faça login para criar"
              : !lancamento.carteiraConectada
                ? `Conecte sua carteira ${meta.label}`
                : !media
                  ? "Envie a imagem ou o vídeo"
                  : !ready
                    ? "Preencha nome e símbolo"
                    : "Criar e abrir a curva"}
      </Button>

      <p className="pb-4 text-center text-[11px] leading-relaxed text-zinc-600">
        {launchFee > 0 ? (
          <>
            Taxa de lançamento: {launchFee} {meta.nativeSymbol}, paga no envio. Mais a taxa de rede da{" "}
            {meta.label}.
          </>
        ) : (
          <>Lançar não tem taxa da Chroma — só a taxa de rede da {meta.label}, paga da sua carteira.</>
        )}{" "}
        Não há limite de quantos tokens você pode lançar.{" "}
        <Link href="/fees" className="text-marca hover:text-chroma-cyan">
          ver todas as taxas
        </Link>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function RewardOption({
  active,
  onClick,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-all",
        active
          ? "border-marca/50 bg-marca/[0.08]"
          : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14]",
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2 transition-colors",
          active ? "border-marca" : "border-zinc-700",
        )}
      >
        {active && <span className="size-1.5 rounded-full bg-marca" />}
      </span>
      <span>
        <span className={cn("block text-[13px] font-bold", active ? "text-marca" : "text-zinc-200")}>
          {title}
        </span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-zinc-500">{description}</span>
      </span>
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
}) {
  const className =
    "w-full rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-700 focus:border-marca/40";

  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
      {multiline ? (
        <textarea
          rows={3}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cn(className, "resize-none")}
        />
      ) : (
        <input
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
          className={className}
        />
      )}
    </label>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Logo da moeda do par, baixado por `npm run tokens:icons`.
 *
 * Se o arquivo não existir (par novo sem logo baixado ainda), cai no
 * símbolo em texto — feio, mas nunca um quadrado quebrado na tela.
 */
function PairLogo({
  chain,
  symbol,
  active,
}: {
  chain: ChainId;
  symbol: string;
  active: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const src = pairLogo(chain, symbol);

  if (!src || broken) {
    return (
      <span
        className={cn(
          "mt-0.5 grid size-9 shrink-0 place-items-center rounded-full text-[10px] font-black",
          active ? "bg-chroma-gradient text-white" : "bg-ink-800 text-zinc-500",
        )}
      >
        {symbol.slice(0, 4)}
      </span>
    );
  }

  return (
     
    <img
      src={src}
      alt=""
      width={36}
      height={36}
      onError={() => setBroken(true)}
      className="mt-0.5 size-9 shrink-0 rounded-full bg-ink-900 object-contain"
    />
  );
}
