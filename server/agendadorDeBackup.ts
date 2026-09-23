/**
 * O backup que acontece sozinho.
 *
 * O backup manual existe desde sempre e funciona — mas depende de alguém
 * lembrar. Backup que depende de lembrar não é backup: é uma intenção. Este
 * módulo faz a mesma rotina rodar de madrugada, todo dia, e deixar registro.
 *
 * Não há serviço separado de agendamento: roda dentro do próprio processo do
 * portal. É uma peça a menos para configurar, monitorar e esquecer — e, com um
 * processo só no ar, dá no mesmo.
 */

import { executarBackup } from "./backup";
import { ultimoBackupConcluido } from "./db";

/** Três da manhã, horário de Brasília: ninguém usando, e antes do expediente. */
export const HORA_DO_BACKUP = 3;

/**
 * O intervalo mínimo entre dois backups.
 *
 * Vinte e duas horas, e não vinte e quatro: o suficiente para não repetir no
 * mesmo dia e folgado o bastante para não pular um dia quando o servidor
 * reinicia ou o relógio anda por causa do horário de verão.
 */
export const INTERVALO_MINIMO_MS = 22 * 60 * 60 * 1000;

/** De quanto em quanto tempo o agendador acorda e olha o relógio. */
export const INTERVALO_DA_CONFERENCIA_MS = 10 * 60 * 1000;

/** A hora do dia em São Paulo, que é onde as pessoas que usam isto trabalham. */
export function horaEmSaoPaulo(agora: Date): number {
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(agora);
  return Number(hora);
}

/**
 * Está na hora de fazer backup?
 *
 * Duas condições, e as duas importam. Passou das três da manhã, para o backup
 * não competir com o movimento do dia. E faz tempo suficiente desde o último,
 * para um deploy às 03:05 não disparar um backup a cada reinício.
 *
 * Quando o servidor passou o dia fora do ar e volta às duas da tarde, a segunda
 * condição sozinha manda fazer — backup atrasado é melhor que backup pulado.
 */
export function deveFazerBackup({ agora, ultimoEm }: { agora: Date; ultimoEm: Date | null }): boolean {
  if (horaEmSaoPaulo(agora) < HORA_DO_BACKUP) return false;
  if (!ultimoEm) return true;
  return agora.getTime() - ultimoEm.getTime() >= INTERVALO_MINIMO_MS;
}

let rodando = false;

/** Uma passada: olha o relógio, e faz o backup se for o caso. */
export async function conferirEBackupear(agora: Date = new Date()): Promise<"feito" | "ainda não" | "já rodando" | "falhou"> {
  if (rodando) return "já rodando";
  const ultimo = await ultimoBackupConcluido();
  if (!deveFazerBackup({ agora, ultimoEm: ultimo?.finishedAt ?? null })) return "ainda não";
  rodando = true;
  try {
    const resumo = await executarBackup("automatico", agora);
    console.log(`[Backup] automático concluído: ${resumo.totalLinhas} linhas, ${Math.round(resumo.tamanhoBytes / 1024)} KB.`);
    return "feito";
  } catch (erro) {
    // Backup que falha não pode derrubar o portal: o registro fica na tabela e
    // a tela de manutenção mostra o erro para quem for olhar.
    console.error("[Backup] automático falhou:", erro instanceof Error ? erro.message : erro);
    return "falhou";
  } finally {
    rodando = false;
  }
}

/**
 * Liga a rotina. Devolve como desligá-la, que é o que o encerramento usa.
 *
 * O primeiro exame é logo na subida, e não daqui a dez minutos: se o servidor
 * passou a madrugada fora do ar, o backup daquele dia sai assim que ele volta.
 */
export function ligarBackupAutomatico(): () => void {
  void conferirEBackupear();
  const relogio = setInterval(() => void conferirEBackupear(), INTERVALO_DA_CONFERENCIA_MS);
  // Sem isto, o processo demoraria até dez minutos para conseguir sair.
  relogio.unref();
  return () => clearInterval(relogio);
}
