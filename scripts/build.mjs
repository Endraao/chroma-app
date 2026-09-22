import { spawn } from "node:child_process";

/**
 * Build de produção numa pasta separada do dev — mas só na máquina de quem
 * desenvolve.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A PASTA SEPARADA EXISTE
 * ---------------------------------------------------------------------------
 * `next dev` e `next build` escrevem formatos diferentes no mesmo diretório.
 * Rodar um depois do outro deixava o `.next` num estado misto: o HTML vinha,
 * mas todo CSS e JS dava 404 e a tela abria em branco — sem erro nenhum que
 * explicasse. Aqui o build vai pra `.next-prod` e o dev fica com `.next`.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISSO NÃO PODE VALER NA VERCEL
 * ---------------------------------------------------------------------------
 * Lá não existe esse conflito: cada publicação nasce numa máquina limpa, sem
 * nenhum `next dev` por perto. E a Vercel procura o resultado do build em
 * `.next`, o nome padrão — com a pasta trocada ela não acha nada e a
 * publicação falha com "No Output Directory named .next found".
 *
 * Então a troca de pasta só acontece fora da Vercel. A variável `VERCEL` é
 * posta por eles em toda build, e é a forma documentada de saber onde estamos.
 */
const naVercel = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);

const command = process.argv[2] === "start" ? "start" : "build";

const child = spawn("npx", ["next", command], {
  stdio: "inherit",
  shell: true,
  env: naVercel ? process.env : { ...process.env, NEXT_DIST_DIR: ".next-prod" },
});

child.on("exit", (code) => process.exit(code ?? 1));
