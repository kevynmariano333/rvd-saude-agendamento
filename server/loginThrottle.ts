/**
 * Freio de tentativas de login.
 *
 * O portal está aberto na internet e a porta de entrada aceita qualquer número
 * de tentativas por segundo. Sem freio, descobrir a senha de um fornecedor é
 * questão de tempo de máquina — e as senhas são escolhidas por pessoas, não
 * sorteadas.
 *
 * A contagem é por chave (o IP de quem tenta e o login tentado, separados) e só
 * conta o que falhou: quem acerta a senha nunca esbarra no limite. A janela
 * desliza, então esperar o tempo limpa a conta sozinho.
 *
 * É memória do processo, não banco: um reinício zera, e duas instâncias contam
 * separado. Para o que isto resolve — a tentativa automatizada, que faz
 * centenas de tentativas por minuto — é suficiente, e não custa uma ida ao
 * banco a cada login.
 */

/** Quantas falhas a mesma chave pode acumular antes de a porta fechar. */
export const LIMITE_DE_FALHAS = 8;
/** Por quanto tempo as falhas são lembradas, e quanto dura o bloqueio. */
export const JANELA_MS = 10 * 60 * 1000;

type Registro = { falhas: number[]; };

const registros = new Map<string, Registro>();
/** Sem isto, cada IP que tenta uma vez deixa uma entrada para sempre. */
const MAXIMO_DE_CHAVES = 10_000;

function agora() {
  return Date.now();
}

function falhasRecentes(chave: string, momento: number): number[] {
  const registro = registros.get(chave);
  if (!registro) return [];
  const recentes = registro.falhas.filter(instante => momento - instante < JANELA_MS);
  if (recentes.length) registros.set(chave, { falhas: recentes });
  else registros.delete(chave);
  return recentes;
}

/** Quantos segundos faltam para a chave poder tentar de novo; 0 se pode agora. */
export function segundosDeEspera(chaves: string[], momento = agora()): number {
  let espera = 0;
  for (const chave of chaves) {
    const recentes = falhasRecentes(chave, momento);
    if (recentes.length < LIMITE_DE_FALHAS) continue;
    const maisAntiga = recentes[recentes.length - LIMITE_DE_FALHAS];
    espera = Math.max(espera, Math.ceil((JANELA_MS - (momento - maisAntiga)) / 1000));
  }
  return espera;
}

export function registrarFalha(chaves: string[], momento = agora()): void {
  for (const chave of chaves) {
    if (!registros.has(chave) && registros.size >= MAXIMO_DE_CHAVES) registros.clear();
    const recentes = falhasRecentes(chave, momento);
    registros.set(chave, { falhas: [...recentes, momento] });
  }
}

/** Uma entrada bem-sucedida limpa o histórico: o freio é para quem erra. */
export function limparFalhas(chaves: string[]): void {
  for (const chave of chaves) registros.delete(chave);
}

/** Só para os testes: devolve o freio ao estado inicial. */
export function zerarFreio(): void {
  registros.clear();
}
