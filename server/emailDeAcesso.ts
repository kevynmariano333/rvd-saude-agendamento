/**
 * O e-mail que avisa a pessoa de que o login dela está valendo.
 *
 * Quem se cadastra fica esperando sem saber o quê: a aprovação acontece do
 * lado de cá, num dia qualquer, e até aqui a única forma de descobrir era
 * tentar entrar de novo — e a maioria não tenta. Cadastro parado é fornecedor
 * ligando para perguntar, ou pior, mandando carga sem agendar.
 *
 * A mensagem diz três coisas e só: que o acesso está liberado, com que login
 * se entra e por qual porta. A senha é a que a própria pessoa escolheu no
 * cadastro — este e-mail nunca a repete.
 */

import type { UserRole } from "../drizzle/schema";
import { MARCA } from "../shared/marca";

/** Por qual porta cada perfil entra. */
export function portaDoPerfil(role: UserRole): string {
  if (role === "supplier") return "fornecedor";
  if (role === "portaria") return "portaria";
  // Operação e Planejamento não têm porta própria: entram pela do Operador,
  // como o login já faz.
  return "operador";
}

export type DadosDoAcesso = {
  nome: string | null;
  email: string;
  role: UserRole;
  /** Endereço do portal, sem barra no fim. Sem ele, o e-mail vai sem link. */
  appUrl: string | null;
  /**
   * Conta que volta a valer depois de bloqueada, e não conta nova. Muda o
   * texto: quem já usava o portal não precisa ser apresentado a ele.
   */
  reativado?: boolean;
};

function escapar(valor: string): string {
  return valor.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const PASSOS_DO_FORNECEDOR = [
  "Envie o XML da nota fiscal e informe o pedido de compra.",
  "Sugira um dia e um horário, se quiser.",
  "Acompanhe pelo portal até a confirmação da data.",
];

export function conteudoDoAcessoLiberado(dados: DadosDoAcesso): { subject: string; html: string; text: string } {
  const titulo = dados.reativado ? "Seu login voltou a funcionar" : "Seu login está ativo";
  const link = dados.appUrl ? `${dados.appUrl}/entrar/${portaDoPerfil(dados.role)}` : null;
  const saudacao = dados.nome ? `Olá, ${dados.nome}.` : "Olá.";
  const abertura = dados.reativado
    ? `Seu acesso ao ${MARCA.nome} foi liberado de novo. Você já pode entrar com o login de sempre.`
    : `Seu cadastro no ${MARCA.nome} foi aprovado. O login abaixo já está valendo.`;
  const passos = dados.role === "supplier" ? PASSOS_DO_FORNECEDOR : [];

  const text = [
    `${titulo} · ${MARCA.nome}`,
    "",
    saudacao,
    abertura,
    "",
    `Login: ${dados.email}`,
    `Senha: a que você cadastrou.`,
    ...(link ? ["", `Entre em: ${link}`] : []),
    ...(passos.length ? ["", "Próximos passos:", ...passos.map(passo => `- ${passo}`)] : []),
    "",
    "Esqueceu a senha? Use o \"Esqueci minha senha\" na tela de entrada.",
    "",
    "Esta mensagem é automática — não responda a este e-mail.",
  ].join("\n");

  const botao = link
    ? `<p style="margin:26px 0 0"><a href="${escapar(link)}" style="display:inline-block;background:#782078;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;padding:13px 26px;border-radius:12px">Entrar no portal</a></p>`
    : "";
  const lista = passos.length
    ? `<p style="margin:26px 0 8px;color:#7a6f7e;font-size:12px;text-transform:uppercase;letter-spacing:1px">Próximos passos</p>
          <ul style="margin:0;padding-left:20px;color:#3f3244;font-size:14px;line-height:1.7">${passos.map(passo => `<li>${escapar(passo)}</li>`).join("")}</ul>`
    : "";

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
          <h1 style="margin:0;color:#782078;font-size:22px">${titulo}</h1>
          <p style="margin:16px 0 0;color:#3f3244;font-size:15px;line-height:1.6">${escapar(saudacao)} ${escapar(abertura)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 0;border-collapse:collapse">
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #eee5ee;color:#7a6f7e;font-size:12px;text-transform:uppercase;letter-spacing:1px;width:40%;vertical-align:top">Login</td>
              <td style="padding:10px 0;border-bottom:1px solid #eee5ee;color:#3f3244;font-size:15px;font-weight:bold">${escapar(dados.email)}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #eee5ee;color:#7a6f7e;font-size:12px;text-transform:uppercase;letter-spacing:1px;vertical-align:top">Senha</td>
              <td style="padding:10px 0;border-bottom:1px solid #eee5ee;color:#3f3244;font-size:15px;font-weight:bold">A que você cadastrou</td>
            </tr>
          </table>
          ${botao}
          ${lista}
          <p style="margin:24px 0 0;color:#7a6f7e;font-size:13px;line-height:1.6">Esqueceu a senha? Use o "Esqueci minha senha" na tela de entrada.</p>
        </td></tr>
        <tr><td style="padding:18px 28px;background:#faf7fa;color:#9a8f9e;font-size:12px">Esta mensagem é automática — não responda a este e-mail.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject: `${titulo} · ${MARCA.nome}`, html, text };
}
