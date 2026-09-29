import { banco, sql } from "@/lib/db";

/**
 * Cópia de segurança do que NÃO pode sumir: contas, apelidos, carteiras
 * vinculadas, pontos do airdrop, eventos de indicação e moedas lançadas.
 *
 * Se um dia o banco quebrar, perder pontos ou quem indicou quem derruba a
 * confiança na plataforma — mesmo que nenhum airdrop tenha sido prometido.
 * `mensagens` (e-mails do contato) fica de fora de propósito.
 */
export const TABELAS_DO_BACKUP = ["contas", "apelidos", "carteiras", "pontos", "eventos_de_afiliado", "moedas", "denuncias"];

export async function exportarBanco(): Promise<{ em: string; tabelas: Record<string, unknown[]> }> {
  await banco();
  const tabelas: Record<string, unknown[]> = {};
  for (const t of TABELAS_DO_BACKUP) {
    tabelas[t] = (await sql.query(`SELECT * FROM ${t}`)) as unknown[];
  }
  return { em: new Date().toISOString(), tabelas };
}
