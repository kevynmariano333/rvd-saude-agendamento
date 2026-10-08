/**
 * O que ainda está aberto na segurança do sistema, dito pela própria tela.
 *
 * Estas pendências viviam numa conversa: "no sábado troca o banco para a rede
 * interna", "confere se o segredo da sessão é longo". Conversa se perde, e
 * seis meses depois ninguém sabe se foi feito. Aqui o servidor no ar responde
 * o que ele vê — e o que estiver vermelho é o que falta.
 *
 * Nada aqui mostra valor de variável: só o que dá para concluir dela. Um
 * painel de segurança que imprime a senha do banco é o próprio problema.
 */

import { MINIMO_DA_SENHA_DE_TESTE, type EstadoDasContasDeTeste } from "./contasDeTeste";

export type ItemDeSeguranca = {
  chave: string;
  titulo: string;
  ok: boolean;
  /** O que o servidor está vendo agora. */
  situacao: string;
  /** O que fazer quando está vermelho. Vazio quando está tudo certo. */
  comoResolver: string;
};

/** Quem hospeda o banco aqui dentro não precisa sair para a internet. */
export function bancoEmRedeInterna(databaseUrl: string): boolean | null {
  const endereco = databaseUrl.trim();
  if (!endereco) return null;
  try {
    const url = new URL(endereco);
    const host = url.hostname.toLowerCase();
    return host.endsWith(".railway.internal") || host === "localhost" || host === "127.0.0.1" || host === "mysql";
  } catch {
    return null;
  }
}

/**
 * Um segredo de sessão curto é adivinhável, e quem o adivinha entra como
 * qualquer pessoa: ele é o que assina o crachá de todo mundo.
 */
export const MINIMO_DO_SEGREDO = 32;

export function segredoForte(segredo: string): boolean {
  const limpo = segredo.trim();
  if (limpo.length < MINIMO_DO_SEGREDO) return false;
  // Um valor longo feito de uma palavra repetida não é melhor do que a palavra.
  const distintos = new Set(limpo).size;
  return distintos >= 10;
}

export function montarEstadoDeSeguranca(entrada: {
  databaseUrl: string;
  segredoDaSessao: string;
  appUrl: string;
  /**
   * Por que as contas de teste estão como estão.
   *
   * Não basta dizer "desligadas": quem acabou de definir a senha na Railway e
   * continua sem entrar precisa saber que ela foi recusada por ser curta — foi
   * exatamente isso que aconteceu da primeira vez.
   */
  contasDeTeste: EstadoDasContasDeTeste;
  emailConfigurado: boolean;
  backupConfigurado: boolean;
}): ItemDeSeguranca[] {
  const interna = bancoEmRedeInterna(entrada.databaseUrl);
  return [
    {
      chave: "banco",
      titulo: "Banco de dados",
      ok: interna === true,
      situacao:
        interna === null
          ? "Não foi possível ler o endereço do banco."
          : interna
            ? "Ligado pela rede interna da hospedagem."
            : "Ligado por endereço público — o banco aceita conexão de fora.",
      comoResolver:
        interna === true
          ? ""
          : "Na Railway, troque a variável DATABASE_URL pela referência ${{MySQL.DATABASE_URL}}, confirme que o portal abre, e então desligue o Public Networking do banco e gire a senha.",
    },
    {
      chave: "sessao",
      titulo: "Segredo da sessão",
      ok: segredoForte(entrada.segredoDaSessao),
      situacao: segredoForte(entrada.segredoDaSessao)
        ? "Longo e variado o bastante."
        : `Curto ou repetitivo — o mínimo são ${MINIMO_DO_SEGREDO} caracteres sorteados.`,
      comoResolver: segredoForte(entrada.segredoDaSessao)
        ? ""
        : "Gere um valor aleatório longo e troque JWT_SECRET na Railway. Todo mundo terá que entrar de novo, então faça fora do horário de pico.",
    },
    {
      chave: "contasDeTeste",
      titulo: "Contas de teste",
      ok: !entrada.contasDeTeste.ligadas,
      situacao: entrada.contasDeTeste.ligadas
        ? "Ligadas: o login de teste entra no sistema com a senha configurada."
        : entrada.contasDeTeste.motivo === "senha configurada é curta demais"
          ? `Desligadas: há uma senha em SENHA_CONTAS_TESTE, mas com menos de ${MINIMO_DA_SENHA_DE_TESTE} caracteres.`
          : "Desligadas: nenhuma senha configurada.",
      comoResolver: entrada.contasDeTeste.ligadas
        ? "Quando não precisar mais delas, apague a variável SENHA_CONTAS_TESTE na Railway."
        : entrada.contasDeTeste.motivo === "senha configurada é curta demais"
          ? `Para ligar, troque SENHA_CONTAS_TESTE na Railway por uma senha de ${MINIMO_DA_SENHA_DE_TESTE} caracteres ou mais. Enquanto for mais curta, o login de teste continua recusado.`
          : `Para ligar durante um teste, defina SENHA_CONTAS_TESTE na Railway com ${MINIMO_DA_SENHA_DE_TESTE} caracteres ou mais — e apague a variável quando terminar.`,
    },
    {
      chave: "endereco",
      titulo: "Endereço do portal",
      ok: Boolean(entrada.appUrl.trim()),
      situacao: entrada.appUrl.trim()
        ? "Configurado — os links dos e-mails saem com ele."
        : "Em branco: o sistema descobre pelo endereço de quem acessa, que é a reserva.",
      comoResolver: entrada.appUrl.trim()
        ? ""
        : "Defina APP_URL na Railway com o endereço do portal, para os links não dependerem de adivinhação.",
    },
    {
      chave: "email",
      titulo: "Envio de e-mail",
      ok: entrada.emailConfigurado,
      situacao: entrada.emailConfigurado
        ? "Configurado: agendamento, acesso liberado e redefinição de senha saem."
        : "Desligado: nenhum aviso chega ao fornecedor.",
      comoResolver: entrada.emailConfigurado ? "" : "Configure BREVO_API_KEY e MAIL_FROM na Railway.",
    },
    {
      chave: "backup",
      titulo: "Backup automático",
      ok: entrada.backupConfigurado,
      situacao: entrada.backupConfigurado ? "Ligado, com cópia diária." : "Desligado: o armazenamento de arquivos não está configurado.",
      comoResolver: entrada.backupConfigurado ? "" : "Configure as variáveis do armazenamento (S3_*) para a cópia diária voltar a rodar.",
    },
  ];
}
