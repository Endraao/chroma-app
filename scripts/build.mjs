import { spawn } from "node:child_process";

/**
 * Build de produção numa pasta separada do dev.
 *
 * `next dev` e `next build` escrevem formatos diferentes no mesmo diretório.
 * Rodar um depois do outro deixava o `.next` num estado misto: o HTML vinha,
 * mas todo CSS e JS dava 404 e a tela abria em branco.
 *
 * Aqui o build vai pra `.next-prod` e o dev fica com `.next`. Um não pisa
 * no outro, e ninguém precisa lembrar de apagar pasta.
 */
const command = process.argv[2] === "start" ? "start" : "build";

const child = spawn("npx", ["next", command], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NEXT_DIST_DIR: ".next-prod" },
});

child.on("exit", (code) => process.exit(code ?? 1));
