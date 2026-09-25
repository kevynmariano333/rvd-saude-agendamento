/**
 * O e-mail que só serve para provar que o envio funciona.
 *
 * Configuração de e-mail tem duas metades: as variáveis estarem no servidor e
 * o provedor aceitar a mensagem. A tela só enxerga a primeira — a segunda só
 * aparece quando alguém agenda uma nota de verdade, e aí o teste é um
 * fornecedor esperando um aviso que não chegou.
 *
 * Esta mensagem fecha essa distância: sai pelo mesmo caminho dos avisos de
 * verdade, para o e-mail de quem pediu, e carrega o que precisa ser conferido
 * — por onde saiu e com que remetente.
 */

import { MARCA } from "../shared/marca";

export type DadosDoTeste = {
  /** "smtp" (a caixa da empresa) ou "resend". */
  caminho: string;
  /** O endereço que assina a mensagem. */
  remetente: string;
  quando: Date;
};

function escapar(valor: string): string {
  return valor.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Como o caminho é chamado por quem lê, e não por quem configurou. */
export function nomeDoCaminho(caminho: string): string {
  if (caminho === "smtp") return "a caixa de e-mail da empresa (SMTP)";
  if (caminho === "brevo") return "o Brevo (envio por HTTPS)";
  return "o Resend (envio por HTTPS)";
}

export function conteudoDoTeste(dados: DadosDoTeste): { subject: string; html: string; text: string } {
  const quando = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(dados.quando);
  const linhas = [
    { rotulo: "Enviado por", valor: nomeDoCaminho(dados.caminho) },
    { rotulo: "Remetente", valor: dados.remetente },
    { rotulo: "Data do teste", valor: quando },
  ];

  const text = [
    `Teste de envio · ${MARCA.nome}`,
    "",
    "Se esta mensagem chegou, o envio de e-mail do portal está funcionando.",
    "A partir de agora saem os avisos de agendamento, de acesso liberado e o link de redefinição de senha.",
    "",
    ...linhas.map(linha => `${linha.rotulo}: ${linha.valor}`),
    "",
    "Esta mensagem foi pedida por alguém na tela de administração do portal.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:32px 16px;background:#f6f4f7;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
        <tr><td style="background:#782078;padding:24px 28px">
          <p style="margin:0;color:#ffffff;font-size:19px;font-weight:bold">${MARCA.nome}</p>
          <p style="margin:6px 0 0;color:#c9e1ee;font-size:12px;letter-spacing:1.6px;text-transform:uppercase">${MARCA.descricao}</p>
        </td></tr>
        <tr><td style="padding:30px 28px">
          <h1 style="margin:0;color:#782078;font-size:22px">Teste de envio</h1>
          <p style="margin:16px 0 0;color:#3f3244;font-size:15px;line-height:1.6">Se esta mensagem chegou, o envio de e-mail do portal está funcionando. A partir de agora saem os avisos de agendamento, de acesso liberado e o link de redefinição de senha.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 0;border-collapse:collapse">
            ${linhas
              .map(
                linha => `<tr>
              <td style="padding:10px 0;border-bottom:1px solid #eee5ee;color:#7a6f7e;font-size:12px;text-transform:uppercase;letter-spacing:1px;width:40%;vertical-align:top">${escapar(linha.rotulo)}</td>
              <td style="padding:10px 0;border-bottom:1px solid #eee5ee;color:#3f3244;font-size:15px;font-weight:bold">${escapar(linha.valor)}</td>
            </tr>`,
              )
              .join("\n            ")}
          </table>
        </td></tr>
        <tr><td style="padding:18px 28px;background:#faf7fa;color:#9a8f9e;font-size:12px">Esta mensagem foi pedida por alguém na tela de administração do portal.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject: `Teste de envio · ${MARCA.nome}`, html, text };
}

/**
 * O erro do provedor, do tamanho de um aviso na tela.
 *
 * O que interessa é a primeira linha — "535 Authentication unsuccessful" diz o
 * que fazer; o rastro de pilha embaixo não diz nada a quem configurou a caixa.
 */
export function motivoDaFalha(erro: unknown): string {
  const bruto = erro instanceof Error ? erro.message : String(erro);
  const primeira = bruto.split("\n")[0].trim();
  return primeira.length > 300 ? `${primeira.slice(0, 297)}...` : primeira || "Motivo não informado pelo provedor.";
}
